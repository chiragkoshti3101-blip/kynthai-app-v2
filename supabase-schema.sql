-- ============================================================================
-- Kynthai US — Supabase Database Schema
-- ============================================================================
-- Apply this in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS (Supabase uses CHECK constraints — we'll use text columns + CHECK)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'lab', 'caretaker', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'plus', 'pro', 'family_pro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'awaiting_payment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_type AS ENUM ('video', 'in_person');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_type AS ENUM ('consultation', 'lab', 'subscription', 'medicine');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_status AS ENUM ('pending', 'taken', 'missed', 'skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'under_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE alert_tier AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM ('missed_medication', 'low_stock', 'sos_emergency', 'family_alert', 'appointment_reminder');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'awaiting_patient_confirmation', 'confirmed', 'sample_collected', 'processing', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_category AS ENUM ('doctor', 'lab', 'billing', 'prescription', 'medication', 'identity', 'technical', 'privacy', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms', 'in_app');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Users — central identity table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'patient',
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  date_of_birth TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  consent_accepted BOOLEAN NOT NULL DEFAULT false,
  data_processing_consent BOOLEAN NOT NULL DEFAULT false,
  ai_training_consent BOOLEAN NOT NULL DEFAULT false,
  is_user_minor BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  onboarding_role user_role,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);

-- Doctor profiles (1:1 with users)
CREATE TABLE IF NOT EXISTS doctor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialization TEXT NOT NULL DEFAULT '',
  license_number TEXT,
  experience INTEGER DEFAULT 0,
  consultation_fee INTEGER DEFAULT 0,
  city TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  video_call_enabled BOOLEAN NOT NULL DEFAULT true,
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_profiles_user_id ON doctor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_doctor_profiles_verified ON doctor_profiles(verified);

-- Lab profiles (1:1 with users)
CREATE TABLE IF NOT EXISTS lab_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_name TEXT NOT NULL DEFAULT '',
  license_number TEXT,
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  home_collection BOOLEAN NOT NULL DEFAULT true,
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_profiles_user_id ON lab_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_lab_profiles_verified ON lab_profiles(verified);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  type appointment_type NOT NULL DEFAULT 'video',
  status appointment_status NOT NULL DEFAULT 'pending',
  price INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0,
  payment_captured BOOLEAN NOT NULL DEFAULT false,
  reason TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);

