'use client'

// B04 — Privacy Officer email
const PRIVACY_OFFICER_EMAIL = 'privacy@kynthai.app'
const SUPPORT_EMAIL = 'hello@kynthai.app'

import * as React from 'react'
import { ArrowLeft, ShieldCheck, Lock, FileText, Mail, Database, Clock, AlertTriangle, Ban, Globe, Scale, Users, Bell, Stethoscope, UserX, ShieldAlert, Siren, Crown, UserCheck, } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { KynthaiBrand } from '../logo'
import { FadeIn } from '../animations'
import { ContactEmail, ContactEmailText } from '../contact-email'

export function LegalLayout({ title, subtitle, updated, children }: { title: string; subtitle: string; updated: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => window.history.length > 1 ? window.history.back() : router.push('/')} className="inline-flex items-center gap-2 rounded-md p-2 -m-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Back to Kynthai
          </button>
          <KynthaiBrand />
          <Button size="sm" onClick={() => router.push('/login')} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">Sign in</Button>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <FadeIn>
          <Badge variant="secondary" className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-3 w-3" />Legal</Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated: {updated}</p>
        </FadeIn>
        <Card className="mt-8 border-border/60">
          <CardContent className="prose prose-sm max-w-none space-y-6 p-6 text-foreground sm:p-8 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:leading-relaxed">{children}</CardContent>
        </Card>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-emerald-600" />TLS in transit · documents encrypted at rest</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Privacy-first</span>
          <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-emerald-600" /><ContactEmailText address={PRIVACY_OFFICER_EMAIL} /></span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">Kynthai · Contact: privacy@kynthai.app</span>
        </div>
      </div>
    </div>
  )
}

export function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-semibold mt-8 mb-3">
      <Icon className="h-5 w-5 text-emerald-600" />{children}
    </h2>
  )
}

