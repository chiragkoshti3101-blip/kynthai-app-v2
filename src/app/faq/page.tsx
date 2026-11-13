import type { Metadata } from 'next'
import Link from 'next/link'
import { FAQ_PAGE_ENTRIES } from '@/components/kynthai/faq-data'
import { StructuredData } from '@/components/structured-data'
import { MarketingEyebrow, MarketingPage, MarketingTitle } from '@/components/kynthai/marketing-ui'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Common questions about Kynthai medication reminders, notifications, Android app, and accounts.',
  alternates: { canonical: 'https://kynthai.app/faq' },
}

export default function FaqPage() {
  return (
    <>
      <StructuredData includeSiteIdentity={false} pathname="/faq" faqEntries={FAQ_PAGE_ENTRIES} />
      <MarketingPage>
        <MarketingEyebrow>
          <Link href="/" className="hover:underline">
            Kynthai
          </Link>{' '}
          · FAQ
        </MarketingEyebrow>
        <MarketingTitle>Frequently asked questions</MarketingTitle>
        <div className="mt-10 space-y-2">
          {FAQ_PAGE_ENTRIES.map((entry) => (
            <details key={entry.q} className="border-b border-border pb-2 group">
              <summary className="cursor-pointer list-none min-h-11 py-4 text-base font-semibold text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                {entry.q}
              </summary>
              <p className="pb-4 text-muted-foreground">{entry.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          More help:{' '}
          <Link className="text-primary underline" href="/contact">
            Contact
          </Link>{' '}
          ·{' '}
          <Link className="text-primary underline" href="/privacy">
            Privacy
          </Link>{' '}
          ·{' '}
          <Link className="text-primary underline" href="/terms">
            Terms
          </Link>
        </p>
      </MarketingPage>
    </>
  )
}
