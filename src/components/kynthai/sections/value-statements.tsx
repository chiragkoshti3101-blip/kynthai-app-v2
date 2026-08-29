'use client';

import React from 'react';
import { Bell, AlertTriangle, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Value Statements — honest, non-numeric trust builders              */
/* ------------------------------------------------------------------ */
export function ValueStatements() {
  const trustStatements = [
    {
      title: 'Never forget a dose',
      body: 'Smart in-app reminders with streaks and family alerts keep everyone on track — including grandparents. Never miss a dose.',
      icon: Bell,
      accent: 'from-emerald-500 to-teal-600',
    },
    {
      title: 'Catch dangerous interactions',
      body: 'AI cross-checks medications for drug-drug, drug-food, and timing conflicts — with severity tags and suggested alternatives (informational only, not medical advice). Works with common medications.',
      icon: AlertTriangle,
      accent: 'from-amber-500 to-orange-600',
    },
    {
      title: 'Care for everyone you love',
      body: 'Manage up to 4 family members from one dashboard. Get live alerts when a parent misses a dose. Share lab reports with their doctor instantly.',
      icon: Users,
      accent: 'from-teal-500 to-emerald-600',
    },
  ];

  return (
    <section className="relative overflow-hidden border-y border-border/60 bg-gradient-to-b from-emerald-500/5 via-background to-teal-500/5">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="secondary"
            className="mb-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          >
            Why Kynthai
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Health management, <span className="text-emerald-600">simplified by AI</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            We&apos;re building Kynthai in the open. No fake reviews, no inflated numbers — just a
            product that solves real health-management problems for households like yours.
          </p>
          <p className="mt-2 text-[10px] italic text-muted-foreground">
            All statements are anonymized summaries. No personal health information is disclosed.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 items-stretch">
          {trustStatements.map(r => (
            <div key={r.title} className="flex h-full">
              <Card className="flex w-full flex-col gap-4 p-6 transition-all hover:-translate-y-1 hover:shadow-lg">
                <div
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
                    r.accent
                  )}
                >
                  <r.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{r.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              </Card>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs text-muted-foreground">
          Join families everywhere managing medications smarter with AI-powered health tools.
        </p>
      </div>
    </section>
  );
}
