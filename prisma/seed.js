/**
 * Kynthai — Demo Seed Script
 * Creates demo users across all 4 portals + admin.
 * Run: node prisma/seed.js
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Kynthai demo database...\n');

  // Safety guard: this script wipes the database. Never let it run against a
  // production environment by accident. `--force` is the explicit override.
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error(
      'Refusing to seed: NODE_ENV=production and this script wipes existing data.\n' +
        'If you really mean it, re-run with --force.'
    );
    process.exit(1);
  }

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.medicineInventory.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.consultMessage.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorAvailabilitySlot.deleteMany();
  await prisma.labBooking.deleteMany();
  await prisma.medicineOrder.deleteMany();
  await prisma.chronicCondition.deleteMany();
  await prisma.healthScore.deleteMany();
  await prisma.healthJournal.deleteMany();
  await prisma.familyHealthAlert.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.emergencyAlert.deleteMany();
  await prisma.family.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.labProfile.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash('Demo@2024', 10);

  // ── 1. PATIENT ──
  const patient = await prisma.user.create({
    data: {
      email: 'patient@demo.kynthai.app',
      name: 'Sarah Johnson',
      role: 'patient',
      password,
      emailVerified: new Date(),
      consentAccepted: true,
      dataProcessingConsent: true,
      aiTrainingConsent: true,
      subscriptionTier: 'plus',
      dateOfBirth: new Date('1988-03-15'),
    },
  });
  console.log(`✅ Patient: ${patient.email}`);

  // ── 2. DOCTOR ──
  const doctorUser = await prisma.user.create({
    data: {
      email: 'priya@demo.kynthai.app',
      name: 'Dr. Michael Chen',
      role: 'doctor',
      password,
      emailVerified: new Date(),
      consentAccepted: true,
      dataProcessingConsent: true,
      aiTrainingConsent: true,
      subscriptionTier: 'pro',
    },
  });
  const doctor = await prisma.doctorProfile.create({
    data: {
      userId: doctorUser.id,
      specialization: 'Family Medicine',
      licenseNumber: 'USMD-12345',
      experience: 12,
      consultationFee: 7500, // $75 in cents
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
    },
  });
  console.log(`✅ Doctor: ${doctorUser.email}`);

  // ── 3. LAB ──
  const labUser = await prisma.user.create({
    data: {
      email: 'pathlabs@demo.kynthai.app',
      name: 'Quest Diagnostics Partner Lab',
      role: 'lab',
      password,
      emailVerified: new Date(),
      consentAccepted: true,
      dataProcessingConsent: true,
      aiTrainingConsent: true,
    },
  });
  const lab = await prisma.labProfile.create({
    data: {
      userId: labUser.id,
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
    },
  });
  console.log(`✅ Lab: ${labUser.email}`);

  // ── 4. CARETAKER ──
  const caretaker = await prisma.user.create({
    data: {
      email: 'caretaker@demo.kynthai.app',
      name: 'James Wilson',
      role: 'caretaker',
      password,
      emailVerified: new Date(),
      consentAccepted: true,
      dataProcessingConsent: true,
      aiTrainingConsent: true,
      subscriptionTier: 'family_pro',
      dateOfBirth: new Date('1975-08-22'),
    },
  });
  console.log(`✅ Caretaker: ${caretaker.email}`);

  // ── 5. ADMIN ──
  const admin = await prisma.user.create({
    data: {
      email: 'admin@demo.kynthai.app',
      name: 'Kynthai Admin',
      role: 'admin',
      password,
      emailVerified: new Date(),
      consentAccepted: true,
      dataProcessingConsent: true,
      aiTrainingConsent: true,
    },
  });
  console.log(`✅ Admin: ${admin.email}`);

  // ── FAMILY ──
  const family = await prisma.family.create({
    data: {
      name: 'Johnson Family',
      ownerId: patient.id,
    },
  });
  console.log(`✅ Family created`);

  // Add family members
  const familyMembers = await Promise.all([
    prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: patient.id,
        name: 'Sarah Johnson',
        relation: 'self',
        age: 36,
        role: 'patient',
        color: 'emerald',
      },
    }),
    prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: caretaker.id,
        name: 'James Wilson',
        relation: 'spouse',
        age: 49,
        role: 'caretaker',
        color: 'blue',
      },
    }),
    prisma.familyMember.create({
      data: {
        familyId: family.id,
        name: 'Emma Johnson',
        relation: 'daughter',
        age: 8,
        role: 'patient',
        color: 'pink',
      },
    }),
  ]);
  console.log(`✅ ${familyMembers.length} family members added`);

  // ── MEDICATIONS ──
  const meds = await Promise.all([
    prisma.medication.create({
      data: {
        userId: patient.id,
        name: 'Lisinopril',
        dosage: '10mg',
        times: JSON.stringify(['08:00', '20:00']),
        frequency: 'Twice daily',
        instructions: 'Take with or without food. Swallow whole.',
        color: 'emerald',
        active: true,
        stockRemaining: 30,
      },
    }),
    prisma.medication.create({
      data: {
        userId: patient.id,
        name: 'Metformin',
        dosage: '500mg',
        times: JSON.stringify(['08:00', '18:00']),
        frequency: 'Twice daily with meals',
        instructions: 'Take with food to reduce stomach upset.',
        color: 'blue',
        active: true,
        stockRemaining: 60,
      },
    }),
    prisma.medication.create({
      data: {
        familyMemberId: familyMembers[2].id, // Emma
        name: 'Amoxicillin',
        dosage: '250mg',
        times: JSON.stringify(['08:00', '14:00', '20:00']),
        frequency: 'Three times daily',
        instructions: 'Complete the full course even if symptoms improve.',
        color: 'purple',
        active: true,
        stockRemaining: 21,
      },
    }),
  ]);
  console.log(`✅ ${meds.length} medications added`);

  // ── APPOINTMENT ──
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const appointment = await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      scheduledAt: tomorrow,
      durationMinutes: 30,
      type: 'video',
      status: 'confirmed',
      price: 7500,
      commission: 1125, // 15%
      reason: 'Annual check-up and medication review',
    },
  });
  console.log(`✅ Appointment created`);

  // ── LAB BOOKING ──
  const labBooking = await prisma.labBooking.create({
    data: {
      labId: lab.id,
      patientId: patient.id,
      tests: JSON.stringify(['Complete Blood Count', 'Lipid Panel', 'Hemoglobin A1c']),
      scheduledAt: tomorrow,
      status: 'confirmed',
      price: 15000, // $150
      commission: 2700, // 18%
      homeCollection: true,
    },
  });
  console.log(`✅ Lab booking created`);

  // ── AVAILABILITY SLOTS ──
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  await Promise.all(days.map(day =>
    prisma.doctorAvailabilitySlot.create({
      data: {
        doctorId: doctor.id,
        day,
        start: '09:00',
        end: '17:00',
        active: true,
      },
    })
  ));
  console.log(`✅ ${days.length} availability slots created`);

  // ── CHRONIC CONDITION ──
  await prisma.chronicCondition.create({
    data: {
      patientId: patient.id,
      name: 'Type 2 Diabetes',
      diagnosedDate: new Date('2021-06-01').toISOString(),
      severity: 'moderate',
      medications: JSON.stringify(['Metformin']),
      notes: 'HbA1c improving from 8.2 to 7.1 over 6 months. Continue current regimen.',
      active: true,
    },
  });
  console.log(`✅ Chronic condition added`);

  // ── PAYMENT ──
  await prisma.payment.create({
    data: {
      userId: patient.id,
      type: 'subscription',
      amount: 999, // $9.99 Plus plan
      currency: 'USD',
      status: 'succeeded',
      provider: 'mock',
      providerRef: 'pi_mock_demo_001',
      description: 'Kynthai Plus - Monthly Subscription',
    },
  });
  console.log(`✅ Demo payment recorded`);

  // ── PRESCRIPTION (for family member) ──
  await prisma.prescription.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      medications: JSON.stringify([
        { name: 'Lisinopril', dosage: '10mg', frequency: 'Twice daily', duration: '90 days' },
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', duration: '90 days' },
      ]),
      notes: 'Continue same dosage. Follow up in 3 months for renal function panel.',
      followUpDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`✅ Prescription created`);

  console.log('\n═══════════════════════════════════════════');
  console.log('🎉  SEED COMPLETE');
  console.log('═══════════════════════════════════════════');
  console.log('\n📋  DEMO LOGIN CREDENTIALS:');
  console.log('   Password for all:  Demo@2024');
  console.log('   ────');
  console.log('   👤 Patient:   patient@demo.kynthai.app');
  console.log('   👨‍⚕️  Doctor:    priya@demo.kynthai.app');
  console.log('   🔬 Lab:       pathlabs@demo.kynthai.app');
  console.log('   👨‍👩‍👧  Caretaker: caretaker@demo.kynthai.app');
  console.log('   ⚙️  Admin:     admin@demo.kynthai.app');
  console.log('═══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
