-- Remaining unindexed foreign keys reported by the database advisor.
-- Table names follow the @@map snake_case mapping in schema.prisma.

CREATE INDEX IF NOT EXISTS "Family_ownerId_idx" ON "families"("ownerId");
CREATE INDEX IF NOT EXISTS "EmergencyAlert_familyId_idx" ON "emergency_alerts"("familyId");
CREATE INDEX IF NOT EXISTS "EmergencyAlert_reporterId_idx" ON "emergency_alerts"("reporterId");
CREATE INDEX IF NOT EXISTS "MedicineInventory_medicationId_idx" ON "medicine_inventories"("medicationId");
