import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as validation from '../workoutValidation.ts';
import { sourceModule } from './workoutIdentityHarness.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';
const lift = sourceModule('supabase/functions/_shared/liftMatching.ts', { './workoutValidation.ts': validation });
export function edge(name: string, rpc: (...args: any[]) => any) {
  let handler: any; const writes: string[] = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-0000-0000-000000000001' } }, error: null }) }, rpc,
    from: (table: string) => { const chain: any = { select: () => chain, eq: () => chain, in: () => chain, delete: () => { writes.push(table); return chain; }, insert: () => { writes.push(table); return chain; }, upsert: () => { writes.push(table); return chain; }, single: async () => ({ data: {}, error: null }), then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) }; return chain; } };
  const deps: any = { 'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: any) => handler = fn }, 'https://esm.sh/@supabase/supabase-js@2.50.1': { createClient: () => client }, '../_shared/liftMatching.ts': lift, '../_shared/workoutValidation.ts': validation, '../_shared/operationErrors.ts': sourceModule('supabase/functions/_shared/operationErrors.ts') };
  vm.runInNewContext(ts.transpileModule(readFileSync(`supabase/functions/${name}/index.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: {}, require: (key: string) => { assert.ok(key in deps, key); return deps[key]; }, Deno: { env: { get: () => 'offline' } }, Response, URL, console });
  return { writes, call: (body: any, method = 'POST') => handler(new Request(`https://offline.invalid/${name}`, { method, headers: { Authorization: 'Bearer offline' }, body: JSON.stringify(body) })) };
}
test('actual composer live effects transport stable session/row operation identity', async () => {
  const first = await runWorkoutRoute('Bench 100 8');
  const sent = first.calls.find(c => c.method === 'logSet')!.data;
  assert.equal(sent.sessionId, 'offline-session'); assert.equal(sent.rowId, first.rows[0].id);
  assert.equal(sent.revision, 1); assert.equal(sent.operationKey, `put:${first.rows[0].id}:1`);
});
test('actual local-first storage persists final operation identity before HTTP and keeps it for retry', async () => {
  let raw: string | null = null; const captures: any[] = [];
  const storage = sourceModule('lib/workoutStorage.ts', {
    './api': { api: { saveWorkout: async (payload: any) => { captures.push(payload); assert.equal(JSON.parse(raw!)[0].operationKey, payload.operationKey); if (captures.length===1) throw new Error('offline'); } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_k: any,v: string) => raw=v } },
  });
  const session = { id: 's', dateISO: '2026-10-08', part: 'Push', createdAt: 1, rows: [{ id:'r',exercise:'Bench',set:1,weightLbs:'100',reps:'8',notes:'' }] };
  assert.equal((await storage.saveWorkout(session)).synced, false);
  assert.ok(captures[0].operationKey); assert.ok(Number.isSafeInteger(captures[0].revision));
  assert.equal(await storage.syncPendingWorkouts(), 1);
  assert.equal(captures[0].operationKey, captures[1].operationKey); assert.equal(captures[0].revision,captures[1].revision);
});
test('actual history delete requires an operation identity and uses the session tombstone RPC', async () => {
  let args: any; const e = edge('history', async (name: string, body: any) => { args={name,body}; return { data: {ok:true}, error:null }; });
  assert.equal((await e.call({id:identity.sessionId,revision:3,operationKey:'delete:3'}, 'DELETE')).status,200);
  assert.equal(args.name,'apply_workout_operation'); assert.equal(args.body.p_kind,'delete');
  assert.equal(args.body.p_session_id,identity.sessionId); assert.deepEqual(e.writes,[]);
});
test('actual row deletion sends a stable row tombstone identity before a delayed live commit', async () => {
  const calls: any[] = []; const current = [{ id:'delete-row', exercise:'Bench',set:1,weightLbs:'100',reps:'8',notes:'',timestamp:1 }];
  const { sourceClosure } = await import('./workoutIdentityHarness.ts');
  const run = sourceClosure('deleteRow', { workoutId:'session-one',workoutDateISO:'2026-10-08',draftRowsRef:{current},
    applyPendingEdit:(rows:any[])=>({nextRows:rows,invalid:false}),resequenceSets:(rows:any[])=>rows,
    persistDraftRows:()=>{},withPendingRows:()=>{},setRows:()=>{},setEditingCell:()=>{},setEditValue:()=>{},api:{logSet:async (payload:any)=>{calls.push(payload);return {ok:true};}},showToast:()=>{} });
  await run('delete-row');
  assert.equal(calls.length,1); assert.equal(calls[0].operation,'drop'); assert.equal(calls[0].rowId,'delete-row'); assert.equal(calls[0].sessionId,'session-one');
});
test('late deletion failure cannot present a toast in a replacement session', async () => {
  const { sourceClosure } = await import('./workoutIdentityHarness.ts');
  const { createSessionOwnership } = await import('../sessionOwnership.ts');
  const ownership=createSessionOwnership('original'); const toasts:any[]=[]; let release!:(value:any)=>void;
  const current=[{id:'delete-row',exercise:'Bench',set:1,weightLbs:'100',reps:'8',notes:'',timestamp:1}];
  const run=sourceClosure('deleteRow',{ownership,workoutId:'s',workoutDateISO:'2026-10-08',draftRowsRef:{current},applyPendingEdit:(rows:any[])=>({nextRows:rows}),resequenceSets:(r:any[])=>r,persistDraftRows:()=>{},withPendingRows:()=>{},api:{logSet:()=>new Promise(r=>release=r)},showToast:(value:any)=>toasts.push(value)});
  run('delete-row'); ownership.setOwner('replacement'); release(null); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(toasts,[]);
});
export const row = { id: 'row-one', exercise: 'Bench', set: 1, weightLbs: '100', reps: '8', notes: '', performance: 'performed' };
export const identity = { sessionId: 'session-one', rowId: row.id, revision: 1, operationKey: 'put:row-one:1', dateISO: '2026-10-08' };
test('actual log-set rejects identity-free legacy writes without table writes', async () => {
  const e = edge('log-set', async () => ({ data: { ok: true }, error: null }));
  assert.equal((await e.call(row)).status, 400); assert.deepEqual(e.writes, []);
});
test('actual log-set sends identity and JWT-owned operation to SQL RPC only', async () => {
  let args: any; const e = edge('log-set', async (name: string, body: any) => { args = { name, body }; return { data: { ok: true }, error: null }; });
  assert.equal((await e.call({ ...row, ...identity, userId: 'attacker' })).status, 200);
  assert.equal(args.name, 'apply_workout_operation'); assert.equal(args.body.p_session_id, identity.sessionId);
  assert.equal(args.body.p_operation_key, identity.operationKey); assert.equal(args.body.p_revision, 1);
  assert.equal(args.body.p_row_id, row.id); assert.equal('p_user_id' in args.body, false); assert.deepEqual(e.writes, []);
});
test('actual history missing RPC fails closed without nontransactional fallback', async () => {
  const e = edge('history', async () => ({ error: { message: 'missing function private' } }));
  const response = await e.call({ id: identity.sessionId, revision: 2, operationKey: 'final:2', dateISO: identity.dateISO, part: 'Push', createdAt: 1, rows: [row] });
  assert.equal(response.status, 500); assert.deepEqual(e.writes, []); assert.doesNotMatch(await response.text(), /private/);
});
test('actual Edge revise validates incomplete actual edits and maps them to the transactional RPC',async()=>{
  let captured:any;
  const e=edge('log-set',async(_n:any,args:any)=>{captured=args;return {data:{ok:true},error:null};});
  const response=await e.call({...row,...identity,reps:'',performance:'planned',operation:'revise'});
  assert.equal(response.status,200);assert.equal(captured.p_kind,'revise');
});
