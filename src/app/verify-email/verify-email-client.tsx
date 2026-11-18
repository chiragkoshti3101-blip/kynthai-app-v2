'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2, Mail, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { KynthaiBrand } from '@/components/kynthai/logo'
import { FadeIn } from '@/components/kynthai/animations'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

type VerificationStatus = {
  email: string
  emailVerified: boolean
  phoneVerified: boolean
  identityConfirmed: boolean
  verificationLevel: string
}

export default function VerifyEmailClient() {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<VerificationStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/users/verify', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const resend = async () => {
    if (!status?.email) return
    setSending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: status.email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not send the verification email')
      }
      setSent(true)
      toast({
        title: 'Verification email sent',
        description: 'If the address needs confirming, a new link is on its way.',
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const verified = status?.emailVerified === true

  return (
    <ErrorBoundary>
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20 p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <KynthaiBrand iconSize={32} />
          </div>
          <FadeIn>
            <Card className="border-border/60">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Button variant="ghost" size="icon" asChild className="h-11 w-11">
                    <Link href="/patient" aria-label="Back to dashboard">
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                  <h1 className="text-lg font-semibold">Verify your email</h1>
                </div>

                {loading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking your verification status…
                  </p>
                ) : !status ? (
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      Sign in to see your verification status and resend the confirmation email.
                    </p>
                    <Button asChild className="w-full">
                      <Link href="/login">Go to sign in</Link>
                    </Button>
                  </div>
                ) : verified ? (
                  <div className="space-y-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> {status.email} is confirmed
                    </p>
                    <p className="text-muted-foreground">
                      You can join video consultations. Identity confirmation (phone and ID) is
                      requested separately when a consultation needs it.
                    </p>
                    <Button asChild className="w-full">
                      <Link href="/patient">Back to dashboard</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 text-sm">
                    <p className="flex items-start gap-2 text-muted-foreground">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Confirm <strong className="text-foreground">{status.email}</strong> to join
                        video consultations. Open the link we emailed you — it stays tied to this
                        account.
                      </span>
                    </p>
                    {sent && (
                      <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-emerald-700 dark:text-emerald-300">
                        <MailCheck className="h-4 w-4" /> A new verification link has been sent.
                      </p>
                    )}
                    <Button onClick={resend} disabled={sending} className="w-full">
                      {sending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        'Resend verification email'
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Nothing arriving? Check spam, or confirm the address in your account settings
                      if it is out of date.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </div>
    </ErrorBoundary>
  )
}
