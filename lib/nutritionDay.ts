// Lifecycle adapter for the live-today Nutrition provider; no selected date is mutated.
export function watchNutritionDay(options: {
  readToday: () => string;
  onChange: () => void;
  subscribeActive: (check: () => void) => () => void;
}): () => void {
  let day = options.readToday();
  const check = () => {
    const next = options.readToday();
    if (next !== day) {
      day = next;
      options.onChange();
    }
  };
  const timer = setInterval(check, 60_000);
  const unsubscribe = options.subscribeActive(check);
  return () => { clearInterval(timer); unsubscribe(); };
}
