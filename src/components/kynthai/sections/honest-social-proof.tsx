'use client';

import React from 'react';
import {
  Sparkles,
  DollarSign,
  Users,
  Check,
  Bell,
  Pill,
  ShieldCheck,
  ShieldCheck as Shield,
  Lock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function HonestSocialProof() {
  return (
    <section className="relative overflow-hidden border-y border-border/60 bg-gradient-to-b from-muted/20 via-emerald-500/[0.03] to-muted/20">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(closest-side, rgba(16,185,129,0.1) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: what we're building */}
          <div>
            <div className="mx-auto max-w-2xl text-center lg:text-left lg:mx-0 mb-5">
              <Badge
                variant="secondary"
                className="mb-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
              >
                Built for families everywhere
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">
                A health companion <span className="text-emerald-600">you can trust</span>
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">
                We&apos;re not here to sell you on fake numbers. Kynthai is a new kind of health app
                — transparent about where we are, honest about what we&apos;re building, and
                accountable to every user who trusts us with their family&apos;s health.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              {[
                { value: 'Live now', label: 'Designed for families everywhere', icon: Sparkles },
                { value: 'No VC', label: 'Built for users, not investors', icon: DollarSign },
                { value: 'Multi-generational', label: 'For families of all ages', icon: Users },
              ].map(s => (
                <div
                  key={s.label}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-2xl border p-4 sm:p-6 text-center transition-all duration-200 border-border/60 bg-card/60 hover:border-emerald-500/20 hover:shadow-lg'
                  )}
                >
                  <s.icon className="mb-2 h-5 w-5 text-muted-foreground" />
                  <div className="text-xl font-bold sm:text-2xl text-emerald-600">{s.value}</div>
                  <div className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: what we believe */}
          <div className="flex flex-col justify-center gap-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-teal-500/5 p-4 shadow-sm sm:p-6">
              <h3 className="text-base font-semibold sm:text-lg">How we build</h3>
              <ul className="mt-4 space-y-3">
                {[
                  'Transparent pricing in USD — no hidden fees, no surprise charges.',
                  'Your data belongs to you — export or delete anytime, no questions asked.',
                  'Privacy-first architecture — data encrypted in transit (TLS 1.3); uploaded documents and prescription images encrypted at rest with AES-256-GCM.',
                  'No health data is ever sold to third parties.',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mx-auto mt-5 flex max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-emerald-500/15 bg-gradient-to-r from-emerald-500/[0.03] via-card to-emerald-500/[0.03] px-4 py-3 sm:mt-6 sm:gap-x-6 sm:gap-y-3 sm:px-6 sm:py-4">
          {[
            { label: 'Building in public', Icon: Sparkles },
            { label: 'AI-powered reminders', Icon: Bell },
            { label: 'Medicine interaction checker', Icon: Pill },
            { label: 'Privacy-first', Icon: ShieldCheck },
          ].map(s => (
            <div
              key={s.label}
              className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-sm font-medium text-foreground/70"
            >
              <s.Icon className="h-3.5 w-3.5 text-emerald-600" />
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export { HonestSocialProof };