export function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How Kynthai collects, uses, and protects your health data."
      updated="July 13, 2026"
    >
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm">
          Kynthai is a health-management platform operated by{' '}
          <strong>Kynthai Health Technologies</strong>.          Kynthai is not a HIPAA-covered entity or business associate and does
          not claim HIPAA compliance. We follow applicable US federal and state
          consumer privacy laws, including the FTC Health Breach Notification
          Rule and state consumer health privacy laws, and we apply strong
          safeguards to your sensitive health data.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Note:</strong> We regularly review this policy to keep it aligned with applicable rules.
          Consult qualified US legal counsel to confirm section numbering and applicability before relying on this policy for regulatory compliance.
        </p>
      </div>

      <SectionTitle icon={Database}>1. Data we collect</SectionTitle>
      <p>We collect only the data necessary to operate Kynthai for you and your family:</p>
      <ul>
        <li><strong>Account data:</strong> name, email address, phone number (optional), hashed password (bcrypt), and chosen portal (Family / Patient / Doctor / Lab / Admin).</li>
        <li><strong>Profile data:</strong> family-member profiles you create, including name, relationship, age, and notes.</li>
        <li><strong>Health data (special category):</strong> medication names, dosages, schedules, reminder logs, symptom-analyzer inputs, AI chat messages, uploaded prescription and medicine images, chronic conditions, and lab results.</li>
        <li><strong>Usage data:</strong> device type, app version, IP address (country-level only), feature usage events, and crash logs.</li>
        <li><strong>Communication data:</strong> records of consults with doctors, lab orders, and prescription invitations.</li>
        <li><strong>Payment data:</strong> billing email and subscription tier. Card data is handled entirely by our payment processor (Stripe) — we never see or store your full card number.</li>
      </ul>


      <SectionTitle icon={Globe}>2. How we use sensitive health data</SectionTitle>
      <p>Kynthai is not a HIPAA-covered entity or business associate. We process sensitive health data only for the purposes described below, based on your consent and the operation of the service:</p>
      <ul>
        <li><strong>With your consent:</strong> — we process sensitive health data for the features you use, with free, specific, informed consent. You may withdraw consent at any time via the in-app consent manager or by emailing <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" />.</li>
        <li><strong>To provide the service:</strong> — to deliver the Kynthai service you signed up for, including medication reminders, AI features, doctor consults, and lab orders.</li>
        <li><strong>Legal obligations:</strong> — to comply with applicable US federal and state laws, including tax and record-retention requirements.</li>
        <li><strong>Safety:</strong> — to send emergency SOS alerts to caretakers and linked doctors when your health or safety is at risk.</li>
        <li><strong>Legitimate interests:</strong> — for security, fraud prevention, and product improvement, balanced against your privacy rights.</li>
      </ul>
      <p>For any use of sensitive health data beyond the purposes described above, we will ask for your explicit consent first. Withdrawing consent does not affect processing that was completed before the withdrawal.</p>

      <SectionTitle icon={ShieldCheck}>3. US privacy compliance</SectionTitle>
      <p>Kynthai operates in the United States and follows applicable US federal and state privacy laws for consumer health data. Kynthai is not a HIPAA-covered entity or business associate and does not claim HIPAA compliance. Our commitments:</p>
      <ul>
        <li>We use and disclose your sensitive health data only for the purposes described in this policy, with strict purpose limitation and data minimization.</li>
        <li>We obtain your explicit consent before using or disclosing sensitive health data for purposes beyond providing the service, and we summarize our privacy practices at account registration.</li>
        <li>You have the right to access, correct, amend, and delete your data, and to designate an authorized individual to act on your behalf in the event of death or incapacity.</li>
        <li>In the event of a breach of unsecured sensitive health data, we will notify affected individuals and, where required, the Federal Trade Commission (FTC) and applicable state regulators, without unreasonable delay — in no case later than 60 calendar days from discovery (consistent with the FTC Health Breach Notification Rule).</li>
        <li>Health data is treated as sensitive consumer health data and is protected with strong security controls.</li>
        <li>A Privacy Officer (details in Section 18) handles privacy complaints. Complaints are acknowledged within 5 business days. Standard grievances are resolved within 30 days; complex investigations are extended in writing with stated resolution timelines.</li>
      </ul>
      <p>For users in the United States, applicable federal and state consumer privacy laws govern our practices. California residents are additionally protected by the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA). Washington, Nevada, and other states with consumer health privacy laws grant additional rights described in this policy. For users in other jurisdictions, Kynthai complies with applicable local data protection laws to the extent required.</p>

      <SectionTitle icon={ShieldCheck}>4. US privacy authorization & privacy practices</SectionTitle>
      <p>
        At registration, you are presented with our privacy practices and asked to consent to the processing of your data. For uses of sensitive health data beyond providing the service, we obtain your separate, specific consent. AI features may require a separate optional data-use consent. You may revoke any consent at any time via your account settings or by emailing <strong><ContactEmailText address="privacy@kynthai.app" /></strong>. Revocation takes effect promptly (typically within 72 hours) but does not apply to processing that occurred before the revocation. Withdrawing AI consent disables AI features but retains your medication reminders and health records.
      </p>


      <SectionTitle icon={UserCheck}>5. Your privacy rights — how to exercise</SectionTitle>
      <p>
        Under applicable US federal and state privacy laws — including the FTC Health Breach Notification Rule, state consumer health privacy laws (e.g., Washington&apos;s My Health My Data Act), and — for California residents — the CCPA/CPRA, you have the following rights:
      </p>
      <ul>
        <li><strong>Right of access:</strong> — Export all your data via Profile → Export Data (GET /api/user/data-export). You will receive a JSON file within 30 days.</li>
        <li><strong>Right to correction:</strong> — Request correction of inaccurate or incomplete sensitive health data via your profile settings or by emailing <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" />.</li>
        <li><strong>Right to request restrictions:</strong> — Request restrictions on how your sensitive health data is used and shared, subject to applicable limitations.</li>
        <li><strong>Right to delete account:</strong> — You may delete your account and all associated sensitive health data at any time via Profile → Delete Account (DELETE /api/user/account). A 7-day cooldown applies.</li>
        <li><strong>Privacy complaints:</strong> — File a complaint with our Privacy Officer at <strong><ContactEmailText address="privacy@kynthai.app" /></strong>. We acknowledge within 5 business days and resolve within 30 days. You may also file a complaint with the Federal Trade Commission at <strong>ftc.gov/complaint</strong> or with your state attorney general.</li>
        <li><strong>Escalation:</strong> — Unresolved complaints may be escalated to the FTC or your state attorney general.</li>
        <li><strong>Right to designate an authorized representative:</strong> — Designate an authorized individual to act on your behalf in the event of death or incapacity. Email <strong><ContactEmailText address="privacy@kynthai.app" /></strong> to set up.</li>
      </ul>
      <p>
        If you are a California resident, you have additional rights under the CCPA/CPRA, including the right to know, delete, and opt out of the sale of personal information. We do not sell your personal information. We will respond to valid requests within 30 days (extendable by 30 days for complex requests, with notice).
      </p>

      <SectionTitle icon={Ban}>6. Your rights regarding health data</SectionTitle>
      <p>
        Kynthai treats health data as <strong>sensitive consumer health data</strong> protected under
        applicable US federal and state privacy law. The following safeguards apply:
      </p>
      <ul>
        <li>Sensitive health data is used and disclosed only for the purposes described in this policy, or with your explicit consent for anything beyond those purposes.</li>
        <li>You may request access to, amendment of, or restrictions on the use and disclosure of your health data (sensitive health data) at any time.</li>
        <li>Health data is encrypted in transit with TLS 1.3; uploaded documents and prescription images are additionally encrypted at rest with AES-256-GCM.</li>
        <li>Access to health data is restricted to authorised personnel on a need-to-know basis.</li>
        <li>Audit logs record all access to health data for security and compliance review.</li>
        <li>In the event of a breach involving unsecured sensitive health data, we will notify affected individuals and, where required, the FTC and applicable state regulators, without unreasonable delay — in no case later than 60 calendar days from discovery (consistent with the FTC Health Breach Notification Rule).</li>
      </ul>
      <p>
        US users are protected by applicable US federal and state consumer privacy laws. California residents have CCPA/CPRA rights. Users in other jurisdictions retain rights under applicable local privacy laws to the extent required.
      </p>

      {/* State privacy law section */}
      <SectionTitle icon={Scale}>6A. Other US state consumer privacy laws</SectionTitle>
      <p>
        In addition to US privacy and CCPA/CPRA, Kynthai complies with the following state-level privacy statutes that grant consumers rights over their personal information:
      </p>
      <ul>
        <li><strong>Virginia — Consumer Data Protection Act (VCDPA):</strong> Virginia residents have the right to confirm whether we process their personal data, correct inaccuracies, delete their personal data, obtain a copy of their personal data in a portable format, and opt out of the processing of personal data for targeted advertising or sale. You may exercise these rights by contacting <ContactEmailText address="privacy@kynthai.app" />.</li>
        <li><strong>Colorado — Privacy Act (CPA):</strong> Colorado residents have the right to know what personal data is collected, correct inaccuracies, delete personal data, obtain a copy of their data, and opt out of targeted advertising, profiling, or sale. To exercise these rights, submit a request to <ContactEmailText address="privacy@kynthai.app" />.</li>
        <li><strong>Utah — Consumer Privacy Act (UCPA):</strong> Utah residents may request confirmation of data processing, access to their data, correction of inaccuracies, and deletion of their data. Opt-out rights apply to targeted advertising and sale. Submit requests to <ContactEmailText address="privacy@kynthai.app" />.</li>
        <li><strong>Connecticut — Data Privacy Act (CTDPA):</strong> Connecticut residents have the right to confirm processing, access their data, correct inaccuracies, delete personal data, and opt out of targeted advertising or sale. Requests may be submitted to <ContactEmailText address="privacy@kynthai.app" />.</li>
      </ul>
      <p>
        <strong>Nondiscrimination:</strong> We will not discriminate against you for exercising any of your privacy rights under these laws.
      </p>

      <SectionTitle icon={Clock}>7. Data retention</SectionTitle>
      <ul>
        <li><strong>Active accounts:</strong> for the duration of your subscription or until you delete your account.</li>
        <li><strong>After account deletion:</strong> we erase personal data within 30 days, except where retention is required by law (tax retention under US federal law: 7 years for tax records).</li>
        <li><strong>De-identified data:</strong> information from which direct identifiers have been removed may be retained indefinitely, as it no longer constitutes personal or sensitive health data.</li>
        <li><strong>Backups:</strong> encrypted backups may contain deleted data for up to 90 days for disaster recovery, after which they are permanently purged.</li>
      </ul>

      <SectionTitle icon={Lock}>8. Security</SectionTitle>
      <p>
        We implement layered technical and organisational controls appropriate
        to the sensitivity of the data we process.
      </p>
      <ul>
        <li><strong>Encryption in transit:</strong> All API and web traffic is protected with TLS 1.3.</li>
        <li><strong>Encryption at rest for high-sensitivity data:</strong> Government-issued identity fields are encrypted with AES-256-GCM (256-bit key, 128-bit IV, 128-bit authentication tag) before being written. Data is decrypted only when required for a specific authorised operation.</li>
        <li><strong>Encryption at rest — general health data:</strong> Column-level encryption for general health columns (medications, lab results, AI chat logs, prescription images) is being rolled out. This will mirror the approach for identity fields. We will update this policy once rollout is complete.</li>
        <li><strong>Password storage:</strong> Passwords are hashed with bcrypt (cost factor 12).</li>
        <li><strong>Session tokens:</strong> Authentication sessions use HTTP-only, Secure, SameSite cookies. Session tokens are HMAC-SHA256 hashed before storage. Session TTL is 30 days from last activity; if fewer than 7 days remain it is automatically extended. Password reset tokens expire after 30 minutes. You can end all sessions by logging out or changing your password.</li>
        <li><strong>Access control:</strong> Role-based access control restricts data access to authorised personnel on a need-to-know basis.</li>
        <li><strong>Audit logging:</strong> All access to health data is logged for security and compliance review.</li>
        <li><strong>Rate limiting:</strong> API rate limits are enforced to prevent abuse and credential-stuffing attacks.</li>
        <li><strong>Content-Security-Policy:</strong> CSP headers are applied to reduce injection risk.</li>
        <li><strong>Account lockout:</strong> Repeated failed login attempts result in temporary account lockout.</li>
      </ul>
      <p>
        Access to production systems is restricted to authorised personnel. We
        follow secure deployment practices and review our infrastructure
        configurations regularly.
      </p>

      <SectionTitle icon={Stethoscope}>8A. FDA Software as a Medical Device (SaMD) & platform status</SectionTitle>
      <p>
        <strong>Kynthai is not a medical device.</strong> Kynthai is a health-technology
        platform that provides general wellness and health-management tools
        (medication reminders, appointment scheduling, lab bookings, prescription
        management, AI chat, symptom analysis, medicine identification, drug-interaction
        checking, and health insights). These features provide informational content
        only and do <strong>not</strong> constitute medical advice, diagnosis,
        treatment, or a substitute for professional healthcare under applicable
        federal and state law.
      </p>
      <p>
        Because our AI features are not intended to diagnose, cure, mitigate, treat,
        or prevent disease, they are <strong>not</strong> regulated as Software as a
        Medical Device (SaMD) under 21 CFR Part 870, nor do they require FDA 510(k)
        clearance, De Novo classification, or PMA approval. Kynthai makes no claims
        of FDA clearance or approval for diagnostic, therapeutic, or monitoring
        functions. The FDA may regulate health software in the future; Kynthai will
        comply with any applicable FDA requirements as they develop.
      </p>
      <p>
        <strong>Independent healthcare professionals:</strong> Doctors and labs
        available through Kynthai are independent healthcare providers. Kynthai does
        not employ, supervise, or control their medical decision-making. These
        professionals are solely responsible for compliance with applicable federal
        and state healthcare laws, including but not limited to EMTALA, Medicare/Medicaid
        conditions of participation, and state medical-board regulations.
      </p>

      <SectionTitle icon={Globe}>9. Data storage & cross-border transfers</SectionTitle>
      <p>
        <strong>Data storage:</strong> sensitive health data of
        US users is stored and processed on secure cloud infrastructure
        with data-processing agreements in place with all subprocessors
        that handle sensitive health data. Cross-border data transfers (where applicable) are
        subject to appropriate safeguards (data-protection terms and Standard Contractual
        Clauses) to ensure continued comprehensive protection of sensitive health data.
      </p>
      <p>
        Kynthai may transfer data to cloud service providers and subprocessors
        operating outside the United States for data processing purposes. Such transfers are
        protected by appropriate contractual safeguards including standard data
        protection clauses and encryption in transit and at rest.
      </p>

      <SectionTitle icon={ShieldCheck}>10. Your rights (US)</SectionTitle>
      <p>
        As a user whose sensitive health data is held by Kynthai, you have the following rights under applicable US federal and state law:
      </p>
      <ul>
        <li><strong>Right of access:</strong> Request a copy of your sensitive health data. Use Profile → Export Data (GET /api/user/data-export). Delivery within 30 days.</li>
        <li><strong>Right to correction:</strong> Request correction of inaccurate or incomplete sensitive health data via your profile settings or email to <ContactEmailText address="privacy@kynthai.app" />.</li>
        <li><strong>Right to request restrictions:</strong> Request restrictions on how your sensitive health data is used and shared.</li>
        <li><strong>Right to delete account:</strong> You may delete your account and all associated sensitive health data at any time via Profile → Delete Account (DELETE /api/user/account). A 7-day cooldown applies before permanent deletion.</li>
        <li><strong>Privacy complaints:</strong> File a complaint with our Privacy Officer at <ContactEmailText address="privacy@kynthai.app" />. We acknowledge within 5 business days and resolve within 30 days. You may also file a complaint with the Federal Trade Commission (ftc.gov/complaint) or your state attorney general.</li>
        <li><strong>Escalation:</strong> Unresolved complaints may be escalated to the FTC or your state attorney general.</li>
      </ul>
      <p>
        If you are a California resident, you have additional rights under the CCPA/CPRA, including the right to know, delete, and opt out of the sale of personal information. We do not sell your personal information. California residents have rights under CCPA/CPRA (we do not sell personal info). Other jurisdictions: you may also have additional rights under applicable laws in your jurisdiction. We will respond to valid
        requests within 30 days (extendable by 30 days for complex requests, with
        notice).
      </p>

      <SectionTitle icon={Ban}>11. Your rights regarding health data</SectionTitle>
      <p>
        Kynthai treats health data as <strong>sensitive consumer health data</strong> protected under
        applicable US federal and state privacy law. We apply heightened safeguards:
      </p>
      <ul>
        <li>Sensitive health data is used and disclosed only for the purposes described in this policy, or with your explicit consent for anything beyond those purposes.</li>
        <li>You may request access to, amendment of, or restrictions on the use and disclosure of your health data (sensitive health data) at any time.</li>
        <li>Health data is encrypted in transit with TLS 1.3; uploaded documents and prescription images are additionally encrypted at rest with AES-256-GCM.</li>
        <li>Access to health data is restricted to authorised personnel on a need-to-know basis.</li>
        <li>Audit logs record all access to health data for security and compliance review.</li>
        <li>In the event of a breach involving unsecured sensitive health data, we will notify affected individuals and, where required, the FTC and applicable state regulators, without unreasonable delay — in no case later than 60 calendar days from discovery (consistent with the FTC Health Breach Notification Rule).</li>
      </ul>
      <p>
        US users are protected by applicable US federal and state consumer privacy laws. California residents are additionally protected by the CCPA/CPRA. Users in other jurisdictions retain rights under applicable local privacy laws to the extent required.
      </p>


      <SectionTitle icon={AlertTriangle}>12. Data sharing & subprocessors</SectionTitle>
      <p>
        Kynthai shares personal data only with the minimum number of processors
        necessary to deliver the service. Each sub-processor listed below has
        executed (or in the case of open-source components, is covered by) a
        data-processing agreement imposing obligations no less protective than
        those in this policy. You may request a current copy of any DPA in force
        by emailing <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" />.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left font-semibold">Sub-processor</th>
              <th className="py-2 pr-4 text-left font-semibold">Role</th>
              <th className="py-2 pr-4 text-left font-semibold">Data shared</th>
              <th className="py-2 text-left font-semibold">Jurisdiction</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4"><strong>Stripe, Inc.</strong></td>
              <td className="py-2 pr-4">Payment processing</td>
              <td className="py-2 pr-4">Billing email, subscription tier, payment-intent amount. Card data never reaches Kynthai servers.</td>
              <td className="py-2">US</td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4"><strong>NVIDIA Corporation</strong> / NVIDIA NIM (or equivalent AI-inference provider)</td>
              <td className="py-2 pr-4">AI inference (chat, symptom analysis, drug-interaction checking, medicine identification, prescription scanning)</td>
              <td className="py-2 pr-4">De-identified chat inputs and symptom text; output returned to Kynthai. Health data is not used to train vendor models.</td>
              <td className="py-2">US</td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4"><strong>Upstash</strong> (or equivalent serverless data store)</td>
              <td className="py-2 pr-4">Background job queue / rate-limit / session store</td>
              <td className="py-2 pr-4">Anonymised session identifiers, rate-limit counters. No health data.</td>
              <td className="py-2">US</td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4"><strong>Twilio, Inc.</strong> / <strong>SendGrid</strong> (Twilio) / WhatsApp (Meta)</td>
              <td className="py-2 pr-4">Communication delivery (SMS, email, WhatsApp messages)</td>
              <td className="py-2 pr-4">Message content (dose reminders, lab-result notifications, SOS alerts) and recipient mobile number / email address. Health summaries are minimised to what is necessary for the reminder.</td>
              <td className="py-2">US</td>
            </tr>
            <tr>
              <td className="py-2 pr-4"><strong>PostHog</strong> / Vercel Analytics</td>
              <td className="py-2 pr-4">Product analytics & performance monitoring</td>
              <td className="py-2 pr-4">Anonymised usage events (page views, feature interactions, error logs). IP addresses are truncated or hashed. No health data.</td>
              <td className="py-2">US</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Cloud infrastructure providers</strong> (primary hosting, databases,
        object storage) operate under data-processing agreements with encryption-in-transit
        and access-control requirements. Government-issued identity fields (Tax ID/SSN)
        are end-to-end encrypted before they reach storage, so cloud infrastructure providers cannot read
        these values under strict data protection agreement requirements.
      </p>
      <p>
        Doctors and labs you choose to consult or order from receive only the data
        necessary for that consultation or order. They act as independent data
        controllers for that data once received.
      </p>
      <p>
        Authorities may receive data where required by law, court order, or to
        protect the rights, property, or safety of Kynthai, our users, or others.
      </p>
      <p><strong>We never sell your personal or health data.</strong> We never share health data for advertising purposes.</p>

      <SectionTitle icon={FileText}>13. Cookies & local storage</SectionTitle>
      <p>Kynthai uses:</p>
      <ul>
        <li>
          <strong>Essential cookies:</strong> a single <code>kynthai_session</code>{' '}
          HttpOnly, Secure, SameSite cookie used for authentication. This cookie
          expires <strong>30 days</strong> after your last activity; if fewer than
          7 days remain it is automatically refreshed for a further 30 days.
          You can terminate the session at any time by logging out or changing
          your password. (No consent is required for this strictly necessary
          session cookie under applicable US and state privacy law.)
        </li>
        <li><strong>Local storage:</strong> to remember your theme preference, onboarding state, and selected currency. This stays on your device and is never transmitted to our servers.</li>
        <li><strong>Service worker:</strong> installed for offline caching and push notifications. You can uninstall it from your browser settings.</li>
      </ul>
      <p>We do <strong>not</strong> use third-party advertising cookies, tracking pixels, or cross-site advertising networks. You can clear all cookies and local storage via your browser settings at any time.</p>

      <SectionTitle icon={Users}>14. Children&apos;s privacy</SectionTitle>
      <p>Kynthai is not directed at children under 16. Family profiles for minors may be created and managed by a parent or legal guardian who consents to the processing on the child&apos;s behalf. The parent may request deletion of a minor&apos;s profile at any time. We do not knowingly collect data from children under 16 without verified parental consent, consistent with the Children&apos;s Online Privacy Protection Act (COPPA, 15 U.S.C. §§ 6501–6506) and applicable US child-protection framework. If you believe we have collected data from a child without consent, contact <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" /> for immediate deletion.</p>

      <SectionTitle icon={Bell}>14A. Marketing communications</SectionTitle>
      <p>
        We will not send you marketing emails or SMS without your explicit consent.
        You can opt in or out at any time via your account settings or by clicking
        the unsubscribe link in any email. Your consent status is stored and audited.
      </p>

      <SectionTitle icon={AlertTriangle}>15. Data breach notification</SectionTitle>
      <p>
        Kynthai is a consumer health application, not a HIPAA covered entity or
        business associate, so we are not subject to the HIPAA/HITECH breach
        notification rules. We nevertheless take breach response seriously and,
        as a provider of health-related personal data, we follow the Federal Trade
        Commission&apos;s Health Breach Notification Rule (16 CFR Part 318) to the
        extent it applies, along with any applicable state consumer health
        privacy laws:
      </p>
      <ul>
        <li><strong>Affected individuals:</strong> We will notify affected individuals without unreasonable delay, and in no case later than 60 calendar days from discovery, when their unsecured sensitive health data is acquired in a breach.</li>
        <li><strong>FTC notification:</strong> Where required by the FTC Health Breach Notification Rule (16 CFR Part 318), we will notify the Federal Trade Commission, and prominent media where the breach affects 500 or more individuals.</li>
        <li><strong>Remediation & review:</strong> We will contain the breach, assess its scope, take reasonable steps to prevent recurrence, and conduct a post-incident review within 30 days.</li>
      </ul>


      <SectionTitle icon={Bell}>16. Automated decision-making & AI transparency</SectionTitle>
      <p>
        Kynthai uses AI to provide health information, identify medicines, check drug
        interactions, and offer insights. AI outputs are advisory only and do not
        constitute medical advice. You always have the option to consult a qualified
        healthcare professional through Kynthai.
      </p>
      <p>
        <strong>AI Incident Reporting:</strong> If you believe an AI response was
        incorrect, misleading, or potentially harmful, report it immediately to
        <strong><ContactEmailText address="ai-incidents@kynthai.app" /></strong>. Include the AI feature used, the
        query/input, and the output received. We review all reports, track patterns,
        and use findings to improve AI accuracy. All reports are logged and reviewed
        within 72 hours.
      </p>
      <p>Kynthai uses AI (large language models, vision models, speech recognition) for chat, symptom analysis, medicine identification, prescription scanning, drug-interaction checking, and insights. These features provide <strong>advisory information only</strong> and do not make automated decisions with legal or similarly significant effects about you. All AI outputs are clearly labelled as AI-generated, and a qualified healthcare professional should be consulted before making medical decisions. You may request human review of any AI-generated output by contacting your doctor or <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />.</p>

      <SectionTitle icon={FileText}>17. Changes to this policy</SectionTitle>
      <p>We may update this policy from time to time. We will notify you of material changes via email and in-app at least 30 days before they take effect. Continued use after the effective date constitutes acceptance. A version history is available at <a href="https://kynthai.app/privacy/history" className="text-emerald-600 underline">kynthai.app/privacy/history</a>.</p>

      <SectionTitle icon={Mail}>18. Contact & Privacy Officer</SectionTitle>
      <p>
        <strong>Kynthai Health Technologies</strong><br />
        <strong>Address (United States):</strong> United States (correspondence via email)<br />

        Email:{' '}
        <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />
        <br />
        Support:{' '}
        <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />
        <br />
      </p>
      <p>
        <strong>Privacy Officer:</strong><br />
        Name: Privacy Officer<br />
        Email: <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" /><br />
        Address: United States
      </p>
      <p>
        <strong>Privacy Officer / Privacy Contact:</strong><br />
        Name: Privacy Officer<br />
        Email: <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" /><br />
        Address: United States<br />
        Acknowledgment: all complaints are acknowledged within 5 business days.
        Standard complaints are resolved within <strong>30 calendar days</strong>
        of acknowledgement. Where a complaint is complex or requires additional investigation, we will notify you
        in writing of any delay, the reason, and the expected final resolution date. Escalation:
        unresolved complaints may be referred to the HHS Office for Civil Rights (OCR).
      </p>
      <p>
        Correspondence is handled primarily via email at <ContactEmailText address="privacy@kynthai.app" />. We do not publish a physical mailing address; please use email for all legal and privacy correspondence.
      </p>
    </LegalLayout>
  )
}

