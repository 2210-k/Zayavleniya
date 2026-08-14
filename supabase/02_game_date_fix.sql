-- Run this AFTER the initial database schema.
-- The game date is supplied explicitly for every event.

DROP FUNCTION IF EXISTS public.submit_application(text,text,text,jsonb,text);
DROP FUNCTION IF EXISTS public.receive_application(uuid);
DROP FUNCTION IF EXISTS public.start_application_review(uuid);
DROP FUNCTION IF EXISTS public.application_decision(uuid,public.application_status,text);

CREATE OR REPLACE FUNCTION public.submit_application(
  p_type text,
  p_title text,
  p_destination text,
  p_form_data jsonb,
  p_generated_document text,
  p_game_day bigint
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_game_day IS NULL OR p_game_day < 0 THEN RAISE EXCEPTION 'INVALID_GAME_DAY'; END IF;

  INSERT INTO public.applications(
    citizen_id,application_type,title,destination,form_data,generated_document,
    status,real_submitted_at,submitted_game_day
  ) VALUES(
    auth.uid(),p_type,p_title,p_destination,coalesce(p_form_data,'{}'::jsonb),
    coalesce(p_generated_document,''),'submitted',now(),p_game_day
  ) RETURNING id INTO v_id;

  INSERT INTO public.application_history(application_id,actor_id,action,new_status,game_day)
  VALUES(v_id,auth.uid(),'Заявление отправлено','submitted',p_game_day);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_application(
  p_application_id uuid,
  p_game_day bigint
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.application_status;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_game_day IS NULL OR p_game_day < 0 THEN RAISE EXCEPTION 'INVALID_GAME_DAY'; END IF;

  SELECT status INTO v_old FROM public.applications WHERE id=p_application_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND'; END IF;

  UPDATE public.applications
  SET status='received',real_received_at=now(),received_game_day=p_game_day
  WHERE id=p_application_id;

  INSERT INTO public.application_history(application_id,actor_id,action,old_status,new_status,game_day)
  VALUES(p_application_id,auth.uid(),'Заявление получено ведомством',v_old,'received',p_game_day);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_application_review(
  p_application_id uuid,
  p_game_day bigint
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.application_status;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_game_day IS NULL OR p_game_day < 0 THEN RAISE EXCEPTION 'INVALID_GAME_DAY'; END IF;

  SELECT status INTO v_old FROM public.applications WHERE id=p_application_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND'; END IF;

  UPDATE public.applications
  SET status='reviewing',real_review_started_at=now(),review_started_game_day=p_game_day
  WHERE id=p_application_id;

  INSERT INTO public.application_history(application_id,actor_id,action,old_status,new_status,game_day)
  VALUES(p_application_id,auth.uid(),'Начато рассмотрение',v_old,'reviewing',p_game_day);
END;
$$;

CREATE OR REPLACE FUNCTION public.application_decision(
  p_application_id uuid,
  p_status public.application_status,
  p_comment text,
  p_game_day bigint
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.application_status; v_action text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_status NOT IN ('approved','rejected','postponed','cancelled') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF p_game_day IS NULL OR p_game_day < 0 THEN RAISE EXCEPTION 'INVALID_GAME_DAY'; END IF;

  SELECT status INTO v_old FROM public.applications WHERE id=p_application_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND'; END IF;

  v_action:=CASE p_status
    WHEN 'approved' THEN 'Заявление одобрено'
    WHEN 'rejected' THEN 'Заявление отклонено'
    WHEN 'postponed' THEN 'Заявление отложено'
    WHEN 'cancelled' THEN 'Заявление отменено'
  END;

  UPDATE public.applications
  SET status=p_status,real_decision_at=now(),decision_game_day=p_game_day,admin_comment=p_comment
  WHERE id=p_application_id;

  INSERT INTO public.application_history(application_id,actor_id,action,old_status,new_status,comment,game_day)
  VALUES(p_application_id,auth.uid(),v_action,v_old,p_status,p_comment,p_game_day);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_application(text,text,text,jsonb,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_application(uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_application_review(uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_decision(uuid,public.application_status,text,bigint) TO authenticated;

DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP FUNCTION IF EXISTS public.get_game_day();