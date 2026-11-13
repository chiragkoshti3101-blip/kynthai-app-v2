import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MarketingEyebrow,
  MarketingLead,
  MarketingPage,
  MarketingTitle,
} from '@/components/kynthai/marketing-ui'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact Kynthai support and privacy team.',
  alternates: { canonical: 'https://kynthai.app/contact' },
}

export default function ContactPage() {
  return (
    <MarketingPage>
      <MarketingEyebrow>
        <Link href="/" className="hover:underline">
          Kynthai
        </Link>{' '}
        · Contact
      </MarketingEyebrow>
      <MarketingTitle>Contact</MarketingTitle>
      <MarketingLead>
        We read every message. For product support and privacy requests, use the addresses below.
      </MarketingLead>
      <ul className="mt-8 space-y-4 text-foreground">
        <li>
          <span className="font-semibold">Support</span>
          <br />
          <a className="text-primary underline" href="mailto:support@kynthai.app">
            support@kynthai.app
          </a>
        </li>
        <li>
          <span className="font-semibold">Privacy</span>
          <br />
          <a className="text-primary underline" href="mailto:privacy@kynthai.app">
            privacy@kynthai.app
          </a>
        </li>
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">
        Kynthai is not an emergency service. If you are in danger, contact local emergency services
        immediately.
      </p>
      <div className="mt-10">
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    </MarketingPage>
  )
}
