import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MarketingCtaLink,
  MarketingEyebrow,
  MarketingLead,
  MarketingPage,
  MarketingSecondaryLink,
  MarketingTextLink,
  MarketingTitle,
} from '@/components/kynthai/marketing-ui'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Kynthai is a health companion for patients, families, doctors, and labs — medication reminders, care coordination, and clear clinical alerts.',
  alternates: { canonical: 'https://kynthai.app/about' },
}

export default function AboutPage() {
  return (
    <MarketingPage>
      <MarketingEyebrow>
        <Link href="/" className="hover:underline">
          Kynthai
        </Link>{' '}
        · About
      </MarketingEyebrow>
      <MarketingTitle>About Kynthai</MarketingTitle>
      <MarketingLead>
        Kynthai helps patients and families stay on top of medications, while doctors and labs get
        clearer requests and updates — all in one place.
      </MarketingLead>
      <ul className="mt-8 list-disc space-y-2 pl-5 text-foreground/90">
        <li>Medication reminders designed for real life (patient + family)</li>
        <li>Consult and lab workflows with in-app notifications</li>
        <li>Privacy-first design with clear account controls</li>
      </ul>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <MarketingCtaLink href="/login">Sign in</MarketingCtaLink>
        <MarketingSecondaryLink href="/download">Download Android app</MarketingSecondaryLink>
        <MarketingTextLink href="/pricing">Pricing</MarketingTextLink>
      </div>
    </MarketingPage>
  )
}
