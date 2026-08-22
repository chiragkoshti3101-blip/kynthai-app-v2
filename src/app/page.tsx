import { StructuredData } from '@/components/structured-data';

// Render the landing page with a short ISR TTL (60s) so the CDN serves cached
// HTML instantly (TTFB ~100ms vs ~800ms server render) while staying fresh.
//
// Why not `revalidate = 3600` (the old value)? That left a stale cache entry
// served indefinitely when background regeneration failed — the live site
// served a 2-day-old empty-shell HTML while the deployed JS was current,
// causing React hydration error #418 and "pages missing" symptoms.
//
// Why not `force-dynamic` (the current value)? It renders the static marketing
// HTML on every request (TTFB ~800ms), hurting Core Web Vitals (LCP/FCP).
//
// 60s is short enough that a failed regeneration can never leave content stale
// for long, and long enough to cut TTFB dramatically. `suppressHydrationWarning`
// on <html> handles the theme-class hydration, and the phone mockup is wrapped
// in a hydration-safe skeleton (ssr:false + identical SSR markup), so the
// hydration-error class of bug does not recur.
export const revalidate = 60;

interface RootPageProps {
  children: React.ReactNode;
}

/**
 * Root page (/) — Server Component.
 *
 * Renders:
 *  1. StructuredData (existing JSON-LD from layout.tsx)
 *  2. MedicalOrganization + MedicalWebPage JSON-LD
 *  3. Health Data Protection medical disclaimer above-the-fold (SSR-rendered, SEO-friendly)
 *
 * PortalClient wraps children in an ErrorBoundary for all routes,
 * so these Server Components render in the SSR HTML chunk first.
 */
export default function RootPage({ children }: RootPageProps) {
  const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MedicalOrganization',
        '@id': BASE + '/#organization',
        name: 'Kynthai',
        url: BASE,
        logo: BASE + '/logo.png',
        description:
          'Kynthai is an AI-powered health companion for families, offering medicine reminders, health tracking, doctor video consultations, lab test bookings, and family health management, Privacy-first.',
        // No street address published yet: the company has not registered a
        // corporate mailing address, and publishing a placeholder or inferred
        // one would be a false claim. Contact is email-only until registration.
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: 'hello@kynthai.app',
            url: BASE,
          },
          {
            '@type': 'ContactPoint',
            contactType: 'privacy',
            email: 'privacy@kynthai.app',
          },
        ],
        // sameAs omitted until official social profiles are live

        knowsAbout: [
          'Medication Adherence',
          'Family Health Management',
          'AI Health Assistant',
          'Telemedicine',
          'Lab Test Booking',
          'Privacy-first Healthcare',
        ],
        areaServed: { '@type': 'Country', name: 'United States' },
      },
      {
        '@type': 'MedicalWebPage',
        '@id': BASE + '/#webpage',
        url: BASE,
        name: "Kynthai - America's AI Health Companion for Families",
        description:
          'AI-powered medicine reminders, doctor video consultations, lab tests and family health management for American households. Free to start. Privacy-first. Documents encrypted at rest; all traffic uses TLS.',
        isPartOf: { '@id': BASE + '/#website' },
        about: { '@id': BASE + '/#organization' },
        inLanguage: 'en-US',
        accessMode: ['textual', 'visual'],
        accessibilityControl: ['fullKeyboardControl', 'highContrast'],
        specialty: 'Family Medicine, Preventive Health, Digital Health',
        audience: {
          '@type': 'Audience',
          audienceType: 'Patients, Families, Caretakers, Doctors, Labs',
          geographicArea: { '@type': 'Country', name: 'United States' },
        },
      },
    ],
  };

  return (
    <>
      <StructuredData pathname="/" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