/* ================================================================== */
/* CCPA / State Privacy Law Rights                                     */
/* ================================================================== */
export function CcpaOptOutPage() {
  return (
    <LegalLayout
      title="Your Privacy Rights (CCPA / VCDPA / CDPA / UCPA / CTDPA)"
      subtitle="Do Not Sell or Share My Personal Information — California and other state consumer rights."
      updated="July 13, 2026"
    >
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 mb-6">
        <p className="text-sm text-emerald-800 dark:text-emerald-200">
          <strong>We do not sell your personal information.</strong> Kynthai does not sell, rent, or
          trade personal information to third parties for monetary consideration. This page exists
          so California residents (CCPA/CPRA) and residents of Virginia (VCDPA), Colorado (CDPA),
          Utah (UCPA), and Connecticut (CTDPA) can exercise their opt-out rights. No action is
          required from you — your data is not sold.
        </p>
      </div>

      <SectionTitle icon={Ban}>Do Not Sell or Share Personal Information</SectionTitle>
      <p>
        Kynthai does not sell or share personal information. Under CCPA/CPRA, "sale" includes
        sharing for monetary or other valuable consideration. No such sharing occurs. If this
        changes, a "Do Not Sell or Share My Personal Information" link will be provided
        prominently before any relevant collection.
      </p>

      <SectionTitle icon={Ban}>Opt Out of Cross-Context Behavioural Advertising (CPRA)</SectionTitle>
      <p>
        Under CPRA, you have the right to opt out of the sharing of your personal information
        for cross-context behavioural advertising. Kynthai does not engage in this practice.
        No opt-out mechanism is required because no such sharing occurs.
      </p>

      <SectionTitle icon={ShieldCheck}>Your CCPA/CPRA Rights (California Residents)</SectionTitle>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          <strong>Right to know</strong> — what personal information is collected, used, shared,
          or sold, and with whom.
        </li>
        <li>
          <strong>Right to delete</strong> — request deletion of your personal information
          (subject to legal exceptions such as data retention).
        </li>
        <li>
          <strong>Right to correct</strong> — request correction of inaccurate personal
          information.
        </li>
        <li>
          <strong>Right to opt out</strong> — of the sale or sharing of personal information.
        </li>
        <li>
          <strong>Right to limited use</strong> — of sensitive personal information.
        </li>
        <li>
          <strong>Right to non-discrimination</strong> — for exercising your CCPA/CPRA rights.
        </li>
      </ul>

      <SectionTitle icon={Globe}>State Consumer Privacy Rights</SectionTitle>
      <p>Kynthai complies with applicable state privacy laws to the extent required:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          <strong>Virginia (VCDPA):</strong> Right to access, correct, delete, obtain a copy of,
          and opt out of targeted advertising or sale of personal data.
        </li>
        <li>
          <strong>Colorado (CDPA):</strong> Same rights as VCDPA, plus right to appeal a denied
          request.
        </li>
        <li>
          <strong>Utah (UCPA):</strong> Right to access, delete, obtain a copy of, and opt out of
          targeted advertising.
        </li>
        <li>
          <strong>Connecticut (CTDPA):</strong> Right to access, correct, delete, obtain a copy
          of, port, and opt out of targeted advertising or sale.
        </li>
      </ul>

      <SectionTitle icon={Mail}>How to Exercise Your Rights</SectionTitle>
      <p>Submit a verifiable consumer request to:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          Email:{' '}
          <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" />{' '}
          with subject "Privacy Rights Request"
        </li>
        <li>
          Include your name, account email (if applicable), state of residence, and the rights
          you wish to exercise.
        </li>
        <li>We will respond within 45 days (extendable by 45 days with notice).</li>
      </ul>

      <p className="text-xs text-muted-foreground mt-4">
        Authorized agents may submit requests on your behalf with signed proof of authorization.
        Minors under 16: opt-out requests must be submitted by a parent or legal guardian.
      </p>
    </LegalLayout>
  )
}

