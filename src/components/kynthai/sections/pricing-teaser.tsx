'use client';

import React from 'react';
import { Gift, Sparkles, Users, Check, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PRICING, formatPrice, yearlySavingsPct } from '@/lib/currency';
import { cn } from '@/lib/utils';

function PricingTeaser({
  onGetStarted,
  onCheckout,
}: {
  onGetStarted: (portal?: string) => void;
  onCheckout?: (tier: 'plus' | 'family_pro') => void;
}) {
  const currency = 'USD';
  type Tier = {
    name: string;
    price: string;
    cadence: string;
    features: string[];
    cta: string;
    onClick: () => void;
    highlight?: boolean;
    icon: React.ComponentType<{ className?: string }>;
    tierKey: 'plus' | 'family_pro';
    yearlyNote?: string;
  };
  const tiers: Tier[] = [
    {
      name: 'Free',
      price: '$0',
      cadence: 'plan',
      features: [
        '1 member profile',
        'Up to 10 medications',
        '5 AI chats / day',
        'All smart reminders',
        'Medicine interaction checker',
      ],
      cta: 'Start Free',
      onClick: onGetStarted,
      icon: Gift,
      tierKey: 'plus',
    },
    {
      name: 'Plus',
      price: formatPrice(PRICING[currency].plus.monthly, currency),
      cadence: '/ month',
      yearlyNote: `${PRICING[currency].plus.yearly}/yr (billed annually)`,
      features: [
        '1 member profile',
        'Unlimited medications',
        'Unlimited AI chat',
        'Priority doctor consults',
        'Advanced drug interaction checker',
        'Lab test booking',
      ],
      cta: 'Upgrade',
      onClick: () => onCheckout?.('plus'),
      highlight: true,
      icon: Sparkles,
      tierKey: 'plus',
    },
    {
      name: 'Family Pro',
      price: formatPrice(PRICING[currency].family_pro.monthly, currency),
      cadence: '/ month',
      yearlyNote: `${PRICING[currency].family_pro.yearly}/yr (billed annually)`,
      features: [
        'Up to 4 members',
        'Everything in Plus',
        'Smart reminders for all',
        'Weekly AI health insights',
        'Family health reports',
        'Caregiver dashboard',
      ],
      cta: 'Get Family Pro',
      onClick: () => onCheckout?.('family_pro'),
      icon: Users,
      tierKey: 'family_pro',
    },
  ];

  return (
    /* NOTE: no id here — the parent landing-page section carries
       id="pricing-preview" (the anchor target). Duplicate ids are invalid HTML. */
    <section className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-20">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at center, rgba(16,185,129,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="mx-auto max-w-2xl text-center">
        <Badge
          variant="secondary"
          className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
        >
          Simple, honest pricing
        </Badge>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Start free. <span className="text-emerald-600">Upgrade only when you need more.</span>
        </h2>
        <p className="mt-3 text-muted-foreground">
          No credit card to start. No lock-in. Cancel anytime. All prices in USD.
        </p>
        <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
          {['Cards', 'Apple Pay', 'Google Pay'].map(m => (
            <span
              key={m}
              className="rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl gap-4 sm:gap-5 md:grid-cols-3 items-stretch">
        {tiers.map(t => (
          <div key={t.name} className={cn('flex h-full', t.highlight ? 'md:-mt-2 md:mb-0' : '')}>
            <Card
              className={cn(
                'relative flex w-full flex-col p-6 sm:p-7 transition-all duration-200',
                'hover:-translate-y-1.5 hover:shadow-xl hover:shadow-emerald-900/5',
                t.highlight
                  ? 'border-emerald-500/40 shadow-lg shadow-emerald-600/10'
                  : 'border-border/60 hover:border-emerald-500/25'
              )}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-700/30">
                    ⭐ Most Popular
                  </Badge>
                </div>
              )}

              {t.yearlyNote && (
                <div className="absolute -top-3 right-4 z-10">
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300"
                  >
                    Save {yearlySavingsPct(currency, t.tierKey)}%
                  </Badge>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md',
                    t.highlight
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                      : 'bg-gradient-to-br from-emerald-500/80 to-teal-600/80'
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

              {t.yearlyNote && (
                <p className="mt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {t.yearlyNote}
                </p>
              )}

              <ul className="mt-5 flex-1 space-y-2.5">
                {t.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm leading-snug">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={t.onClick}
                className={cn(
                  'mt-6 min-h-11 w-full rounded-full font-medium',
                  t.highlight
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/20'
                    : ''
                )}
                variant={t.highlight ? 'default' : 'outline'}
              >
                {t.cta}
              </Button>
            </Card>
          </div>
        ))}
      </div>

      <p className="mx-auto mt-6 max-w-md text-center text-xs text-muted-foreground">
        Save up to {yearlySavingsPct(currency, 'family_pro')}% with annual billing — always in USD.
        No surprise charges.
      </p>
    </section>
  );
}

export { PricingTeaser };
