'use client'

import { Badge } from '@/components/ui/badge'
import type { LoginPortal } from '@/lib/store'
import { LandingNav } from './landing-nav'
import { LandingFooter } from './landing-footer'
import { LandingFinalCTA } from './landing-final-cta'
import { EarlyAdopterBanner } from './early-adopter-banner'
import { EarlyAdopterCard } from './early-adopter-card'
import { HeroSection } from './hero-section'
import { ProofStrip } from './sections/proof-strip'
import { TrustStats } from './sections/trust-stats'
import { FeatureStrip } from './sections/feature-strip'
import { BentoFeatures } from './sections/bento-features'
import { HowItWorks } from './sections/how-it-works'
import { ValueStatements } from './sections/value-statements'
import { FounderStory } from './sections/founder-story'
import { LaunchCTA } from './sections/launch-cta'
import { HonestSocialProof } from './sections/honest-social-proof'
import { UserTypeFeatures } from './sections/user-type-features'
import { PricingTeaser } from './sections/pricing-teaser'
import { Commission } from './sections/commission-section'
import { USTrust } from './sections/us-trust'
import { EmailCapture } from './sections/email-capture'
import { WhyAmericaSection } from './sections/why-america-section'
import { FAQ } from './sections/faq-section'

/* ------------------------------------------------------------------ */
/* LandingPage — main export                                          */
/* ------------------------------------------------------------------ */
export interface LandingPageProps {
  onGetStarted: (type?: string) => void
  onPickPortal: (portal: LoginPortal) => void
  currency: string
}

/**
 * LandingPage – Client Component.
 *
 * Receives handlers from PortalClient and wires them into the landing UI.
 */
export function LandingPage({
  onGetStarted,
  onPickPortal,
  currency,
}: LandingPageProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <EarlyAdopterBanner onGetStarted={onGetStarted} />
      <LandingNav goToLogin={onPickPortal} />
      <main id="main-content">
        <HeroSection onGetStarted={onGetStarted} />
        <ProofStrip />
        <TrustStats />
        <FeatureStrip />
        <BentoFeatures />
        <WhyAmericaSection />
        <HowItWorks />
        <ValueStatements />
        <FounderStory />
        <LaunchCTA onPickPortal={onPickPortal} />
        <HonestSocialProof />
        <UserTypeFeatures onGetStarted={onGetStarted} />

        {/* Early adopter pricing card */}
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-12 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center mb-5 sm:mb-6">
            <Badge
              variant="secondary"
              className="mb-2 sm:mb-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              Founder pricing
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">
              Simple <span className="text-emerald-600">early pricing</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">
              Start free, or choose Individual or Family. Prices shown in USD. Subject to change with notice.
            </p>
          </div>
          <div className="mx-auto max-w-3xl">
            <EarlyAdopterCard onSelect={(type) => onGetStarted(type)} />
          </div>
        </section>

        <section aria-labelledby="pricing-heading" id="pricing-preview">
          <h2 id="pricing-heading" className="sr-only">Pricing overview</h2>
          <PricingTeaser onGetStarted={onGetStarted} />
        </section>

        <Commission onPick={onPickPortal} />
        <USTrust />
        <EmailCapture onPickPortal={onPickPortal} />

        <section aria-labelledby="faq-heading" id="faq">
          <h2 id="faq-heading" className="sr-only">Frequently asked questions</h2>
          <FAQ />
        </section>

        <LandingFinalCTA onGetStarted={onGetStarted} />
      </main>
      <LandingFooter />
    </div>
  )
}