/* ================================================================== */
/* Terms of Service                                                    */
/* ================================================================== */
export function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The agreement between you and Kynthai."
      updated="July 13, 2026"
    >
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm">
          These Terms govern your use of Kynthai. By creating an account you agree
          to them. If you do not agree, please do not use Kynthai.
        </p>
      </div>

      <SectionTitle icon={FileText}>1. Eligibility</SectionTitle>
      <p>
        You must be at least 18 years old (or the age of majority in your
        jurisdiction) to use Kynthai. Doctors and labs must hold the relevant
        professional licences in the jurisdictions where they practise. By registering, you represent and warrant that you meet these requirements.
      </p>

      <SectionTitle icon={FileText}>2. Your account</SectionTitle>
      <ul>
        <li>You are responsible for keeping your password confidential and for all activity under your account.</li>
        <li>You must provide accurate, current information at registration and update it if it changes.</li>
        <li>You may not share your account credentials with others or allow others to access your account.</li>
        <li>You may hold one account per portal unless authorised in writing by Kynthai.</li>
        <li>You agree to notify us immediately of any unauthorised use or security breach involving your account.</li>
        <li>We may suspend or close accounts that are inactive for more than 24 months.</li>
      </ul>

      <SectionTitle icon={ShieldCheck}>3. Health disclaimer &amp; no medical advice</SectionTitle>
      <p>
        Kynthai&apos;s AI features (chat, symptom analyzer, medicine identifier,
        interaction checker, insights, prescription scanner, voice conversation)
        provide <strong>general information only</strong> and do{' '}
        <strong>not</strong> constitute medical advice, diagnosis, treatment, or
        a substitute for professional healthcare. Always consult a qualified
        healthcare professional before making decisions about your health,
        medications, or treatment. Do not disregard or delay seeking professional
        medical advice because of something you read or received from Kynthai.
      </p>
      <p>
        In a medical emergency, call 911 (United States) immediately. Do not rely on Kynthai
        for emergency response.
      </p>


      <SectionTitle icon={Crown}>4. Subscription & billing</SectionTitle>
      <p>Kynthai offers the following subscription tiers:</p>
      <ul>
        <li><strong>Free:</strong> Limited AI features (3 AI chats/day), basic medication tracking, family profiles for 1 member.</li>
        <li><strong>Plus:</strong> $9.99/month or $99.99/year — unlimited AI consultations, drug interactions, weekly health insights, up to 4 family members.</li>
        <li><strong>Family Pro:</strong> $19.99/month or $199.99/year — Includes all Plus features, plus caretaker dashboard, shared lab reports, family health journal, priority support.</li>
      </ul>
      <p>All prices shown are the full charge — no hidden fees or surprise charges.
        State sales tax, if applicable, will be itemized at checkout per your state.
        All payments are processed securely by Stripe. Cancel anytime from your account settings
        or by contacting <ContactEmailText address="hello@kynthai.app" />. Your subscription remains active until the end of your
        billing period; no further charges apply after cancellation.</p>

      <SectionTitle icon={Stethoscope}>5. Platform role & independent doctors</SectionTitle>
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-sm">
          <strong>Important:</strong> Kynthai is a <strong>technology connector
          only</strong>. It is <strong>not</strong> a healthcare provider, medical
          practice, hospital, clinic, or any form of healthcare organisation.
          Kynthai does not employ, supervise, or control the medical
          decision-making of any doctor or healthcare professional using the
          platform. Kynthai&apos;s role is limited to providing technology
          infrastructure (scheduling, messaging, payment processing, video
          connectivity) that facilitates your connection with independent
          doctors. Under the <strong>Federal Trade Commission Act</strong> and
          applicable US consumer protection laws, Kynthai
          provides only technology/connectivity services — not healthcare services.
          Any claim that Kynthai owes a duty of care in the nature of a healthcare
          provider is expressly denied.
        </p>
      </div>
      <p>
        All doctors, healthcare professionals, and labs available through Kynthai
        are <strong>independent practitioners</strong>. When you consult a doctor
        through Kynthai, you are entering into a direct doctor-patient
        relationship with that independent professional — <strong>not</strong>
        with Kynthai Health Technologies. By using Kynthai, you acknowledge and
        agree that:
      </p>
      <ul>
        <li>Any consultation, diagnosis, treatment plan, prescription, or medical
        advice you receive comes solely from the independent doctor, not from
        Kynthai.</li>
        <li>Kynthai does not verify, endorse, or guarantee the quality, accuracy,
        or appropriateness of any medical services provided by doctors on the
        platform.</li>
        <li>You are responsible for independently verifying the qualifications,
        licensing, and credentials of any doctor you consult through Kynthai.</li>
        <li>Kynthai&apos;s role is limited to providing the technology
        infrastructure that facilitates your connection with independent doctors.</li>
        <li><strong>Under no circumstances is Kynthai liable</strong> for any
        medical negligence, misdiagnosis, incorrect treatment, false
        consultation, malpractice, or any act or omission by a doctor or
        healthcare professional using the platform.</li>
      </ul>

      <SectionTitle icon={ShieldAlert}>6. Doctor liability & indemnity insurance</SectionTitle>
      <p>
        <strong>Sole responsibility of doctors.</strong> Kynthai is{' '}
        <strong>not liable</strong> for any medical negligence, misdiagnosis,
        incorrect treatment, false consultation, malpractice, or any act or
        omission by a doctor or healthcare professional using the platform. Each
        doctor is <strong>solely and independently responsible</strong> for the
        medical services they provide, including:
      </p>
      <ul>
        <li>The accuracy of diagnoses and treatment plans.</li>
        <li>The appropriateness and safety of prescriptions issued.</li>
        <li>The quality and standard of care provided during consultations.</li>
        <li>Compliance with all applicable medical laws, regulations, and
        professional standards in their jurisdiction.</li>
        <li>Any harm, injury, or damage resulting from false, negligent, or
        incompetent medical advice or treatment.</li>
      </ul>
      <p>
        <strong>Professional indemnity insurance required.</strong> All doctors
        and healthcare professionals using Kynthai <strong>must</strong> maintain
        their own professional indemnity (malpractice) insurance covering the
        full scope of services they provide through the platform. By registering
        as a doctor on Kynthai, you represent and warrant that you hold valid
        professional indemnity insurance and will maintain it throughout your use
        of the platform. Kynthai reserves the right to request proof of insurance
        at any time and to suspend or remove any doctor who fails to provide
        evidence of valid coverage.
      </p>
      <p>
        <strong>No vicarious liability.</strong> To the maximum extent permitted
        by applicable law, Kynthai shall not be held vicariously liable for the
        acts, omissions, negligence, or malpractice of any doctor, healthcare
        professional, or lab using the platform. Any claim arising from medical
        services must be directed to the treating doctor or their insurer.
        Kynthai shall not be named as a party to any dispute between a patient
        and a doctor, and Kynthai will not indemnify or compensate any party for
        damages arising from a doctor&apos;s medical practice.
      </p>
      <p>
        <strong>Mandatory patient acknowledgment required.</strong> Before any
        consultation booking is confirmed, every patient must explicitly
        acknowledge and agree through Kynthai&apos;s mandatory liability
        acknowledgment screen that (a) Kynthai is a technology platform only and
        not a healthcare provider, (b) the doctor is an independent practitioner
        solely responsible for their own medical advice and treatment, and
        (c) Kynthai is not liable for any medical negligence, misdiagnosis, or
        incorrect treatment by the doctor. No booking is processed without this
        explicit patient consent.
      </p>

      <SectionTitle icon={UserX}>7. Doctor removal on complaint</SectionTitle>
      <p>
        Kynthai reserves the right to <strong>immediately suspend or permanently
        remove</strong> any doctor or healthcare professional from the platform,
        without prior notice, upon receiving a credible complaint regarding:
      </p>
      <ul>
        <li>Medical negligence, malpractice, or provision of false consultation.</li>
        <li>Practising without a valid licence or with an expired/suspended
        licence.</li>
        <li>Fraud, misrepresentation of qualifications, or impersonation.</li>
        <li>Violation of patient privacy or confidentiality.</li>
        <li>Prescribing controlled substances without proper authorisation.</li>
        <li>Any conduct that poses a risk to patient safety or violates
        applicable law.</li>
      </ul>
      <p>
        Kynthai will investigate complaints promptly and may cooperate with
        medical regulatory authorities as required. Removal from the platform
        does not absolve a doctor of liability for their medical practice —
        patients retain the right to pursue claims directly against the
        treating doctor.
      </p>

      <SectionTitle icon={FileText}>8. Acceptable use</SectionTitle>
      <p>You agree not to:</p>
      <ul>
        <li>Use Kynthai for any unlawful purpose or in violation of these Terms.</li>
        <li>Upload content that infringes the intellectual property, privacy, or other rights of others.</li>
        <li>Attempt to access data, accounts, or systems you are not authorised to access (IDOR, SQL injection, XSS, CSRF, or other attacks).</li>
        <li>Reverse-engineer, decompile, disassemble, or otherwise attempt to derive the source code of the platform.</li>
        <li>Use bots, scrapers, crawlers, or automated tools to extract data, overwhelm the service, or bypass rate limits.</li>
        <li>Submit false, misleading, or harmful information to AI features.</li>
        <li>Share content that is harmful, abusive, defamatory, obscene, or otherwise objectionable.</li>
      </ul>


      <SectionTitle icon={FileText}>9. Commissions &amp; payouts for professionals</SectionTitle>
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <p className="text-sm">
          <strong>Fee-splitting disclosure:</strong> The platform fee charged
          to doctors (15%) and labs (18%) is a service charge for technology
          infrastructure, scheduling, payment processing, and platform operations.
          It does not constitute a referral fee, commission, or division of
          professional fees between you and Kynthai. It does not constitute
          fee-sharing under applicable professional medical board regulations
          governing practitioners in their jurisdiction.
        </p>
      </div>
      <p>
        Doctors pay a 15% platform fee on every consultation and medicine order
        routed through Kynthai (you keep 85%). Labs pay an 18% platform fee on
        every test booking fulfilled through the platform (you keep 82%).
        Platform fees are calculated on the pre-tax amount and deducted before
        payout. Loyalty tiers (Bronze → Platinum) reduce the fee by up to 3%.
      </p>
      <p>
        Payouts are made on a Net-15 schedule (15 days after month-end) subject
        to a minimum payout threshold of $50 USD. Payouts are made via ACH, Wire, or direct deposit to your registered account. Withholding tax is
        deducted per applicable country tax law. Tax invoices are provided for reporting purposes. You are
        responsible for reporting and paying your own taxes on earnings.
      </p>

      <SectionTitle icon={AlertTriangle}>9a. Refund &amp; cancellation policy</SectionTitle>
      <p>
        <strong>Subscriptions.</strong> You may cancel your subscription at any
        time from your account settings or by contacting
        <ContactEmailText address="hello@kynthai.app" />. Cancellation takes effect at the end of the current
        billing period; you will retain access until that date. No partial-period
        refunds are issued for unused days in the cancelled period.
      </p>
      <p>
        <strong>Refund eligibility.</strong> A full refund may be requested
        within 14 calendar days of an accidental double-charge or an unauthorised
        transaction. To request a refund, email
        <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />{' '}
        with your receipt number, the charged amount, and a brief description of
        the issue. Refunds are processed within 10 business days to the original
        payment method.
      </p>
      <p>
        <strong>Non-refundable charges.</strong> Platform fees deducted from
        partner payouts are non-refundable once a consultation or order has been
        fulfilled. In-app purchases, if any, are final and non-refundable unless
        required by applicable law.
      </p>
      <p>
        <strong>Cancellation for professional accounts.</strong> Doctors and
        labs may deactivate their professional account at any time. Outstanding
        payouts prior to deactivation will be settled per the Net-15 schedule.
        No cancellation fee applies.
      </p>

      <SectionTitle icon={FileText}>10. Intellectual property</SectionTitle>
      <p>
        <strong>Trademarks.</strong> &quot;Kynthai&quot; and the Kynthai logo are
        trademarks of Kynthai Health Technologies (trademark registration pending).
        The ™ symbol denotes a claimed trademark; it does not imply registration.
        All other trademarks, service marks, trade names, product names, and
        logos appearing in the service are the property of their respective
        owners. Use of these marks does not imply endorsement, sponsorship, or
        affiliation.
      </p>
      <p>
        <strong>Software &amp; content.</strong> Kynthai and all its software,
        design, branding, and original content are the intellectual property of
        Kynthai Health Technologies. The software is built on open-source
        components (Next.js, React, Prisma, shadcn/ui, Tailwind CSS, lucide-react)
        licensed under their respective MIT/Apache/ISC licenses. We acknowledge
        and comply with all open-source license terms.
      </p>
      <p>
        <strong>Your data.</strong> You retain all rights to the data you submit.
        By submitting content (e.g. uploaded prescription images, chat messages)
        you grant Kynthai a worldwide, non-exclusive, royalty-free licence to
        process that content solely to provide and improve the service. You
        represent and warrant that you have the right to submit all content and
        that it does not infringe the intellectual property rights of any third
        party.
      </p>

      <SectionTitle icon={FileText}>11. Privacy</SectionTitle>
      <p>
        Your use of Kynthai is also governed by our Privacy Policy, which
        describes how we collect, use, and protect your data under applicable
        US federal and state privacy laws. The Privacy Policy
        is incorporated into these Terms by reference.
      </p>

      <SectionTitle icon={AlertTriangle}>12. Disclaimers</SectionTitle>
      <p>
        Kynthai is provided &quot;as is&quot; and &quot;as available&quot; without
        warranties of any kind. To the maximum extent permitted by law, we
        disclaim all warranties, express or implied, including merchantability,
        fitness for a particular purpose, title, and non-infringement. We do not
        warrant that the service will be uninterrupted, error-free, secure, or
        that AI-generated results are accurate or complete. You use Kynthai at
        your own risk.
      </p>

      <SectionTitle icon={AlertTriangle}>13. Limitation of liability</SectionTitle>
      <p>
        To the maximum extent permitted by law, Kynthai shall not be liable
        for any direct, indirect, incidental, special, consequential, or
        punitive damages arising from your use of any health feature,
        including reliance on AI-generated content or advice from doctors
        found through the platform.
      </p>

      <SectionTitle icon={FileText}>14. Indemnification</SectionTitle>
      <p>
        You agree to indemnify and hold harmless Kynthai from any claims,
        damages, losses, and expenses (including reasonable legal fees)
        arising from your use of the platform, your violation of these Terms,
        or your violation of any rights of another party.
      </p>


      <SectionTitle icon={FileText}>15. Infringement notices</SectionTitle>
      <p>
        If you believe content on Kynthai infringes your copyright, send a
        takedown notice to <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />{' '}
        with the item URL, your original work URL, and contact information. We
        will respond to valid takedown requests within 72 hours, in accordance
        with the Digital Millennium Copyright Act (DMCA) 17 U.S.C. §512 and the
        Copyright Act, 1957.
      </p>

      <SectionTitle icon={Globe}>16. Dispute resolution & arbitration (US)</SectionTitle>
      <p>
        <strong>Governing law:</strong> These Terms are governed by and construed
        in accordance with the laws of the State of Wyoming, United States. The courts of competent jurisdiction in Wyoming, US,
        have exclusive jurisdiction over any dispute not subject to arbitration.
      </p>
      <p>
        <strong>Arbitration.</strong> If the dispute is not resolved informally,
        you and Kynthai agree to resolve any claim or controversy (except for
        claims seeking injunctive or equitable relief) through final and binding
        arbitration in accordance with the Federal Arbitration Act, 9 U.S.C. § 1
        et seq. The arbitration shall be conducted in English, with the seat of
        arbitration in <strong>Cheyenne, Wyoming, United States</strong>. The arbitral
        tribunal shall consist of one arbitrator mutually agreed by the parties,
        or appointed by the relevant arbitral institution in accordance with its
        rules. The award shall be final and binding, and judgment may be entered
        in any court of competent jurisdiction in the United States.
      </p>
      <p>
        <strong>Class action waiver.</strong> You and Kynthai agree that each
        party may bring claims against the other only on an individual basis, and
        not as a plaintiff or class member in any purported class, consolidated,
        or representative action. The arbitration of any claim or dispute shall
        be conducted on an individual basis only, and not on a class, collective,
        or representative basis. This clause is enforceable under US federal law and the laws of the State of Wyoming.
      </p>
      <p>
        <strong>Limitation period.</strong> You and Kynthai agree that any claim
        arising out of or related to these Terms or the service must be filed
        within two (2) years after the claim arose, or it is permanently barred.
      </p>

      <SectionTitle icon={Globe}>17. Governing law &amp; jurisdiction</SectionTitle>
      <p>
        These Terms are governed by and construed in accordance with the laws of
        the State of Wyoming, United States. The courts of competent jurisdiction in Wyoming, US,
        have exclusive jurisdiction over any dispute arising out of or in connection with these
        Terms or your use of Kynthai, subject to the arbitration clause above.
      </p>

      <SectionTitle icon={FileText}>18. Force majeure</SectionTitle>
      <p>
        Kynthai shall not be liable for any failure or delay in performance caused
        by circumstances beyond its reasonable control, including but not limited
        to acts of God, natural disasters, war, terrorism, civil unrest,
        pandemics, government actions, labour disputes, power outages, internet
        or telecommunications failures, or failures of third-party service
        providers (including cloud hosting, AI APIs, and payment processors).
      </p>

      <SectionTitle icon={FileText}>19. Severability</SectionTitle>
      <p>
        If any provision of these Terms is held by a court or arbitrator to be
        invalid, illegal, or unenforceable, that provision shall be modified to
        the minimum extent necessary to make it enforceable, or if modification
        is not possible, severed from these Terms. The remaining provisions
        shall remain in full force and effect.
      </p>

      <SectionTitle icon={FileText}>20. Assignment &amp; entire agreement</SectionTitle>
      <p>
        <strong>Assignment.</strong> You may not assign or transfer these Terms
        or your account without Kynthai&apos;s prior written consent. Kynthai may
        assign these Terms freely in connection with a merger, acquisition, or
        sale of all or substantially all of its assets. Any attempted assignment
        in violation of this clause is void.
      </p>
      <p>
        <strong>Entire agreement.</strong> These Terms, together with the
        Privacy Policy and any other policies referenced herein, constitute the
        entire agreement between you and Kynthai regarding the service, and
        supersede all prior or contemporaneous agreements, communications, and
        understandings, whether oral or written.
      </p>

      <SectionTitle icon={FileText}>21. Export controls</SectionTitle>
      <p>
        You agree not to use, export, re-export, or transfer Kynthai in violation
        of any applicable export control laws, including applicable US export-control regulations and sanctions administered by
        the US Department of Commerce and the US Department of the Treasury. Kynthai is not available in
        jurisdictions sanctioned by the United Nations or the US Government.
      </p>

      <SectionTitle icon={FileText}>22. Changes to these Terms</SectionTitle>
      <p>
        We may update these Terms from time to time. We will notify you of
        material changes via email and in-app at least 30 days before they take
        effect. Continued use after the effective date constitutes acceptance.
        If you do not agree to the updated Terms, you may cancel your
        subscription and delete your account before the effective date.
      </p>

      <SectionTitle icon={Mail}>23. Contact</SectionTitle>
      <p>
        <strong>Kynthai Health Technologies</strong><br />
        Email only (no public street address yet). Write to <ContactEmailText address="privacy@kynthai.app" /> for legal/privacy correspondence.<br />
        Email:{' '}
        <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />
        <br />
        Support:{' '}
        <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />
        <br />
        Grievance Officer:{' '}
        <ContactEmail address="privacy@kynthai.app" className="text-emerald-600 underline" />
        <br />
        <br />
        Postal address: United States (handled via email: <ContactEmailText address="privacy@kynthai.app" />)<br />
      </p>
    </LegalLayout>
  )
}

