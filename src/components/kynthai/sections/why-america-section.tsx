'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Users,
  DollarSign,
  Languages,
  Accessibility,
  ShieldCheck,
  Bell,
} from 'lucide-react'

interface Reason {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
  accent: string
}

export function WhyAmericaSection() {
  const reasons: Reason[] = [
    {
      icon: Users,
      title: 'Built for American families',
      body: 'Manage up to 4 family members from one dashboard. Smart reminders, family alerts, and weekly AI insights — all in-app. Designed for busy households across the US.',
      accent: 'from-emerald-500 to-teal-600',
    },
    {
      icon: DollarSign,
      title: 'Transparent USD pricing',
      body: 'Simple, all-in pricing in USD with no surprise taxes at checkout. Card and ACH payments accepted. Start free, upgrade when you need more.',
      accent: 'from-teal-500 to-emerald-600',
    },
    {
      icon: Languages,
      title: 'English-first interface',
      body: 'Clear English interface designed for US households.',
      accent: 'from-emerald-500 to-emerald-700',
    },
    {
      icon: Accessibility,
      title: 'Senior-friendly design',
      body: 'Extra-large text, simple navigation, and SOS alerts ensure accessibility for elderly users across America.',
      accent: 'from-teal-500 to-teal-700',
    },
    {
      icon: ShieldCheck,
      title: 'Local & US privacy-aligned',
      body: 'Built for US families with privacy-first defaults. Primary app data uses US cloud regions where configured.',
      accent: 'from-emerald-600 to-teal-700',
    },
  ]

  return (
    <section id="why-america" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">
          Built <span className="text-emerald-600">for America</span>
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">
          Built for American households with US values: data privacy, transparent pricing, and family-first healthcare.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-5 items-stretch">
        {reasons.map((r) => (
          <div key={r.title} className="flex h-full">
            <Card className="relative flex w-full flex-col gap-3 overflow-hidden p-5 transition-all hover:-translate-y-1 hover:shadow-lg">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${r.accent.includes('emerald') ? '#10b981' : '#0d9488'}, ${r.accent.includes('teal') ? '#0d9488' : '#0f766e'})` }}
                aria-hidden="true"
              >
                <r.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{r.title}</h3>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {r.body}
              </p>
            </Card>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:mt-6 sm:gap-6 sm:p-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-medium">Up to 4 family members</span>
        </div>
        <div className="h-4 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-medium">Smart reminders</span>
        </div>
        <div className="h-4 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-medium">Privacy-first</span>
        </div>
        <div className="h-4 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <Accessibility className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-medium">Senior-friendly</span>
        </div>
      </div>

    </section>
  )
}
