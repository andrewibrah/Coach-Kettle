drop extension if exists "pg_net";

drop policy "chat_history_delete_own" on "public"."chat_history";

drop policy "chat_history_insert_own" on "public"."chat_history";

drop policy "chat_history_select_own" on "public"."chat_history";

drop policy "chat_history_update_own" on "public"."chat_history";

drop policy "workout_log_delete_own" on "public"."workout_log";

drop policy "workout_log_insert_own" on "public"."workout_log";

drop policy "workout_log_select_own" on "public"."workout_log";

drop policy "workout_log_update_own" on "public"."workout_log";

drop policy "workouts_delete_own" on "public"."workouts";

drop policy "workouts_insert_own" on "public"."workouts";

drop policy "workouts_select_own" on "public"."workouts";

drop policy "workouts_update_own" on "public"."workouts";

revoke delete on table "public"."chat_history" from "anon";

revoke insert on table "public"."chat_history" from "anon";

revoke references on table "public"."chat_history" from "anon";

revoke select on table "public"."chat_history" from "anon";

revoke trigger on table "public"."chat_history" from "anon";

revoke truncate on table "public"."chat_history" from "anon";

revoke update on table "public"."chat_history" from "anon";

revoke delete on table "public"."chat_history" from "authenticated";

revoke insert on table "public"."chat_history" from "authenticated";

revoke references on table "public"."chat_history" from "authenticated";

revoke select on table "public"."chat_history" from "authenticated";

revoke trigger on table "public"."chat_history" from "authenticated";

revoke truncate on table "public"."chat_history" from "authenticated";

revoke update on table "public"."chat_history" from "authenticated";

revoke delete on table "public"."chat_history" from "service_role";

revoke insert on table "public"."chat_history" from "service_role";

revoke references on table "public"."chat_history" from "service_role";

revoke select on table "public"."chat_history" from "service_role";

revoke trigger on table "public"."chat_history" from "service_role";

revoke truncate on table "public"."chat_history" from "service_role";

revoke update on table "public"."chat_history" from "service_role";

alter table "public"."chat_history" drop constraint "chat_history_role_check";

alter table "public"."chat_history" drop constraint "chat_history_source_check";

alter table "public"."chat_history" drop constraint "chat_history_user_id_fkey";

alter table "public"."workout_log" drop constraint "workout_log_user_id_fkey";

alter table "public"."workouts" drop constraint "workouts_user_id_fkey";

alter table "public"."chat_history" drop constraint "chat_history_pkey";

drop index if exists "public"."chat_history_pkey";

drop index if exists "public"."idx_workout_log_user_id_created_at";

drop index if exists "public"."idx_workouts_user_id_created_at";

drop table "public"."chat_history";


  create table "public"."chats" (
    "id" text not null,
    "title" text,
    "role" text not null,
    "content" text not null,
    "createdAt" bigint not null,
    "source" text
      );


alter table "public"."chats" enable row level security;

alter table "public"."workout_log" drop column "user_id";

alter table "public"."workouts" drop column "user_id";

CREATE UNIQUE INDEX chats_pkey ON public.chats USING btree (id);

CREATE INDEX idx_chats_created_at ON public.chats USING btree ("createdAt" DESC);

CREATE INDEX idx_chats_source ON public.chats USING btree (source);

alter table "public"."chats" add constraint "chats_pkey" PRIMARY KEY using index "chats_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_chat(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.chats where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_chats()
 RETURNS SETOF public.chats
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.chats order by "createdAt" desc limit 100;
$function$
;

CREATE OR REPLACE FUNCTION public.save_chat(p_id text, p_title text, p_role text, p_content text, p_created_at bigint, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

grant delete on table "public"."chats" to "anon";

grant insert on table "public"."chats" to "anon";

grant references on table "public"."chats" to "anon";

grant select on table "public"."chats" to "anon";

grant trigger on table "public"."chats" to "anon";

grant truncate on table "public"."chats" to "anon";

grant update on table "public"."chats" to "anon";

grant delete on table "public"."chats" to "authenticated";

grant insert on table "public"."chats" to "authenticated";

grant references on table "public"."chats" to "authenticated";

grant select on table "public"."chats" to "authenticated";

grant trigger on table "public"."chats" to "authenticated";

grant truncate on table "public"."chats" to "authenticated";

grant update on table "public"."chats" to "authenticated";

grant delete on table "public"."chats" to "service_role";

grant insert on table "public"."chats" to "service_role";

grant references on table "public"."chats" to "service_role";

grant select on table "public"."chats" to "service_role";

grant trigger on table "public"."chats" to "service_role";

grant truncate on table "public"."chats" to "service_role";

grant update on table "public"."chats" to "service_role";


  create policy "chats_deny_all"
  on "public"."chats"
  as permissive
  for all
  to public
using (false)
with check (false);



  create policy "workout_log_deny_all"
  on "public"."workout_log"
  as permissive
  for all
  to public
using (false)
with check (false);



  create policy "workouts_deny_all"
  on "public"."workouts"
  as permissive
  for all
  to public
using (false)
with check (false);



