-- Harden legacy objects created outside the committed migration history. The
-- guards keep this migration safe on fresh databases where they do not exist.
DO $$
BEGIN
  IF to_regclass('public.nutrition_sources') IS NOT NULL THEN
    ALTER TABLE public.nutrition_sources ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'nutrition_sources'
        AND policyname = 'Public read nutrition_sources'
    ) THEN
      CREATE POLICY "Public read nutrition_sources"
        ON public.nutrition_sources
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;

    GRANT SELECT ON TABLE public.nutrition_sources TO anon, authenticated;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.set_updated_at() SET search_path = '';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
