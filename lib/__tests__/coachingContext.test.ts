import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceClosure } from './workoutIdentityHarness.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';
import { collectDisclosures, buildCoachingContext, coachingRecordFor, observeCoaching, MAX_CONTEXT_DISCLOSURES, MAX_CONTEXT_TEXT } from '../coachingContext.ts';
import { COACHING_POLICY } from '../coachingPolicy.ts';

const FLAG_ON = { ...COACHING_POLICY, contextualDisclosures: true };
const row = (id: string, notes: string) => ({ id, exercise: 'Bench', set: 1, weightLbs: '100', reps: '5', notes, performance: 'performed', timestamp: 1 });

test('policy ships unapproved with every adaptive switch off', () => {
  assert.deepEqual(COACHING_POLICY, { version: 'unapproved', contextualDisclosures: false, adaptiveNextSet: false, structuredQuestions: false, reviewSetPolicy: false, suppressReviewLoadAdvice: false, restWorkSetsOnly: false, questionnaire: null });
  assert.deepEqual(readFileSync(new URL('../../supabase/functions/_shared/coachingPolicy.ts', import.meta.url), 'utf8').match(/COACHING_POLICY = (\{[^}]*\})/)?.[1],
    readFileSync(new URL('../coachingPolicy.ts', import.meta.url), 'utf8').match(/COACHING_POLICY = (\{[^}]*\})/)?.[1]);
});

const unknownScope = { exerciseCanonical: null, revision: null };
const noteD = (rowId: string, text: string, exercise = 'Bench', sessionId = 's1') => ({ sessionId, source: 'row_note', rowId, exercise, ...unknownScope, text });
const msgD = (source: string, text: string, sessionId = 's1') => ({ sessionId, source, rowId: null, exercise: null, ...unknownScope, text });

test('collectDisclosures returns exact pain/effort strings with provenance and explicit-unknown scope', () => {
  const rows = [row('r1', 'left shoulder pain on the way down  '), row('r2', 'warmup'), { ...row('r3', 'RPE 9'), exercise: 'bench PRESS ' }, row('r4', '')];
  const messages = [
    { source: 'coach_question', text: 'My shoulder hurts, should I keep benching?' },
    { source: 'composer_message', text: 'What weight next?' },
    { source: 'composer_message', text: 'Feeling exhaustion today' },
  ];
  assert.deepEqual(collectDisclosures(rows, messages, 's1'), [
    noteD('r1', 'left shoulder pain on the way down  '),
    noteD('r3', 'RPE 9', 'bench PRESS '),
    msgD('coach_question', 'My shoulder hurts, should I keep benching?'),
    msgD('composer_message', 'Feeling exhaustion today'),
  ]);
});

test('skip, missing answer or a later "no pain" never erases or synthesizes a disclosure', () => {
  const out = collectDisclosures([], [{ source: 'coach_question', text: 'my knee hurts' }, { source: 'coach_question', text: '' }, { source: 'composer_message', text: 'no pain now' }], 's1');
  assert.deepEqual(out.map(d => d.text), ['my knee hurts', 'no pain now'], 'chronological, literal, no precedence');
  assert.deepEqual(collectDisclosures([row('r1', '')], [{ source: 'coach_question', text: '' }], 's1'), []);
});

test('flag off: nothing is observed and no context is built', () => {
  const ref: any = { current: null };
  const record = coachingRecordFor(ref, 'owner:s1');
  observeCoaching(COACHING_POLICY, record, 's1', [row('r1', 'knee pain')], [{ source: 'composer_message', text: 'my knee hurts' }]);
  assert.deepEqual(record.disclosures, []);
  assert.equal(buildCoachingContext(COACHING_POLICY, 's1', record), undefined);
});

test('observed disclosures are append-only: a later row edit or delete cannot erase them', () => {
  const ref: any = { current: null };
  const record = coachingRecordFor(ref, 'owner:s1');
  observeCoaching(FLAG_ON, record, 's1', [row('r1', 'knee pain')], []);
  observeCoaching(FLAG_ON, record, 's1', [row('r1', 'knee pain')], []);
  observeCoaching(FLAG_ON, record, 's1', [row('r1', 'fine')], []); // edited
  observeCoaching(FLAG_ON, record, 's1', [], []); // deleted
  assert.deepEqual(buildCoachingContext(FLAG_ON, 's1', record)!.disclosures, [noteD('r1', 'knee pain')]);
  observeCoaching(FLAG_ON, record, 's1', [row('r1', 'knee pain worse')], []);
  assert.deepEqual(record.disclosures.map(d => d.text), ['knee pain', 'knee pain worse']);
  assert.equal(buildCoachingContext(FLAG_ON, null, record), undefined, 'no session, no context');
  assert.equal(coachingRecordFor(ref, 'owner:s2').disclosures.length, 0, 'new session starts empty');
  assert.equal(coachingRecordFor(ref, 'owner:s2'), ref.current);
});

