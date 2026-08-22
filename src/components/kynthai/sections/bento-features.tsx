'use client';

import React from 'react';
import {
  Sparkles,
  Bell,
  Video,
  Camera,
  ShoppingBag,
  FlaskConical,
  Users,
  TrendingUp,
  ScanSearch,
  Microscope,
  Bot,
  AlertTriangle,
  Pill,
  Languages,
  Accessibility,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const AI_FEATURE_COUNT = 10;

/* ------------------------------------------------------------------ */
/* SmallFeature — reusable card for individual bento items              */
/* ------------------------------------------------------------------ */
export function SmallFeature({
  icon: Icon,
  title,
  body,
  accent,
  wide,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  accent: string;
  wide?: boolean;
}) {
  const DynamicIcon = Icon;
  return (
    <div className={wide ? 'h-full' : undefined}>
      <Card className="group h-full border-border/60 bg-card/80 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-500/25 hover:shadow-lg hover:shadow-emerald-900/5">
        <CardContent className={cn('p-5 sm:p-6', wide && 'flex h-full flex-col justify-between')}>
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform duration-200 group-hover:scale-110',
              accent
            )}
          >
            <DynamicIcon className="h-[18px] w-[18px]" />
          </div>
          <h3 className="mt-3 text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bento features                                                      */
/* ------------------------------------------------------------------ */
export function BentoFeatures() {
  return (
    <section
      id="bento-features"
      className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-20"
    >
      {/* Section background accent */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at center, rgba(16,185,129,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="mx-auto max-w-2xl text-center">
        <Badge
          variant="secondary"
          className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
        >
          Everything in one app
        </Badge>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="text-emerald-600">{AI_FEATURE_COUNT} AI features</span>, zero clutter.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Ask, snap, type — Kynthai turns everyday moments into safer, better-coordinated care for
          the people you love.
        </p>
      </div>

      <div className="mt-6 grid gap-2 sm:gap-4 md:grid-cols-6 lg:grid-cols-12 lg:gap-5">
        {/* Big AI chat card */}
        <div className="md:col-span-6 lg:col-span-7">
          <div className="h-full">
            <Card className="relative h-full overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-teal-500/5">
              <div
                className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full opacity-40 blur-3xl"
                style={{
                  background:
                    'radial-gradient(closest-side, rgba(16,185,129,0.5), transparent 70%)',
                }}
              />
              <CardContent className="flex flex-col gap-3 p-4 sm:p-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30 sm:h-11 sm:w-11">
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold sm:text-xl">AI Health Assistant</h3>
                  <p className="mt-1 text-xs text-muted-foreground sm:mt-1.5 sm:text-sm">
                    Ask about medicines, side effects, interactions and timing. Get answers in plain
                    language — with text output.
                  </p>
                </div>
                <div className="mt-2 rounded-2xl border border-border/60 bg-background/70 p-4">
                  <p className="text-xs text-muted-foreground">You</p>
                  <p className="mt-0.5 text-xs sm:text-sm">Can I take this medicine with food?</p>
                  <div className="mt-2 flex items-start gap-2 sm:mt-3">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 text-emerald-600 sm:h-4 sm:w-4" />
                    <p className="text-xs sm:text-sm">
                      Some medicines are easier on the stomach when taken with food. Always follow
                      your doctor&apos;s instructions or the label.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 sm:gap-2">
                  {['Text input', 'Text replies', 'Markdown', 'History'].map(t => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] sm:text-xs"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right column small cards */}          <div className="grid gap-2 sm:gap-4 md:col-span-6 lg:col-span-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <SmallFeature
              icon={Bell}
              title="Smart Reminders"
              body="Adaptive schedules with snooze & streaks."
              accent="from-emerald-500 to-emerald-600"
            />
            <SmallFeature
              icon={Video}
              title="Video Consults"
              body="Book consultations with reviewed practitioners when available."
              accent="from-teal-500 to-teal-600"
            />
            <SmallFeature
              icon={Camera}
              title="Identify Meds"
              body="Snap a pill — AI suggests what it might be (informational only, not a diagnosis)."
              accent="from-emerald-500 to-teal-600"
            />
            <SmallFeature
              icon={ShoppingBag}
              title="Order Medicines"
              body="Track medicines and refills in one place."
              accent="from-teal-500 to-emerald-600"
            />
          </div>
          <SmallFeature
            wide
            icon={FlaskConical}
            title="Lab Tests at Home"
            body="Book lab tests when partners are available. Results can appear in your dashboard for you to share."
            accent="from-emerald-600 to-teal-700"
          />
        </div>

        {/* Interactions wide card */}
        <div className="md:col-span-6 lg:col-span-7">
          <Card className="h-full border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-card to-emerald-500/5">
            <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:p-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-600/30 sm:h-11 sm:w-11">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold sm:text-xl">Drug & Food Interactions</h3>
                <p className="mt-1 text-xs text-muted-foreground sm:mt-1.5 sm:text-sm">
                  Kynthai cross-checks every active medication for drug-drug, drug-food and timing
                  conflicts — with severity tags and suggested alternatives (informational only, not
                  medical advice).
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-amber-500/30 text-amber-700 dark:text-amber-300"
              >
                Auto-checked
              </Badge>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-6 lg:col-span-5">
          <Card className="h-full border-emerald-500/20">
            <CardContent className="p-4 sm:p-8">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 sm:h-10 sm:w-10">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-base font-semibold sm:text-lg">Family Care Hub</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground sm:mt-3 sm:text-sm">
                Manage up to 4 family members from a single dashboard. Caretakers get live adherence
                updates, missed-dose alerts and weekly AI insights.
              </p>
                <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
                {['Alex', 'Jordan', 'You', 'Sam'].map((m, i) => (
                  <div
                    key={m}
                    className="rounded-xl border border-border/60 bg-card p-2 text-center"
                  >
                    <div
                      className="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{
                        background: `linear-gradient(135deg, hsl(${160 + i * 10} 70% 45%), hsl(${175 + i * 6} 70% 40%))`,
                      }}
                    >
                      {m[0]}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{m}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-6 lg:col-span-5">
          <Card className="h-full border-emerald-500/20">
            <CardContent className="p-4 sm:p-8">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 sm:h-10 sm:w-10">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-base font-semibold sm:text-lg">AI Health Insights</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground sm:mt-3 sm:text-sm">
                Weekly adherence trends, strengths, concerns, and personalised recommendations.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-6 lg:col-span-7">
          <Card className="h-full border-emerald-500/20">
            <CardContent className="p-4 sm:p-8">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 sm:h-10 sm:w-10">
                  <ScanSearch className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-base font-semibold sm:text-lg">Prescription Scanner</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground sm:mt-3 sm:text-sm">
                Scan a prescription — AI extracts every medication, dose, frequency, and
                instructions.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <Button
          variant="outline"
          size="lg"
          className="group rounded-full border-border/60 px-8 py-6 text-base hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all duration-200 hover:shadow-md"
          onClick={() =>
            document.getElementById('features-anchor')?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          See all features
          <ArrowRight
            className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Button>
      </div>
    </section>
  );
}
