-- =============================================================================
-- Comprehensive Row Level Security (RLS) & Hardening Migration
-- Kynthai Health Platform - All 35 Production Tables
-- =============================================================================

-- 1. Enable RLS on every table in the public schema
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    END LOOP;
END $$;

-- 2. Drop existing policies to allow idempotent re-run
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Core User Profiles & Authentication
-- -----------------------------------------------------------------------------
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid()::text = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid()::text = id);

-- Public profiles for doctors & labs (read-only directory; updates only by owner)
CREATE POLICY "doctor_profiles_select_public" ON doctor_profiles FOR SELECT USING (true);
CREATE POLICY "doctor_profiles_update_own" ON doctor_profiles FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "lab_profiles_select_public" ON lab_profiles FOR SELECT USING (true);
CREATE POLICY "lab_profiles_update_own" ON lab_profiles FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "doctor_availability_select_public" ON doctor_availability_slots FOR SELECT USING (true);
CREATE POLICY "doctor_availability_manage_own" ON doctor_availability_slots FOR ALL USING (
    EXISTS (SELECT 1 FROM doctor_profiles WHERE doctor_profiles.id = doctor_availability_slots.doctor_id AND doctor_profiles.user_id = auth.uid()::text)
);

-- -----------------------------------------------------------------------------
-- Appointments, Bookings & Consultations
-- -----------------------------------------------------------------------------
CREATE POLICY "appointments_participant_access" ON appointments FOR ALL USING (
    auth.uid()::text = patient_id OR
    EXISTS (SELECT 1 FROM doctor_profiles WHERE doctor_profiles.id = appointments.doctor_id AND doctor_profiles.user_id = auth.uid()::text)
);

CREATE POLICY "lab_bookings_participant_access" ON lab_bookings FOR ALL USING (
    auth.uid()::text = patient_id OR
    EXISTS (SELECT 1 FROM lab_profiles WHERE lab_profiles.id = lab_bookings.lab_id AND lab_profiles.user_id = auth.uid()::text)
);

CREATE POLICY "consult_messages_participant_access" ON consult_messages FOR ALL USING (
    auth.uid()::text = sender_id OR
    EXISTS (
        SELECT 1 FROM appointments
        WHERE appointments.id = consult_messages.appointment_id
          AND (appointments.patient_id = auth.uid()::text OR
               EXISTS (SELECT 1 FROM doctor_profiles WHERE doctor_profiles.id = appointments.doctor_id AND doctor_profiles.user_id = auth.uid()::text))
    )
);

CREATE POLICY "consultation_notes_access" ON consultation_notes FOR ALL USING (
    EXISTS (
        SELECT 1 FROM appointments
        WHERE appointments.id = consultation_notes.appointment_id
          AND (appointments.patient_id = auth.uid()::text OR
               EXISTS (SELECT 1 FROM doctor_profiles WHERE doctor_profiles.id = appointments.doctor_id AND doctor_profiles.user_id = auth.uid()::text))
    )
);

CREATE POLICY "chat_messages_user_access" ON chat_messages FOR ALL USING (auth.uid()::text = user_id);

-- -----------------------------------------------------------------------------
-- Health Records, Medications, Reminders & Prescriptions
-- -----------------------------------------------------------------------------
CREATE POLICY "prescriptions_patient_doctor_access" ON prescriptions FOR ALL USING (
    auth.uid()::text = patient_id OR
    EXISTS (SELECT 1 FROM doctor_profiles WHERE doctor_profiles.id = prescriptions.doctor_id AND doctor_profiles.user_id = auth.uid()::text)
);

CREATE POLICY "prescription_templates_doctor_access" ON prescription_templates FOR ALL USING (
    EXISTS (SELECT 1 FROM doctor_profiles WHERE doctor_profiles.id = prescription_templates.doctor_id AND doctor_profiles.user_id = auth.uid()::text)
);

CREATE POLICY "medications_user_access" ON medications FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "reminders_user_access" ON reminders FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "chronic_conditions_user_access" ON chronic_conditions FOR ALL USING (auth.uid()::text = patient_id);
CREATE POLICY "health_journals_user_access" ON health_journals FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "health_scores_user_access" ON health_scores FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "prescription_intel_user_access" ON prescription_intelligence FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "medicine_inventory_user_access" ON medicine_inventory FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "medicine_orders_user_access" ON medicine_orders FOR ALL USING (auth.uid()::text = patient_id);

-- -----------------------------------------------------------------------------
-- Family & Emergency
-- -----------------------------------------------------------------------------
CREATE POLICY "families_owner_access" ON families FOR ALL USING (auth.uid()::text = owner_id);
CREATE POLICY "family_members_access" ON family_members FOR ALL USING (
    auth.uid()::text = user_id OR
    EXISTS (SELECT 1 FROM families WHERE families.id = family_members.family_id AND families.owner_id = auth.uid()::text)
);
CREATE POLICY "family_health_alerts_access" ON family_health_alerts FOR ALL USING (
    EXISTS (SELECT 1 FROM families WHERE families.id = family_health_alerts.family_id AND families.owner_id = auth.uid()::text)
);
CREATE POLICY "emergency_alerts_access" ON emergency_alerts FOR ALL USING (auth.uid()::text = user_id);

-- -----------------------------------------------------------------------------
-- Payments, Billing, Orders & Payouts
-- -----------------------------------------------------------------------------
CREATE POLICY "payments_user_access" ON payments FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "refunds_user_access" ON refunds FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "payouts_doctor_access" ON payouts FOR ALL USING (
    EXISTS (SELECT 1 FROM doctor_profiles WHERE doctor_profiles.id = payouts.doctor_id AND doctor_profiles.user_id = auth.uid()::text)
);

-- -----------------------------------------------------------------------------
-- Telehealth / Video Calls
-- -----------------------------------------------------------------------------
CREATE POLICY "video_calls_access" ON video_calls FOR ALL USING (auth.uid()::text = initiated_by);
CREATE POLICY "video_call_participants_access" ON video_call_participants FOR ALL USING (auth.uid()::text = user_id);

-- -----------------------------------------------------------------------------
-- Audit, Logs, Notifications, Gamification & Referrals
-- -----------------------------------------------------------------------------
CREATE POLICY "audit_logs_user_view" ON audit_logs FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "notification_logs_user_access" ON notification_logs FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "complaints_user_access" ON complaints FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "user_streaks_user_access" ON user_streaks FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "user_badges_user_access" ON user_badges FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "referrals_user_access" ON referrals FOR ALL USING (auth.uid()::text = referrer_id);
CREATE POLICY "referral_usages_user_access" ON referral_usages FOR ALL USING (auth.uid()::text = referee_id);
