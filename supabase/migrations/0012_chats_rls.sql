-- RLS policies for chats table
-- Following the same pattern as workouts table

alter table if exists public.chats enable row level security;

-- Deny all access until explicit rules are defined.
drop policy if exists chats_deny_all on public.chats;
create policy chats_deny_all on public.chats
for all
using (false)
with check (false);

