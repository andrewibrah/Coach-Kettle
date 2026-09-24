-- Two-user RLS isolation for body_metrics, body_photos and the private workout-media
-- storage objects that body-metrics signs/removes with the caller's JWT.
-- Run only against a disposable database (local Supabase stack, or a private cluster with
-- auth/storage stubs) where 0027 + 0036 are applied. Fixtures are rolled back.
-- Sets both JWT claim styles so auth.uid() resolves on either.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.body_metrics'::regclass), 'body_metrics RLS disabled';
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.body_photos'::regclass), 'body_photos RLS disabled';
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass), 'storage.objects RLS disabled';
 ASSERT NOT has_table_privilege('anon', 'public.body_metrics', 'SELECT'), 'anon can read body_metrics';
 ASSERT NOT has_table_privilege('anon', 'public.body_photos', 'SELECT'), 'anon can read body_photos';
 ASSERT NOT has_table_privilege('authenticated', 'public.body_photos', 'UPDATE'), 'body_photos UPDATE granted';
END $$;
INSERT INTO auth.users(id) VALUES
 ('a0000000-0000-4000-8000-00000000000a'), ('b0000000-0000-4000-8000-00000000000b');
INSERT INTO public.body_metrics(id, user_id, measured_date, weight_lbs) VALUES
 ('a1000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', '2026-09-01', 180),
 ('b1000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', '2026-09-01', 150);
INSERT INTO public.body_photos(id, user_id, captured_date, storage_path) VALUES
 ('a2000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', '2026-09-01', 'a0000000-0000-4000-8000-00000000000a/body/a.jpg'),
 ('b2000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', '2026-09-01', 'b0000000-0000-4000-8000-00000000000b/body/b.jpg');
INSERT INTO storage.objects(bucket_id, name, owner) VALUES
 ('workout-media', 'a0000000-0000-4000-8000-00000000000a/body/a.jpg', 'a0000000-0000-4000-8000-00000000000a'),
 ('workout-media', 'b0000000-0000-4000-8000-00000000000b/body/b.jpg', 'b0000000-0000-4000-8000-00000000000b');

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true),
       set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer; raised boolean;
