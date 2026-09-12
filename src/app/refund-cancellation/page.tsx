'use client'

import * as React from 'react'
import { ContactEmail, ContactEmailText } from '@/components/kynthai/contact-email'
import {
  ArrowLeft,
  ShieldCheck,
  Mail,
  Clock,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { KynthaiBrand } from '@/components/kynthai/logo'
import {
  DOCTOR_BASE_FEE_PCT,
  LAB_BASE_FEE_PCT,
  PAYOUT_POLICY,
} from '@/lib/commission'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export default function RefundCancellationPage() {
  const router = useRouter()

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => window.history.length > 1 ? window.history.back() : router.push('/')}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Kynthai
            </button>
            <KynthaiBrand />
            <Button
              size="sm"
              onClick={() => router.push('/login')}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
            >
              Sign in
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <Badge variant="secondary" className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" /> Legal
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Refund & Cancellation Policy
          </h1>
          <p className="mt-2 text-muted-foreground">
            Clear, fair terms for subscriptions, consultations, lab tests, and partner payouts.
            Last updated: July 13, 2026.
          </p>

          {/* Request a refund CTA */}
          <Card className="mt-8 border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-emerald-500/5">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <Mail className="h-6 w-6" />
              </span>
              <div className="flex-1">
                <h3 className="font-semibold">Need a refund?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Email us at <ContactEmailText address="privacy@kynthai.app" className="font-medium text-foreground" /> with your account email and reason.
                  Eligible refund requests are reviewed and processed within 10 business days.
                </p>
              </div>
              <ContactEmail
                address="privacy@kynthai.app"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Email Support
              </ContactEmail>
            </CardContent>
          </Card>

          {/* Policies */}
          <div className="mt-10 space-y-8 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-foreground">1. Subscriptions</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Free plans may be cancelled anytime.</li>
                <li>Paid plans renew automatically unless cancelled before the renewal date.</li>
                <li>Cancellation takes effect at the end of the current billing period; unused subscription time is not automatically prorated.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">2. Consultations</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Full refund if cancelled more than 24 hours before the appointment.</li>
                <li>No refund for no-shows.</li>
                <li>Partial refund for technical issues on either side.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">3. Lab Tests</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Refunds only before sample collection.</li>
                <li>Lab processing fees are non-refundable once collected.</li>
                <li>Delayed results may qualify for store credit.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">4. Partner Payouts</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Doctor/Lab partner payouts follow <span className="font-medium text-foreground">{DOCTOR_BASE_FEE_PCT}% / {LAB_BASE_FEE_PCT}%</span> split.</li>
                <li>Payouts are processed monthly.</li>
                <li>Chargebacks reduce the next payout cycle.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">5. General</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>All disputes are governed by Wyoming law, US jurisdiction.</li>
                <li>Contact <ContactEmailText address="privacy@kynthai.app" className="font-medium text-foreground" /> for escalation.</li>
              </ul>
            </section>
          </div>

          <footer className="mt-12 border-t border-border/60 pt-6 text-xs text-muted-foreground">
            Last updated: July 13, 2026. Kynthai Health Technologies
          </footer>
        </div>
      </div>
    </ErrorBoundary>
  )
}
