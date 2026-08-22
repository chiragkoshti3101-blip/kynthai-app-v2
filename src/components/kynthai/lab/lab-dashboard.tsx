'use client'

import * as React from 'react'
import { useAppStore, type AuthUser } from '@/lib/store'
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
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { LAB_BASE_FEE_PCT } from '@/lib/commission'
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
  hasResultsFile?: boolean
}

interface LabDashboardProps {
  user: AuthUser
  profile: {
    labName: string
    city: string
    verified: boolean
    homeCollection: boolean
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
  { id: 'demo-b1', patientName: 'Sarah Johnson', tests: [{ name: 'Complete Blood Count', price: 3500 }], scheduledAt: '2026-07-20T09:00:00Z', status: 'pending', price: 3500, commission: Math.round(3500 * DEMO_COMMISSION_PCT / 100), homeCollection: false },
  { id: 'demo-b2', patientName: 'James Carter', tests: [{ name: 'Lipid Panel', price: 4900 }], scheduledAt: '2026-07-22T14:00:00Z', status: 'sample_collected', price: 4900, commission: Math.round(4900 * DEMO_COMMISSION_PCT / 100), homeCollection: true },
  { id: 'demo-b3', patientName: 'Mia Carter', tests: [{ name: 'HbA1c', price: 3900 }, { name: 'Vitamin D', price: 4500 }], scheduledAt: '2026-07-25T10:30:00Z', status: 'completed', price: 8400, commission: Math.round(8400 * DEMO_COMMISSION_PCT / 100), homeCollection: false, hasResultsFile: true },
]

export function LabDashboard({ user, profile, onLogout }: LabDashboardProps) {
  const [labOnline, setLabOnline] = React.useState(true)
  const [tab, setTab] = React.useState<LabTab>('overview')
  const [profileOpen, setProfileOpen] = React.useState(false)
  const profileRef = React.useRef<HTMLDivElement>(null)

  const [stats, setStats] = React.useState<{bookingsTotal:number;pending:number;completed:number;revenue:number}|null>(null)
  const [bookings, setBookings] = React.useState<BookingRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const [notes, setNotes] = React.useState('')
  const [resultFile, setResultFile] = React.useState<File|null>(null)
  const [uploadingFor, setUploadingFor] = React.useState<string|null>(null)

  const { toast } = useToast()

  const tabs: {id: LabTab; label: string; icon: any}[] = [
    {id: 'overview', label: 'Overview', icon: LayoutGrid},
    {id: 'bookings', label: 'Bookings', icon: CalendarCheck},
    {id: 'results',  label: 'Results',  icon: FlaskConical},
  ]

  const fetchData = React.useCallback(async () => {
    // Demo mode: use sample data directly — skip API calls that fail without a real DB
    if (user.isDemo || user.email?.endsWith('@kynthai.app')) {
      // Mirror the production /api/labs/dashboard calc: revenue = Σ(price − commission) over completed
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
      if (br?.ok) { const b = await br.json(); setBookings(Array.isArray(b) ? b : []) }
    } catch {
      toast({title: 'Failed to load data', variant: 'destructive'})
    } finally { setLoading(false) }
  }, [toast, user.isDemo, user.email])

  React.useEffect(() => { fetchData() }, [fetchData])

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const updateBookingStatus = async (id: string, status: string) => {
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

  const canAdvance = (s: string) => ['pending', 'sample_collected'].includes(s)
  const nextStatus = (s: string) => s === 'pending' ? 'sample_collected' : 'completed'

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})

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
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/70 pt-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <KynthaiBrand iconSize={32} />
          <div className="flex items-center gap-1">
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
                      <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
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

      {/* tab bar */}
      <div className="sticky top-16 z-20 border-b border-border/40 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl gap-1 px-4 py-1.5">
          {tabs.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                         : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <main className="mx-auto max-w-3xl w-full flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
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
                                  {(b.tests ?? []).map((t: any) => t?.name).filter(Boolean).join(', ') || 'No tests listed'} · {fmtDate(b.scheduledAt)}
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
            <p className="text-sm text-muted-foreground">Bookings module available.</p>
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
                          {(b.tests ?? []).map((t: any) => t?.name).filter(Boolean).join(', ') || '—'} · {fmtDate(b.scheduledAt)}
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

    {/* Minimal legal footer */}
  </div>
  )
}
