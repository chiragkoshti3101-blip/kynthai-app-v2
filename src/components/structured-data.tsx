import type { FaqEntry } from '@/components/kynthai/faq-data'

/**
 * StructuredData — Server Component.
 *
 * Site identity is rendered once from the root layout. Page-specific WebPage,
 * breadcrumb, and FAQ schema are supplied by the route that owns the content.
 * Keeping FAQ data route-local prevents unrelated pages from advertising FAQs
 * they do not visibly contain.
 */

const BASE_URL = 'https://kynthai.app'

const KYNTHAI_CONTACT = {
  email: 'privacy@kynthai.app',
} as const

// Only list profiles that actually exist. Empty until official social profiles
// are live; never invent or infer social URLs.
const SOCIAL_PROFILES = [] as const

const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${BASE_URL}/#website`,
  name: 'Kynthai',
  url: BASE_URL,
  inLanguage: 'en',
  publisher: { '@id': `${BASE_URL}/#organization` },
} as const

const WEBAPP_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  '@id': `${BASE_URL}/#webapp`,
  name: 'Kynthai',
  alternateName: 'Kynthai Health',
  description:
    "Your family's connected health companion for smart reminders, doctor consultations, lab tests, and family care.",
  url: BASE_URL,
  applicationCategory: 'HealthApplication',
  operatingSystem: 'iOS, Android, Web',
  softwareVersion: '2.0.0',
  offers: [
    { '@type': 'Offer', name: 'Free Plan', price: '0', priceCurrency: 'USD' },
    {
      '@type': 'Offer',
      name: 'Individual Plan',
      price: '9.99',
      priceCurrency: 'USD',
      billingIncrement: 'P1M',
    },
    {
      '@type': 'Offer',
      name: 'Family Pro Plan',
      price: '19.99',
      priceCurrency: 'USD',
      billingIncrement: 'P1M',
    },
  ],
  availableOnDemand: true,
  inLanguage: ['en'],
  author: { '@id': `${BASE_URL}/#organization` },
  publisher: { '@id': `${BASE_URL}/#organization` },
} as const

// One canonical organization entity. Kynthai is a health-management company;
// this does not claim that Kynthai itself is a hospital or licensed provider.
const ORG_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${BASE_URL}/#organization`,
  name: 'Kynthai',
  description:
    'Kynthai connects patients, families, doctors, and labs in one privacy-first care experience worldwide.',
  url: BASE_URL,
  ...KYNTHAI_CONTACT,
  foundingDate: '2025',
  ...(SOCIAL_PROFILES.length ? { sameAs: [...SOCIAL_PROFILES] } : {}),
  areaServed: { '@type': 'Place', name: 'Worldwide' },
  knowsAbout: [
    'Medication Adherence',
    'Family Health Management',
    'AI Health Assistant',
    'Telemedicine',
    'Lab Test Booking',
    'Privacy-first Healthcare',
  ],
} as const

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return ''
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return path.endsWith('/') ? path.slice(0, -1) : path
}

function breadcrumbSchema(pathname: string) {
  const normalizedPath = normalizePathname(pathname)
  const parts = normalizedPath.split('/').filter(Boolean)
  const items = parts.map((part, i) => ({
    '@type': 'ListItem' as const,
    position: i + 2,
    name: part
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
    item: `${BASE_URL}/${parts.slice(0, i + 1).join('/')}`,
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList' as const,
    '@id': `${BASE_URL}${normalizedPath || '/'}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem' as const, position: 1, name: 'Home', item: BASE_URL },
      ...items,
    ],
  }
}

function webPageSchema(pathname: string) {
  const normalizedPath = normalizePathname(pathname)
  const url = `${BASE_URL}${normalizedPath}`
  const isFaq = normalizedPath === '/faq'

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url || BASE_URL}#webpage`,
    name: isFaq ? 'Frequently asked questions — Kynthai' : "Kynthai — Your family's health, connected.",
    description: isFaq
      ? 'Common questions about Kynthai medication reminders, notifications, the Android app, and accounts.'
      : 'Smart reminders, doctor consultations, and lab tests—all in one place.',
    url: url || BASE_URL,
    inLanguage: 'en',
    isAccessibleForFree: true,
    accessibilitySummary:
      'Designed for keyboard navigation and screen readers; accessibility is an ongoing effort.',
    isPartOf: { '@id': `${BASE_URL}/#website` },
  }
}

function faqSchema(pathname: string, entries: readonly FaqEntry[]) {
  const normalizedPath = normalizePathname(pathname)
  const url = `${BASE_URL}${normalizedPath}`

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url || BASE_URL}#faqpage`,
    mainEntity: entries.map(entry => ({
      '@type': 'Question' as const,
      name: entry.q,
      acceptedAnswer: {
        '@type': 'Answer' as const,
        text: entry.a,
      },
    })),
  }
}

interface StructuredDataProps {
  /** Adds the canonical site identity when this is the root layout. */
  includeSiteIdentity?: boolean
  /** Adds route-specific WebPage and breadcrumb schema. */
  pathname?: string
  /** Include only FAQs that are actually rendered on this route. */
  faqEntries?: readonly FaqEntry[]
}

export function StructuredData({
  includeSiteIdentity = true,
  pathname,
  faqEntries,
}: StructuredDataProps) {
  const schemas: Record<string, unknown>[] = includeSiteIdentity
    ? [WEBSITE_SCHEMA, WEBAPP_SCHEMA, ORG_SCHEMA]
    : []

  if (pathname) {
    schemas.push(webPageSchema(pathname), breadcrumbSchema(pathname))
  }

  if (pathname && faqEntries?.length) {
    schemas.push(faqSchema(pathname, faqEntries))
  }

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={`${schema['@type']}-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  )
}

/**
 * Compatibility helper for callers that need the schema objects directly.
 */
export function usePageStructuredData(
  pathname: string,
  faqEntries: readonly FaqEntry[] = [],
) {
  return {
    webApp: WEBAPP_SCHEMA,
    org: ORG_SCHEMA,
    breadcrumb: breadcrumbSchema(pathname),
    webpage: webPageSchema(pathname),
    faq: faqEntries.length ? faqSchema(pathname, faqEntries) : null,
  }
}
