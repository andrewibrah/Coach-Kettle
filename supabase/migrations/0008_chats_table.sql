-- Chat history table for storing user questions and assistant answers
-- Mirrors the SQLite chats table structure from backend/main.py

create table if not exists public.chats (
    id text primary key,
    title text,
    role text not null, -- 'user' or 'assistant'
    content text not null,
    "createdAt" bigint not null,
    source text -- 'workout_chat' or 'coach_modal'
);

create index if not exists idx_chats_created_at on public.chats ("createdAt" desc);
create index if not exists idx_chats_source on public.chats (source);


