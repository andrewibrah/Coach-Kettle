-- Documentation only: measurement values are not cleared by the body-metrics upsert API.
COMMENT ON TABLE public.body_metrics IS
  'Per-user body measurements; one row per user and measured_date. The body-metrics API merges supplied numeric fields; omitted, null, or blank numeric inputs leave stored values unchanged. Whole-entry deletion is separate.';