/* ================================================================== */
/* Cookie Policy                                                       */
/* ================================================================== */
export function CookiePolicy() {
  return (
    <LegalLayout
      title="Cookie Policy"
      subtitle="How the Kynthai platform uses cookies and local storage."
      updated="July 13, 2026"
    >
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm">
          This Cookie Policy explains how the Kynthai platform uses cookies and similar
          technologies (local storage, service workers, notification permissions)
          in compliance with applicable US and state data-protection regulations and healthcare law.
          For health data, US privacy and security standards apply.
        </p>
      </div>

      <SectionTitle icon={FileText}>1. What are cookies?</SectionTitle>
      <p>
        Cookies are small text files stored on your device when you visit a
        website. They are widely used to make websites work efficiently and
        provide information to site owners. The Kynthai platform uses cookies and local
        storage for authentication and remembering your preferences.
      </p>

      <SectionTitle icon={FileText}>2. Types of cookies we use</SectionTitle>
      <ul>
        <li>
          <strong>Essential cookies (strictly necessary):</strong> A single
          HttpOnly session cookie for authentication. Without this cookie, you
          cannot log in or use  Kynthai . These do not require consent under
          applicable US and state data protection regulations.
        </li>
        <li>
          <strong>Local storage (strictly necessary):</strong> We use
          browser local storage to remember your theme preference (light/dark),
          onboarding completion, selected currency, and demo-mode flag. This
          data stays on your device and is never transmitted to our servers.
        </li>
        <li>
          <strong>Service worker:</strong> A service worker is installed for
          offline caching, push notifications, and PWA functionality. You can
          uninstall it from your browser settings.
        </li>
        <li>
          <strong>Notification permission (US):</strong> We request browser
          notification permission to deliver medication reminders, appointment
          alerts, and SOS notifications. This permission is opt-in and can be
          revoked at any time via your browser settings. We do not use
          notifications for marketing without explicit opt-in consent.
        </li>
        <li>
          <strong>Optional local storage consent:</strong> Where applicable, we obtain
          affirmative consent before storing non-essential data (theme preference,
          currency choice, onboarding state) in browser local storage. You may
          clear this data at any time without affecting core functionality.
        </li>
      </ul>

      <SectionTitle icon={FileText}>3. Cookies we do NOT use</SectionTitle>
      <ul>
        <li><strong>Advertising cookies:</strong> We do not use third-party advertising cookies (Google Ads, Facebook Pixel, etc.).</li>
        <li><strong>Tracking cookies:</strong> We do not use cross-site tracking cookies.</li>
        <li><strong>Analytics cookies:</strong> We do not use third-party analytics cookies (Google Analytics, Mixpanel, etc.) without your explicit consent.</li>
        <li><strong>Social media cookies:</strong> We do not embed social media widgets that set cookies.</li>
      </ul>

      <SectionTitle icon={FileText}>4. Consent</SectionTitle>
      <p>
        On your first visit, the Kynthai platform shows a cookie consent banner. You may
        choose &quot;Accept all&quot; (allowing all cookies including any future
        non-essential cookies) or &quot;Essential only&quot; (only strictly
        necessary cookies). Your choice is stored in local storage for 12 months,
        after which you will be asked again. You can withdraw consent at any time
        by clearing your browser cookies and local storage.
      </p>
    </LegalLayout>
  )
}


