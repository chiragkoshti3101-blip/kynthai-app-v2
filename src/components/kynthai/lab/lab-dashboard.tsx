'use client'

import * as React from 'react'
import { type AuthUser } from '@/lib/store'
import { KynthaiBrand } from '@/components/kynthai/logo'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CheckCircle2, ChevronDown, LayoutGrid, CalendarCheck, FlaskConical,
  LogOut, User, ClipboardList, DollarSign, Clock, TrendingUp, Upload,
  CheckCircle, XCircle, CircleDashed, Loader2,
  MapPin, Home,
} from 'lucide-react'
import { OfflineIndicator } from '@/components/kynthai/offline-indicator'
import { NotificationCenter } from '@/components/kynthai/notification-center'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { LAB_BASE_FEE_PCT } from '@/lib/commission'
import { useRouter } from 'next/navigation'
import { ProfileHub } from '@/components/kynthai/patient/profile-hub'
import { LoadingState } from '@/components/kynthai/loading-state'

type LabTab = 'overview' | 'bookings' | 'results'

interface BookingRow {
  id: string
  patientName: string
  patientEmail?: string
  tests: { name: string; price: number }[]
  scheduledAt: string
  status: string
  price: number
  commission: number
  homeCollection: boolean
  deliveryDistanceKm?: number | null
  deliveryFee?: number
  deliveryQuoteAccepted?: boolean
  deliveryPricingSource?: string
  hasResultsFile?: boolean
}

interface LabDashboardProps {
  user: AuthUser
  profile: {
    id: string
    labName: string
    city: string
    verified: boolean
    homeCollection: boolean
    longDistanceTravelFeeCents?: number | null
  }
  onLogout: () => void
}

const STATUS_CFG: Record<string, { label: string; icon: any; bg: string; color: string }> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    bg: 'bg-amber-50/60 dark:bg-amber-950/30',
    color: 'text-amber-700 dark:text-amber-300',
  },
  sample_collected: {
    label: 'Sample collected',
    icon: FlaskConical,
    bg: 'bg-blue-50/60 dark:bg-blue-950/30',
    color: 'text-blue-700 dark:text-blue-300',
  },
  confirmed: {
    label: 'Confirmed',
    icon: CalendarCheck,
    bg: 'bg-sky-50/60 dark:bg-sky-950/30',
    color: 'text-sky-700 dark:text-sky-300',
  },
  processing: {
    label: 'Processing',
    icon: Loader2,
    bg: 'bg-violet-50/60 dark:bg-violet-950/30',
    color: 'text-violet-700 dark:text-violet-300',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    bg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    color: 'text-emerald-700 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    bg: 'bg-rose-50/60 dark:bg-rose-950/30',
    color: 'text-rose-700 dark:text-rose-300',
  },
}

// Demo commissions use the same 18% platform fee as production (LAB_BASE_FEE_PCT)
// so the demo dashboard never shows stale 15% numbers.
const DEMO_COMMISSION_PCT = LAB_BASE_FEE_PCT
const DEMO_BOOKINGS: BookingRow[] = [
  { id: 'demo_booking_1', patientName: 'Sarah Johnson', tests: [{ name: 'Complete Blood Count', price: 3500 }], scheduledAt: '2026-07-20T09:00:00Z', status: 'pending', price: 3500, commission: Math.round(3500 * DEMO_COMMISSION_PCT / 100), homeCollection: false },
  { id: 'demo_booking_2', patientName: 'James Carter', tests: [{ name: 'Lipid Panel', price: 4900 }], scheduledAt: '2026-07-22T14:00:00Z', status: 'sample_collected', price: 4900, commission: Math.round(4900 * DEMO_COMMISSION_PCT / 100), homeCollection: true },
  { id: 'demo_booking_3', patientName: 'Mia Carter', tests: [{ name: 'HbA1c', price: 3900 }, { name: 'Vitamin D', price: 4500 }], scheduledAt: '2026-07-25T10:30:00Z', status: 'completed', price: 8400, commission: Math.round(8400 * DEMO_COMMISSION_PCT / 100), homeCollection: false, hasResultsFile: true },
]

