'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function TrustStats() {
  const stats: Array<{
    label: string;
    value: string;
    note?: string;
  }> = [
    { label: 'AI-Powered Features', value: '10', note: 'In Plus plan' },
    { label: 'Medicine Added In', value: '<30s', note: 'AI-assisted' },
    { label: 'Starting Price', value: 'Free', note: 'Free plan available' },
    { label: 'Individual Plan', value: '$9.99/mo', note: 'Early adopter pricing' },
    { label: 'Family Plan', value: '$19.99/mo', note: 'Billed monthly' },
    { label: 'Family members', value: 'Up to 4', note: 'Single dashboard' },
  ];

  return (
    <section className="relative border-y border-border/60">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-40 blur-3xl"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-10 sm:px-6 sm:gap-5 sm:py-14 lg:grid-cols-6 lg:px-8">
        {stats.map(s => (
          <div
            key={s.label}
            className="group flex flex-col items-center rounded-2xl border border-border/50 bg-card/50 p-3 text-center transition-all duration-200 hover:border-emerald-500/25 hover:bg-emerald-500/[0.04] hover:shadow-lg hover:shadow-emerald-900/5 sm:p-5"
          >
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 bg-clip-text text-2xl font-bold text-transparent sm:text-4xl lg:text-[2.5rem]">
              {s.value}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-foreground/70 sm:mt-1.5 sm:text-[11px]">
              {s.label}
            </div>
            {s.note && (
              <div className="mt-0.5 text-[9px] font-medium text-emerald-600/90 dark:text-emerald-400/90 sm:text-[10px]">
                {s.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
