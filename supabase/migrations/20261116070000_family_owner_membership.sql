-- Owner identity is represented by a normal accepted caretaker membership.
-- Trigger executes in the family INSERT transaction (including invite-first creation).
BEGIN;
ALTER TABLE public.doctor_profiles ADD COLUMN IF NOT EXISTS state TEXT;
CREATE OR REPLACE FUNCTION public.kynthai_family_owner_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  -- Serialize against backfill and other family membership creation for this family.
  PERFORM 1 FROM public.families WHERE id = NEW.id FOR UPDATE;
  UPDATE public.family_members SET "inviteStatus" = 'accepted', role = 'caretaker'
    WHERE "familyId" = NEW.id AND "userId" = NEW."ownerId";
  IF NOT FOUND THEN
    INSERT INTO public.family_members (id, "familyId", "userId", relation, role, "inviteStatus", "createdAt")
    VALUES ('owner_' || NEW.id, NEW.id, NEW."ownerId", 'self', 'caretaker', 'accepted', now());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kynthai_family_owner_membership
AFTER INSERT OR UPDATE OF "ownerId" ON public.families
FOR EACH ROW EXECUTE FUNCTION public.kynthai_family_owner_membership();
-- Lock family rows so backfill and concurrent family changes cannot race.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT id, "ownerId" FROM public.families FOR UPDATE LOOP
    UPDATE public.family_members SET "inviteStatus" = 'accepted', role = 'caretaker'
      WHERE "familyId" = f.id AND "userId" = f."ownerId";
    IF NOT FOUND THEN
      INSERT INTO public.family_members (id, "familyId", "userId", relation, role, "inviteStatus", "createdAt")
      VALUES ('owner_' || f.id, f.id, f."ownerId", 'self', 'caretaker', 'accepted', now());
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.kynthai_family_owner_membership() FROM PUBLIC, anon, authenticated;
COMMIT;
