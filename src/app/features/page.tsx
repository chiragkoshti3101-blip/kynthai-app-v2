import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Features — Kynthai',
  description:
    'Medication reminders, family care, doctor consults, lab bookings, and clinical notifications in one health app.',
  alternates: { canonical: 'https://kynthai.app/features' },
}

const FEATURES = [
  {
    title: 'Medication reminders',
    body: 'Schedule doses, full-screen Taken/Skip when the app is open, and system alerts when enabled on the device.',
  },
  {
    title: 'Family & caretakers',
    body: 'Manage family members and escalate missed doses so caretakers stay in the loop.',
  },
  {
    title: 'Doctor portal',
    body: 'Consult requests with accept/decline style notifications and patient updates.',
  },
  {
    title: 'Lab portal',
    body: 'Bookings and status updates for diagnostic partners and patients.',
  },
  {
    title: 'Android app',
    body: 'Install from kynthai.app/download for stronger closed-app notification support.',
  },
]

export default function FeaturesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-slate-800">
      <p className="text-sm font-medium text-emerald-600">
        <Link href="/">Kynthai</Link> · Features
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Features</h1>
      <p className="mt-4 text-lg text-slate-600">
        Built for patients, families, doctors, and labs — without clutter.
      </p>
      <div className="mt-10 space-y-6">
        {FEATURES.map((f) => (
          <section key={f.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{f.title}</h2>
            <p className="mt-2 text-slate-600">{f.body}</p>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Get started
        </Link>
        <Link href="/pricing" className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-600">
          Pricing
        </Link>
      </div>
    </main>
  )
}