/* ================================================================== */
/* Accessibility Statement                                            */
/* ================================================================== */
export function AccessibilityStatement() {
  return (
    <LegalLayout
      title="Accessibility Statement"
      subtitle="Kynthai&apos;s commitment to digital accessibility."
      updated="July 13, 2026"
    >
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm">
          Kynthai is committed to making our platform accessible to all users,
          including people with disabilities. We are actively working toward
          accessibility best practices and continuously improving the
          accessibility of our application.
        </p>
      </div>

      <SectionTitle icon={FileText}>1. Conformance target</SectionTitle>
      <p>
        We aim to follow the Web Content Accessibility Guidelines (WCAG)
        2.1 at Level AA. These guidelines explain how to make web content more
        accessible for people with disabilities and user agents.
      </p>

      <SectionTitle icon={FileText}>2. Current status</SectionTitle>
      <p>
        Kynthai is working toward WCAG 2.1 Level AA. Some content may
        not yet fully conform due to third-party components or legacy features
        under active remediation. We commit to remediating known accessibility
        issues within 45 days of identification; critical issues (screen-reader
        blocking, keyboard navigation failures) are prioritised for remediation
        within 30 days.
      </p>

      <SectionTitle icon={FileText}>3. Accessibility features</SectionTitle>
      <ul>
        <li><strong>Screen reader support:</strong> Semantic HTML, ARIA labels, and alt text for meaningful images.</li>
        <li><strong>Keyboard navigation:</strong> All interactive elements are keyboard-focusable with visible focus indicators.</li>
        <li><strong>Color contrast:</strong> We target WCAG 2.1 AA contrast ratios for text and interactive elements where practical.</li>
        <li><strong>Resizable text:</strong> Content is legible at 200% zoom without loss of content or functionality.</li>
        <li><strong>Forms:</strong> Form fields have accessible labels, error messages, and instructions.</li>
      </ul>

      <SectionTitle icon={FileText}>4. Limitations</SectionTitle>
      <p>
        Some third-party embedded content (e.g. AI chat models, payment iframes)
        may not be fully accessible. We work with our vendors to improve
        accessibility of embedded components and provide alternative access
        methods where possible.
      </p>

      <SectionTitle icon={FileText}>5. Legal framework</SectionTitle>
      <ul>
        <li><strong>United States:</strong> Americans with Disabilities Act (ADA) Title III, Section 508 of the Rehabilitation Act</li>
        <li><strong>EU:</strong> RPwD Act 2016 (Directive 2019/882) — effective June 2025</li>
        <li><strong>UK:</strong> Equality Act 2010</li>
        <li><strong>Reference:</strong> WCAG 2.1 (W3C) — ongoing effort, not a certified audit claim</li>
      </ul>

      <SectionTitle icon={FileText}>6. Assessment methodology</SectionTitle>
      <p>
        The Kynthai platform is evaluated using:
      </p>
      <ul>
        <li>Automated accessibility scanners (axe-core, Lighthouse).</li>
        <li>Manual testing with screen readers (NVDA, VoiceOver).</li>
        <li>Keyboard-only navigation testing.</li>
        <li>User testing with people with disabilities where feasible.</li>
      </ul>

      <SectionTitle icon={Bell}>7. Feedback &amp; contact</SectionTitle>
      <p>
        We welcome your feedback on the accessibility of Kynthai. Please contact
        us at <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />.
        We aim to respond to accessibility feedback within 5 business days and
        remediate critical issues within 30 days.
      </p>
    </LegalLayout>
  )
}