-- Lab bookings
CREATE TABLE IF NOT EXISTS lab_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES lab_profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tests JSONB NOT NULL DEFAULT '[]',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  price INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0,
  home_collection BOOLEAN NOT NULL DEFAULT true,
  travel_fee INTEGER NOT NULL DEFAULT 0,
  results_file TEXT,
  results_note TEXT,
  result_uploaded_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_bookings_lab_id ON lab_bookings(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_bookings_patient_id ON lab_bookings(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_bookings_status ON lab_bookings(status);

-- Prescriptions (doctor → patient)
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medications JSONB NOT NULL DEFAULT '[]',
  notes TEXT DEFAULT '',
  follow_up_notes TEXT,
  invite_token TEXT,
  invite_status TEXT DEFAULT 'pending',
  invite_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);

-- Medications
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_member_id UUID,
  name TEXT NOT NULL DEFAULT '',
  dosage TEXT DEFAULT '',
  frequency TEXT DEFAULT '',
  instructions TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medications_user_id ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_medications_family_member_id ON medications(family_member_id);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  status reminder_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_medication_id ON reminders(medication_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date_status ON reminders(date, status);

-- Chat messages (AI health chat)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role chat_role NOT NULL DEFAULT 'user',
  content TEXT NOT NULL DEFAULT '',
  source TEXT DEFAULT 'llm',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Families
CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Family',
  join_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_families_owner_id ON families(owner_id);
CREATE INDEX IF NOT EXISTS idx_families_join_code ON families(join_code);

-- Family members
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  relation TEXT DEFAULT '',
  age INTEGER,
  role TEXT DEFAULT 'member',
  invite_email TEXT,
  invite_token TEXT,
  invite_status TEXT DEFAULT 'pending',
  invite_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id);

-- Emergency alerts (SOS)
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type alert_type NOT NULL DEFAULT 'sos_emergency',
  tier alert_tier NOT NULL DEFAULT 'critical',
  location TEXT,
  notes TEXT DEFAULT '',
  notified_doctors JSONB DEFAULT '[]',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_alerts_family_id ON emergency_alerts(family_id);
CREATE INDEX IF NOT EXISTS idx_emergency_alerts_created_at ON emergency_alerts(created_at);

-- ============================================================================
-- HEALTH & MEDICAL RECORDS
-- ============================================================================

-- Health journal
CREATE TABLE IF NOT EXISTS health_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  symptoms TEXT DEFAULT '',
  mood TEXT DEFAULT 'okay',
  notes TEXT DEFAULT '',
  vitals JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_health_journals_user_id ON health_journals(user_id);

-- Health scores
CREATE TABLE IF NOT EXISTS health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  score INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_health_scores_user_id ON health_scores(user_id);

-- Consultation notes
CREATE TABLE IF NOT EXISTS consultation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  type TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_notes_doctor_id ON consultation_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultation_notes_patient_id ON consultation_notes(patient_id);

-- Chronic conditions
CREATE TABLE IF NOT EXISTS chronic_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  diagnosed_date TEXT,
  medications TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chronic_conditions_patient_id ON chronic_conditions(patient_id);

-- ============================================================================
-- FAMILY HEALTH
-- ============================================================================

-- Family health alerts
CREATE TABLE IF NOT EXISTS family_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  type alert_type NOT NULL DEFAULT 'missed_medication',
  severity alert_tier NOT NULL DEFAULT 'medium',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_health_alerts_family_id ON family_health_alerts(family_id);
CREATE INDEX IF NOT EXISTS idx_family_health_alerts_read ON family_health_alerts(read);

-- ============================================================================
-- GAMIFICATION
-- ============================================================================

-- User streaks
CREATE TABLE IF NOT EXISTS user_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'medication',
  count INTEGER NOT NULL DEFAULT 0,
  best_count INTEGER NOT NULL DEFAULT 0,
  last_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_user_streaks_user_id ON user_streaks(user_id);

-- User badges
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_type)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

-- ============================================================================
-- PRESCRIPTIONS & INTELLIGENCE
-- ============================================================================

-- Prescription intelligence (AI parsing)
CREATE TABLE IF NOT EXISTS prescription_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT DEFAULT '',
  medications JSONB DEFAULT '[]',
  schedule JSONB DEFAULT '{}',
  interactions JSONB DEFAULT '[]',
  warnings JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescription_intelligence_user_id ON prescription_intelligence(user_id);

-- Prescription templates (doctor)
CREATE TABLE IF NOT EXISTS prescription_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  medications JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescription_templates_doctor_id ON prescription_templates(doctor_id);

-- Consult messages (appointment chat)
CREATE TABLE IF NOT EXISTS consult_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE SET NULL,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_role TEXT DEFAULT 'patient',
  content TEXT NOT NULL DEFAULT '',
  "read" BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consult_messages_appointment_id ON consult_messages(appointment_id);

-- ============================================================================
-- MEDICINE ORDERS & INVENTORY
-- ============================================================================

-- Medicine orders
CREATE TABLE IF NOT EXISTS medicine_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  address TEXT DEFAULT '',
  total_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medicine_orders_patient_id ON medicine_orders(patient_id);

-- Medicine inventory
CREATE TABLE IF NOT EXISTS medicine_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
  total_pills INTEGER DEFAULT 0,
  remaining INTEGER DEFAULT 0,
  refill_date DATE,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medicine_inventory_user_id ON medicine_inventory(user_id);

-- ============================================================================
-- VIDEO CALLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  room_name TEXT NOT NULL,
  initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  duration_sec INTEGER DEFAULT 0,
  recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_calls_family_id ON video_calls(family_id);

CREATE TABLE IF NOT EXISTS video_call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_call_id UUID NOT NULL REFERENCES video_calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_call_participants_video_call_id ON video_call_participants(video_call_id);
CREATE INDEX IF NOT EXISTS idx_video_call_participants_user_id ON video_call_participants(user_id);

-- ============================================================================
-- DOCTOR AVAILABILITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_availability_doctor_id ON doctor_availability_slots(doctor_id);

