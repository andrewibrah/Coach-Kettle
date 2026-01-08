-- Observability: event logs table and supporting index.

create table if not exists public.event_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text not null,
  level text not null,
  message text not null,
  context jsonb,
  user_id uuid
);

create index if not exists event_logs_created_at_idx on public.event_logs (created_at desc);
create index if not exists event_logs_level_idx on public.event_logs (level);
create index if not exists event_logs_source_idx on public.event_logs (source);
