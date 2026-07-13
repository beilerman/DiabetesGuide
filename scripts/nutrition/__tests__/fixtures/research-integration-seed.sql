-- Disposable Supabase fixture for manual inspection only.
-- Never run against production. The automated integration test generates
-- unique UUIDs and equivalent rows through the service-role client.
BEGIN;

INSERT INTO public.parks (id, name, location)
VALUES ('10000000-0000-4000-8000-000000000001', 'Integration Magic Kingdom', 'Walt Disney World Resort');

INSERT INTO public.restaurants (id, park_id, name)
VALUES (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'Integration Cart'
);

INSERT INTO public.menu_items (id, restaurant_id, name, category)
VALUES (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000002',
  'Integration Pretzel',
  'snack'
);

INSERT INTO public.nutritional_data (
  id, menu_item_id, carbs, confidence_score, source, active_certification_id
)
VALUES (
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000003',
  40,
  40,
  'official',
  NULL
);

INSERT INTO public.nutrition_certifications (
  id, menu_item_id, tier, status, reviewer_id, decision_reason
)
VALUES (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000003',
  'D',
  'rejected',
  'integration-test',
  'Synthetic protected-state sentinel'
);

COMMIT;
