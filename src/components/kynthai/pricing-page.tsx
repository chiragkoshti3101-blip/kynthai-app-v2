'use client';

import * as React from 'react';
import { ContactEmail, ContactEmailText } from '@/components/kynthai/contact-email';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Heart,
  Users,
  Stethoscope,
  Microscope,
  ShieldCheck,
  Zap,
  Calculator,
  Banknote,
  Trophy,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EarlyAdopterCard } from './early-adopter-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { KynthaiBrand } from './logo';
import { Reveal, StaggerGroup, StaggerItem, Magnetic } from './animations';
import { useRouter } from 'next/navigation';
import {
  DOCTOR_BASE_FEE_PCT,
  LAB_BASE_FEE_PCT,
  LOYALTY_TIERS,
  type LoyaltyTier,
  effectiveFeePct,
  platformFee,
  partnerKeeps,
  PAYOUT_POLICY,
} from '@/lib/commission';
import { type Currency, CURRENCIES, PRICING, formatPrice, yearlySavingsPct } from '@/lib/currency';

type BillingCycle = 'monthly' | 'yearly';

interface Tier {
  id: 'free' | 'plus' | 'family_pro' | 'professional' | 'enterprise';
  name: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  cta: string;
  featured?: boolean;
  commissionOnly?: boolean;
  enterprise?: boolean;
  features: string[];
}

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Start your health journey — free plan available',
    icon: Heart,
    accent: 'from-emerald-500 to-emerald-600',
    cta: 'Start Free',
    features: [
      '1 member profile',
      'Up to 10 medications',
      'AI Health Chat (3 / day)',
      'Smart reminders & streaks',
      'Medicine identification (2 / day)',
      'Prescription scanning (1 / day)',
      'Book doctor consults',
      'Order medicines & lab tests',
      'CCPA/CPRA-oriented privacy controls',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    tagline: 'Unlimited AI for your health — zero limits',
    icon: Sparkles,
    accent: 'from-emerald-500 to-teal-600',
    cta: 'Upgrade to Plus',
    featured: true,
    features: [
      '1 member profile',
      'Unlimited medications',
      'Unlimited AI Health Chat',
      'Unlimited medicine identification',
      'Unlimited prescription scanning',
      'Drug & food interaction checks',
      'AI symptom analyzer with red flags',
      'Weekly AI insights report',
      'Chronic condition tracker',
      'Priority support (24h response)',
      'No ads, ever',
    ],
  },
  {
    id: 'family_pro',
    name: 'Family Pro',
    tagline: 'Every family member. One dashboard. Total peace of mind.',
    icon: Users,
    accent: 'from-teal-500 to-emerald-600',
    cta: 'Get Family Pro',
    features: [
      'Up to 4 member profiles',
      'Everything in Plus (for all 4 members)',
      'Caretaker dashboard & live alerts',
      'Missed-dose escalation alerts',
      'Shared lab reports with doctors',
      'Family adherence leaderboard',
      'SOS emergency alerts',
      'Family AI insights (per member)',
      'Early access to new AI features',
      'Dedicated family support line',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'For doctors & labs — earn more, hassle less',
    icon: Stethoscope,
    accent: 'from-teal-500 to-teal-700',
    cta: 'Apply to join',
    commissionOnly: true,
    features: [
      'No monthly fee — pay only platform fee',
      `Doctors: ${DOCTOR_BASE_FEE_PCT}% fee · you keep ${100 - DOCTOR_BASE_FEE_PCT}%`,
      `Labs: ${LAB_BASE_FEE_PCT}% fee · you keep ${100 - LAB_BASE_FEE_PCT}%`,
      'Loyalty discounts up to 3% off',
      'Verified profile badge',
      'Digital prescriptions with invite links',
      'Patient adherence tracking dashboard',
      'Auto-create medications from prescriptions',
      'Video consultation support',
      'Patient nudge & follow-up scheduler',
      'Earnings calculator & projections',
      `Payouts ${PAYOUT_POLICY.cadence} · min ${PAYOUT_POLICY.minPayoutUsd}`,
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Healthy employees. Healthier families. Stronger company.',
    icon: ShieldCheck,
    accent: 'from-teal-500 to-emerald-700',
    cta: 'Contact Sales',
    commissionOnly: true,
    enterprise: true,
    features: [
      'Employee + family coverage (spouse + parents)',
      'Everything in Plus & Family Pro for every employee',
      'Admin dashboard with org-wide health analytics',
      'Bulk employee onboarding (CSV import)',
      'Custom branding & white-label option',
      'SSO (Google Workspace, Microsoft 365)',
      'Dedicated account manager',
      'On-site health camps & doctor visits',
      'Mental wellness tracking (anonymized)',
      'Quarterly health reports for HR',
      'API access for HRIS integration',
      'Priority 24/7 support for all employees',
    ],
  },
];

export function PricingPage() {
  const { setScreen, setCheckoutTier, currency } = useAppStore();
  const router = useRouter();
  const [cycle, setCycle] = React.useState<BillingCycle>('monthly');

  // US launch — pricing is in USD.

  // Get dynamic prices for the selected currency — fallback to USD if unsupported
  const safeCurrency = PRICING[currency] ? currency : 'USD';
  const plusPrice = PRICING[safeCurrency].plus;
  const familyProPrice = PRICING[safeCurrency].family_pro;
  const savingsPlus = yearlySavingsPct(safeCurrency, 'plus');
  const savingsFamily = yearlySavingsPct(safeCurrency, 'family_pro');
  const savingsLabel = Math.min(savingsPlus, savingsFamily);

  function startCheckout(tier: 'plus' | 'family_pro') {
    setCheckoutTier(tier);
    router.push('/checkout');
  }

  /** Resolve the price for a tier given the current billing cycle + currency. */
  function tierPrice(tierId: string): number | null {
    if (tierId === 'free') return 0;
    if (tierId === 'plus') return cycle === 'monthly' ? plusPrice.monthly : plusPrice.yearly;
    if (tierId === 'family_pro')
      return cycle === 'monthly' ? familyProPrice.monthly : familyProPrice.yearly;
    return null; // professional / enterprise
  }

  /** Subtle USD subtitle, e.g. "$9.99/mo · cancel anytime". */
  function inrSubtitle(tierId: string, billingCycle: 'monthly' | 'yearly'): string {
    const price = tierPrice(tierId) ?? 0;
    if (billingCycle === 'yearly' && tierId !== 'free') {
      return `${formatPrice(price, currency)}/year · cancel anytime`;
    }
    return `${formatPrice(price, currency)}/mo · cancel anytime`;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push('/')}
            className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md p-2 -m-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <KynthaiBrand />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => router.push('/login')}
              className="min-h-11 bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
            >
              Sign in
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div
            className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
            style={{
              background: 'radial-gradient(closest-side, rgba(16,185,129,0.35), transparent 70%)',
            }}
          />
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 lg:px-8 lg:py-16">
          <Reveal>
            <Badge
              variant="secondary"
              className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              <Zap className="h-3 w-3" />
              Simple, transparent pricing
            </Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Pricing that scales with your care
            </h1>
            <p className="mt-4 text-pretty text-sm text-muted-foreground sm:text-base">
              Start free, upgrade when you need more. Cancel anytime. Doctors and labs pay no
              monthly fee — just a fair platform fee on each fulfilled order.
            </p>
          </Reveal>

          {/* Billing toggle */}
          <Reveal delay={0.1}>
            <div className="mt-8 inline-flex items-center gap-2 sm:gap-3 rounded-full border border-border bg-muted/40 p-1.5 pl-3 sm:pl-4">
              <span
                className={cn(
                  'text-xs sm:text-sm font-medium transition-colors',
                  cycle === 'monthly' ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                Monthly
              </span>
              <Switch
                checked={cycle === 'yearly'}
                onCheckedChange={c => setCycle(c ? 'yearly' : 'monthly')}
                aria-label="Toggle yearly billing"
              />
              <span
                className={cn(
                  'text-xs sm:text-sm font-medium transition-colors',
                  cycle === 'yearly' ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                Yearly
              </span>
              <Badge className="mr-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                Save ~{savingsLabel}%
              </Badge>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Tax note */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs text-muted-foreground">
          Prices are shown in US dollars. Sales tax (where applicable) is charged at checkout. Doctor consultation
          fees are charged separately by the doctor.
        </p>
      </div>

      {/* Early Adopter Card */}
      <section className="mx-auto max-w-3xl px-4 pb-8 sm:px-6 lg:px-8">
        <EarlyAdopterCard
          onSelect={type => startCheckout(type === 'family' ? 'family_pro' : 'plus')}
        />
      </section>

      {/* Tiers */}
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <StaggerGroup className="grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TIERS.map(tier => (
            <StaggerItem key={tier.id}>
              <Card
                className={cn(
                  'relative flex h-full flex-col overflow-hidden transition-all',
                  tier.featured
                    ? 'border-emerald-500/40 shadow-xl shadow-emerald-600/10'
                    : 'hover:border-emerald-500/30'
                )}
              >
                {tier.featured && (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2">
                    <div className="-mt-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md">
                      Most popular
                    </div>
                  </div>
                )}
                <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow',
                      tier.accent
                    )}
                  >
                    <tier.icon className="h-5 w-5" />
                  </div>

                  <h3 className="mt-4 text-lg font-semibold">{tier.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{tier.tagline}</p>

                  <div className="mt-5 flex items-baseline gap-1">
                    {tier.enterprise ? (
                      <span className="text-3xl font-bold">Custom</span>
                    ) : tier.commissionOnly ? (
                      <span className="text-3xl font-bold">
                        {DOCTOR_BASE_FEE_PCT}%
                        <span className="text-base font-medium text-muted-foreground">
                          /{LAB_BASE_FEE_PCT}%
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold">
                          {formatPrice(tierPrice(tier.id) ?? 0, currency)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {cycle === 'monthly' ? '/mo' : '/yr'}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tier.enterprise
                      ? `Starting at $9/employee/mo · min 50 employees`
                      : tier.commissionOnly
                        ? `Platform fee · doctor / lab · no monthly fee`
                        : cycle === 'yearly' && tier.id !== 'free'
                          ? `Billed ${formatPrice(tierPrice(tier.id) ?? 0, currency)} once a year · cancel anytime`
                          : `Billed monthly · cancel anytime`}
                  </p>

                  <Separator className="my-5" />

                  <ul className="flex-1 space-y-2.5">
                    {tier.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    {tier.id === 'free' && (
                      <Button
                        variant="outline"
                        className="min-h-11 w-full"
                        onClick={() => router.push('/login')}
                      >
                        {tier.cta}
                      </Button>
                    )}
                    {(tier.id === 'plus' || tier.id === 'family_pro') && (
                      <Magnetic strength={0.2}>
                        <Button
                          className={cn(
                            'min-h-11 w-full gap-2',
                            tier.featured
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                              : ''
                          )}
                          variant={tier.featured ? 'default' : 'outline'}
                          onClick={() => startCheckout(tier.id as 'plus' | 'family_pro')}
                        >
                          {tier.cta}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Magnetic>
                    )}
                    {tier.commissionOnly && !tier.enterprise && (
                      <Button
                        variant="outline"
                        className="min-h-11 w-full"
                        onClick={() => router.push('/login')}
                      >
                        {tier.cta}
                      </Button>
                    )}
                    {tier.enterprise && (
                      <Button
                        className="w-full gap-2 bg-gradient-to-r from-teal-500 to-emerald-700 text-white"
                        onClick={() =>
                          (window.location.href =
                            'mailto:enterprise@kynthai.app?subject=Enterprise%20Inquiry&body=Company%20name%3A%0AEmployee%20count%3A%0AContact%20name%3A%0AContact%20email%3A')
                        }
                      >
                        {tier.cta}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Platform fee transparency cards */}
        <Reveal>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-teal-500/5">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h3 className="text-sm font-semibold">
                        Doctors — {DOCTOR_BASE_FEE_PCT}% platform fee
                      </h3>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        keep 85%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Charged on every consult and medicine order routed through your practice.
                      Loyalty tier discounts reduce it by up to 3%.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-teal-500/20 bg-gradient-to-br from-teal-500/10 via-card to-emerald-500/5">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
                    <Microscope className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h3 className="text-sm font-semibold">
                        Labs — {LAB_BASE_FEE_PCT}% platform fee
                      </h3>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        keep 82%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Charged on every test booking fulfilled through Kynthai&apos;s network. Loyalty
                      tier discounts reduce it by up to 3%.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Reveal>

        {/* Loyalty tier table */}
        <Reveal>
          <Card className="mt-8 overflow-hidden">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Trophy className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">
                    Loyalty tiers — your fee shrinks as you grow
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tier is calculated from lifetime fulfilled orders and re-evaluated every Monday.
                  </p>
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden sm:grid sm:grid-cols-4 gap-3">
                {(
                  Object.entries(LOYALTY_TIERS) as [
                    LoyaltyTier,
                    (typeof LOYALTY_TIERS)[LoyaltyTier],
                  ][]
                ).map(([name, cfg]) => {
                  const docFee = effectiveFeePct(DOCTOR_BASE_FEE_PCT, name);
                  const labFee = effectiveFeePct(LAB_BASE_FEE_PCT, name);
                  return (
                    <div
                      key={name}
                      className={cn(
                        'rounded-xl border p-3 text-center',
                        name === 'Platinum'
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-border/60'
                      )}
                    >
                      <div className="text-2xl">
                        <span
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${cfg.tint} text-lg font-bold text-white shadow`}
                        >
                          {cfg.icon}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold">{name}</p>
                      <p className="text-[10px] text-muted-foreground">{cfg.min}+ orders</p>
                      <Separator className="my-2" />
                      <p className="text-[11px] text-muted-foreground">Doctor fee</p>
                      <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {docFee}%
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">Lab fee</p>
                      <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {labFee}%
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Mobile collapsible list */}
              <div className="sm:hidden space-y-2">
                {(
                  Object.entries(LOYALTY_TIERS) as [
                    LoyaltyTier,
                    (typeof LOYALTY_TIERS)[LoyaltyTier],
                  ][]
                ).map(([name, cfg]) => {
                  const docFee = effectiveFeePct(DOCTOR_BASE_FEE_PCT, name);
                  const labFee = effectiveFeePct(LAB_BASE_FEE_PCT, name);
                  return (
                    <div
                      key={name}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3',
                        name === 'Platinum'
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-border/60'
                      )}
                    >
                      <div className="shrink-0">
                        <span
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${cfg.tint} text-lg font-bold text-white shadow`}
                        >
                          {cfg.icon}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold">{name}</p>
                          <p className="text-[10px] text-muted-foreground">{cfg.min}+ orders</p>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px]">
                          <span className="text-muted-foreground">
                            Doc{' '}
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {docFee}%
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Lab{' '}
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {labFee}%
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <p>
                  Example: a Gold doctor (150+ orders) pays a 13% fee instead of 15% — saving $200
                  on every $10,000 of consults.
                </p>
              </div>
            </CardContent>
          </Card>
        </Reveal>

        {/* Earnings calculator */}
        <Reveal>
          <EarningsCalculator />
        </Reveal>

        {/* Payout policy */}
        <Reveal>
          <Card className="mt-6 border-dashed">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Banknote className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold">Payout policy</h3>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Schedule</p>
                      <p className="font-semibold mt-0.5">
                        {PAYOUT_POLICY.cadence} (15 days after month-end)
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Minimum payout</p>
                      <p className="font-semibold mt-0.5">
                        {formatPrice(PAYOUT_POLICY.minPayoutUsd, currency)} min payout
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Methods</p>
                      <p className="font-semibold mt-0.5">{PAYOUT_POLICY.methods.join(' · ')}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Refunds, chargebacks, and cancelled orders are excluded from earnings. US privacy
                    compliant with full audit trail.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Reveal>

        {/* Trust strip */}
        <Reveal>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:gap-x-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Privacy-first
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Built for US families
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-emerald-600" /> Cancel anytime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-emerald-600" /> 30-day money-back
            </span>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/* ----------------------------- Earnings calculator ----------------------------- */

function EarningsCalculator() {
  const { currency } = useAppStore();
  const [role, setRole] = React.useState<'doctor' | 'lab'>('doctor');
  const [tier, setTierName] = React.useState<LoyaltyTier>('Bronze');
  const [amount, setAmount] = React.useState<string>('10000');
  const [orders, setOrders] = React.useState<string>('20');

  const baseFee = role === 'doctor' ? DOCTOR_BASE_FEE_PCT : LAB_BASE_FEE_PCT;
  const feePct = effectiveFeePct(baseFee, tier);
  const gross = Math.max(0, parseFloat(amount) || 0) * Math.max(0, parseInt(orders) || 0);
  const fee = platformFee(gross, feePct);
  const keeps = partnerKeeps(gross, feePct);
  const savingVsBronze = platformFee(gross, baseFee) - fee;

  const currencySymbol = CURRENCIES[currency]?.symbol ?? '$';

  return (
    <>
      <Card className="mt-6 border-emerald-500/20">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Calculator className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Partner earnings calculator</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                See exactly what you take home. Numbers update live.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="calc-role" className="text-xs">
                I am a
              </Label>
              <Select value={role} onValueChange={v => setRole(v as 'doctor' | 'lab')}>
                <SelectTrigger id="calc-role" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="lab">Lab</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-tier" className="text-xs">
                Loyalty tier
              </Label>
              <Select value={tier} onValueChange={v => setTierName(v as LoyaltyTier)}>
                <SelectTrigger id="calc-tier" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LOYALTY_TIERS) as LoyaltyTier[]).map(t => (
                    <SelectItem key={t} value={t}>
                      {LOYALTY_TIERS[t].icon} {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-amount" className="text-xs">
                Avg. order value ({currencySymbol})
              </Label>
              <Input
                id="calc-amount"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-9"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-orders" className="text-xs">
                Orders per month
              </Label>
              <Input
                id="calc-orders"
                type="number"
                value={orders}
                onChange={e => setOrders(e.target.value)}
                className="h-9"
                min={0}
              />
            </div>
          </div>

          {/* Result */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-[11px] text-muted-foreground">Gross volume</p>
              <p className="text-lg font-bold mt-0.5">{formatPrice(gross, currency)}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-[11px] text-muted-foreground">Platform fee ({feePct}%)</p>
              <p className="text-lg font-bold mt-0.5 text-rose-600 dark:text-rose-400">
                −{formatPrice(fee, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="text-[11px] text-muted-foreground">You receive</p>
              <p className="text-lg font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
                {formatPrice(keeps, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[11px] text-muted-foreground">Loyalty saving / mo</p>
              <p className="text-lg font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
                +{formatPrice(savingVsBronze, currency)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>
              Projection only. Actual earnings depend on case mix and cancellations. Payouts are{' '}
              {PAYOUT_POLICY.cadence}; minimum {formatPrice(PAYOUT_POLICY.minPayoutUsd, currency)}.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Refund & Cancellation policy link */}
      <div className="mt-8 border-t border-border/60 pt-5">              <p className="text-center text-[13px] text-muted-foreground">
          Questions about billing or cancellations? See our{' '}
          <a
            href="/refund-cancellation"
            className="inline-block rounded-md px-1 -mx-1 py-2 -my-2 text-emerald-600 underline hover:text-emerald-700"
          >
            Refund &amp; Cancellation Policy
          </a>{' '}
          or email{' '}
          <ContactEmail
            address="privacy@kynthai.app"
            className="inline-block rounded-md px-1 -mx-1 py-2 -my-2 text-emerald-600 underline hover:text-emerald-700"
          />
          .
          <br />
          Registered Office: 16192 Coastal Highway, Lewes, DE 19958, United
          States.
        </p>
      </div>
    </>
  );
}
