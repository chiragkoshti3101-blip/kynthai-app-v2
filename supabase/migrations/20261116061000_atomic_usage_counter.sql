-- Serialize each user/feature/day counter and audit event in one transaction.
CREATE OR REPLACE FUNCTION public.kynthai_record_usage(p_user_id text, p_feature text, p_action text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE day_start timestamp := date_trunc('day', now() AT TIME ZONE 'UTC'); result_count integer;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown usage user';
  END IF;
  IF NOT ((p_feature='add_medication' AND p_action='medicine_add') OR (p_feature='ai_chat' AND p_action='ai_chat') OR (p_feature='prescription_scan' AND p_action='prescription_scan')) THEN
    RAISE EXCEPTION 'Invalid usage feature/action';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || p_feature || ':' || day_start::text, 0));
  -- Normalize legacy per-interaction timestamps without discarding their counts.
  SELECT COALESCE(sum(count),0)::integer + 1 INTO result_count FROM public.free_tier_usage
    WHERE "userId"=p_user_id AND feature=p_feature AND date>=day_start AND date<day_start + interval '1 day';
  DELETE FROM public.free_tier_usage WHERE "userId"=p_user_id AND feature=p_feature AND date>=day_start AND date<day_start + interval '1 day';
  INSERT INTO public.free_tier_usage(id,"userId",feature,date,count,"createdAt","updatedAt")
    VALUES(gen_random_uuid()::text,p_user_id,p_feature,day_start,result_count,now(),now());
  INSERT INTO public.free_tier_usage_audit(id,"userId",feature,action,count,"createdAt")
    VALUES(gen_random_uuid()::text,p_user_id,p_feature,p_action,1,now());
  RETURN result_count;
END;
$$;
REVOKE ALL ON FUNCTION public.kynthai_record_usage(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kynthai_record_usage(text,text,text) TO service_role;