BEGIN
 ASSERT auth.uid() = 'a0000000-0000-4000-8000-00000000000a', 'JWT claim not applied';
 -- Own rows/objects are visible (signing a URL needs SELECT on storage.objects).
 ASSERT (SELECT count(*) FROM public.body_metrics WHERE id = 'a1000000-0000-4000-8000-00000000000a') = 1, 'own metric hidden';
 ASSERT (SELECT count(*) FROM public.body_photos WHERE id = 'a2000000-0000-4000-8000-00000000000a') = 1, 'own photo hidden';
 ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'workout-media' AND name = 'a0000000-0000-4000-8000-00000000000a/body/a.jpg') = 1, 'own object hidden';
 -- B is invisible: no read, no signing.
 ASSERT NOT EXISTS (SELECT 1 FROM public.body_metrics WHERE user_id <> auth.uid()), 'cross-user metric read';
 ASSERT NOT EXISTS (SELECT 1 FROM public.body_photos WHERE user_id <> auth.uid()), 'cross-user photo read';
 ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'workout-media' AND name LIKE 'b0000000-0000-4000-8000-00000000000b/%'), 'cross-user object read';

 UPDATE public.body_metrics SET weight_lbs = 200 WHERE id = 'b1000000-0000-4000-8000-00000000000b';
 GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'cross-user metric update';
 DELETE FROM public.body_metrics WHERE id = 'b1000000-0000-4000-8000-00000000000b';
 GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'cross-user metric delete';
 DELETE FROM public.body_photos WHERE id = 'b2000000-0000-4000-8000-00000000000b';
 GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'cross-user photo delete';

 raised := false;
 BEGIN INSERT INTO public.body_metrics(user_id, measured_date, weight_lbs) VALUES ('b0000000-0000-4000-8000-00000000000b', '2026-09-05', 150);
 EXCEPTION WHEN insufficient_privilege THEN raised := true; END;
 ASSERT raised, 'metric inserted for another user';
 raised := false;
 BEGIN UPDATE public.body_metrics SET user_id = 'b0000000-0000-4000-8000-00000000000b' WHERE id = 'a1000000-0000-4000-8000-00000000000a';
 EXCEPTION WHEN insufficient_privilege THEN raised := true; END;
 ASSERT raised, 'metric reassigned to another user';
 raised := false;
 BEGIN INSERT INTO public.body_photos(user_id, captured_date, storage_path) VALUES ('b0000000-0000-4000-8000-00000000000b', '2026-09-05', 'b0000000-0000-4000-8000-00000000000b/body/x.jpg');
 EXCEPTION WHEN insufficient_privilege THEN raised := true; END;
 ASSERT raised, 'photo inserted for another user';
 raised := false;
 BEGIN UPDATE public.body_photos SET storage_path = 'b0000000-0000-4000-8000-00000000000b/body/b.jpg' WHERE id = 'a2000000-0000-4000-8000-00000000000a';
 EXCEPTION WHEN insufficient_privilege THEN raised := true; END;
 ASSERT raised, 'body_photos UPDATE allowed';
 raised := false;
 BEGIN INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('workout-media', 'b0000000-0000-4000-8000-00000000000b/body/evil.jpg', 'a0000000-0000-4000-8000-00000000000a');
 EXCEPTION WHEN insufficient_privilege THEN raised := true; END;
 ASSERT raised, 'object written into another user folder';
 -- Removal: 0 rows via RLS, or rejected outright by a storage delete guard; B's object
 -- must survive either way (read back as the owner role below).
 BEGIN DELETE FROM storage.objects WHERE bucket_id = 'workout-media' AND name = 'b0000000-0000-4000-8000-00000000000b/body/b.jpg';
 EXCEPTION WHEN OTHERS THEN NULL; END;

 -- Own-row writes still work.
 UPDATE public.body_metrics SET weight_lbs = 181 WHERE id = 'a1000000-0000-4000-8000-00000000000a';
 GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 1, 'own metric update blocked';
 DELETE FROM public.body_photos WHERE id = 'a2000000-0000-4000-8000-00000000000a';
 GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 1, 'own photo delete blocked';
END $$;
RESET ROLE;

-- Symmetric read check from B's side.
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000b', true),
       set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.body_metrics WHERE user_id = auth.uid()) = 1, 'B own metric hidden';
 ASSERT NOT EXISTS (SELECT 1 FROM public.body_metrics WHERE user_id <> auth.uid()), 'B reads A metric';
 ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'workout-media' AND name LIKE 'a0000000-0000-4000-8000-00000000000a/%'), 'B reads A object';
END $$;
RESET ROLE;

DO $$ BEGIN
 ASSERT (SELECT weight_lbs FROM public.body_metrics WHERE id = 'b1000000-0000-4000-8000-00000000000b') = 150, 'B metric changed';
 ASSERT (SELECT count(*) FROM public.body_metrics WHERE user_id = 'b0000000-0000-4000-8000-00000000000b') = 1, 'B metric count changed';
 ASSERT EXISTS (SELECT 1 FROM public.body_photos WHERE id = 'b2000000-0000-4000-8000-00000000000b'), 'B photo removed';
 ASSERT EXISTS (SELECT 1 FROM storage.objects WHERE name = 'b0000000-0000-4000-8000-00000000000b/body/b.jpg'), 'B object removed';
 ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = 'b0000000-0000-4000-8000-00000000000b/body/evil.jpg'), 'foreign object written';
 ASSERT (SELECT weight_lbs FROM public.body_metrics WHERE id = 'a1000000-0000-4000-8000-00000000000a') = 181, 'own update lost';
END $$;
ROLLBACK;
\echo 'body_metrics RLS/storage isolation SQL tests passed (fixtures rolled back)'
