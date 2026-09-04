import Link from 'next/link'
import { HOME_FAQS } from '@/components/kynthai/faq-data'
import { HeroCarePreview } from '@/components/kynthai/hero-care-preview'
import { StructuredData } from '@/components/structured-data'

// Keep the public landing route fresh without making every request dynamic.
// Authenticated portals and all health-data APIs remain uncached elsewhere.
export const revalidate = 60

/**
   * Root page server fallback.
   *
   * The interactive landing experience is mounted by PortalClient after the
   * client store hydrates. This lightweight, complete fallback is rendered first
   * so crawlers and users with JavaScript disabled still receive meaningful
   * product copy, a care overview, and the FAQ answers.
   */
export default function RootPage() {
    return (
          <>
                <StructuredData includeSiteIdentity={false} pathname="/" faqEntries={HOME_FAQS} />
                <LandingSeoFallback />
          </>>
        )
}

function LandingSeoFallback() {
    return (
          <main id="main-content" className="min-h-screen bg-background text-foreground">
                <section aria-labelledby="landing-title" className="relative overflow-hidden">
                        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
                                  <div>
                                              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                                            Kynthai health companion
                                              </p>p>
                                              <h1 id="landing-title" className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                                                            Your family&apos;s health, connected.
                                              </h1>h1>
                                              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                                                            Smart medication reminders, doctor consultations, and lab tests — all in one place.
                                                            Built for families everywhere with privacy-first safeguards.
                                              </p>p>
                                              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                                            Kynthai is a health management tool, not a doctor, hospital, or emergency service.
                                                            It does not diagnose or replace professional medical care.
                                              </p>p>
                                              <div className="mt-7 flex flex-wrap gap-3">
                                                            <Link
                                                                              href="/register"
                                                                              className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                                                                            >
                                                                            Get started free
                                                            </Link>Link>
                                                            <Link
                                                                              href="/faq"
                                                                              className="rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-muted"
                                                                            >
                                                                            Read common questions
                                                            </Link>Link>
                                              </div>div>
                                  </div>div>
                        
                                  <div className="flex items-center justify-center">
                                              <HeroCarePreview />
                                  </div>div>
                        </div>div>
                </section>section>
          
                <section aria-labelledby="home-faq-title" className="border-y border-border/60 bg-muted/30">
                        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
                                  <h2 id="home-faq-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
                                              Frequently asked questions
                                  </h2>h2>
                                  <div className="mt-8 rounded-2xl border border-border bg-background p-2 sm:p-4">
                                    {HOME_FAQS.map((entry) => (
                          <details key={entry.q} className="group border-b last:border-b-0">
                                          <summary className="cursor-pointer list-none px-3 py-4 text-base font-semibold outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                                            {entry.q}
                                          </summary>summary>
                                          <p className="px-3 pb-4 text-sm leading-relaxed text-muted-foreground">
                                            {entry.a}
                                          </p>p>
                          </details>details>
                        ))}
                                  </div>div>
                        </div>div>
                </section>section>
          </main>main>
        )
}
</>
