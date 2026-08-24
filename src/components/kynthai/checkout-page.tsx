'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ShieldCheck,
  Lock,
  Loader2,
  Sparkles,
  PartyPopper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StripeCardElement } from './stripe-card-element';
import { useAppStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { KynthaiBrand } from './logo';
import { FadeIn, motion, AnimatePresence } from './animations';
import { installGlobalCsrf } from '@/lib/client-fetch';
installGlobalCsrf();
import {
  PRICING,
  EARLY_ADOPTER_PRICING,
  formatPrice,
  type Currency,
  type Currency as CurrencyType,
} from '@/lib/currency';
import { EARLY_ADOPTER_TIERS } from '@/lib/commission';
import type { AuthUser } from '@/lib/store';

interface TierInfo {
  id: 'plus' | 'family_pro';
  name: string;
  tagline: string;
  features: string[];
}

// ─── Safari-safe receipt ID ──────────────────────────────────────────────
// crypto.randomUUID() is unavailable on Safari < 15.4 and in any
// non-secure context — calling it crashes the render with
// "crypto.randomUUID is not a function". Fall back to a timestamp +
// Math.random based id so the checkout success screen always renders.
function safeReceiptId(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID().slice(0, 6).toUpperCase();
    }
  } catch {
    /* fall through */
  }
  return (
    Date.now().toString(36).toUpperCase().slice(-3) +
    Math.random().toString(36).toUpperCase().slice(2, 5)
  );
}

const TIER_INFO: Record<'plus' | 'family_pro', TierInfo> = {
  plus: {
    id: 'plus',
    name: 'Plus',
    tagline: 'Unlimited AI · 1 member',
    features: [
      'Unlimited medications',
      'Unlimited AI Health Chat',
      'Drug & food interaction checks',
      'AI symptom analyzer',
      'Weekly AI insights report',
      'Priority support',
    ],
  },
  family_pro: {
    id: 'family_pro',
    name: 'Family Pro',
    tagline: 'Up to 4 members · everything in Plus',
    features: [
      'Up to 4 member profiles',
      'Everything in Plus',
      'Caretaker dashboard & live alerts',
      'Shared lab reports',
      'Family adherence leaderboard',
      'Early access to new AI features',
    ],
  },
};

type Phase = 'form' | 'processing' | 'success';