-- ============================================================================
-- PAYMENTS, REFUNDS, PAYOUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type payment_type NOT NULL DEFAULT 'consultation',
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status payment_status NOT NULL DEFAULT 'pending',
  provider TEXT DEFAULT 'mock',
  provider_ref TEXT,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  lab_booking_id UUID REFERENCES lab_bookings(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  status refund_status NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL,
  proof_file TEXT,
  proof_note TEXT,
  review_deadline TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_appointment_id ON refunds(appointment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_lab_booking_id ON refunds(lab_booking_id);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE SET NULL,
  lab_id UUID REFERENCES lab_profiles(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  lab_booking_id UUID REFERENCES lab_bookings(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status payout_status NOT NULL DEFAULT 'pending',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_doctor_id ON payouts(doctor_id);
CREATE INDEX IF NOT EXISTS idx_payouts_lab_id ON payouts(lab_id);

-- ============================================================================
-- AUDIT LOG (HIPAA)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'access',
  resource_type TEXT,
  resource_id TEXT,
  http_method TEXT,
  http_path TEXT,
  status_code INTEGER,
  user_agent TEXT,
  ip_hash TEXT,
  outcome TEXT DEFAULT 'success',
  risk_score INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  type TEXT NOT NULL DEFAULT 'generic',
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  cost NUMERIC DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);

-- ============================================================================
-- REFERRALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  referral_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);

CREATE TABLE IF NOT EXISTS referral_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_usages_referral_id ON referral_usages(referral_id);

-- ============================================================================
-- COMPLAINTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category complaint_category NOT NULL DEFAULT 'other',
  subject TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  priority complaint_priority NOT NULL DEFAULT 'medium',
  status complaint_status NOT NULL DEFAULT 'open',
  related_entity_type TEXT,
  related_entity_id UUID,
  proof_file TEXT,
  evidence_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);

-- ============================================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$ DECLACE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'doctor_profiles', 'lab_profiles', 'appointments',
      'lab_bookings', 'prescriptions', 'medications', 'consultation_notes',
      'families', 'family_members', 'health_journals', 'health_scores',
      'chronic_conditions', 'prescription_intelligence', 'prescription_templates',
      'medicine_orders', 'medicine_inventory', 'video_calls', 'refunds',
      'payouts', 'complaints', 'referrals', 'consult_messages'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at_%I ON %I; CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
DO $$ DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'doctor_profiles', 'lab_profiles', 'appointments', 'lab_bookings',
      'prescriptions', 'medications', 'reminders', 'chat_messages', 'families',
      'family_members', 'emergency_alerts', 'payments', 'audit_logs',
      'consultation_notes', 'health_scores', 'health_journals',
      'family_health_alerts', 'medicine_inventory', 'user_streaks',
      'user_badges', 'prescription_intelligence', 'prescription_templates',
      'medicine_orders', 'video_calls', 'video_call_participants',
      'doctor_availability_slots', 'refunds', 'payouts', 'notification_logs',
      'referrals', 'referral_usages', 'complaints', 'consult_messages',
      'chronic_conditions'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Users: users manage own data, admins see all
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "admins_select_all_users" ON users FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Doctor profiles
CREATE POLICY "doctor_profiles_select" ON doctor_profiles FOR SELECT USING (true);
CREATE POLICY "doctor_profiles_insert_own" ON doctor_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "doctor_profiles_update_own" ON doctor_profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "admins_manage_doctor_profiles" ON doctor_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Lab profiles
CREATE POLICY "lab_profiles_select" ON lab_profiles FOR SELECT USING (true);
CREATE POLICY "lab_profiles_insert_own" ON lab_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "lab_profiles_update_own" ON lab_profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "admins_manage_lab_profiles" ON lab_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Appointments
CREATE POLICY "appointments_patient_view" ON appointments FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "appointments_doctor_view" ON appointments FOR SELECT USING (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "appointments_patient_insert" ON appointments FOR INSERT WITH CHECK (patient_id = auth.uid());
CREATE POLICY "appointments_doctor_update" ON appointments FOR UPDATE USING (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "admins_manage_appointments" ON appointments FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Lab bookings
CREATE POLICY "lab_bookings_patient_view" ON lab_bookings FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "lab_bookings_lab_view" ON lab_bookings FOR SELECT USING (
  lab_id IN (SELECT id FROM lab_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "lab_bookings_patient_insert" ON lab_bookings FOR INSERT WITH CHECK (patient_id = auth.uid());
CREATE POLICY "lab_bookings_lab_update" ON lab_bookings FOR UPDATE USING (
  lab_id IN (SELECT id FROM lab_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "admins_manage_lab_bookings" ON lab_bookings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Prescriptions
CREATE POLICY "prescriptions_patient_view" ON prescriptions FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "prescriptions_doctor_view" ON prescriptions FOR SELECT USING (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "prescriptions_doctor_insert" ON prescriptions FOR INSERT WITH CHECK (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "admins_manage_prescriptions" ON prescriptions FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Medications
CREATE POLICY "medications_user_view" ON medications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "medications_user_insert" ON medications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "medications_user_update" ON medications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "medications_user_delete" ON medications FOR DELETE USING (user_id = auth.uid());

-- Reminders
CREATE POLICY "reminders_via_medication" ON reminders FOR SELECT USING (
  medication_id IN (SELECT id FROM medications WHERE user_id = auth.uid())
);

-- Chat messages
CREATE POLICY "chat_messages_user_view" ON chat_messages FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "chat_messages_user_insert" ON chat_messages FOR INSERT WITH CHECK (user_id = auth.uid());

-- Families
CREATE POLICY "families_owner_view" ON families FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "families_owner_insert" ON families FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "families_owner_update" ON families FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "families_member_view" ON families FOR SELECT USING (
  id IN (SELECT family_id FROM family_members WHERE user_id = auth.uid())
);

-- Family members
CREATE POLICY "family_members_family_view" ON family_members FOR SELECT USING (
  family_id IN (SELECT id FROM families WHERE owner_id = auth.uid())
  OR family_id IN (SELECT family_id FROM family_members WHERE user_id = auth.uid())
);
CREATE POLICY "family_members_family_insert" ON family_members FOR INSERT WITH CHECK (
  family_id IN (SELECT id FROM families WHERE owner_id = auth.uid())
);
CREATE POLICY "family_members_family_update" ON family_members FOR UPDATE USING (
  family_id IN (SELECT id FROM families WHERE owner_id = auth.uid())
);

-- Emergency alerts
CREATE POLICY "emergency_alerts_family_view" ON emergency_alerts FOR SELECT USING (
  family_id IN (SELECT id FROM families WHERE owner_id = auth.uid())
  OR family_id IN (SELECT family_id FROM family_members WHERE user_id = auth.uid())
);
CREATE POLICY "emergency_alerts_insert" ON emergency_alerts FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Payments
CREATE POLICY "payments_user_view" ON payments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "admins_manage_payments" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Refunds
CREATE POLICY "refunds_user_view" ON refunds FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "refunds_user_insert" ON refunds FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins_manage_refunds" ON refunds FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Payouts
CREATE POLICY "payouts_doctor_view" ON payouts FOR SELECT USING (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "payouts_lab_view" ON payouts FOR SELECT USING (
  lab_id IN (SELECT id FROM lab_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "admins_manage_payouts" ON payouts FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Audit logs (read-only, admin can read all)
CREATE POLICY "audit_logs_user_view" ON audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "audit_logs_admin_view" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "audit_logs_insert_service" ON audit_logs FOR INSERT WITH CHECK (true);

-- Remaining tables — user-scoped
CREATE POLICY "health_journals_user" ON health_journals FOR ALL USING (user_id = auth.uid());
CREATE POLICY "health_scores_user" ON health_scores FOR ALL USING (user_id = auth.uid());
CREATE POLICY "consultation_notes_user" ON consultation_notes FOR ALL USING (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
  OR patient_id = auth.uid()
);
CREATE POLICY "chronic_conditions_user" ON chronic_conditions FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "medicine_orders_user" ON medicine_orders FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "medicine_inventory_user" ON medicine_inventory FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_streaks_user" ON user_streaks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_badges_user" ON user_badges FOR ALL USING (user_id = auth.uid());
CREATE POLICY "prescription_intelligence_user" ON prescription_intelligence FOR ALL USING (user_id = auth.uid());
CREATE POLICY "prescription_templates_doctor" ON prescription_templates FOR ALL USING (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "video_calls_user" ON video_calls FOR ALL USING (initiated_by = auth.uid());
CREATE POLICY "video_call_participants_user" ON video_call_participants FOR ALL USING (
  user_id = auth.uid()
);
CREATE POLICY "doctor_availability_doctor" ON doctor_availability_slots FOR ALL USING (
  doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "notification_logs_user" ON notification_logs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "complaints_user" ON complaints FOR ALL USING (user_id = auth.uid());
CREATE POLICY "admins_manage_complaints" ON complaints FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "referrals_user" ON referrals FOR ALL USING (referrer_id = auth.uid());
CREATE POLICY "consult_messages_user" ON consult_messages FOR ALL USING (
  sender_id = auth.uid()
  OR doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "family_health_alerts_family" ON family_health_alerts FOR ALL USING (
  family_id IN (SELECT id FROM families WHERE owner_id = auth.uid())
);

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('prescriptions', 'prescriptions', false, 5242880, ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('lab-results', 'lab-results', false, 5242880, ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('complaint-proof', 'complaint-proof', false, 5242880, ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('doctor-docs', 'doctor-docs', false, 5242880, ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('medicine-images', 'medicine-images', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "prescriptions_owner" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'prescriptions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "prescriptions_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'prescriptions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "lab-results_owner" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'lab-results'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "lab-results_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'lab-results'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "complaint-proof_owner" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'complaint-proof'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "complaint-proof_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'complaint-proof'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "doctor-docs_owner" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'doctor-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "doctor-docs_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'doctor-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "medicine-images_public" ON storage.objects FOR SELECT USING (bucket_id = 'medicine-images');
CREATE POLICY "medicine-images_owner" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'medicine-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================================
-- Missing tables from Prisma schema (schema drift fix)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS free_tier_usage (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature, date)
);

CREATE INDEX IF NOT EXISTS idx_free_tier_usage_user_feature_date ON free_tier_usage(user_id, feature, date);

CREATE TABLE IF NOT EXISTS free_tier_usage_audit (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  action TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_free_tier_usage_audit_user_id ON free_tier_usage_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_free_tier_usage_audit_feature ON free_tier_usage_audit(feature);

CREATE TABLE IF NOT EXISTS medical_document (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  uploaded_by_id TEXT NOT NULL,
  family_id TEXT,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'CLINICAL',
  title TEXT NOT NULL DEFAULT '',
  title_enc TEXT,
  description TEXT,
  description_enc TEXT,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'medical-documents',
  encrypted BOOLEAN NOT NULL DEFAULT true,
  encryption_key TEXT,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE',
  shared_with TEXT[] NOT NULL DEFAULT '{}',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  CONSTRAINT fk_medical_document_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_medical_document_uploaded_by FOREIGN KEY (uploaded_by_id) REFERENCES users(id),
  CONSTRAINT fk_medical_document_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_medical_document_user_type ON medical_document(user_id, type);
CREATE INDEX IF NOT EXISTS idx_medical_document_family_id ON medical_document(family_id);
CREATE INDEX IF NOT EXISTS idx_medical_document_uploaded_by_id ON medical_document(uploaded_by_id);
CREATE INDEX IF NOT EXISTS idx_medical_document_uploaded_at ON medical_document(uploaded_at);

CREATE TABLE IF NOT EXISTS newsletter_subscriber (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscriber_created_at ON newsletter_subscriber(created_at);

CREATE TABLE IF NOT EXISTS push_subscription (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'webpush',
  token TEXT,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_push_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_user_endpoint_type ON push_subscription(user_id, endpoint, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_user_type_token ON push_subscription(user_id, type, token);

CREATE TABLE IF NOT EXISTS revoked_session (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  session_jti TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT 'user_initiated',
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT fk_revoked_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_revoked_session_session_jti ON revoked_session(session_jti);
CREATE INDEX IF NOT EXISTS idx_revoked_session_user_id ON revoked_session(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_session_expires_at ON revoked_session(expires_at);

-- ============================================================================
-- SEED DATA (for development with ENABLE_DEMO=true)
-- ============================================================================

-- These are created by the auth system — do NOT insert here.
-- The app seeds demo users via ensureDemoUsers() which uses Supabase Auth API.

-- ============================================================================
-- DONE
-- ============================================================================
-- Run psql -f supabase-schema.sql against your Supabase project