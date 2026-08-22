'use client';

import React from 'react';
import { UserPlus, Pill, Bell, Stethoscope } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function HowItWorks() {
  const steps: Array<{
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    body: string;
  }> = [
    {
      icon: UserPlus,
      title: 'Manage Your Family',
      body: 'Manage health for up to 4 family members in one app. Each member gets their own health profile.',
    },
    {
      icon: Pill,
      title: 'Add Medicines Easily',
      body: 'Upload a prescription photo or type a list — AI helps extract details so you can review and confirm before saving.',
    },
    {
      icon: Bell,
      title: 'Smart Reminders',
      body: 'Get intelligent reminders for medications. Send missed-dose alerts to family members.',
    },
    {
      icon: Stethoscope,
      title: 'Care when you need it',
      body: 'Book consults and lab tests when available in the app. Medication tools work even if you keep your own pharmacy.',
    },
  ];

  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Badge
          variant="secondary"
          className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        >
          How it works
        </Badge>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Live in <span className="text-emerald-600">four steps</span>, not four apps.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Sign up in under two minutes. No technical setup, no complicated settings — just open the
          app and start.
        </p>
      </div>

      {/* Step connector line (desktop only) */}
      <div className="pointer-events-none relative mt-6 hidden lg:block" aria-hidden="true">
        <div className="mx-auto max-w-5xl">
          <div
            className="h-px w-full bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent"
            style={{ marginTop: '-3rem' }}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        {steps.map((s, i) => (
          <div key={s.title} className="group flex h-full">
            <Card className="relative flex w-full flex-col overflow-hidden border-border/60 bg-card transition-all duration-200 hover:-translate-y-1.5 hover:border-emerald-500/30 hover:shadow-xl hover:shadow-emerald-900/5">
              {/* Large ghost step number */}
              <div
                className="pointer-events-none absolute -bottom-2 -right-2 select-none text-[6.5rem] font-black leading-none text-emerald-500/[0.04]"
                aria-hidden="true"
              >
                {i + 1}
              </div>
              {/* Step number — small accent */}
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {i + 1}
              </div>
              <CardContent className="flex-1 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/20 transition-transform duration-200 group-hover:scale-110">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">{s.body}</p>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
