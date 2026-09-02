-- Home-collection pricing policy:
--   < 5 km: fixed platform charge of $8.00
--   >= 5 km: provider-set quote, accepted by the patient before booking
-- Keep this additive so existing bookings and providers remain readable.

ALTER TABLE "lab_profiles"
  ADD COLUMN IF NOT EXISTS "longDistanceTravelFeeCents" INTEGER;

ALTER TABLE "lab_bookings"
  ADD COLUMN IF NOT EXISTS "deliveryDistanceKm" DOUBLE PRECISION;

ALTER TABLE "lab_bookings"
  ADD COLUMN IF NOT EXISTS "deliveryQuoteAccepted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "lab_bookings"
  ADD COLUMN IF NOT EXISTS "deliveryPricingSource" TEXT NOT NULL DEFAULT 'platform_fixed';

CREATE INDEX IF NOT EXISTS "idx_lab_bookings_delivery_pricing"
  ON "lab_bookings"("deliveryPricingSource");
