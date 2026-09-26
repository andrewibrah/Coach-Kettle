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

// Stands in for react-native's ExceptionsManager default export: callers
// (ErrorHandlers.onUncaughtError, setUpErrorHandling's ErrorUtils handler) look
// `handleException` up on the object at call time.
function fakeExceptionsManager(original: (error: any, isFatal: boolean) => void) {
  const host = { handleException: original };
  return Object.assign(host, {
    fire: (error: any, isFatal: boolean) => host.handleException(error, isFatal),
  });
}

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlX2hlcmU';

test('the crash key survives sign-out: clearAllCaches never matches it', () => {
  const { storage } = memoryStorage();
  const { CRASH_RECORD_KEY } = loadCrashCapture(storage);
  assert.equal(typeof CRASH_RECORD_KEY, 'string');
  const authProvider = read('contexts/AuthProvider.tsx');
  // Read the key filter from clearAllCaches() itself so the test follows it.
  const prefixes = [...authProvider.matchAll(/key\.startsWith\('([^']+)'\)/g)].map((m) => m[1]);
  const substrings = [...authProvider.matchAll(/key\.includes\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(prefixes.length > 0 && substrings.length > 0, 'clearAllCaches key filter not found');
  for (const prefix of prefixes) assert.equal(CRASH_RECORD_KEY.startsWith(prefix), false, prefix);
  for (const part of substrings) assert.equal(CRASH_RECORD_KEY.includes(part), false, part);
  assert.equal(authProvider.includes(CRASH_RECORD_KEY), false);
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
  const exceptionsManager = fakeExceptionsManager((_error, isFatal) => {
    order.push(`original:${isFatal}:${storage.data.has(CRASH_RECORD_KEY)}`);
  });
  installCrashCapture(exceptionsManager, null);

  exceptionsManager.fire(new Error('fatal boom'), true);
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
  const exceptionsManager = fakeExceptionsManager(() => { order.push('original'); });
  installCrashCapture(exceptionsManager, null);

  exceptionsManager.fire(new Error('fatal boom'), true);
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
  const exceptionsManager = fakeExceptionsManager((error, isFatal) => { order.push(`original:${error.message}:${isFatal}`); });
  installCrashCapture(exceptionsManager, null);

  exceptionsManager.fire(new Error('soft'), false);
  assert.deepEqual(order, ['original:soft:false']);

  await tick();
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
  const exceptionsManager = fakeExceptionsManager(() => { order.push('original'); });
  installCrashCapture(exceptionsManager, null);

  exceptionsManager.fire(new Error('fatal boom'), true);
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

test('the original handleException is called exactly once per error', async () => {
  const { storage } = memoryStorage();
  const { installCrashCapture } = loadCrashCapture(storage);
  let calls = 0;
  const exceptionsManager = fakeExceptionsManager(() => { calls++; });
  installCrashCapture(exceptionsManager, null);

  exceptionsManager.fire(new Error('fatal'), true);
  exceptionsManager.fire(new Error('soft'), false);
  await tick();
  assert.equal(calls, 2);
});

test('installing twice (Fast Refresh) does not stack wrappers', async () => {
  const { storage } = memoryStorage();
  const { installCrashCapture } = loadCrashCapture(storage);
  let calls = 0;
  const writes: string[] = [];
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { writes.push(key); return setItem(key, value); };
  const exceptionsManager = fakeExceptionsManager(() => { calls++; });
  installCrashCapture(exceptionsManager, null);
  const wrapped = exceptionsManager.handleException;
  installCrashCapture(exceptionsManager, null);
  assert.equal(exceptionsManager.handleException, wrapped);

  exceptionsManager.fire(new Error('fatal'), true);
  await tick();
  assert.equal(calls, 1);
  assert.equal(writes.length, 1);
});

test('a non-fatal error never overwrites a stored fatal record', async () => {
  const { storage } = memoryStorage();
  const { recordCrash, takeCrashRecord } = loadCrashCapture(storage);
  await recordCrash(new Error('the crash'), true, null);
  await recordCrash(new Error('noise afterwards'), false, null);
  const record = await takeCrashRecord();
  assert.equal(record.message, 'the crash');
  assert.equal(record.isFatal, true);
});

test('a non-fatal error raised while the fatal write is in flight cannot overwrite it', async () => {
  const { storage, releaseWrites } = memoryStorage({ holdWrites: true });
  const { recordCrash, takeCrashRecord } = loadCrashCapture(storage);
  const fatal = recordCrash(new Error('the crash'), true, null);
  const soft = recordCrash(new Error('noise'), false, null);
  await tick();
  releaseWrites();
  await fatal;
  await tick();
  releaseWrites();
  await soft;
  const record = await takeCrashRecord();
  assert.equal(record.message, 'the crash');
});

test('a later fatal replaces an earlier non-fatal record', async () => {
  const { storage } = memoryStorage();
  const { recordCrash, takeCrashRecord } = loadCrashCapture(storage);
  await recordCrash(new Error('noise'), false, null);
  await recordCrash(new Error('the crash'), true, null);
  assert.equal((await takeCrashRecord()).message, 'the crash');
});

test('auth callback params and UUIDs are scrubbed', async () => {
  const { storage } = memoryStorage();
  const { recordCrash, takeCrashRecord } = loadCrashCapture(storage);
  await recordCrash(
    new Error('bad url coachkettle://auth/callback?code=abc-123&x=1#access_token=opaque1&refresh_token=r3fr35h&provider_token=pt for 0f8fad5b-d9cb-469f-a165-70867728950e'),
    true,
    null,
  );
  const record = await takeCrashRecord();
  assert.equal(
    record.message,
    'bad url coachkettle://auth/callback?code=[redacted]&x=1#access_token=[redacted]&refresh_token=[redacted]&provider_token=[redacted] for [id]',
  );
});

test('crashAlertTitle distinguishes a crash from a non-fatal error', () => {
  const { storage } = memoryStorage();
  const { crashAlertTitle } = loadCrashCapture(storage);
  const base = { message: 'x', stack: null, timestamp: '2026-09-26T19:31:08.000Z', appVersion: null };
  assert.equal(crashAlertTitle({ ...base, isFatal: true }), 'The app crashed last time');
  assert.equal(crashAlertTitle({ ...base, isFatal: false }), 'An error occurred last time');
});