export function LabDashboard({ user, profile, onLogout }: LabDashboardProps) {
  const router = useRouter()
  const isDemoAccount = user.isDemo || user.email?.endsWith('@kynthai.app') || false
  const [labOnline, setLabOnline] = React.useState(true)
  const [tab, setTab] = React.useState<LabTab>('overview')
  const [profileOpen, setProfileOpen] = React.useState(false)
  const [hubOpen, setHubOpen] = React.useState(false)
  const profileRef = React.useRef<HTMLDivElement>(null)

  const [stats, setStats] = React.useState<{bookingsTotal:number;pending:number;completed:number;revenue:number}|null>(null)
  const [bookings, setBookings] = React.useState<BookingRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const [notes, setNotes] = React.useState('')
  const [resultFile, setResultFile] = React.useState<File|null>(null)
  const [uploadingFor, setUploadingFor] = React.useState<string|null>(null)
  const [travelQuoteDollars, setTravelQuoteDollars] = React.useState(
    profile.longDistanceTravelFeeCents ? (profile.longDistanceTravelFeeCents / 100).toFixed(2) : '',
  )
  const [savingTravelQuote, setSavingTravelQuote] = React.useState(false)

  const { toast } = useToast()

  const tabs: {id: LabTab; label: string; icon: any}[] = [
    {id: 'overview', label: 'Overview', icon: LayoutGrid},
    {id: 'bookings', label: 'Bookings', icon: CalendarCheck},
    {id: 'results',  label: 'Results',  icon: FlaskConical},
  ]

  const fetchData = React.useCallback(async () => {
    // Demo mode: use sample data directly — skip API calls that fail without a real DB
    if (isDemoAccount) {
      // Mirror the production /api/labs/dashboard calc: revenue = Σ(price + travel − commission) over completed
      setStats({
        bookingsTotal: DEMO_BOOKINGS.length,
        pending: DEMO_BOOKINGS.filter((b) => b.status === 'pending').length,
        completed: DEMO_BOOKINGS.filter((b) => b.status === 'completed').length,
        revenue: DEMO_BOOKINGS.filter((b) => b.status === 'completed').reduce((s, b) => s + b.price - b.commission, 0),
      })
      setBookings(DEMO_BOOKINGS)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const [dr, br] = await Promise.all([
        fetch('/api/labs/dashboard').catch(() => null),
        fetch('/api/lab-bookings').catch(() => null),
      ])
      if (dr?.ok) {
        const d = await dr.json()
        setStats({bookingsTotal: d.stats?.bookingsTotal ?? 0, pending: d.stats?.pending ?? 0, completed: d.stats?.completed ?? 0, revenue: d.stats?.revenue ?? 0})
      }
      if (br?.ok) {
        const b = await br.json()
        const list = Array.isArray(b) ? b : Array.isArray(b?.data) ? b.data : Array.isArray(b?.bookings) ? b.bookings : []
        setBookings(list)
      }
    } catch {
      toast({title: 'Failed to load data', variant: 'destructive'})
    } finally { setLoading(false) }
  }, [toast, isDemoAccount])

  React.useEffect(() => { fetchData() }, [fetchData])

  const saveTravelQuote = async () => {
    if (isDemoAccount) {
      toast({ title: 'Demo profile is read-only', description: 'Use a real lab account to set travel pricing.' })
      return
    }
    const trimmed = travelQuoteDollars.trim()
    const cents = trimmed === '' ? null : Math.round(Number(trimmed) * 100)
    if (cents !== null && (!Number.isFinite(cents) || cents < 100 || cents > 1000000)) {
      toast({ title: 'Invalid provider quote', description: 'Enter a value from $1.00 to $10,000.00, or leave it blank to disable long-distance online booking.', variant: 'destructive' })
      return
    }
    setSavingTravelQuote(true)
    try {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' }).then(r => r.json()).then(d => d.token)
      const res = await fetch(`/api/labs/${profile.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
        body: JSON.stringify({ longDistanceTravelFeeCents: cents }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to save provider quote')
      setTravelQuoteDollars(data.longDistanceTravelFeeCents == null ? '' : (data.longDistanceTravelFeeCents / 100).toFixed(2))
      toast({ title: 'Travel pricing saved', description: cents === null ? 'Long-distance online bookings are now disabled until you add a quote.' : 'Patients will see and accept this quote at 5 km or more.' })
    } catch (error) {
      toast({ title: 'Travel pricing update failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setSavingTravelQuote(false)
    }
  }

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const updateBookingStatus = async (id: string, status: string) => {
    if (id.startsWith('demo-') || isDemoAccount) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
      toast({
        title: `Simulated: marked as ${STATUS_CFG[status]?.label ?? status}`,
        description: 'Demo session — changes are not persisted and reset on reload.',
      })
      return
    }
    try {
      const res = await fetch('/api/lab-bookings/' + id, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({status}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Update failed')
      }
      toast({title: 'Updated to ' + ((STATUS_CFG[status]?.label ?? status))})
      fetchData()
    } catch(e: any) { toast({title: e.message, variant: 'destructive'}) }
  }

  const uploadResults = async (bookingId: string) => {
    if (!resultFile) { toast({title: 'Select a file first', variant: 'destructive'}); return }
    try {
      setUploadingFor(bookingId)
      const fd = new FormData(); fd.append('file', resultFile)
      const ur = await fetch('/api/upload', {method: 'POST', body: fd})
      if (!ur.ok) throw new Error('File upload failed')
      const {fileToken} = await ur.json()
      const pr = await fetch('/api/lab-bookings/' + bookingId + '/results', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({resultsFile: fileToken, resultsNote: notes, status: 'completed'}),
      })
      if (!pr.ok) {
        const err = await pr.json().catch(() => ({}))
        throw new Error(err.error || 'Submit failed')
      }
      toast({title: 'Results uploaded — patient notified'})
      setNotes(''); setResultFile(null)
      fetchData()
      setTab('bookings')
    } catch(e: any) { toast({title: e.message, variant: 'destructive'}) }
    finally { setUploadingFor(null) }
  }

  // Wave-8: aligned with the server transition table in
  // /api/lab-bookings/[id] (pending→confirmed→sample_collected→completed).
  // The old machine skipped 'confirmed' entirely, so a fresh booking's
  // "Mark as Sample collected" always bounced off the server with 400
  // INVALID_STATUS_TRANSITION.
  const canAdvance = (s: string) => ['pending', 'confirmed', 'sample_collected'].includes(s)
  const nextStatus = (s: string) => s === 'pending' ? 'confirmed' : s === 'confirmed' ? 'sample_collected' : 'completed'

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format((n ?? 0) / 100)

  const statCard = (label: string, value: string, icon: any, accent: string) => (
    <div className={accent + ' overflow-hidden border-0 shadow-sm rounded-xl p-4 flex items-center gap-3'}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-white/10 shadow-sm">{icon}</div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
      </div>
    </div>
  )

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background pt-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <KynthaiBrand iconSize={32} />
          <div className="flex items-center gap-1">
            <NotificationCenter role="lab"
              userId={user.id}
              isDemo={!!user.isDemo || (user.email || '').endsWith('@kynthai.app')}
              onNavigate={(t: string) => {
                if (t === 'meds' || t === 'care') setTab('bookings')
                else setTab('overview')
              }}
            />
            <div className="relative" ref={profileRef}>
              <button onClick={() => setProfileOpen(o => !o)}
                aria-label="Profile"
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted">
                <Avatar className="h-10 w-10 ring-2 ring-emerald-500/20">
                  <AvatarFallback className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-semibold">
                    {(profile.labName?.[0] ?? 'L').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden sm:block">
                  <p className="text-xs text-muted-foreground leading-tight">{profile.city}</p>
                  <p className="text-sm font-semibold leading-tight truncate max-w-[160px]">{profile.labName}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
              </button>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border/60 bg-background shadow-xl shadow-black/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/40">
                      <p className="text-sm font-semibold">{profile.labName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{profile.city}</p>
                    </div>
                    <div className="p-1">
                      <button
                        onClick={() => { setProfileOpen(false); setHubOpen(true) }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <User className="h-4 w-4" /> Profile Hub
                      </button>
                      <button onClick={onLogout}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors">
                        <LogOut className="h-4 w-4" /> Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <OfflineIndicator />
            <Badge variant="secondary"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hidden sm:inline-flex">
              <CheckCircle2 className="h-3 w-3" /> Verified Lab
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl w-full flex-1 px-4 pt-safe pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        {/* Wave-8: honest demo banner — demo sessions were silently mutating
            local state with success toasts while nothing was persisted. */}
        {isDemoAccount && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
            Demo session — booking updates are simulated and reset on reload. No real data is changed.
          </div>
        )}
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {loading ? (
              <LoadingState label="Loading stats…" fullPage={false} />
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {statCard('Total bookings',  String(stats.bookingsTotal), <ClipboardList className="h-5 w-5 text-blue-600" />, 'bg-blue-50/60 dark:bg-blue-950/30')}
                  {statCard('Pending',         String(stats.pending),        <Clock className="h-5 w-5 text-amber-600" />,       'bg-amber-50/60 dark:bg-amber-950/30')}
                  {statCard('Completed',       String(stats.completed),      <CheckCircle className="h-5 w-5 text-emerald-600" />, 'bg-emerald-50/60 dark:bg-emerald-950/30')}
                  {statCard('Revenue (est.)',  fmtMoney(stats.revenue),     <DollarSign className="h-5 w-5 text-violet-600" />, 'bg-violet-50/60 dark:bg-violet-950/30')}
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-5">
                  <h2 className="text-base font-semibold mb-3">Welcome, {profile.labName}</h2>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {profile.city}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {profile.homeCollection ? 'Home collection' : 'In-lab only'}
                    </span>
                    {profile.verified && (
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="h-4 w-4" /> Verified
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold">Home-collection travel pricing</p>
                      <p className="mt-1 text-xs text-muted-foreground">Under 5 km is a fixed $8.00 patient charge. At 5 km or more, patients see and accept your quote before booking.</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="flex-1 space-y-1 text-xs font-medium">
                      <span>Your long-distance quote (USD)</span>
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        step="0.01"
                        inputMode="decimal"
                        value={travelQuoteDollars}
                        onChange={e => setTravelQuoteDollars(e.target.value)}
                        disabled={isDemoAccount || savingTravelQuote}
                        placeholder="e.g. 15.00"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={saveTravelQuote}
                      disabled={isDemoAccount || savingTravelQuote}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {savingTravelQuote ? 'Saving…' : 'Save quote'}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Leave blank to stop online long-distance bookings. The platform keeps no hard-coded $15/$30 tiers.</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card">
                  <div className="px-5 py-4 border-b border-border/40">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-600" /> Recent bookings
                    </p>
                  </div>
                  <div className="px-5 py-5">
                    {bookings.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No bookings yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {bookings.slice(0, 5).map(b => {
                          const cfg = (STATUS_CFG[b.status] as any) ?? STATUS_CFG['pending']
                          const SIcon = cfg.icon
                          return (
                            <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{b.patientName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(b.tests ?? []).map((t: any) => t?.name).filter(Boolean).join(', ') || 'No tests listed'} · {fmtDateTime(b.scheduledAt)}
                                </p>
                              </div>
                              <span className={cn('shrink-0 gap-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs', cfg.bg, cfg.color)}>
                                <SIcon className="h-3 w-3 mr-1" /> {cfg.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
                No stats available yet.
              </div>
            )}
          </div>
        )}

        {/* BOOKINGS */}
        {tab === 'bookings' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Bookings</h2>
              <Badge variant="secondary" className="text-[10px]">{bookings.length} total</Badge>
            </div>
            {loading ? (
              <LoadingState label="Loading bookings…" fullPage={false} />
            ) : bookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center">
                <CalendarCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm font-medium">No bookings yet</p>
                <p className="text-xs text-muted-foreground mt-1">New patient bookings will show up here.</p>
              </div>
            ) : (
              bookings.map(b => {
                const cfg = (STATUS_CFG[b.status] as any) ?? STATUS_CFG['pending']
                const SIcon = cfg.icon
                const advance = canAdvance(b.status)
                return (
                  <div key={b.id} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{b.patientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {(b.tests ?? []).map((t: any) => t?.name).filter(Boolean).join(', ') || 'No tests listed'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtDateTime(b.scheduledAt)}
                          {b.homeCollection ? ' · Home collection' : ' · In-lab'}
                          {b.homeCollection && b.deliveryDistanceKm != null ? ` · ${b.deliveryDistanceKm} km · travel ${fmtMoney(b.deliveryFee ?? 0)}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <p className="text-sm font-semibold">{fmtMoney(b.price + (b.deliveryFee ?? 0))}</p>
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
                          <SIcon className="h-3 w-3" /> {cfg.label}
                        </span>
                      </div>
                    </div>
                    {advance && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateBookingStatus(b.id, nextStatus(b.status))}
                          className="flex-1 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          Mark as {STATUS_CFG[nextStatus(b.status)]?.label ?? nextStatus(b.status)}
                        </button>
                        {(b.status === 'pending' || b.status === 'confirmed') && (
                          <button
                            onClick={() => updateBookingStatus(b.id, 'cancelled')}
                            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* RESULTS */}
        {tab === 'results' && (
          <div className="space-y-4">
            {bookings.filter(b => ['sample_collected', 'processing', 'pending'].includes(b.status)).length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
                All results have been uploaded. No pending tests.
              </div>
            ) : (
              bookings.filter(b => ['sample_collected', 'processing', 'pending'].includes(b.status)).map(b => {
                const cfg = (STATUS_CFG[b.status] as any) ?? STATUS_CFG['pending']
                const SIcon = cfg.icon
                const done = !!b.hasResultsFile || b.status === 'completed'
                const inputId = 'res-' + b.id
                return (
                  <div key={b.id} className={"rounded-xl border border-border/60 bg-card p-4 space-y-3" + (done ? ' opacity-70' : '')}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{b.patientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {(b.tests ?? []).map((t: any) => t?.name).filter(Boolean).join(', ') || '—'} · {fmtDateTime(b.scheduledAt)}
                        </p>
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
                        <SIcon className="h-3 w-3" /> {cfg.label}
                      </span>
                    </div>
                    {done && (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                        <CheckCircle className="h-4 w-4" /> Results uploaded
                      </div>
                    )}
                    {!done && (
                      <div className="space-y-2">
                        <textarea
                          placeholder="Add results notes..."
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          disabled={uploadingFor !== null}
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60 resize-none"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <label className={cn('flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs cursor-pointer transition-colors',
                            resultFile ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-600' : 'border-border hover:border-emerald-500/40 text-muted-foreground',
                            uploadingFor !== null && 'opacity-50 pointer-events-none'
                          )}>
                            <Upload className="h-4 w-4" />
                            {resultFile ? resultFile.name : 'Attach PDF/JPG/PNG'}
                            <input id={inputId} type="file"
                              accept="application/pdf,image/jpeg,image/png"
                              disabled={uploadingFor !== null}
                              className="hidden"
                              onChange={e => setResultFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                          <button
                            onClick={() => uploadResults(b.id)}
                            disabled={uploadingFor !== null || !resultFile}
                            className="ml-auto inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {uploadingFor === b.id ? 'Uploading...' : 'Upload results'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )
          }
        </div>
      )}
    </main>

    <nav aria-label="Lab portal navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-safe">
      <div className="mx-auto flex max-w-3xl items-center justify-around gap-1 px-4 py-2">
        {tabs.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-20 flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-all sm:min-w-24 sm:flex-none sm:flex-row sm:justify-center sm:gap-1.5 sm:text-sm',
                active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                       : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>
    </nav>

    {/* Minimal legal footer */}
    <ProfileHub
      open={hubOpen}
      onOpenChange={setHubOpen}
      user={user}
      onLogout={onLogout}
      onShowPricing={() => router.push('/pricing')}
      onShowPrivacy={() => router.push('/privacy')}
      onOpenSettings={() => router.push('/settings')}
      professionalProfile={profile}
    />
  </div>
  )
}
