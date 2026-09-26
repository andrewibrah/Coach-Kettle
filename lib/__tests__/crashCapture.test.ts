import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

type Storage = {
  data: Map<string, string>;
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
};

function memoryStorage(opts: { holdWrites?: boolean } = {}) {
  const data = new Map<string, string>();
  const pending: (() => void)[] = [];
  const storage: Storage = {
    data,
    setItem: (key, value) => {
      const write = () => { data.set(key, value); };
      if (!opts.holdWrites) { write(); return Promise.resolve(); }
      return new Promise((resolve) => pending.push(() => { write(); resolve(); }));
    },
    getItem: async (key) => data.get(key) ?? null,
    removeItem: async (key) => { data.delete(key); },
  };
  return { storage, releaseWrites: () => pending.splice(0).forEach((fn) => fn()) };
}

function loadCrashCapture(storage: Storage, timers: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } = { setTimeout, clearTimeout }) {
  const exports: any = {};
  const code = ts.transpileModule(read('lib/crashCapture.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    Date,
    JSON,
    Promise,
    String,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    require: (name: string) => {
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

function fakeErrorUtils(previous: (error: any, isFatal?: boolean) => void) {
  let handler = previous;
  return {
    getGlobalHandler: () => handler,
    setGlobalHandler: (next: typeof previous) => { handler = next; },
    fire: (error: any, isFatal?: boolean) => handler(error, isFatal),
  };
}

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlX2hlcmU';

test('the crash key survives sign-out: clearAllCaches never matches it', () => {
  const { storage } = memoryStorage();
  const { CRASH_RECORD_KEY } = loadCrashCapture(storage);
  assert.equal(typeof CRASH_RECORD_KEY, 'string');
  // Mirrors the prefix/substring filter in contexts/AuthProvider.tsx clearAllCaches().
  assert.equal(
    CRASH_RECORD_KEY.startsWith('sb-') || CRASH_RECORD_KEY.includes('supabase') ||
      CRASH_RECORD_KEY.includes('auth') || CRASH_RECORD_KEY.startsWith('coach-kettle:nutrition'),
    false,
  );
  assert.equal(read('contexts/AuthProvider.tsx').includes(CRASH_RECORD_KEY), false);
});

test('recordCrash stores message, stack, isFatal, timestamp and app version; takeCrashRecord reads once then clears', async () => {
  const { storage } = memoryStorage();
  const { recordCrash, takeCrashRecord, CRASH_RECORD_KEY } = loadCrashCapture(storage);
  const error = new TypeError('Cannot read property \'routes\' of undefined');
  error.stack = 'TypeError: boom\n    at findDivergentState (bundle:1:2)';

  await recordCrash(error, true, '1.0.2 (74)');
  assert.ok(storage.data.has(CRASH_RECORD_KEY));

  const record = await takeCrashRecord();
  assert.equal(record.message, 'Cannot read property \'routes\' of undefined');
  assert.equal(record.stack, 'TypeError: boom\n    at findDivergentState (bundle:1:2)');
  assert.equal(record.isFatal, true);
  assert.equal(record.appVersion, '1.0.2 (74)');
  assert.equal(typeof record.timestamp, 'string');
  assert.ok(!Number.isNaN(Date.parse(record.timestamp)));

  assert.equal(storage.data.has(CRASH_RECORD_KEY), false);
  assert.equal(await takeCrashRecord(), null);
});

test('takeCrashRecord returns null and clears a corrupt record', async () => {
  const { storage } = memoryStorage();
  const { takeCrashRecord, CRASH_RECORD_KEY } = loadCrashCapture(storage);
  storage.data.set(CRASH_RECORD_KEY, '{not json');
  assert.equal(await takeCrashRecord(), null);
  assert.equal(storage.data.has(CRASH_RECORD_KEY), false);
});

test('recordCrash accepts non-Error throws', async () => {
  const { storage } = memoryStorage();
  const { recordCrash, takeCrashRecord } = loadCrashCapture(storage);
  await recordCrash('plain string thrown', false, null);
  const record = await takeCrashRecord();
  assert.equal(record.message, 'plain string thrown');
  assert.equal(record.stack, null);
  assert.equal(record.isFatal, false);
  assert.equal(record.appVersion, null);
});

test('tokens and emails are scrubbed from message and stack', async () => {
  const { storage } = memoryStorage();
  const { recordCrash, takeCrashRecord } = loadCrashCapture(storage);
  const error = new Error(`bad token ${JWT} for jane.doe+gym@example.co.uk`);
  error.stack = `Error: bad\n    at fetch (Bearer ${JWT})\n    at user andrew@icloud.com`;
  await recordCrash(error, true, null);
  const raw = storage.data.get((loadCrashCapture(storage)).CRASH_RECORD_KEY)!;
  assert.equal(raw.includes(JWT), false);
  assert.equal(raw.includes('example.co.uk'), false);
  assert.equal(raw.includes('andrew@icloud.com'), false);
  const record = await takeCrashRecord();
  assert.equal(record.message, 'bad token [token] for [email]');
  assert.equal(record.stack, 'Error: bad\n    at fetch (Bearer [token])\n    at user [email]');
});

test('fatal: the original handler runs only after the write resolves', async () => {
  const { storage, releaseWrites } = memoryStorage({ holdWrites: true });
  const { installCrashCapture, CRASH_RECORD_KEY } = loadCrashCapture(storage);
  const order: string[] = [];
  const errorUtils = fakeErrorUtils((_error, isFatal) => {
    order.push(`original:${isFatal}:${storage.data.has(CRASH_RECORD_KEY)}`);
  });
  installCrashCapture(errorUtils, null);

  errorUtils.fire(new Error('fatal boom'), true);
  await tick();
  assert.deepEqual(order, []);

  releaseWrites();
  await tick();
  assert.deepEqual(order, ['original:true:true']);
});

test('fatal: the original handler still runs after the 500 ms timeout if the write hangs', async () => {
  const { storage } = memoryStorage({ holdWrites: true });
  const scheduled: { fn: () => void; ms: number }[] = [];
  const timers = {
    setTimeout: ((fn: () => void, ms: number) => { scheduled.push({ fn, ms }); return scheduled.length; }) as any,
    clearTimeout: (() => {}) as any,
  };
  const { installCrashCapture } = loadCrashCapture(storage, timers);
  const order: string[] = [];
  const errorUtils = fakeErrorUtils(() => { order.push('original'); });
  installCrashCapture(errorUtils, null);

  errorUtils.fire(new Error('fatal boom'), true);
  await tick();
  assert.deepEqual(order, []);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 500);

  scheduled[0].fn();
  await tick();
  assert.deepEqual(order, ['original']);
});

test('non-fatal: the original handler runs immediately and the error is still recorded', async () => {
  const { storage, releaseWrites } = memoryStorage({ holdWrites: true });
  const { installCrashCapture, takeCrashRecord } = loadCrashCapture(storage);
  const order: string[] = [];
  const errorUtils = fakeErrorUtils((error, isFatal) => { order.push(`original:${error.message}:${isFatal}`); });
  installCrashCapture(errorUtils, null);

  errorUtils.fire(new Error('soft'), false);
  assert.deepEqual(order, ['original:soft:false']);

  releaseWrites();
  await tick();
  const record = await takeCrashRecord();
  assert.equal(record.message, 'soft');
  assert.equal(record.isFatal, false);
});

test('a failing storage write never swallows the crash', async () => {
  const { storage } = memoryStorage();
  storage.setItem = () => Promise.reject(new Error('disk full'));
  const { installCrashCapture } = loadCrashCapture(storage);
  const order: string[] = [];
  const errorUtils = fakeErrorUtils(() => { order.push('original'); });
  installCrashCapture(errorUtils, null);

  errorUtils.fire(new Error('fatal boom'), true);
  await tick();
  assert.deepEqual(order, ['original']);
});

test('formatCrashAlert shows the message and only the first stack lines', () => {
  const { storage } = memoryStorage();
  const { formatCrashAlert } = loadCrashCapture(storage);
  const stack = ['Error: x', 'at a', 'at b', 'at c', 'at d', 'at e', 'at f', 'at g'].join('\n');
  const text = formatCrashAlert({ message: 'x', stack, isFatal: true, timestamp: '2026-09-26T19:31:08.000Z', appVersion: '1.0.2' });
  assert.ok(text.startsWith('x\n'));
  assert.ok(text.includes('at d'));
  assert.equal(text.includes('at g'), false);
  assert.ok(text.includes('2026-09-26T19:31:08.000Z'));
  assert.ok(text.includes('1.0.2'));
});
