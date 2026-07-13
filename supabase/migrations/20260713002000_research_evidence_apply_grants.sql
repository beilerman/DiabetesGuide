-- The research worker's service-role credential exists only in the protected
-- post-merge job. Fresh Supabase projects no longer expose new tables or grant
-- privileges implicitly, so declare the worker's minimum database surface.
GRANT SELECT ON TABLE
  public.nutritional_data,
  public.nutrition_sources,
  public.nutrition_certifications
TO service_role;

GRANT INSERT ON TABLE public.nutrition_sources TO service_role;

-- Defense in depth: evidence history remains append-only even for service-role
-- sessions. The immutability trigger rejects UPDATE/DELETE, and this role is
-- not granted either privilege here.

NOTIFY pgrst, 'reload schema';