/* ================================================================== */
/* Medical Disclaimer                                                  */
/* ================================================================== */
export function MedicalDisclaimer() {
  return (
    <LegalLayout
      title="Medical Disclaimer"
      subtitle="Important information about the Kynthai health features."
      updated="July 13, 2026"
    >
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-sm">
          <strong>Please read this disclaimer carefully before using any
          health-related feature of Kynthai.</strong>
        </p>
      </div>

      <SectionTitle icon={AlertTriangle}>1. Not a substitute for professional medical advice</SectionTitle>
      <p>
        Kynthai is a health-management platform that provides tools for tracking
        medications, scheduling consultations, managing lab results, and
        accessing AI-powered health information. Kynthai does <strong>not</strong>
        provide medical advice, diagnosis, or treatment. All AI-generated
        content is informational only and should not replace consultation with
        a qualified healthcare professional.
      </p>

      <SectionTitle icon={AlertTriangle}>2. AI outputs are advisory only</SectionTitle>
      <p>
        AI features (chat, symptom analyzer, medicine identifier, drug
        interaction checker, prescription scanner) provide general
        information only. They are not substitutes for professional medical
        advice, diagnosis, or treatment. Always consult a qualified healthcare
        professional before making any decisions about your health, medications,
        or treatment. Do not disregard or delay seeking professional medical
        advice because of something you read or received from Kynthai.
      </p>

      <SectionTitle icon={AlertTriangle}>3. No doctor-patient relationship with Kynthai</SectionTitle>
      <p>
        Kynthai is a technology platform only. It is not a healthcare provider.
        Any advice, diagnosis, or treatment you receive through a doctor
        consultation on Kynthai comes from that independent doctor, not from
        Kynthai. Kynthai is not responsible for the quality, accuracy, or safety
        of any medical services provided by doctors on the platform.
      </p>

      <SectionTitle icon={AlertTriangle}>4. Emergency numbers</SectionTitle>
      <p>
        In a medical emergency, call <strong>911 (United States)</strong> immediately.
        Do not rely on Kynthai for emergency response.
      </p>
      <ul>
        <li><strong>US:</strong> 911 (emergency)</li>
        <li><strong>EU/UK:</strong> 112</li>
      </ul>
      <p>
        Kynthai&apos;s Emergency SOS feature notifies your contacts and doctors,
        but it is <strong>not</strong> a substitute for emergency medical services.
      </p>

      <SectionTitle icon={Users}>5. Doctor consultations are independent</SectionTitle>
      <p>
        When you consult a doctor through Kynthai, you enter into a direct
        doctor-patient relationship with that <strong>independent practitioner</strong>.
        Kynthai is not responsible for:
      </p>
      <ul>
        <li>Any medical advice, diagnosis, or treatment provided by the doctor.</li>
        <li>The accuracy or completeness of any prescription, test order, or medical recommendation.</li>
        <li>Any harm, injury, or damage resulting from the doctor&apos;s advice or treatment.</li>
      </ul>

      <SectionTitle icon={ShieldAlert}>6. Governing law </SectionTitle>
      <p>
        This disclaimer is governed by <strong>US federal law and the laws of the State of Wyoming, United States</strong>. Any
        dispute arising from your use of Kynthai&apos;s health features shall
        be subject to the exclusive jurisdiction of courts in the State of
        <strong>Wyoming, United States</strong>, and the Terms of
        Service dispute resolution clause applies.
      </p>

      <SectionTitle icon={Mail}>7. Questions</SectionTitle>
      <p>
        If you have questions about this disclaimer, contact us at{' '}
        <ContactEmail address="hello@kynthai.app" className="text-emerald-600 underline" />.
      </p>
    </LegalLayout>
  )
}
