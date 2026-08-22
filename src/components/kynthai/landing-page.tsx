'use client'

import type { LoginPortal } from '@/lib/store'
import { LandingNav } from './landing-nav'
import { LandingFooter } from './landing-footer'
import { LandingFinalCTA } from './landing-final-cta'
import { EarlyAdopterBanner } from './early-adopter-banner'
import { HeroSection } from './hero-section'
import { ProofStrip } from './sections/proof-strip'
import { HowItWorks } from './sections/how-it-works'
import { PricingTeaser } from './sections/pricing-teaser'
import { USTrust } from './sections/us-trust'
import { FAQ } from './sections/faq-section'
import { BentoFeatures } from './sections/bento-features'

export interface LandingPageProps {
  onGetStarted: (type?: string) => void
  onPickPortal: (portal: LoginPortal) => void
  currency: string
}

/**
 * Shorter conversion-focused landing:
 * Banner → Nav → Hero → Proof → How it works → Features → Pricing → Trust → FAQ → CTA → Footer
 * Commission / founder / duplicate pricing / email capture removed from homepage.
 */
export function LandingPage({
  onGetStarted,
  onPickPortal,
}: LandingPageProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <EarlyAdopterBanner onGetStarted={onGetStarted} />
      <LandingNav goToLogin={onPickPortal} />
      <main id="main-content">
        <HeroSection onGetStarted={onGetStarted} />
        <ProofStrip />
        <HowItWorks />
        <BentoFeatures />
        <section aria-labelledby="pricing-heading" id="pricing-preview">
          <h2 id="pricing-heading" className="sr-only">
            Pricing overview
          </h2>
          <PricingTeaser onGetStarted={onGetStarted} />
        </section>
        <USTrust />
        <section aria-labelledby="faq-heading" id="faq">
          <h2 id="faq-heading" className="sr-only">
            Frequently asked questions
          </h2>
          <FAQ />
        </section>
        <LandingFinalCTA onGetStarted={onGetStarted} />
      </main>
      <LandingFooter />
    </div>
  )
}
