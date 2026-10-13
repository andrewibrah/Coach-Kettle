// Single-flight guard for a submit action. The flag is taken synchronously, so
// a second press in the same tick is ignored. Failures propagate to the caller.
export function createSubmitGuard(options: { once?: boolean } = {}) {
  let active = false;
  let consumed = false;
  return {
    get active() { return active; },
    async run(task: () => Promise<void>): Promise<boolean> {
      if (active || consumed) return false;
      active = true;
      try {
        await task();
        consumed = options.once === true;
        return true;
      } finally {
        active = false;
      }
    },
  };
}
