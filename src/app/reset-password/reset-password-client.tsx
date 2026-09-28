'use client'


import * as React from 'react'
import { Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { KynthaiBrand } from '@/components/kynthai/logo'
import { FadeIn } from '@/components/kynthai/animations'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export default function ResetPasswordClient() {
  const { toast } = useToast()
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)

  // Read token from URL query param
  const [token, setToken] = React.useState('')
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setToken(params.get('token') || '')
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset password')
      setDone(true)
      toast({ title: 'Password reset', description: 'Your password has been updated. You can now log in.' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Something went wrong', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <ErrorBoundary>
        <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20 p-4">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex justify-center">
              <KynthaiBrand iconSize={32} />
            </div>
            <FadeIn>
              <Card className="border-border/60">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Invalid or missing reset token. Please request a new reset link.
                </CardContent>
              </Card>
            </FadeIn>
          </div>
        </div>
      </ErrorBoundary>
    )
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
                  <h1 className="text-lg font-semibold">Reset password</h1>
                </div>
                {done ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                    Password updated successfully. You can now log in.
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Choose a new password for your account.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="password">New password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required
                        minLength={8}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm">Confirm password</Label>
                      <Input
                        id="confirm"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repeat new password"
                        required
                        minLength={8}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                      Update password
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
