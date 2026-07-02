-- Migration 0047: Hybrid nutrition target sets.
-- ------------------------------------------------------------
-- Durable, provenance-tracked storage for ACCEPTED nutrition targets.
-- This is the source of truth for authenticated targets; AsyncStorage on the
-- client is demoted to drafts / offline cache / pending-save only.
--
-- Separate from the legacy `nutrition_targets` (0033) training/rest row, which
-- remains for meal-plan snapshots and existing data. The new model stores a
-- base target plus optional training/rest/day-specific overrides with an
-- explicit `source` so the UI can always explain where a number came from.

-- 1. NUTRITION TARGET SETS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrition_target_sets (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source                     TEXT NOT NULL
        CHECK (source IN ('manual', 'backend_suggested', 'local_draft', 'imported_existing')),
    base_target                JSONB,
    training_day_target        JSONB,
    rest_day_target            JSONB,
    macro_preference           TEXT,
    explanation                JSONB,
    derivation_inputs_snapshot JSONB,
    stale_after                TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.nutrition_target_sets IS
    'Durable, provenance-tracked accepted nutrition targets. One active set per user (latest updated).';

-- One canonical set per user keeps GET/save simple (upsert on user_id).
CREATE UNIQUE INDEX IF NOT EXISTS nutrition_target_sets_user_uq
    ON public.nutrition_target_sets (user_id);

ALTER TABLE public.nutrition_target_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nutrition_target_sets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_target_sets TO authenticated;

CREATE POLICY nutrition_target_sets_select_own ON public.nutrition_target_sets
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_target_sets_insert_own ON public.nutrition_target_sets
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_target_sets_update_own ON public.nutrition_target_sets
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_target_sets_delete_own ON public.nutrition_target_sets
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_nutrition_target_sets_updated_at
    BEFORE UPDATE ON public.nutrition_target_sets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. NUTRITION TARGET DAY OVERRIDES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrition_target_day_overrides (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_set_id UUID NOT NULL REFERENCES public.nutrition_target_sets(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_of_week   INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    target        JSONB NOT NULL,
    source        TEXT NOT NULL
        CHECK (source IN ('manual', 'backend_suggested', 'local_draft', 'imported_existing')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (target_set_id, day_of_week)
);

COMMENT ON TABLE public.nutrition_target_day_overrides IS
    'Optional per-day target overrides belonging to a nutrition_target_sets row. Only created when a user edits a specific day.';

ALTER TABLE public.nutrition_target_day_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nutrition_target_day_overrides FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_target_day_overrides TO authenticated;

-- Ownership enforced by user_id AND that the parent set belongs to the user.
CREATE POLICY nutrition_target_day_overrides_select_own ON public.nutrition_target_day_overrides
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_target_day_overrides_insert_own ON public.nutrition_target_day_overrides
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.nutrition_target_sets s
            WHERE s.id = target_set_id AND s.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY nutrition_target_day_overrides_update_own ON public.nutrition_target_day_overrides
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.nutrition_target_sets s
            WHERE s.id = target_set_id AND s.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY nutrition_target_day_overrides_delete_own ON public.nutrition_target_day_overrides
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS nutrition_target_day_overrides_set_idx
    ON public.nutrition_target_day_overrides (target_set_id);

CREATE TRIGGER trg_nutrition_target_day_overrides_updated_at
    BEFORE UPDATE ON public.nutrition_target_day_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
