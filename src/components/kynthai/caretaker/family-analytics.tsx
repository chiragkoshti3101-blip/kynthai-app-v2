'use client'

import { isDemoEnabled } from '@/lib/demo-mode'
/**
 * FamilyAnalytics — Cross-member analytics for caretakers.
 *
 * Pulls GET /api/family/analytics and renders:
 *   - 4 stat cards (family adherence, total meds, members, needs attention)
 *   - 7-day family adherence line chart
 *   - Member comparison bar chart
 *   - "Needs Attention" section (members < 60% adherence or no meds today)
 *   - All-members breakdown list
 */

import * as React from 'react'
import {
  Activity,
  Pill,
  Users,
  AlertTriangle,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Flame,
  Calendar,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  Cell,
} from 'recharts'
import { cn } from '@/lib/utils'
import { LoadingState } from '@/components/kynthai/loading-state'

// ---------------------------------------------------------------------------
// Types — mirror the shape returned by /api/family/analytics
// ---------------------------------------------------------------------------

interface MemberDay {
  date: string
  total: number
  taken: number
  adherence: number
}

interface FamilyMember {
  id: string
  name: string
  relation: string
  color: string
  medications: number
  weekTotal: number
  weekTaken: number
  adherence: number
  perDay: MemberDay[]
  conditions: unknown[]
}

