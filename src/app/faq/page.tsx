import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'FAQ — Kynthai',
  description: 'Common questions about Kynthai medication reminders, notifications, Android app, and accounts.',
  alternates: { canonical: 'https://kynthai.app/faq' },
}

const FAQS = [
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

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-slate-800">
      <p className="text-sm font-medium text-emerald-600">
        <Link href="/">Kynthai</Link> · FAQ
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Frequently asked questions</h1>
      <div className="mt-10 space-y-6">
        {FAQS.map((f) => (
          <section key={f.q} className="border-b border-slate-200 pb-6">
            <h2 className="text-base font-semibold text-slate-900">{f.q}</h2>
            <p className="mt-2 text-slate-600">{f.a}</p>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-slate-500">
        More help: <Link className="text-emerald-700 underline" href="/contact">Contact</Link> ·{' '}
        <Link className="text-emerald-700 underline" href="/privacy">Privacy</Link> ·{' '}
        <Link className="text-emerald-700 underline" href="/terms">Terms</Link>
      </p>
    </main>
  )
}
