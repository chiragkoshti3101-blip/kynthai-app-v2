'use client';

import React from 'react';
import { HeartPulse, ShieldCheck, Server, DollarSign, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Why Kynthai — mission & promise, not founder story                   */
/* ------------------------------------------------------------------ */
export function FounderStory() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto max-w-2xl text-center mb-6">
          <Badge
            variant="secondary"
            className="mb-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          >
            Our Mission
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Health management <span className="text-emerald-600">shouldn&apos;t be this hard</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Millions of Americans manage medications for aging parents, young children, or their own
            health — often juggling scattered notes, multiple pharmacy apps, and paper schedules.
            Kynthai brings everything into one place.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50/60 via-card to-teal-50/60 p-8 sm:p-10">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* Mission icon */}
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
              <HeartPulse className="h-10 w-10 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-3">Our mission</h3>
              <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
                <p>
                  We built Kynthai because medication management for families is broken. One missed
                  dose can cascade into an ER visit, a hospital stay, or worse.
                </p>
                <p>
                  Every feature ships because real families need it — not because we answer to
                  investors or chase growth metrics. We&apos;re building in the open, with
                  transparency, and we earn your trust every day.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {[
                  { label: 'Privacy-first from day one', icon: ShieldCheck },
                  { label: 'Built for US families', icon: Server },
                  { label: 'No surprise billing', icon: DollarSign },
                  { label: 'You own your data', icon: Lock },
                ].map(item => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                  >
                    <item.icon className="h-3 w-3" />
                    {item.label}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent" />
                <p className="whitespace-nowrap text-xs font-semibold text-foreground/80">
                  Kynthai Health Technologies
                </p>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
