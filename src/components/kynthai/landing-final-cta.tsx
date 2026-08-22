'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight, DollarSign, ShieldCheck, Bell, Lock } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* LandingFinalCTA — final call-to-action section (client island)     */
/* ------------------------------------------------------------------ */
export function LandingFinalCTA({ onGetStarted }: { onGetStarted: () => void }) {
  const router = useRouter();

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-16">
      <div
        className="relative overflow-hidden rounded-2xl px-5 py-8 text-center sm:rounded-3xl sm:px-10 sm:py-14"
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #0d9488 50%, #0f766e 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3), transparent 40%)',
          }}
        />
        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur sm:mb-5 sm:px-3 sm:text-xs">
            <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Built for the US
          </div>
          <h2 className="mx-auto max-w-2xl text-balance text-2xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Because your family deserves better than forgetting.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-emerald-50 sm:mt-4 sm:text-base">
            Join US families who trust Kynthai. Start free today — no credit card, no commitment.
          </p>
          <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:mt-6 sm:flex-row sm:gap-3">
            <Button
              size="lg"
              onClick={onGetStarted}
              className="h-11 min-h-11 w-full rounded-full bg-white px-6 text-sm text-emerald-700 shadow-lg hover:bg-emerald-50 sm:h-12 sm:min-h-12 sm:w-auto sm:px-7 sm:text-base"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => router.push('/pricing')}
              className="h-11 min-h-11 w-full rounded-full border-white/40 bg-white/10 px-5 text-sm text-white backdrop-blur hover:bg-white/20 hover:text-white sm:h-12 sm:min-h-12 sm:w-auto sm:px-6 sm:text-base"
            >
              View Pricing
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-white/80 sm:mt-4 sm:gap-x-5 sm:gap-y-2 sm:text-xs">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Privacy-first
            </span>
            <span className="inline-flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" />
              Secure Card Billing
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Bell className="h-3 w-3" />
              Smart Reminders
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Privacy-first
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
