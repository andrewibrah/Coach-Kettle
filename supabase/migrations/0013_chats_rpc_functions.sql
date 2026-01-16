-- RPC functions for chat operations

-- Save a chat message (user or assistant)
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
  insert into public.chats (id, title, role, content, "createdAt", source)
  values (p_id, p_title, p_role, p_content, p_created_at, p_source)
  on conflict (id) do update
    set title = excluded.title,
        role = excluded.role,
        content = excluded.content,
        "createdAt" = excluded."createdAt",
        source = excluded.source;
end;
$$;

-- List all chats (newest first, limited to 100)
create or replace function public.list_chats()
returns setof public.chats
language sql
security definer
set search_path = public
as $$
  select * from public.chats order by "createdAt" desc limit 100;
$$;

-- Delete a chat by id
create or replace function public.delete_chat(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chats where id = p_id;
end;
$$;

