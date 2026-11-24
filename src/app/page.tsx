import type { Metadata } from 'next'
import { HOME_FAQS } from '@/components/kynthai/faq-data'
import { StructuredData } from '@/components/structured-data'
import { LandingRoute } from './landing-route'

// Keep the public landing route fresh without making every request dynamic.
// Authenticated portals and all health-data APIs remain uncached elsewhere.
export const metadata: Metadata = {
  title: 'Kynthai — Family Health Management, Medication Reminders & Doctor Consults',
  description:
    'Kynthai is a privacy-first family health management app: smart medication reminders, doctor consultations, lab test booking, and AI-guided health information — all in one connected experience. Free to start.',
  keywords: [
    'family health management app',
    'medication reminder app',
    'pill reminder',
    'doctor consultation',
    'lab test booking',
    'family health tracker',
    'care coordination',
    'privacy-first health app',
  ],
  alternates: {
    canonical: 'https://kynthai.app',
  },
  openGraph: {
    title: 'Kynthai — Your family\'s health, connected.',
    description:
      'Smart medication reminders, doctor consultations, and lab tests — all in one privacy-first app for families.',
    url: 'https://kynthai.app',
    siteName: 'Kynthai',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Kynthai family health app' }],
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kynthai — Your family\'s health, connected.',
    description:
      'Smart medication reminders, doctor consultations, and lab tests — all in one privacy-first app for families.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export const revalidate = 60

/**
 * Root page.
 *
 * Renders the real landing on the server: the same tree the client hydrates,
 * so there is no SEO-fallback → interactive swap after load. `LandingRoute` is
 * a client component (it needs the router and the app store), but it is still
 * server-rendered, which is what keeps the first paint stable.
 */
export default function RootPage() {
  return (
    <>
      <StructuredData includeSiteIdentity={false} pathname="/" faqEntries={HOME_FAQS} />
      <LandingRoute />
    </>
  )
}
