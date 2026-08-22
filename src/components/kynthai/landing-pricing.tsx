'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { PRICING, formatPrice } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  Check,
  DollarSign,
  Gift,
  Sparkles,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* LandingPricing — inline pricing teaser (client island)             */
/* ------------------------------------------------------------------ */
export function LandingPricing({ onGetStarted }: { onGetStarted: () => void }) {
  const { setScreen, currency } = useAppStore()
  const router = useRouter()

  const tiers = [
    {
      name: 'Free',
      price: formatPrice(0, currency),
      cadence: 'plan',
      features: ['1 member profile', '3 medications', '3 AI chats / day', 'All smart reminders'],
      cta: 'Start Free',
      onClick: onGetStarted,
      icon: Gift,
    },
    {
      name: 'Plus',
      price: formatPrice(PRICING[currency].plus.monthly, currency),
      cadence: '/ month',
      features: ['1 member profile', 'Unlimited medications', 'Unlimited AI chat', 'Priority doctor consults'],
      cta: 'Upgrade',
      onClick: () => router.push('/pricing'),
      highlight: true,
      icon: Sparkles,
    },
    {
      name: 'Family Pro',
      price: formatPrice(PRICING[currency].family_pro.monthly, currency),
      cadence: '/ month',
      features: ['Up to 4 members', 'Everything in Plus', 'Smart reminders', 'Weekly AI insights'],
      cta: 'Get Family Pro',
      onClick: () => router.push('/pricing'),
      icon: Users,
    },
  ]

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <Badge
          variant="secondary"
          className="mb-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        >
          Simple, honest pricing
        </Badge>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Start free. <span className="text-emerald-600">Upgrade only when you need more.</span>
        </h2>
        <p className="mt-3 text-muted-foreground">
          No credit card to start. No lock-in. Cancel anytime.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <DollarSign className="h-3 w-3" />
          Pay with Card · ACH · Apple Pay · Google Pay
        </div>
      </div>

      <div className="mx-auto mt-6 grid max-w-5xl gap-3 md:grid-cols-3 items-stretch">
        {tiers.map((t) => (
          <Card
            key={t.name}
            className={cn(
              'relative flex w-full flex-col p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg',
              t.highlight ? 'border-emerald-500/40 shadow-lg shadow-emerald-600/10' : ''
            )}
          >
            {t.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <Badge className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md">
                  Most popular
                </Badge>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow',
                  t.highlight ? 'from-emerald-500 to-teal-600' : 'from-emerald-500/80 to-teal-600/80'
                )}
              >
                <t.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{t.name}</h3>
            </div>
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="bg-gradient-to-br from-emerald-600 to-teal-700 bg-clip-text text-4xl font-bold text-transparent">
                {t.price}
              </span>
              <span className="text-sm text-muted-foreground">{t.cadence}</span>
            </div>
            <ul className="mt-5 flex-1 space-y-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={t.onClick}
              className={cn(
                'mt-6 min-h-11 w-full',
                t.highlight ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white' : ''
              )}
              variant={t.highlight ? 'default' : 'outline'}
            >
              {t.cta}
            </Button>
          </Card>
        ))}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={() => router.push('/pricing')}
          className="inline-flex items-center gap-1 rounded-md px-1 -mx-1 py-2 -my-2 text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700"
        >
          See full pricing
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  )
}

