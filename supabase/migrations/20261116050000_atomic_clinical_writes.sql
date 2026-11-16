-- Run via the Supabase migration pipeline, not a public HTTP schema endpoint.
-- Server-only, narrowly allowlisted INSERT batch for SOS / prescription writes.
CREATE OR REPLACE FUNCTION public.kynthai_atomic_create(records jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE item jsonb; table_name text; columns_sql text; values_sql text;
  result_row jsonb; results jsonb := '[]'::jsonb;
BEGIN
  IF records IS NULL OR jsonb_typeof(records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid clinical write batch';
  END IF;
  IF jsonb_array_length(records) > 200 THEN
    RAISE EXCEPTION 'Invalid clinical write batch';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
    table_name := item->>'table';
    IF table_name IS NULL OR table_name NOT IN ('medications','prescriptions','appointments','emergency_alerts','family_health_alerts') THEN
      RAISE EXCEPTION 'Table is not permitted';
    END IF;
    IF jsonb_typeof(item->'data') IS DISTINCT FROM 'object' OR item->'data' = '{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid record';
    END IF;
    SELECT string_agg(format('%I', key), ',' ORDER BY key),
      string_agg(format('r.%I', key), ',' ORDER BY key)
      INTO columns_sql, values_sql FROM jsonb_object_keys(item->'data') AS key;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r RETURNING to_jsonb(%I.*)',
      table_name, columns_sql, values_sql, table_name, table_name)
      INTO result_row USING item->'data';
    results := results || jsonb_build_array(result_row);
  END LOOP;
  RETURN results;
END;
$$;
REVOKE ALL ON FUNCTION public.kynthai_atomic_create(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kynthai_atomic_create(jsonb) TO service_role;
