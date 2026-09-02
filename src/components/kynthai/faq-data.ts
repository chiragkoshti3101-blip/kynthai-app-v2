export interface FaqEntry {
  q: string
  a: string
}

/**
 * FAQ content shown on the landing page. Keep this data as the single source
 * for the visible answers, the server-rendered SEO fallback, and FAQ schema.
 */
export const HOME_FAQS: readonly FaqEntry[] = [
  {
    q: 'Is Kynthai a doctor or hospital?',
    a: 'No. Kynthai is a health management app — reminders, organization, and optional tools. It does not diagnose, treat, or replace emergency care. In an emergency contact local emergency services. See our Medical Disclaimer.',
  },
  {
    q: 'Is my health data safe?',
    a: 'We design for privacy. Traffic uses TLS. Uploaded documents and prescription images are encrypted at rest (AES-256-GCM). We do not sell your personal health data. You can request export or deletion from your account or by emailing privacy@kynthai.app.',
  },
  {
    q: 'Are you HIPAA compliant?',
    a: 'Kynthai is a consumer health app. We are not a HIPAA covered entity or business associate and do not claim HIPAA compliance. See our Privacy Policy for how we handle data under applicable US consumer privacy rules.',
  },
  {
    q: 'Is it really free to start?',
    a: 'Yes. The Free plan includes a member profile, a limited set of medications and AI chats, and smart reminders. No credit card is required to sign up. Paid plans unlock more capacity when you need them.',
  },
  {
    q: 'What do paid plans cost?',
    a: 'Listed early pricing is in USD (for example Plus about $9.99/mo and Family Pro about $19.99/mo). Prices can change with notice. Cancel from your account when billing is active.',
  },
  {
    q: 'Are doctors on the platform verified?',
    a: 'When doctor listing is available, our team reviews credentials before access. A platform badge means our review was completed — doctors remain responsible for their own licenses with state boards.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. When you have a paid subscription, cancel from your profile. You keep access through the end of the paid period where applicable.',
  },
  {
    q: 'What if my doctor is not on Kynthai?',
    a: 'You can still use reminders, AI chat (health topics), and other patient tools. Invite your clinician when they are ready to join.',
  },
]

/** FAQ content for the dedicated, fully crawlable /faq page. */
// Keep both collections here so visible copy and structured data cannot drift.
export const FAQ_PAGE_ENTRIES: readonly FaqEntry[] = [
  {
    q: 'Is Kynthai a medical device or emergency service?',
    a: 'No. Kynthai is a health organization and reminder companion. It does not replace professional medical advice or emergency services. Call local emergency numbers for emergencies.',
  },
  {
    q: 'Why do I need to allow notifications?',
    a: 'Closed-app reminders and doctor/lab alerts use system notifications. If notifications are off for Kynthai, the phone will not show banners or sound.',
  },
  {
    q: 'Android app vs website?',
    a: 'The website works in the browser. The Android APK from /download adds stronger OS-level reminder support. Install it, then allow notifications.',
  },
  {
    q: 'How do I sign in?',
    a: 'Use https://kynthai.app/login (or /sign-in, which redirects there). Demo accounts may be provided separately for testing.',
  },
  {
    q: 'iPhone support?',
    a: 'Use Safari → Add to Home Screen for the best web experience. A full App Store build with APNs is a separate release path.',
  },
]
