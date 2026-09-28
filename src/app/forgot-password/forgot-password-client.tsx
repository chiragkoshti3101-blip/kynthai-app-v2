'use client'


import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { KynthaiBrand } from '@/components/kynthai/logo'
import { FadeIn } from '@/components/kynthai/animations'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export default function ForgotPasswordClient() {
  const router = useRouter()
  const { toast } = useToast()
  const [email, setEmail] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to request reset')
      setSent(true)
      toast({ title: 'Reset link sent', description: 'If an account exists, a reset link has been sent to your email.' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Something went wrong', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

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
                  <Button variant="ghost" size="icon" onClick={() => router.push('/login')} className="h-11 w-11">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h1 className="text-lg font-semibold">Forgot password?</h1>
                </div>
                {sent ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                    If an account exists with that email, a password reset link has been sent. Please check your inbox.
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Enter the email associated with your account and we&apos;ll send you a reset link.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                    <Button type="submit" className="min-h-11 w-full" disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                      Send reset link
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </div>
    </ErrorBoundary>
  )
}
