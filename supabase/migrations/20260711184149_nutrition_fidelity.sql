-- Evidence-backed carbohydrate certification. Existing nutrition rows keep
-- their current behavior until an explicit certification is activated.

-- Production already has this legacy citation table, while fresh installs do
-- not. Preserve the legacy shape, then extend it additively below.
CREATE TABLE IF NOT EXISTS public.nutrition_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.nutrition_sources
  ADD COLUMN IF NOT EXISTS reported_item_name TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_locator TEXT,
  ADD COLUMN IF NOT EXISTS reported_carbs NUMERIC,
  ADD COLUMN IF NOT EXISTS serving_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS serving_unit TEXT,
  ADD COLUMN IF NOT EXISTS serving_description TEXT,
  ADD COLUMN IF NOT EXISTS size_name TEXT,
  ADD COLUMN IF NOT EXISTS preparation_notes TEXT,
  ADD COLUMN IF NOT EXISTS published_at DATE,
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS normalized_carbs NUMERIC,
  ADD COLUMN IF NOT EXISTS normalization_formula TEXT,
  ADD COLUMN IF NOT EXISTS normalization_inputs JSONB,
  ADD COLUMN IF NOT EXISTS upstream_source_key TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID;

DO $$ BEGIN
  ALTER TABLE public.nutrition_sources
    ADD CONSTRAINT fk_nutrition_sources_supersedes
    FOREIGN KEY (supersedes_id)
    REFERENCES public.nutrition_sources(id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutrition_sources
    ADD CONSTRAINT chk_nutrition_source_type
    CHECK (
      source_type IS NULL OR source_type IN (
        'official_restaurant',
        'manufacturer',
        'government_database',
        'third_party_database',
        'editorial',
        'recipe_calculation',
        'ai_estimate',
        'other'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutrition_sources
    ADD CONSTRAINT chk_nutrition_source_carbs_non_negative
    CHECK (
      (reported_carbs IS NULL OR reported_carbs >= 0)
      AND (normalized_carbs IS NULL OR normalized_carbs >= 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutrition_sources
    ADD CONSTRAINT chk_nutrition_source_serving_positive
    CHECK (serving_quantity IS NULL OR serving_quantity > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_nutrition_sources_menu_item_id
  ON public.nutrition_sources(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_sources_upstream_source_key
  ON public.nutrition_sources(upstream_source_key)
  WHERE upstream_source_key IS NOT NULL;

-- A legacy row may be completed once. After it has an observed carb value, its
-- evidence fields are immutable; corrections create a superseding row.
CREATE OR REPLACE FUNCTION public.prevent_nutrition_source_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.reported_carbs IS NOT NULL THEN
      RAISE EXCEPTION 'captured nutrition evidence cannot be deleted; supersede it';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.reported_carbs IS NOT NULL AND ROW(
    NEW.menu_item_id,
    NEW.reported_item_name,
    NEW.source_name,
    NEW.source_type,
    NEW.source_url,
    NEW.source_locator,
    NEW.reported_carbs,
    NEW.serving_quantity,
    NEW.serving_unit,
    NEW.serving_description,
    NEW.size_name,
    NEW.preparation_notes,
    NEW.published_at,
    NEW.retrieved_at,
    NEW.content_hash,
    NEW.normalized_carbs,
    NEW.normalization_formula,
    NEW.normalization_inputs,
    NEW.upstream_source_key,
    NEW.supersedes_id
  ) IS DISTINCT FROM ROW(
    OLD.menu_item_id,
    OLD.reported_item_name,
    OLD.source_name,
    OLD.source_type,
    OLD.source_url,
    OLD.source_locator,
    OLD.reported_carbs,
    OLD.serving_quantity,
    OLD.serving_unit,
    OLD.serving_description,
    OLD.size_name,
    OLD.preparation_notes,
    OLD.published_at,
    OLD.retrieved_at,
    OLD.content_hash,
    OLD.normalized_carbs,
    OLD.normalization_formula,
    OLD.normalization_inputs,
    OLD.upstream_source_key,
    OLD.supersedes_id
  ) THEN
    RAISE EXCEPTION 'captured nutrition evidence is immutable; insert a superseding row';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_nutrition_source_evidence_mutation
  ON public.nutrition_sources;
CREATE TRIGGER trg_prevent_nutrition_source_evidence_mutation
  BEFORE UPDATE OR DELETE ON public.nutrition_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_nutrition_source_evidence_mutation();

CREATE TABLE IF NOT EXISTS public.nutrition_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  canonical_carbs INTEGER,
  serving_quantity NUMERIC,
  serving_unit TEXT,
  serving_description TEXT,
  reviewer_id TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES public.nutrition_certifications(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_nutrition_certification_tier_status CHECK (
    tier IN ('A', 'B', 'C', 'D')
    AND status IN ('approved', 'rejected', 'quarantined')
  ),
  CONSTRAINT chk_nutrition_certification_review_window CHECK (
    expires_at IS NULL OR expires_at > reviewed_at
  ),
  CONSTRAINT chk_nutrition_certification_approved_fields CHECK (
    status <> 'approved' OR (
      canonical_carbs IS NOT NULL
      AND canonical_carbs >= 0
      AND serving_quantity IS NOT NULL
      AND serving_quantity > 0
      AND NULLIF(BTRIM(serving_unit), '') IS NOT NULL
      AND NULLIF(BTRIM(serving_description), '') IS NOT NULL
      AND expires_at IS NOT NULL
    )
  ),
  CONSTRAINT chk_nutrition_certification_review_metadata CHECK (
    NULLIF(BTRIM(reviewer_id), '') IS NOT NULL
    AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.nutrition_certification_evidence (
  certification_id UUID NOT NULL
    REFERENCES public.nutrition_certifications(id) ON DELETE CASCADE,
  nutrition_source_id UUID NOT NULL
    REFERENCES public.nutrition_sources(id) ON DELETE RESTRICT,
  evidence_role TEXT NOT NULL DEFAULT 'primary'
    CHECK (evidence_role IN ('primary', 'corroborating')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (certification_id, nutrition_source_id)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_certifications_menu_item_id
  ON public.nutrition_certifications(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_certification_evidence_source_id
  ON public.nutrition_certification_evidence(nutrition_source_id);

CREATE OR REPLACE FUNCTION public.prevent_nutrition_certification_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'certification evidence links are immutable; insert a superseding decision';
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_nutrition_certification_evidence_mutation
  ON public.nutrition_certification_evidence;
CREATE TRIGGER trg_prevent_nutrition_certification_evidence_mutation
  BEFORE UPDATE OR DELETE ON public.nutrition_certification_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_nutrition_certification_evidence_mutation();

-- Decisions are append-only. The active pointer on nutritional_data selects a
-- decision; replacing or quarantining it creates a new decision.
CREATE OR REPLACE FUNCTION public.prevent_nutrition_certification_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'nutrition certification decisions are immutable; insert a superseding decision';
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_nutrition_certification_mutation
  ON public.nutrition_certifications;
CREATE TRIGGER trg_prevent_nutrition_certification_mutation
  BEFORE UPDATE OR DELETE ON public.nutrition_certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_nutrition_certification_mutation();

ALTER TABLE public.nutritional_data
  ADD COLUMN IF NOT EXISTS serving_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS serving_unit TEXT,
  ADD COLUMN IF NOT EXISTS serving_description TEXT,
  ADD COLUMN IF NOT EXISTS active_certification_id UUID;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT fk_nutritional_data_active_certification
    FOREIGN KEY (active_certification_id)
    REFERENCES public.nutrition_certifications(id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutritional_data_serving_positive
    CHECK (serving_quantity IS NULL OR serving_quantity > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Validate a certification only when it becomes canonical. Expiry remains a
-- runtime condition as time can invalidate an otherwise unchanged row.
CREATE OR REPLACE FUNCTION public.validate_active_nutrition_certification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  decision public.nutrition_certifications%ROWTYPE;
  evidence_count INTEGER;
  missing_upstream_count INTEGER;
  independent_source_count INTEGER;
  mismatched_item_count INTEGER;
BEGIN
  IF NEW.active_certification_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO decision
  FROM public.nutrition_certifications
  WHERE id = NEW.active_certification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active nutrition certification does not exist';
  END IF;
  IF decision.menu_item_id <> NEW.menu_item_id THEN
    RAISE EXCEPTION 'nutrition certification belongs to a different menu item';
  END IF;
  IF decision.status <> 'approved' OR decision.tier NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'only approved Tier A or B evidence can be dosing-grade';
  END IF;
  IF decision.expires_at <= NOW() THEN
    RAISE EXCEPTION 'nutrition certification is expired';
  END IF;
  IF NEW.carbs IS DISTINCT FROM decision.canonical_carbs
     OR NEW.serving_quantity IS DISTINCT FROM decision.serving_quantity
     OR NEW.serving_unit IS DISTINCT FROM decision.serving_unit
     OR NEW.serving_description IS DISTINCT FROM decision.serving_description THEN
    RAISE EXCEPTION 'canonical nutrition does not match its certification decision';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE source.upstream_source_key IS NULL)::INTEGER,
    COUNT(DISTINCT source.upstream_source_key)::INTEGER,
    COUNT(*) FILTER (WHERE source.menu_item_id <> decision.menu_item_id)::INTEGER
  INTO evidence_count, missing_upstream_count, independent_source_count, mismatched_item_count
  FROM public.nutrition_certification_evidence AS link
  JOIN public.nutrition_sources AS source
    ON source.id = link.nutrition_source_id
  WHERE link.certification_id = decision.id;

  IF evidence_count < 1 OR mismatched_item_count > 0 THEN
    RAISE EXCEPTION 'nutrition certification requires matching evidence';
  END IF;
  IF decision.tier = 'B'
     AND (evidence_count < 2 OR missing_upstream_count > 0 OR independent_source_count < 2) THEN
    RAISE EXCEPTION 'Tier B requires two independently keyed evidence sources';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_validate_active_nutrition_certification
  ON public.nutritional_data;
CREATE TRIGGER trg_validate_active_nutrition_certification
  BEFORE INSERT OR UPDATE OF
    carbs,
    serving_quantity,
    serving_unit,
    serving_description,
    active_certification_id
  ON public.nutritional_data
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_active_nutrition_certification();

ALTER TABLE public.nutrition_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_certification_evidence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read nutrition sources"
    ON public.nutrition_sources
    FOR SELECT TO anon, authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public read nutrition certifications"
    ON public.nutrition_certifications
    FOR SELECT TO anon, authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public read nutrition certification evidence"
    ON public.nutrition_certification_evidence
    FOR SELECT TO anon, authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.nutrition_sources,
  public.nutrition_certifications,
  public.nutrition_certification_evidence
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.nutrition_sources,
  public.nutrition_certifications,
  public.nutrition_certification_evidence
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