test('over-cap sessions send the most recent disclosures plus an explicit omittedCount', () => {
  const ref: any = { current: null };
  const record = coachingRecordFor(ref, 'owner:s1');
  const rows = Array.from({ length: MAX_CONTEXT_DISCLOSURES + 5 }, (_, i) => row(`r${i}`, `pain ${i}`));
  observeCoaching(FLAG_ON, record, 's1', rows, [{ source: 'composer_message', text: `pain ${'x'.repeat(MAX_CONTEXT_TEXT)}` }]);
  const context = buildCoachingContext(FLAG_ON, 's1', record)!;
  assert.equal(context.disclosures.length, MAX_CONTEXT_DISCLOSURES);
  assert.equal(context.disclosures[0].text, 'pain 5');
  assert.equal(context.disclosures.at(-1)!.text, `pain ${MAX_CONTEXT_DISCLOSURES + 4}`);
  assert.equal(context.omittedCount, 6, '5 oldest + 1 oversized, never silent');
  assert.equal(record.disclosures.length, MAX_CONTEXT_DISCLOSURES + 6, 'record itself keeps everything');
});

// Real submitCoachQuestion closure; only API/storage/UI setters are doubles.
function coachRoute(overrides: Record<string, any> = {}) {
  const sent: any[] = [];
  const saved: any[] = [];
  const ctx: any = {
    coachQuestion: '', coachLoading: false, rows: [], workoutId: 'session-a',
    setCoachLoading: () => {}, setCoachError: (e: any) => { if (e) throw new Error(`unexpected coach error ${e}`); }, setCoachAnswer: () => {},
    saveCoachChatQA: async (...args: any[]) => { saved.push(args); },
    toApiRows: (rows: any[]) => rows, Platform: { OS: 'web' },
    FeatureGateError: class extends Error {}, showAiLimitAlert: () => {},
    api: { askCoach: async (question: string, rows: any[], _onChunk: any, chatHistory: any, context: any) => {
      // structuredClone: VM-realm arrays fail strict prototype comparison.
      sent.push(structuredClone({ question, rows, chatHistory, context })); return { answer: `answer to ${question}` };
    } },
    ...overrides,
  };
  const ask = async (question: string, archive: any[] = []) => { ctx.coachQuestion = question; await sourceClosure('submitCoachQuestion', ctx)(archive); };
  return { ctx, sent, saved, ask };
}
const archive = [
  { role: 'user', content: 'ARCHIVE: last week my elbow hurt', source: 'coach_modal' },
  { role: 'assistant', content: 'ARCHIVE answer', source: 'coach_modal' },
];

test('reopen sends only current-session Q/A, not the cross-session archive', async () => {
  const r = coachRoute();
  await r.ask('First question?', [...archive, { role: 'user', content: 'First question?' }]);
  // Modal reopened: it passes the refetched archive plus this session's pairs.
  await r.ask('Second question?', [...archive, { role: 'user', content: 'First question?' }, { role: 'assistant', content: 'answer to First question?' }, { role: 'user', content: 'Second question?' }]);
  assert.deepEqual(r.sent[0].chatHistory, [{ role: 'user', content: 'First question?' }]);
  assert.deepEqual(r.sent[1].chatHistory, [
    { role: 'user', content: 'First question?' }, { role: 'assistant', content: 'answer to First question?' },
    { role: 'user', content: 'Second question?' },
  ]);
  assert.equal(JSON.stringify(r.sent).includes('ARCHIVE'), false);
  assert.equal(r.saved.length, 2, 'archive persistence unchanged');
});

test('a new session does not inherit the previous session turns', async () => {
  const r = coachRoute();
  await r.ask('Old session question?');
  r.ctx.ownership.setOwner('offline-owner:session-b'); r.ctx.renderOwner = r.ctx.ownership.capture(); r.ctx.workoutId = 'session-b';
  await r.ask('New session question?');
  assert.deepEqual(r.sent[1].chatHistory, [{ role: 'user', content: 'New session question?' }]);
});

