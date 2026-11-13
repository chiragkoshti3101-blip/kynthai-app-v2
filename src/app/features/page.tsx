import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MarketingCtaLink,
  MarketingEyebrow,
  MarketingLead,
  MarketingPage,
  MarketingTextLink,
  MarketingTitle,
} from '@/components/kynthai/marketing-ui'

export const metadata: Metadata = {
  title: 'Features',
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
    <MarketingPage>
      <MarketingEyebrow>
        <Link href="/" className="hover:underline">
          Kynthai
        </Link>{' '}
        · Features
      </MarketingEyebrow>
      <MarketingTitle>Features</MarketingTitle>
      <MarketingLead>Built for patients, families, doctors, and labs — without clutter.</MarketingLead>
      <div className="mt-10 space-y-6">
        {FEATURES.map((f) => (
          <section key={f.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">{f.title}</h2>
            <p className="mt-2 text-muted-foreground">{f.body}</p>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <MarketingCtaLink href="/login">Get started</MarketingCtaLink>
        <MarketingTextLink href="/pricing">Pricing</MarketingTextLink>
      </div>
    </MarketingPage>
  )
}
