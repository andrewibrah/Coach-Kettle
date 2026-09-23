-- Service-only atomic Coach persistence. p_user_id is the verified Edge auth
-- identity, never the request body's owner. No authenticated/anon execution.
CREATE OR REPLACE FUNCTION public.persist_coach_feedback(
 p_user_id uuid, p_date date, p_historical boolean, p_summary jsonb,
 p_snapshot jsonb, p_report jsonb, p_event jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
 v_today date; v_tz text; v_existing jsonb; v_snapshot jsonb;
 s public.daily_nutrition_summaries; r public.daily_feedback;
 ev record; level integer := 0; good integer := 0; bad integer := 0;
 last_good date; last_bad date; last_date date;
BEGIN
 IF p_user_id IS NULL OR p_date IS NULL OR p_historical IS NULL THEN
  RAISE EXCEPTION 'invalid coach request';
 END IF;
 -- Lock across dates: behavior_state is per USER, not per report date.
 PERFORM pg_advisory_xact_lock(hashtextextended('coach:' || p_user_id::text, 0));
 SELECT timezone INTO v_tz FROM public.notification_preferences WHERE user_id=p_user_id;
 v_tz := coalesce(v_tz, 'America/New_York');
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_tz) THEN v_tz := 'UTC'; END IF;
 -- clock_timestamp, not transaction start: a waiter can cross midnight.
 v_today := (clock_timestamp() AT TIME ZONE v_tz)::date;
 IF p_date > v_today THEN RAISE EXCEPTION 'future coach date'; END IF;
 IF p_date < v_today THEN
  SELECT to_jsonb(f) INTO v_existing FROM public.daily_feedback f
   WHERE user_id=p_user_id AND feedback_date=p_date;
  IF FOUND THEN RETURN v_existing; END IF;
  IF NOT p_historical THEN RAISE EXCEPTION 'coach date rolled over; retry'; END IF;
  SELECT to_jsonb(n) INTO v_snapshot FROM public.daily_nutrition_summaries n
   WHERE user_id=p_user_id AND summary_date=p_date FOR SHARE;
  IF v_snapshot IS NULL OR v_snapshot IS DISTINCT FROM p_snapshot
   OR coalesce((v_snapshot->>'calorie_target')::numeric,0)<=0
   OR coalesce((v_snapshot->>'protein_target')::numeric,0)<=0
   OR coalesce((v_snapshot->>'carb_target')::numeric,0)<=0
   OR coalesce((v_snapshot->>'fat_target')::numeric,0)<=0
   OR jsonb_typeof(v_snapshot->'is_training_day') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'historical snapshot unavailable or changed'; END IF;
 ELSE
  IF p_historical THEN RAISE EXCEPTION 'coach date changed; retry'; END IF;
  IF p_summary IS NOT NULL THEN
   s := jsonb_populate_record(NULL::public.daily_nutrition_summaries,p_summary);
   INSERT INTO public.daily_nutrition_summaries(user_id,summary_date,is_training_day,calories,protein_g,carbs_g,fat_g,fiber_g,saturated_fat_g,calorie_target,protein_target,carb_target,fat_target,color_grade,score,gap_summary)
   VALUES(p_user_id,p_date,s.is_training_day,s.calories,s.protein_g,s.carbs_g,s.fat_g,s.fiber_g,s.saturated_fat_g,s.calorie_target,s.protein_target,s.carb_target,s.fat_target,s.color_grade,s.score,s.gap_summary)
   ON CONFLICT(user_id,summary_date) DO UPDATE SET is_training_day=excluded.is_training_day,calories=excluded.calories,protein_g=excluded.protein_g,carbs_g=excluded.carbs_g,fat_g=excluded.fat_g,fiber_g=excluded.fiber_g,saturated_fat_g=excluded.saturated_fat_g,calorie_target=excluded.calorie_target,protein_target=excluded.protein_target,carb_target=excluded.carb_target,fat_target=excluded.fat_target,color_grade=excluded.color_grade,score=excluded.score,gap_summary=excluded.gap_summary;
  END IF;
  IF p_event->>'kind' IS NULL OR p_event->>'kind' NOT IN ('good_day','neutral_day') THEN
   RAISE EXCEPTION 'invalid current-day event';
  END IF;
  INSERT INTO public.behavior_events(user_id,event_date,kind,delta_harshness,payload)
   VALUES(p_user_id,p_date,p_event->>'kind',0,p_event->'payload')
   ON CONFLICT(user_id,event_date) DO UPDATE SET kind=excluded.kind,delta_harshness=0,payload=excluded.payload;
  -- Exact prior 90-day inclusive algorithm; neutral preserves both streaks,
  -- recalibration resets streaks but not level; gaps do not reset streaks.
  FOR ev IN SELECT event_date,kind FROM public.behavior_events
   WHERE user_id=p_user_id AND event_date BETWEEN p_date-90 AND p_date ORDER BY event_date
  LOOP
   last_date := ev.event_date;
   IF ev.kind='bad_day' THEN
    bad:=bad+1; good:=0; last_bad:=ev.event_date;
    level:=CASE WHEN bad>=3 THEN 3 WHEN bad=2 THEN 2 ELSE greatest(level,1) END;
   ELSIF ev.kind='good_day' THEN
    good:=good+1; bad:=0; last_good:=ev.event_date; level:=greatest(0,level-1);
   ELSIF ev.kind='plan_recalibrated' THEN good:=0; bad:=0;
   END IF;
  END LOOP;
  INSERT INTO public.behavior_state(user_id,harshness_level,consecutive_good_days,consecutive_bad_days,last_evaluated_date,last_good_day_date,last_bad_day_date)
   VALUES(p_user_id,level,good,bad,coalesce(last_date,p_date),last_good,last_bad)
   ON CONFLICT(user_id) DO UPDATE SET harshness_level=excluded.harshness_level,
   consecutive_good_days=excluded.consecutive_good_days,consecutive_bad_days=excluded.consecutive_bad_days,
   last_evaluated_date=excluded.last_evaluated_date,last_good_day_date=excluded.last_good_day_date,last_bad_day_date=excluded.last_bad_day_date;
 END IF;
 r:=jsonb_populate_record(NULL::public.daily_feedback,p_report);
 -- Never use caller-precomputed behavior state. Narrative currently depends
 -- only on evidence; if that changes it must be generated under this lock too.
 r.harshness_level:=level; r.streak_days:=good; r.bad_days_streak:=bad;
 r.tone:=(ARRAY['supportive','firm','direct','accountability'])[level+1];
 INSERT INTO public.daily_feedback(user_id,feedback_date,workout_completed,nutrition_color,nutrition_score,nutrition_grade,workout_grade,overall_color,did_well,needs_improvement,tomorrow_focus,harshness_level,tone,streak_days,bad_days_streak)
 VALUES(p_user_id,p_date,r.workout_completed,r.nutrition_color,r.nutrition_score,r.nutrition_grade,r.workout_grade,r.overall_color,r.did_well,r.needs_improvement,r.tomorrow_focus,r.harshness_level,r.tone,r.streak_days,r.bad_days_streak)
 ON CONFLICT(user_id,feedback_date) DO UPDATE SET workout_completed=excluded.workout_completed,nutrition_color=excluded.nutrition_color,nutrition_score=excluded.nutrition_score,nutrition_grade=excluded.nutrition_grade,workout_grade=excluded.workout_grade,overall_color=excluded.overall_color,did_well=excluded.did_well,needs_improvement=excluded.needs_improvement,tomorrow_focus=excluded.tomorrow_focus,harshness_level=excluded.harshness_level,tone=excluded.tone,streak_days=excluded.streak_days,bad_days_streak=excluded.bad_days_streak
 WHERE NOT p_historical
 RETURNING to_jsonb(daily_feedback.*) INTO v_existing;
 IF v_existing IS NULL THEN
  SELECT to_jsonb(f) INTO v_existing FROM public.daily_feedback f WHERE user_id=p_user_id AND feedback_date=p_date;
 END IF;
 RETURN v_existing;
END $$;
REVOKE ALL ON FUNCTION public.persist_coach_feedback(uuid,date,boolean,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_coach_feedback(uuid,date,boolean,jsonb,jsonb,jsonb,jsonb) TO service_role;
