-- Real tables/migrations; only timezone preference is minimal bootstrap.
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO notification_preferences SELECT id,'UTC' FROM auth.users;
CREATE FUNCTION public.coach_fixture(owner_id uuid, marker text, d date DEFAULT current_date, historical boolean DEFAULT false, snapshot jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.persist_coach_feedback(owner_id,d,historical,
 jsonb_build_object('user_id','00000000-0000-0000-0000-000000000002','is_training_day',false,'calories',2000,'protein_g',100,'carbs_g',200,'fat_g',60,'fiber_g',25,'saturated_fat_g',10,'calorie_target',2000,'protein_target',100,'carb_target',200,'fat_target',60,'color_grade','green','score',100,'gap_summary',jsonb_build_object('marker',marker)),
 snapshot,jsonb_build_object('user_id','00000000-0000-0000-0000-000000000002','workout_completed',true,'nutrition_color','green','nutrition_score',100,'overall_color','green','did_well',marker,'harshness_level',3,'streak_days',999),
 jsonb_build_object('kind','good_day','payload',jsonb_build_object('marker',marker)))
$$;
SELECT coach_fixture('00000000-0000-0000-0000-000000000001','A');
CREATE TEMP TABLE before_rows AS SELECT
 (SELECT jsonb_agg(to_jsonb(t)) FROM daily_nutrition_summaries t) s,
 (SELECT jsonb_agg(to_jsonb(t)) FROM behavior_events t) e,
 (SELECT jsonb_agg(to_jsonb(t)) FROM behavior_state t) b,
 (SELECT jsonb_agg(to_jsonb(t)) FROM daily_feedback t) f;
CREATE FUNCTION public.coach_late_fault() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.did_well='FAIL' THEN RAISE EXCEPTION 'late fault'; END IF; RETURN NEW; END $$;
CREATE TRIGGER coach_late_fault BEFORE INSERT OR UPDATE ON daily_feedback FOR EACH ROW EXECUTE FUNCTION coach_late_fault();
DO $$ BEGIN
 BEGIN PERFORM coach_fixture('00000000-0000-0000-0000-000000000001','FAIL'); RAISE EXCEPTION 'fault did not fire';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'late fault' THEN RAISE; END IF; END;
 ASSERT (SELECT s FROM before_rows)=(SELECT jsonb_agg(to_jsonb(t)) FROM daily_nutrition_summaries t);
 ASSERT (SELECT e FROM before_rows)=(SELECT jsonb_agg(to_jsonb(t)) FROM behavior_events t);
 ASSERT (SELECT b FROM before_rows)=(SELECT jsonb_agg(to_jsonb(t)) FROM behavior_state t);
 ASSERT (SELECT f FROM before_rows)=(SELECT jsonb_agg(to_jsonb(t)) FROM daily_feedback t);
 ASSERT NOT EXISTS(SELECT FROM daily_feedback WHERE user_id='00000000-0000-0000-0000-000000000002');
 ASSERT (SELECT harshness_level=0 AND streak_days=1 FROM daily_feedback);
 ASSERT NOT has_function_privilege('anon','public.persist_coach_feedback(uuid,date,boolean,jsonb,jsonb,jsonb,jsonb)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.persist_coach_feedback(uuid,date,boolean,jsonb,jsonb,jsonb,jsonb)','EXECUTE');
 ASSERT has_function_privilege('service_role','public.persist_coach_feedback(uuid,date,boolean,jsonb,jsonb,jsonb,jsonb)','EXECUTE');
END $$;
-- Exact full historical snapshot, immutable even if caller supplies summary.
INSERT INTO daily_nutrition_summaries(user_id,summary_date,calorie_target,protein_target,carb_target,fat_target)
 VALUES('00000000-0000-0000-0000-000000000001',current_date-1,2000,100,200,60);
DO $$ DECLARE snap jsonb; first_report jsonb; BEGIN
 SELECT to_jsonb(s) INTO snap FROM daily_nutrition_summaries s WHERE summary_date=current_date-1;
 BEGIN
  PERFORM coach_fixture('00000000-0000-0000-0000-000000000001','bad',current_date-1,true,snap || '{"fat_target":61}');
  RAISE EXCEPTION 'accepted changed snapshot';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'historical snapshot unavailable or changed' THEN RAISE; END IF; END;
 BEGIN
  PERFORM coach_fixture('00000000-0000-0000-0000-000000000001','rollover',current_date-1,false,NULL);
  RAISE EXCEPTION 'accepted rollover';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'coach date rolled over; retry' THEN RAISE; END IF; END;
 first_report:=coach_fixture('00000000-0000-0000-0000-000000000001','history',current_date-1,true,snap);
 ASSERT coach_fixture('00000000-0000-0000-0000-000000000001','rewrite',current_date-1,true,NULL)=first_report;
 ASSERT snap=(SELECT to_jsonb(s) FROM daily_nutrition_summaries s WHERE summary_date=current_date-1);
 ASSERT (SELECT e FROM before_rows)=(SELECT jsonb_agg(to_jsonb(t)) FROM behavior_events t);
 ASSERT (SELECT b FROM before_rows)=(SELECT jsonb_agg(to_jsonb(t)) FROM behavior_state t);
END $$;
SELECT 'coach rollback, trusted ownership, state derivation, ACL, historical immutability and rollover PASS';

-- Execute with real roles, not merely privilege introspection.
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.persist_coach_feedback('00000000-0000-0000-0000-000000000002',current_date,false,NULL,NULL,'{}','{}');
  RAISE EXCEPTION 'authenticated execution allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT coach_fixture('00000000-0000-0000-0000-000000000002','other-owner');
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT did_well='A' FROM daily_feedback WHERE user_id='00000000-0000-0000-0000-000000000001' AND feedback_date=current_date);
END $$;
-- SQL port of the exact existing behavior algorithm: inclusive 90-day window,
-- nonconsecutive dates, neutral, recalibration, high level and good-day decay.
INSERT INTO behavior_events(user_id,event_date,kind) VALUES
 ('00000000-0000-0000-0000-000000000002',current_date-91,'bad_day'),
 ('00000000-0000-0000-0000-000000000002',current_date-90,'bad_day'),
 ('00000000-0000-0000-0000-000000000002',current_date-8,'bad_day'),
 ('00000000-0000-0000-0000-000000000002',current_date-7,'neutral_day'),
 ('00000000-0000-0000-0000-000000000002',current_date-6,'bad_day'),
 ('00000000-0000-0000-0000-000000000002',current_date-5,'plan_recalibrated'),
 ('00000000-0000-0000-0000-000000000002',current_date-4,'bad_day'),
 ('00000000-0000-0000-0000-000000000002',current_date-3,'good_day');
SELECT coach_fixture('00000000-0000-0000-0000-000000000002','algorithm');
DO $$ BEGIN
 ASSERT (SELECT harshness_level=1 AND consecutive_good_days=2 AND consecutive_bad_days=0
  AND last_good_day_date=current_date AND last_bad_day_date=current_date-4
  FROM behavior_state WHERE user_id='00000000-0000-0000-0000-000000000002');
 ASSERT (SELECT harshness_level=1 AND tone='firm' AND streak_days=2 AND bad_days_streak=0
  FROM daily_feedback WHERE user_id='00000000-0000-0000-0000-000000000002');
END $$;
SELECT 'Actual role execution/denial, cross-user isolation and legacy algorithm parity PASS';

