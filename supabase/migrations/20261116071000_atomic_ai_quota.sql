CREATE OR REPLACE FUNCTION public.kynthai_reserve_ai_usage(p_user_id text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE day_start timestamp := date_trunc('day',now() AT TIME ZONE 'UTC'); used integer;
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Invalid AI quota'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id || ':ai_chat:' || day_start::text,0));
  SELECT COALESCE(sum(count),0)::integer INTO used FROM public.free_tier_usage
    WHERE "userId"=p_user_id AND feature='ai_chat' AND date>=day_start AND date<day_start+interval '1 day';
  IF used >= p_limit THEN RETURN false; END IF;
  PERFORM public.kynthai_record_usage(p_user_id,'ai_chat','ai_chat');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.kynthai_reserve_ai_usage(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kynthai_reserve_ai_usage(text,integer) TO service_role;
