import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Kynthai',
  description:
    'Kynthai is a health companion for patients, families, doctors, and labs — medication reminders, care coordination, and clear clinical alerts.',
  alternates: { canonical: 'https://kynthai.app/about' },
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-slate-800">
      <p className="text-sm font-medium text-emerald-600">
        <Link href="/">Kynthai</Link> · About
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">About Kynthai</h1>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">
        Kynthai helps patients and families stay on top of medications, while doctors and labs get
        clearer requests and updates — all in one place.
      </p>
      <ul className="mt-8 list-disc space-y-2 pl-5 text-slate-700">
        <li>Medication reminders designed for real life (patient + family)</li>
        <li>Consult and lab workflows with in-app notifications</li>
        <li>Privacy-first design with clear account controls</li>
      </ul>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Sign in
        </Link>
        <Link
          href="/download"
          className="rounded-full border border-emerald-200 px-5 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
        >
          Download Android app
        </Link>
        <Link href="/pricing" className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          Pricing
        </Link>
      </div>
    </main>
  )
}
