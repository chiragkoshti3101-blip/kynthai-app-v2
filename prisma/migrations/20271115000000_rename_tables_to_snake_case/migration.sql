-- Rename the seven tables that previously used Prisma's default PascalCase
-- names to the snake_case names now declared via @@map in schema.prisma.
-- Idempotent: only renames when the old table exists and the new one does not,
-- so it is safe on databases that already have the snake_case tables.

DO $$
BEGIN
  IF to_regclass('public."DoctorAvailabilitySlot"') IS NOT NULL
     AND to_regclass('public.doctor_availability_slots') IS NULL THEN
    ALTER TABLE "DoctorAvailabilitySlot" RENAME TO doctor_availability_slots;
  END IF;
  IF to_regclass('public."Reminder"') IS NOT NULL
     AND to_regclass('public.reminders') IS NULL THEN
    ALTER TABLE "Reminder" RENAME TO reminders;
  END IF;
  IF to_regclass('public."Family"') IS NOT NULL
     AND to_regclass('public.families') IS NULL THEN
    ALTER TABLE "Family" RENAME TO families;
  END IF;
  IF to_regclass('public."MedicineInventory"') IS NOT NULL
     AND to_regclass('public.medicine_inventories') IS NULL THEN
    ALTER TABLE "MedicineInventory" RENAME TO medicine_inventories;
  END IF;
  IF to_regclass('public."UserStreak"') IS NOT NULL
     AND to_regclass('public.user_streaks') IS NULL THEN
    ALTER TABLE "UserStreak" RENAME TO user_streaks;
  END IF;
  IF to_regclass('public."UserBadge"') IS NOT NULL
     AND to_regclass('public.user_badges') IS NULL THEN
    ALTER TABLE "UserBadge" RENAME TO user_badges;
  END IF;
  IF to_regclass('public."Referral"') IS NOT NULL
     AND to_regclass('public.referrals') IS NULL THEN
    ALTER TABLE "Referral" RENAME TO referrals;
  END IF;
END $$;