test('fenced or failed coach requests add no turn', async () => {
  const r = coachRoute({ setCoachError: () => {} });
  r.ctx.api.askCoach = async () => { throw new Error('offline'); };
  await r.ask('my wrist hurts?');
  r.ctx.api.askCoach = async (question: string, _rows: any, _c: any, chatHistory: any) => { r.sent.push(structuredClone({ question, chatHistory })); return { answer: '' }; };
  await r.ask('Next?');
  assert.deepEqual(r.sent[0].chatHistory, [{ role: 'user', content: 'Next?' }]);
  await r.ask('Then?');
  // C3: an empty answer is a failed request (question restored for resend), so it adds no turn either.
  assert.deepEqual(r.sent[1].chatHistory, [{ role: 'user', content: 'Then?' }], 'no fabricated assistant turn');
});

test('flag off: coach request carries no context', async () => {
  const r = coachRoute({ rows: [row('r1', 'shoulder pain')] });
  await r.ask('My shoulder hurts');
  assert.equal(r.sent[0].context, undefined);
});

test('flag on: pain disclosure survives >10 later turns while history stays bounded', async () => {
  const r = coachRoute({ COACHING_POLICY: FLAG_ON, rows: [row('r1', 'left knee pain')] });
  await r.ask('My shoulder hurts');
  for (let i = 1; i <= 11; i++) await r.ask(`Follow-up ${i}?`);
  const last = r.sent.at(-1);
  assert.equal(last.chatHistory.length, 10);
  assert.equal(JSON.stringify(last.chatHistory).includes('My shoulder hurts'), false, 'prose window dropped it');
  assert.deepEqual(last.context, { sessionId: 'session-a', omittedCount: 0, disclosures: [
    noteD('r1', 'left knee pain', 'Bench', 'session-a'), msgD('coach_question', 'My shoulder hurts', 'session-a'),
  ] });
});

test('flag on: coach disclosure from a row survives that row being edited and then deleted', async () => {
  const r = coachRoute({ COACHING_POLICY: FLAG_ON, rows: [row('r1', 'knee pain')] });
  await r.ask('Next weight?');
  r.ctx.rows = [row('r1', 'fine now')];
  await r.ask('And after that?');
  r.ctx.rows = [];
  await r.ask('Done?');
  for (const sent of r.sent) assert.deepEqual(sent.context.disclosures, [noteD('r1', 'knee pain', 'Bench', 'session-a')]);
});

// Real composer route (inSessionHarness runs the actual sendMessage closure).
async function composer(messages: string[], overrides: Record<string, any> = {}, rows: any[] = [row('r1', '')]) {
  const seen: any[] = [];
  const coachingRecordRef = { current: null };
  const replies = ['Where exactly? Does it hurt when pressing?', 'Then hold the weight this session.'];
  const chat = async (...args: any[]) => { seen.push(structuredClone(args)); return { answer: replies[seen.length - 1] ?? 'ok' }; };
  for (const m of messages) await runWorkoutRoute(m, rows, undefined, 1, false, { api: { chat }, coachingRecordRef, ...overrides });
  return { seen, record: coachingRecordRef.current as any };
}

test('flag on: composer pain then clarification reply carries disclosure and preceding clarification', async () => {
  const { seen } = await composer(['My shoulder hurts', 'Only on the way down'], { COACHING_POLICY: FLAG_ON });
  assert.deepEqual(seen[0][3], { sessionId: 'offline-session', omittedCount: 0, disclosures: [msgD('composer_message', 'My shoulder hurts', 'offline-session')] });
  assert.deepEqual(seen[1][3], { sessionId: 'offline-session', omittedCount: 0,
    disclosures: [msgD('composer_message', 'My shoulder hurts', 'offline-session')],
    exchange: { question: 'My shoulder hurts', answer: 'Where exactly? Does it hurt when pressing?' } });
  assert.equal(seen[1][0], 'Only on the way down', 'the reply itself is the only chat message; no replayed turns');
});

test('flag on: a session over the cap still sends, with explicit omittedCount', async () => {
  const rows = Array.from({ length: MAX_CONTEXT_DISCLOSURES + 1 }, (_, i) => row(`r${i}`, `pain ${i}`));
  const { seen } = await composer(['Should I add weight?'], { COACHING_POLICY: FLAG_ON }, rows);
  assert.equal(seen[0][3].disclosures.length, MAX_CONTEXT_DISCLOSURES);
  assert.equal(seen[0][3].omittedCount, 1, 'oldest row note omitted explicitly');
  assert.equal(seen[0][3].disclosures[0].text, 'pain 1');
});

