-- Add indexes on all FK columns that lack them.
-- These back the most common filtered lookups (reminders by medication,
-- notifications/payments by user, bookings by patient, family joins, meds by owner)
-- and avoid per-row seq scans as row counts grow.
-- Table names follow the @@map snake_case mapping in schema.prisma.

CREATE INDEX IF NOT EXISTS "Reminder_medicationId_idx" ON "Reminder"("medicationId");
CREATE INDEX IF NOT EXISTS "NotificationLog_userId_idx" ON "notification_logs"("userId");
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "payments"("userId");
CREATE INDEX IF NOT EXISTS "LabBooking_patientId_idx" ON "lab_bookings"("patientId");
CREATE INDEX IF NOT EXISTS "FamilyMember_familyId_idx" ON "family_members"("familyId");
CREATE INDEX IF NOT EXISTS "Medication_familyMemberId_idx" ON "medications"("familyMemberId");
