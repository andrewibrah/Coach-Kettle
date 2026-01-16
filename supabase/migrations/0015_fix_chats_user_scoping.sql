-- Fix chats table: add user_id column and proper RLS policies
-- This migration adds user scoping to the chats table

-- Step 1: Add user_id column to chats table
alter table if exists public.chats
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Step 2: Create index for efficient user-scoped queries
create index if not exists idx_chats_user_id_created_at 
  on public.chats (user_id, "createdAt" desc);

-- Step 3: Drop the deny_all policy that was blocking access
drop policy if exists chats_deny_all on public.chats;

-- Step 4: Create proper RLS policies for user-scoped access
create policy chats_select_own on public.chats
  for select using (auth.uid() = user_id);

create policy chats_insert_own on public.chats
  for insert with check (auth.uid() = user_id);

create policy chats_update_own on public.chats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy chats_delete_own on public.chats
  for delete using (auth.uid() = user_id);

-- Step 5: Update the save_chat function to include user_id
create or replace function public.save_chat(
  p_id text,
  p_title text,
  p_role text,
  p_content text,
  p_created_at bigint,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chats (id, title, role, content, "createdAt", source, user_id)
  values (p_id, p_title, p_role, p_content, p_created_at, p_source, auth.uid())
  on conflict (id) do update
    set title = excluded.title,
        role = excluded.role,
        content = excluded.content,
        "createdAt" = excluded."createdAt",
        source = excluded.source,
        user_id = auth.uid();
end;
$$;

-- Step 6: Update list_chats to only return user's own chats
create or replace function public.list_chats()
returns setof public.chats
language sql
security definer
set search_path = public
as $$
  select * from public.chats 
  where user_id = auth.uid()
  order by "createdAt" desc 
  limit 100;
$$;

-- Step 7: Update delete_chat to only delete user's own chats
create or replace function public.delete_chat(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chats where id = p_id and user_id = auth.uid();
end;
$$;
