import type { Metadata } from 'next'
import Link from 'next/link'
import { FAQ_PAGE_ENTRIES } from '@/components/kynthai/faq-data'
import { StructuredData } from '@/components/structured-data'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'FAQ — Kynthai',
  description: 'Common questions about Kynthai medication reminders, notifications, Android app, and accounts.',
  alternates: { canonical: 'https://kynthai.app/faq' },
}

export default function FaqPage() {
  return (
    <>
      <StructuredData includeSiteIdentity={false} pathname="/faq" faqEntries={FAQ_PAGE_ENTRIES} />
      <main className="mx-auto max-w-3xl px-4 py-16 text-slate-800">
        <p className="text-sm font-medium text-emerald-600">
          <Link href="/">Kynthai</Link> · FAQ
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Frequently asked questions
        </h1>
        <div className="mt-10 space-y-2">
          {FAQ_PAGE_ENTRIES.map((entry) => (
            <details key={entry.q} className="border-b border-slate-200 pb-2 group">
              <summary className="cursor-pointer list-none py-4 text-base font-semibold text-slate-900 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500 [&::-webkit-details-marker]:hidden">
                {entry.q}
              </summary>
              <p className="pb-4 text-slate-600">{entry.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-10 text-sm text-slate-500">
          More help:{' '}
          <Link className="text-emerald-700 underline" href="/contact">
            Contact
          </Link>{' '}
          ·{' '}
          <Link className="text-emerald-700 underline" href="/privacy">
            Privacy
          </Link>{' '}
          ·{' '}
          <Link className="text-emerald-700 underline" href="/terms">
            Terms
          </Link>
        </p>
      </main>
    </>
  )
}
