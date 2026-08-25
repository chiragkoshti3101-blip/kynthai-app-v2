import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Contact — Kynthai',
  description: 'Contact Kynthai support and privacy team.',
  alternates: { canonical: 'https://kynthai.app/contact' },
}

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-slate-800">
      <p className="text-sm font-medium text-emerald-600">
        <Link href="/">Kynthai</Link> · Contact
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Contact</h1>
      <p className="mt-4 text-lg text-slate-600">
        We read every message. For product support and privacy requests, use the addresses below.
      </p>
      <ul className="mt-8 space-y-4 text-slate-800">
        <li>
          <span className="font-semibold">Support</span>
          <br />
          <a className="text-emerald-700 underline" href="mailto:support@kynthai.app">
            support@kynthai.app
          </a>
        </li>
        <li>
          <span className="font-semibold">Privacy</span>
          <br />
          <a className="text-emerald-700 underline" href="mailto:privacy@kynthai.app">
            privacy@kynthai.app
          </a>
        </li>
      </ul>
      <p className="mt-8 text-sm text-slate-500">
        Kynthai is not an emergency service. If you are in danger, contact local emergency services
        immediately.
      </p>
      <div className="mt-10">
        <Link href="/login" className="text-sm font-semibold text-emerald-700 hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </main>
  )
}
