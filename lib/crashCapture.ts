/**
 * Records uncaught JS errors so a fatal crash in a release build (where the
 * red box is replaced by an abort) can be shown to the user on next launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Intentionally NOT cleared by clearAllCaches() in contexts/AuthProvider.tsx:
// a crash on the sign-in path must survive the sign-out that usually precedes
// the retry. That rule exists to stop user data leaking across accounts, and
// this record holds none: tokens and emails are scrubbed before writing. The
// name must also stay clear of clearAllCaches' 'auth' / 'supabase' / 'sb-'
// key filters.
export const CRASH_RECORD_KEY = 'crash_capture_last_v1';

// A fatal error aborts the process once the original handler runs, so give the
// write at most this long before handing over.
const FATAL_WRITE_TIMEOUT_MS = 500;
const MAX_STACK_LENGTH = 4000;
const ALERT_STACK_LINES = 5;

export type CrashRecord = {
  message: string;
  stack: string | null;
  isFatal: boolean;
  timestamp: string;
  appVersion: string | null;
};

type HandleException = (error: unknown, isFatal: boolean) => void;

// Shape of react-native's ExceptionsManager default export.
type ExceptionsManagerLike = { handleException: HandleException };

const INSTALLED = Symbol.for('coachkettle.crashCapture.installed');

function scrub(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/\b((?:access|refresh|provider|provider_refresh|id)_token|code)=[^&#\s]+/g, '$1=[redacted]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');
}

// Serialises writes so a non-fatal error can never land after (and over) a fatal one.
let writeQueue: Promise<void> = Promise.resolve();

/** Stores the error, unless it is non-fatal and a fatal record is already waiting to be shown. */
export function recordCrash(error: unknown, isFatal: boolean, appVersion: string | null): Promise<void> {
  const write = writeQueue.then(() => writeRecord(error, isFatal, appVersion));
  writeQueue = write.catch(() => {});
  return write;
}

async function writeRecord(error: unknown, isFatal: boolean, appVersion: string | null): Promise<void> {
  if (!isFatal) {
    const existing = await AsyncStorage.getItem(CRASH_RECORD_KEY);
    try {
      if (existing !== null && (JSON.parse(existing) as CrashRecord).isFatal) return;
    } catch {
      // Corrupt record: overwrite it.
    }
  }

  const err = error as { message?: unknown; stack?: unknown } | null;
  const message = typeof err?.message === 'string' ? err.message : String(error);
  const stack = typeof err?.stack === 'string' ? err.stack.slice(0, MAX_STACK_LENGTH) : null;
  const record: CrashRecord = {
    message: scrub(message),
    stack: stack === null ? null : scrub(stack),
    isFatal,
    timestamp: new Date().toISOString(),
    appVersion,
  };
  await AsyncStorage.setItem(CRASH_RECORD_KEY, JSON.stringify(record));
}

/** Returns the stored crash record (if any) and deletes it, so it is shown once. */
export async function takeCrashRecord(): Promise<CrashRecord | null> {
  const raw = await AsyncStorage.getItem(CRASH_RECORD_KEY);
  if (raw === null) return null;
  await AsyncStorage.removeItem(CRASH_RECORD_KEY);
  try {
    return JSON.parse(raw) as CrashRecord;
  } catch {
    return null;
  }
}

export function crashAlertTitle(record: CrashRecord): string {
  return record.isFatal ? 'The app crashed last time' : 'An error occurred last time';
}

export function formatCrashAlert(record: CrashRecord): string {
  const stackLines = record.stack ? record.stack.split('\n').slice(0, ALERT_STACK_LINES).join('\n') : '';
  return [record.message, stackLines, `${record.timestamp}${record.appVersion ? ` · ${record.appVersion}` : ''}`]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Wraps react-native's ExceptionsManager.handleException, the single sink for
 * both uncaught React render/effect/commit errors (renderer onUncaughtError /
 * onCaughtError) and errors reported through ErrorUtils (setUpErrorHandling's
 * global handler delegates to it). Records every error, then calls the
 * original exactly once: fatal errors wait for the write (bounded by
 * FATAL_WRITE_TIMEOUT_MS) so the record lands before the abort; non-fatal
 * errors are handed over immediately.
 */
export function installCrashCapture(exceptionsManager: ExceptionsManagerLike, appVersion: string | null): void {
  const current = exceptionsManager.handleException as HandleException & { [INSTALLED]?: true };
  // Fast Refresh re-runs the installing module; never stack a second wrapper.
  if (current[INSTALLED]) return;
  const original = current;

  const wrapped: HandleException & { [INSTALLED]?: true } = (error, isFatal) => {
    const write = recordCrash(error, !!isFatal, appVersion).catch(() => {});

    if (!isFatal) {
      original(error, isFatal);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FATAL_WRITE_TIMEOUT_MS);
    });
    Promise.race([write, timeout]).then(() => {
      clearTimeout(timer);
      original(error, isFatal);
    });
  };
  wrapped[INSTALLED] = true;
  exceptionsManager.handleException = wrapped;
}
