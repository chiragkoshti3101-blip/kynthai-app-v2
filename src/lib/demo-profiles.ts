/**
 * Demo-only provider-profile provisioning.
 *
 * Demo accounts are seeded as `User` rows only. Real provider accounts receive
 * their profile row from the verification submission flow (`/api/labs`,
 * `/api/doctors`), which a demo login never runs — so a demo session that opens
 * a provider portal dead-ends on a 404 ("Lab profile not found" /
 * "Doctor profile not found").
 *
 * These helpers backfill the missing row so the portal renders. They are only
 * ever called behind an `isDemoUser(user)` guard, so real accounts are never
 * touched.
 */
import { db } from './db'

const DEMO_DOCTOR = {
  specialization: 'Family Medicine',
  licenseNumber: 'USMD-12345',
  experience: 12,
  consultationFee: 7500,
  videoCallEnabled: true,
  verified: true,
  bio: 'Board-certified Family Medicine physician with 12+ years of experience in preventive care and chronic disease management.',
  rating: 4.8,
  reviewCount: 127,
  city: 'Austin, TX',
  verificationStatus: 'approved',
  degreeType: 'MD',
  medicalCouncil: 'American Board of Family Medicine',
  patientSlotCap: 8,
  avatarColor: 'emerald',
}

const DEMO_LAB = {
  labName: 'Kynthai Diagnostic Center',
  licenseNumber: 'USLAB-67890',
  verified: true,
  testsOffered: JSON.stringify([
    { name: 'Complete Blood Count', price: 35 },
    { name: 'Lipid Panel', price: 49 },
    { name: 'Thyroid Panel', price: 59 },
    { name: 'Hemoglobin A1c', price: 39 },
    { name: 'Basic Metabolic Panel', price: 45 },
    { name: 'Vitamin D Test', price: 45 },
    { name: 'Urinalysis', price: 29 },
    { name: 'Liver Function Test', price: 49 },
  ]),
  rating: 4.6,
  reviewCount: 89,
  homeCollection: true,
  city: 'Austin, TX',
  verificationStatus: 'approved',
}

/** Idempotent: creates the demo doctor profile only if the user has none. */
export async function ensureDemoDoctorProfile(userId: string) {
  return db.doctorProfile.upsert({
    where: { userId },
    update: {},
    create: { userId, ...DEMO_DOCTOR },
  })
}

/** Idempotent: creates the demo lab profile only if the user has none. */
export async function ensureDemoLabProfile(userId: string) {
  return db.labProfile.upsert({
    where: { userId },
    update: {},
    create: { userId, ...DEMO_LAB },
  })
}
