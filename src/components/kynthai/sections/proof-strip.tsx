'use client';

import React from 'react';
import { Lock, CreditCard, Users, CheckCircle, Globe, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProofStrip() {
  const items = [
    {
      icon: Lock,
      label: 'Privacy-first',
      sub: 'TLS in transit · documents encrypted at rest',
      accent: 'border-emerald-500/30 bg-emerald-500/5',
    },
    {
      icon: CreditCard,
      label: 'Transparent USD pricing',
      sub: 'No hidden fees on listed plans',
      accent: 'border-teal-500/30 bg-teal-500/5',
    },
    {
      icon: Users,
      label: 'Free to start',
      sub: 'No credit card required to sign up',
      accent: 'border-emerald-500/30 bg-emerald-500/5',
    },
    {
      icon: CheckCircle,
      label: 'Practitioner review',
      sub: 'Doctors reviewed before listing when available',
      accent: 'border-teal-500/30 bg-teal-500/5',
    },
    {
      icon: Globe,
      label: 'Built for US families',
      sub: 'USD · US-oriented workflows · privacy controls',
      accent: 'border-emerald-500/30 bg-emerald-500/5',
    },
    {
      icon: Siren,
      label: 'Family SOS alerts',
      sub: 'Notify your emergency contacts from the app',
      accent: 'border-red-500/20 bg-red-500/5',
    },
  ];

  return (
    <section className="border-y border-border/60 bg-gradient-to-b from-background via-emerald-50/40 to-background dark:via-emerald-900/10">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <div
              key={item.label}
              className={cn(
                'group flex items-start gap-3 rounded-2xl border p-4 transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-md hover:shadow-emerald-900/5',
                item.accent
              )}
            >
              <item.icon className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-foreground">{item.label}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
