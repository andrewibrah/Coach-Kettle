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

type GlobalHandler = (error: any, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler: () => GlobalHandler;
  setGlobalHandler: (handler: GlobalHandler) => void;
};

function scrub(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');
}

export async function recordCrash(error: unknown, isFatal: boolean, appVersion: string | null): Promise<void> {
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

export function formatCrashAlert(record: CrashRecord): string {
  const stackLines = record.stack ? record.stack.split('\n').slice(0, ALERT_STACK_LINES).join('\n') : '';
  return [record.message, stackLines, `${record.timestamp}${record.appVersion ? ` · ${record.appVersion}` : ''}`]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Records every uncaught error, then chains to the previous global handler.
 * Fatal errors wait for the write (bounded by FATAL_WRITE_TIMEOUT_MS) so the
 * record lands before the abort; non-fatal errors chain immediately.
 */
export function installCrashCapture(errorUtils: ErrorUtilsLike, appVersion: string | null): void {
  const previous = errorUtils.getGlobalHandler();

  errorUtils.setGlobalHandler((error, isFatal) => {
    const write = recordCrash(error, !!isFatal, appVersion).catch(() => {});

    if (!isFatal) {
      previous(error, isFatal);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FATAL_WRITE_TIMEOUT_MS);
    });
    Promise.race([write, timeout]).then(() => {
      clearTimeout(timer);
      previous(error, isFatal);
    });
  });
}