export function CheckoutPage({ tier }: { tier: 'plus' | 'family_pro' }) {
  const { setScreen, currency, checkoutFounder, user } = useAppStore();
  const router = useRouter();
  const { toast } = useToast();
  const info = TIER_INFO[tier];

  // Display price equals the amount on the
  // pricing page — no tax components.
  const safeCurrency = PRICING[currency] ? currency : 'USD';
  const regularPrice = PRICING[safeCurrency][tier].monthly;

  const total = regularPrice;

  const [phase, setPhase] = React.useState<Phase>('form');
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function createPaymentIntent(): Promise<{
    clientSecret: string;
    paymentId: string;
  } | null> {
    try {
      setIsProcessing(true);
      // Fetch CSRF token before payment request
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const csrf = csrfData.token || '';
      const intentRes = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          type: 'subscription',
          amount: total,
          currency,
          description: `Kynthai ${info.name} subscription`,
          email,
          name,
        }),
      });

      const data = await intentRes.json().catch(() => ({}));
      if (!intentRes.ok) {
        throw new Error(data.error || 'Payment creation failed');
      }
      if (data.duplicate) {
        toast({
          title: 'Payment in progress',
          description: 'Your previous payment is being processed.',
        });
        return null;
      }
      return { clientSecret: data.clientSecret, paymentId: data.paymentId };
    } catch (err) {
      logger.warn('Payment initialization failed', err instanceof Error ? err.message : err);
      toast({
        title: 'Payment setup failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsProcessing(false);
    }
  }

  function handlePaymentSuccess() {
    setPhase('success');
    toast({
      title: 'Payment successful',
      description: `You're now on the ${info.name} plan.`,
    });
  }

  function handlePaymentError(message: string) {
    setPhase('form');
    toast({
      title: 'Payment failed',
      description: message,
      variant: 'destructive',
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {checkoutFounder ? (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-center text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          🎉 Early-access pricing applied — subject to change with notice
        </div>
      ) : (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-[11px] font-medium text-amber-700 dark:text-amber-300">
          Demo checkout — no real payment will be processed. Stripe integration required for
          production.
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push('/pricing')}
            className="inline-flex items-center gap-2 rounded-md p-2 -m-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to pricing
          </button>
          <KynthaiBrand />
          <Badge
            variant="outline"
            className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
          >
            <Lock className="h-3 w-3" />
            {checkoutFounder ? 'Founder Member' : 'Secure checkout'}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <AnimatePresence initial={false}>
          {phase === 'success' ? (
            <SuccessView
              key="success"
              info={info}
              price={total}
              currency={currency}
              onContinue={() => {
                if (user) {
                  const target =
                    user.role === 'patient'
                      ? 'patient'
                      : user.role === 'doctor'
                        ? 'doctor'
                        : user.role === 'lab'
                          ? 'lab'
                          : user.role === 'admin'
                            ? 'admin'
                            : 'caretaker';
                  router.push(`/${target}`);
                } else {
                  router.push('/login');
                }
              }}
            />
          ) : (
            <motion.div
              key="checkout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-8 lg:grid-cols-5"
              suppressHydrationWarning
            >
              {/* Form */}
              <div className="lg:col-span-3">
                <FadeIn>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Checkout</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You're upgrading to the{' '}
                    <span className="font-semibold text-foreground">{info.name}</span> plan.
                  </p>
                </FadeIn>

                <Card className="mt-6 border-emerald-500/20">
                  <CardContent className="space-y-5 p-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={phase === 'processing'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Name on card</Label>
                      <Input
                        id="name"
                        placeholder="John Smith"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        disabled={phase === 'processing'}
                      />
                    </div>

                    <StripePaymentSection
                      email={email}
                      name={name}
                      total={total}
                      currency={currency}
                      tier={tier}
                      info={info}
                      onCreateIntent={createPaymentIntent}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      disabled={phase === 'processing'}
                    />
                  </CardContent>
                </Card>

                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Use <span className="font-mono">4242 4242 4242 4242</span> · any future date · any
                  CVC for the demo.
                </p>
              </div>

              {/* Order summary */}
              <div className="lg:col-span-2">
                <FadeIn delay={0.1}>
                  <Card className="sticky top-24 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-teal-500/5">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Kynthai {info.name}</p>
                          <p className="text-xs text-muted-foreground">{info.tagline}</p>
                        </div>
                      </div>

                      <Separator className="my-5" />

                      <dl className="space-y-2 text-sm">
                        <div className="flex items-center justify-between text-base font-semibold">
                          <dt>Plan price</dt>
                          <dd>{formatPrice(total, currency)}/month</dd>
                        </div>
                        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                          <dt>Renews</dt>
                          <dd>Monthly · cancel anytime</dd>
                        </div>
                        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                          <dt>Note</dt>
                          <dd>Doctor consults charged separately</dd>
                        </div>
                      </dl>

                      <Separator className="my-5" />

                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        What's included
                      </p>
                      <ul className="mt-3 space-y-2">
                        {info.features.map(f => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </FadeIn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SuccessView({
  info,
  price,
  currency,
  onContinue,
}: {
  info: TierInfo;
  price: number;
  currency: Currency;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto max-w-md text-center"
      suppressHydrationWarning
    >
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.1 }}
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-600/30"
        suppressHydrationWarning
      >
        <CheckCircle2 className="h-9 w-9" />
      </motion.div>

      <Badge
        variant="secondary"
        className="mt-5 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        <PartyPopper className="h-3 w-3" />
        Payment successful
      </Badge>

      <h1 className="mt-3 text-3xl font-bold tracking-tight">Welcome to Kynthai {info.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Your subscription is active. All {info.name} features are now unlocked — sign in to start
        exploring.
      </p>

      <Card className="mt-6 border-emerald-500/20 text-left">
        <CardContent className="space-y-2 p-5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-semibold">Kynthai {info.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-semibold">{formatPrice(price, currency)} / month</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Receipt</span>
            <span className="font-mono text-xs">
              #SHY-{useMemo(() => safeReceiptId(), [])}
            </span>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={onContinue}
        className="mt-6 w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25 hover:from-emerald-600 hover:to-teal-700"
      >
        Sign in to your account
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* StripePaymentSection — wraps Stripe Elements inside the form      */
/* ------------------------------------------------------------------ */
type StripePaymentSectionProps = {
  email: string;
  name: string;
  total: number;
  currency: string;
  tier: 'plus' | 'family_pro';
  info: TierInfo;
  onCreateIntent: () => Promise<{ clientSecret: string; paymentId: string } | null>;
  onSuccess: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

function StripePaymentSection({
  email,
  name,
  total,
  currency,
  tier,
  info,
  onCreateIntent,
  onSuccess,
  onError,
  disabled,
}: StripePaymentSectionProps) {
  const [cs, setCs] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function init() {
      const result = await onCreateIntent();
      if (!cancelled && result) setCs(result.clientSecret);
      if (!cancelled) setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [onCreateIntent]);

  if (disabled) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <span className="ml-2 text-sm text-muted-foreground">Initializing secure payment…</span>
      </div>
    );
  }

  if (!cs) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Unable to initialize payment. Please try again or contact support.
      </div>
    );
  }

  return (
    <StripeCardElement
      clientSecret={cs}
      onSuccess={onSuccess}
      onError={onError}
      disabled={!!disabled}
    />
  );
}
