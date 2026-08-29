'use client';

import React from 'react';
import { Sparkles, Bell, Users, ShieldCheck } from 'lucide-react';

export function FeatureStrip() {
  const items = [
    { label: 'Privacy-first', icon: ShieldCheck },
    { label: 'AI-Powered', icon: Sparkles },
    { label: 'Family First', icon: Users },
    { label: 'Smart Reminders', icon: Bell },
    { label: 'Family-first', icon: Users },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 rounded-2xl border border-emerald-500/15 bg-gradient-to-r from-emerald-500/[0.03] via-card to-emerald-500/[0.03] px-6 py-4 backdrop-blur-sm">
        {items.map(it => (
          <div
            key={it.label}
            className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-sm font-medium text-foreground/80 transition-all hover:border-emerald-500/25 hover:text-foreground"
          >
            <it.icon className="h-3.5 w-3.5 text-emerald-600" />
            {it.label}
          </div>
        ))}
      </div>
    </section>
  );
}
