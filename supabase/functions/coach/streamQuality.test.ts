import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachTextStream } from './coachStream.ts';

const enc = new TextEncoder();
const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('oversized unterminated line rejects safely and cancels before draining upstream', async () => {
  let reads = 0;
  let cancelled = 0;
  const upstream = new ReadableStream<Uint8Array>({
    pull(c) { reads++; c.enqueue(enc.encode('x'.repeat(4096))); if (reads === 100) c.close(); },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 });
  await assert.rejects(new Response(coachTextStream(upstream)).text(), /Coach response interrupted/);
  assert.ok(reads <= 5, `unterminated line consumed ${reads} chunks`);
  assert.equal(cancelled, 1);
  await tick();
  assert.equal(upstream.locked, false);
});

test('oversized multiline event cancels before reading its unbounded continuation', async () => {
  let reads = 0;
  let cancelled = 0;
  const upstream = new ReadableStream<Uint8Array>({
    pull(c) { reads++; c.enqueue(enc.encode(`data: ${' '.repeat(4096)}\n`)); if (reads === 100) c.close(); },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 });
  await assert.rejects(new Response(coachTextStream(upstream)).text(), /Coach response interrupted/);
  assert.ok(reads <= 16, `multiline event consumed ${reads} chunks`);
  assert.equal(cancelled, 1);
});

test('oversized network chunk fails before retaining an unbounded decoded remainder', async () => {
  let cancelled = 0;
  const upstream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(enc.encode(event('ok') + ':'.repeat(256 * 1024))); },
    cancel() { cancelled++; },
  });
  const reader = coachTextStream(upstream).getReader();
  await assert.rejects(reader.read(), /Coach response interrupted/);
  await tick();
  assert.equal(cancelled, 1);
  assert.equal(upstream.locked, false);
});

test('cancel during a pending read is idempotent, releases the reader, and is not a provider failure', async () => {
  let reads = 0;
  let cancelled = 0;
  const logs: unknown[] = [];
  const originalError = console.error;
  console.error = (...args) => { logs.push(args); };
  try {
    const upstream = new ReadableStream<Uint8Array>({
      pull() { reads++; },
      cancel() { cancelled++; },
    }, { highWaterMark: 0 });
    const reader = coachTextStream(upstream).getReader();
    const pending = reader.read();
    await tick();
    assert.equal(reads, 1);
    await Promise.all([reader.cancel('private-client-reason'), reader.cancel()]);
    assert.equal((await pending).done, true);
    await tick();
    assert.equal(cancelled, 1);
    assert.equal(upstream.locked, false);
    assert.deepEqual(logs, [], 'client cancellation is not an upstream failure');
  } finally { console.error = originalError; }
});

test('cancellation discards unread same-chunk events and DONE without touching a detached reader', async () => {
  let cancelled = 0;
  const upstream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(enc.encode(event('first') + event('unread') + 'data: [DONE]\n\n')); },
    cancel() { cancelled++; },
  });
  const output = coachTextStream(upstream);
  const reader = output.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'first');
  await reader.cancel();
  await reader.cancel();
  reader.releaseLock();
  await output.cancel();
  assert.equal(cancelled, 1);
  assert.equal(upstream.locked, false);
});

test('cancellation races safely with DONE cleanup and remains safe after reader release', async () => {
  let finish!: () => void;
  let started!: () => void;
  const cleanupStarted = new Promise<void>(resolve => { started = resolve; });
  let cancelled = 0;
  const upstream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(enc.encode('data: [DONE]\n\n')); },
    cancel() { cancelled++; started(); return new Promise<void>(resolve => { finish = resolve; }); },
  });
  const output = coachTextStream(upstream);
  const reader = output.getReader();
  const pending = reader.read();
  await cleanupStarted;
  const cancel = reader.cancel();
  finish();
  await cancel;
  assert.equal((await pending).done, true);
  reader.releaseLock();
  await output.cancel();
  assert.equal(cancelled, 1);
  assert.equal(upstream.locked, false);
});

test('same chunk and split chunks emit multiple events exactly once under demand', async () => {
  const expected = Array.from({ length: 100 }, (_, i) => `${i},`).join('');
  const bytes = enc.encode(Array.from({ length: 100 }, (_, i) => event(`${i},`)).join('') + 'data: [DONE]\n\n');
  for (const size of [bytes.length, 1, 7, 64]) {
    let offset = 0;
    const upstream = new ReadableStream<Uint8Array>({
      pull(c) { c.enqueue(bytes.slice(offset, offset + size)); offset += size; if (offset >= bytes.length) c.close(); },
    }, { highWaterMark: 0 });
    assert.equal(await new Response(coachTextStream(upstream)).text(), expected);
  }
});

test('exact line, event and chunk limits accept valid fixtures', async () => {
  const payload = JSON.stringify({ choices: [{ delta: { content: 'bounded' } }] });
  const parts = [payload];
  let remaining = 64 * 1024 - payload.length - 1;
  while (remaining > 0) {
    const size = Math.min(16000, remaining - 1);
    parts.push(' '.repeat(size));
    remaining -= size + 1;
  }
  const fixture = ':' + ' '.repeat(16 * 1024 - 1) + '\n' + parts.map(p => `data: ${p}\n`).join('') + '\ndata: [DONE]\n\n';
  const bytes = enc.encode(fixture + 'ignored'.padEnd(256 * 1024 - enc.encode(fixture).length, 'x'));
  assert.equal(bytes.length, 256 * 1024);
  const upstream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
  assert.equal(await new Response(coachTextStream(upstream)).text(), 'bounded');
});

test('stalled consumer bounds actual upstream reads and resumes without lost or duplicate events', async () => {
  let pulls = 0;
  let cancelled = 0;
  const upstream = new ReadableStream<Uint8Array>({
    pull(c) {
      const i = pulls++;
      if (i < 10000) c.enqueue(enc.encode(event(`${i},`)));
      else c.enqueue(enc.encode('data: [DONE]\n\n'));
    },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 });
  const output = coachTextStream(upstream);
  await tick();
  assert.equal(pulls, 0, 'no demand must not read the provider');
  const reader = output.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), '0,');
  await tick();
  assert.equal(pulls, 1, 'stalled consumer must not drain 10000 upstream events');
  let text = '0,';
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    text += new TextDecoder().decode(next.value);
  }
  assert.equal(text, Array.from({ length: 10000 }, (_, i) => `${i},`).join(''));
  assert.equal(cancelled, 1);
  assert.equal(upstream.locked, false);
});
