-- One live booking per doctor per time range.
--
-- The route's find-then-create check can be passed by two concurrent requests;
-- this constraint is the actual guarantee. The adapter surfaces a violation as
-- SQLSTATE 23P01, mapped to 409 SLOT_UNAVAILABLE. `scheduledAt` is UTC
-- TIMESTAMP(3), so the range is built timezone-free.
--
-- Pre-existing overlaps make the ADD fail. Find them first; cancel or shift one
-- side, then apply:
--
--   SELECT a."doctorId", a."id" AS keep_id, b."id" AS overlap_id
--   FROM "appointments" a JOIN "appointments" b
--     ON a."doctorId" = b."doctorId" AND a."id" < b."id"
--    AND tsrange(a."scheduledAt", a."scheduledAt" + make_interval(mins => COALESCE(a."durationMinutes", 15)))
--     && tsrange(b."scheduledAt", b."scheduledAt" + make_interval(mins => COALESCE(b."durationMinutes", 15)))
--   WHERE a."deletedAt" IS NULL AND b."deletedAt" IS NULL
--     AND a.status IN ('pending', 'confirmed', 'rescheduled')
--     AND b.status IN ('pending', 'confirmed', 'rescheduled');

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  DROP CONSTRAINT IF EXISTS "appointments_doctor_slot_no_overlap";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_doctor_slot_no_overlap"
  EXCLUDE USING gist (
    "doctorId" WITH =,
    tsrange(
      "scheduledAt",
      "scheduledAt" + make_interval(mins => COALESCE("durationMinutes", 15))
    ) WITH &&
  )
  WHERE ("deletedAt" IS NULL AND status IN ('pending', 'confirmed', 'rescheduled'));
