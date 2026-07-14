type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const fallbackStorage = new Map<string, string>();
const failedRemovals = new Set<string>();

function getBrowserStorage(): Storage {
  return window.localStorage;
}

export const supabaseAuthStorage: StorageAdapter = {
  async getItem(key) {
    if (typeof window === 'undefined') return null;

    try {
      const value = getBrowserStorage().getItem(key);

      if (value === null) {
        fallbackStorage.delete(key);
        failedRemovals.delete(key);
        return null;
      }

      if (failedRemovals.has(key)) {
        return fallbackStorage.get(key) ?? null;
      }

      fallbackStorage.delete(key);
      return value;
    } catch {
      // Fall back to memory when browser storage access is blocked.
      return fallbackStorage.get(key) ?? null;
    }
  },
  async setItem(key, value) {
    if (typeof window === 'undefined') return;

    try {
      getBrowserStorage().setItem(key, value);
      fallbackStorage.delete(key);
      failedRemovals.delete(key);
    } catch {
      // Keep the in-memory value when browser storage is unavailable or full.
      fallbackStorage.set(key, value);
    }
  },
  async removeItem(key) {
    if (typeof window === 'undefined') return;

    fallbackStorage.delete(key);
    try {
      getBrowserStorage().removeItem(key);
      failedRemovals.delete(key);
    } catch {
      // Prevent a stale browser value from resurfacing after a failed removal.
      failedRemovals.add(key);
    }
  },
};