interface AnalyticsResponse {
  family: { id: string; name: string }
  members: FamilyMember[]
  overallAdherence: number
  totalMedications: number
  days: string[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FamilyAnalytics() {
  const [data, setData] = React.useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const isDemoMode = isDemoEnabled();

    // Demo mode: return seeded data without backend call
    if (isDemoMode) {
      const demoData: AnalyticsResponse = {
        family: { id: 'demo-family', name: 'Demo Family' },
        members: [
          {
            id: 'fm1',
            name: 'Robert Wilson',
            relation: 'Father',
            color: 'emerald',
            medications: 4,
            weekTotal: 28,
            weekTaken: 24,
            adherence: 85,
            perDay: Array(7).fill(null).map((_, i) => ({ date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0]!, total: 4, taken: 3 + (i % 2), adherence: 75 + (i % 3) * 5 })),
            conditions: ['Hypertension'],
          },
          {
            id: 'fm2',
            name: 'Emma Wilson',
            relation: 'Mother',
            color: 'teal',
            medications: 2,
            weekTotal: 14,
            weekTaken: 11,
            adherence: 78,
            perDay: Array(7).fill(null).map((_, i) => ({ date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0]!, total: 2, taken: 1 + (i % 2), adherence: 50 + (i % 4) * 10 })),
            conditions: ['Thyroid'],
          },
          {
            id: 'fm3',
            name: 'Noah Wilson',
            relation: 'Child',
            color: 'cyan',
            medications: 1,
            weekTotal: 7,
            weekTaken: 7,
            adherence: 100,
            perDay: Array(7).fill(null).map((_, i) => ({ date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0]!, total: 1, taken: 1, adherence: 100 })),
            conditions: [],
          },
        ],
        overallAdherence: 84,
        totalMedications: 7,
        days: Array(7).fill(null).map((_, i) => new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0]!),
      }
      setData(demoData)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/family/analytics', { cache: 'no-store' })
      if (res.status === 404) {
        setError('No family found. Create a family first.')
        setData(null)
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const json = (await res.json()) as AnalyticsResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <LoadingState label="Loading analytics…" fullPage={false} />
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-semibold">{error}</p>
          <Button onClick={load} size="sm" variant="outline">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.members.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <Users className="h-8 w-8 text-emerald-600" />
          <p className="text-sm font-semibold">No family members yet</p>
          <p className="text-xs text-muted-foreground">
            Add family members to see cross-member analytics here.
          </p>
        </CardContent>
      </Card>
    )
  }

  const needsAttention = data.members.filter(
    (m) => m.adherence < 60 || (m.weekTotal > 0 && m.adherence < 80),
  )

  // 7-day line chart data: family avg per day.
  const lineData = data.days.map((d, i) => {
    const dayValues = data.members
      .map((m) => m.perDay[i]?.adherence ?? 0)
      .filter((v) => v > 0)
    const familyAvg = dayValues.length
      ? Math.round(dayValues.reduce((s, v) => s + v, 0) / dayValues.length)
      : 0
    return { date: d.slice(5), family: familyAvg }
  })

  // Bar chart data: per-member 7-day adherence.
  const barData = data.members.map((m) => ({
    name: m.name.split(' ')[0],
    adherence: m.adherence,
    color: getColor(m.color),
  }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Family Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Cross-member health & adherence insights.
          </p>
        </div>
        <Button onClick={load} size="sm" variant="outline">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* 5 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Family adherence"
          value={`${data.overallAdherence}%`}
          tint="emerald"
          trend={data.overallAdherence >= 80 ? 'up' : data.overallAdherence < 50 ? 'down' : undefined}
        />
        <StatCard
          icon={<Pill className="h-4 w-4" />}
          label="Total meds"
          value={data.totalMedications}
          tint="cyan"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Members"
          value={data.members.length}
          tint="teal"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Needs attention"
          value={needsAttention.length}
          tint="amber"
        />
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          label="Family streak"
          value={computeFamilyStreak(data.members)}
          tint="emerald"
        />
      </div>

      {/* 7-day family adherence line chart */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">7-day family adherence</h3>
              <p className="text-xs text-muted-foreground">Daily average across all members</p>
            </div>
            <Badge variant="secondary" className={cn(adherenceColor(data.overallAdherence))}>
              {data.overallAdherence}%
            </Badge>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={((v: number | string | Array<number | string>) => [`${Array.isArray(v) ? v.join(',') : v}%`, 'Adherence']) as never}
                />
                <Line
                  type="monotone"
                  dataKey="family"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#10b981' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Member comparison bar chart */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Member comparison</h3>
            <p className="text-xs text-muted-foreground">7-day adherence per member</p>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={((v: number | string | Array<number | string>) => [`${Array.isArray(v) ? v.join(',') : v}%`, 'Adherence']) as never}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="adherence" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Best performing day */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold">Best performing day</h3>
          </div>
          <div className="flex items-center gap-3">
            {(() => {
              // Compute average adherence per day-of-week across all members.
              const dayScores: Record<number, number[]> = {}
              data.members.forEach((m) => {
                m.perDay.forEach((d) => {
                  const date = new Date(d.date + 'T00:00:00')
                  const dow = date.getDay()
                  if (!dayScores[dow]) dayScores[dow] = []
                  if (d.total > 0) dayScores[dow].push(d.adherence)
                })
              })
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
              const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              let bestDay = -1
              let bestAvg = -1
              for (let i = 0; i < 7; i++) {
                const scores = dayScores[i]
                if (scores && scores.length > 0) {
                  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
                  if (avg > bestAvg) { bestAvg = avg; bestDay = i }
                }
              }
              return bestDay >= 0 ? (
                <>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{dayNames[bestDay]}</p>
                    <p className="text-xs text-muted-foreground">Highest average adherence across the family</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{bestAvg}%</p>
                    <p className="text-[10px] text-muted-foreground">avg on {shortNames[bestDay]}</p>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Not enough data yet</p>
              )
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-semibold">Needs attention</h3>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                {needsAttention.length} member{needsAttention.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <div className="space-y-2">
              {needsAttention.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-background/60 p-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs">
                      {m.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.relation} · {m.medications} med{m.medications === 1 ? '' : 's'} · {m.weekTaken}/{m.weekTotal} taken this week
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px]', adherenceColor(m.adherence))}>
                    {m.adherence}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All-members breakdown */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">All members</h3>
          <div className="space-y-3">
            {data.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs">
                    {m.name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <span className={cn('text-xs font-semibold', adherenceColor(m.adherence))}>
                      {m.adherence}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {m.relation} · {m.medications} med{m.medications === 1 ? '' : 's'}
                    {m.conditions && Array.isArray(m.conditions) && m.conditions.length > 0 && (
                      <> · {m.conditions.length} condition{(m.conditions as unknown[]).length === 1 ? '' : 's'}</>
                    )}
                  </p>
                  <Progress value={m.adherence} className="mt-1 h-1" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeFamilyStreak(members: AnalyticsResponse['members']): number {
  // Simple heuristic: count consecutive days where all members with meds had 100% adherence.
  // We look at the `perDay` data (7 days) and find the longest suffix of perfect days.
  const days = 7
  let streak = 0
  for (let i = days - 1; i >= 0; i--) {
    const allPerfect = members.every((m) => {
      const day = m.perDay[i]!
      // If no meds scheduled that day, consider it "passed" (member wasn't supposed to take anything).
      if (day.total === 0) return true
      return day.adherence === 100
    })
    if (allPerfect) streak++
    else break
  }
  return streak
}

function adherenceColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function getColor(color: string): string {
  const map: Record<string, string> = {
    emerald: '#10b981',
    teal: '#14b8a6',
    cyan: '#06b6d4',
    amber: '#f59e0b',
    rose: '#f43f5e',
    violet: '#8b5cf6',
    orange: '#f97316',
    pink: '#ec4899',
  }
  return map[color] ?? '#10b981'
}

function StatCard({
  icon,
  label,
  value,
  tint,
  trend,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tint: 'emerald' | 'cyan' | 'teal' | 'amber'
  trend?: 'up' | 'down'
}) {
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  }[tint]
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">
          <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md', cls)}>
            {icon}
          </span>
          <span className="truncate">{label}</span>
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-600" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-rose-600" />}
        </div>
        <div className={cn('text-xl font-bold', cls.split(' ').slice(1).join(' '))}>{value}</div>
      </CardContent>
    </Card>
  )
}