test('flag off: composer chat payload unchanged and nothing recorded', async () => {
  const { seen, record } = await composer(['My shoulder hurts', 'Only on the way down']);
  assert.deepEqual(seen.map(args => args.length === 4 ? args[3] : 'absent'), [undefined, undefined]);
  const on = await composer(['My shoulder hurts', 'Only on the way down'], { COACHING_POLICY: FLAG_ON });
  assert.deepEqual(seen.map(args => args.slice(0, 3)), on.seen.map(args => args.slice(0, 3)), 'message, rows, lastExercise identical');
  assert.equal(record?.exchange, undefined);
  assert.deepEqual(record?.disclosures ?? [], []);
});

// Real lib/api.ts; fetchWithAuth is the transport boundary.
function realApi() {
  const bodies: any[] = [];
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    // C3: askCoach arms an idle deadline (timers + AbortController); bodies are unchanged.
    exports, Error, JSON, Response, TextDecoder, setTimeout, clearTimeout, AbortController, require: (name: string) => {
      if (name === './supabase') return { supabaseUrl: 'https://fixture.supabase.co' };
      if (name === './auth') return { fetchWithAuth: async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response('{"answer":"ok"}', { status: 200 }); } };
      return {};
    },
  });
  return { api: exports.api, bodies };
}

test('api attaches context only when the caller supplies one; default payload unchanged', async () => {
  const { api, bodies } = realApi();
  const context = { sessionId: 's1', disclosures: [{ sessionId: 's1', source: 'coach_question', text: 'knee hurts' }] };
  await api.chat('hi', [], 'Bench');
  await api.chat('hi', [], 'Bench', context);
  await api.askCoach('q', [], undefined, [{ role: 'user', content: 'q' }]);
  await api.askCoach('q', [], undefined, [{ role: 'user', content: 'q' }], context);
  assert.deepEqual(bodies[0], { message: 'hi', rows: [], lastExercise: 'Bench' });
  assert.deepEqual(bodies[1], { message: 'hi', rows: [], lastExercise: 'Bench', context });
  assert.deepEqual(bodies[2], { question: 'q', rows: [], chatHistory: [{ role: 'user', content: 'q' }] });
  assert.deepEqual(bodies[3], { question: 'q', rows: [], chatHistory: [{ role: 'user', content: 'q' }], context });
});

test('client transport bounds mirror the Edge validator exactly', () => {
  const edge = readFileSync(new URL('../../supabase/functions/_shared/coachingPolicy.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../coachingContext.ts', import.meta.url), 'utf8');
  for (const [e, c] of [['MAX_DISCLOSURES', 'MAX_CONTEXT_DISCLOSURES'], ['MAX_TEXT', 'MAX_CONTEXT_TEXT'], ['MAX_ID', 'MAX_CONTEXT_ID']]) {
    const ev = edge.match(new RegExp(`const ${e} = (\\d+)`))?.[1]; const cv = client.match(new RegExp(`const ${c} = (\\d+)`))?.[1];
    assert.ok(ev && cv, `${e}/${c} present`); assert.equal(cv, ev, `${c} must equal Edge ${e}`);
  }
});

test('flag on: a parse-mode reply clears the preceding exchange', async () => {
  const coachingRecordRef = { current: null as any }; const seen: any[] = [];
  const results = [{ answer: 'Where exactly?' }, { rows: [{ exercise: 'Bench', set: 1, weightLbs: '100', reps: '5', notes: '' }] }, { answer: 'ok' }];
  const chat = async (...args: any[]) => { seen.push(structuredClone(args)); return results[seen.length - 1]; };
  for (const m of ['My shoulder hurts', 'did some bench today felt alright', 'Should I add weight?'])
    await runWorkoutRoute(m, [], undefined, 1, false, { api: { chat }, coachingRecordRef, COACHING_POLICY: FLAG_ON });
  assert.equal(seen.length, 3, 'all three messages reached the AI path');
  assert.deepEqual(seen[1][3].exchange, { question: 'My shoulder hurts', answer: 'Where exactly?' });
  assert.equal(seen[2][3].exchange, undefined, 'no stale exchange after a parse-mode reply');
});
