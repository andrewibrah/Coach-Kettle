-- Restore pr_history in the supabase_realtime publication.
--
-- Migration 0024 added public.pr_history to supabase_realtime, but the live
-- publication was later emptied outside migrations (pg_publication_tables
-- returns zero rows). The client's pr_breakthroughs channel subscribes
-- successfully but never receives INSERT events, so the realtime backup
-- path for PR celebrations is silently dead.
--
-- Idempotent: safe to run whether or not the table is already a member.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'pr_history'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.pr_history;
    END IF;
END $$;
