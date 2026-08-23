'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Users, Clock, CheckCircle2, AlertTriangle, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FamilyCelebration } from './family-celebration'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { FamilyHealthPulse, type FamilyMemberPulse } from './health-pulse'
import { isDemoUser } from '@/lib/demo-mode'
import { useAppStore } from '@/lib/store'

export interface PulseMember {
  memberId: string
  name: string
  relation: string
  color: string
  score: number
  adherence: number
  total: number
  taken: number
  missed: number
  status: string
  lastTaken: string | null
  conditions: unknown[]
}

interface FamilyCircleProps {
  members: PulseMember[]
  loading?: boolean
}

const COLOR_MAP: Record<string, string> = {
  emerald: 'from-emerald-500 to-teal-600',
  teal: 'from-teal-500 to-cyan-600',
  cyan: 'from-cyan-500 to-sky-600',
  amber: 'from-amber-500 to-orange-600',
  rose: 'from-rose-500 to-pink-600',
  violet: 'from-violet-500 to-purple-600',
  orange: 'from-orange-500 to-red-600',
  pink: 'from-pink-500 to-rose-600',
}

function avatarGradient(color: string): string {
  return COLOR_MAP[color] ?? 'from-emerald-500 to-teal-600'
}

function statusConfig(status: string, adherence: number) {
  if (status === 'all_taken')
    return {
      label: 'All taken',
      icon: CheckCircle2,
      badgeClass: cn('bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'),
      iconClass: 'text-emerald-600 dark:text-emerald-400',
    }
  if (status === 'missed')
    return {
      label: `${Math.max(0, adherence)}% adherence`,
      icon: AlertTriangle,
      badgeClass: cn('bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'),
      iconClass: 'text-amber-600 dark:text-amber-400',
    }
  if (status === 'in_progress')
    return {
      label: 'In progress',
      icon: Clock,
      badgeClass: cn('bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'),
      iconClass: 'text-cyan-600 dark:text-cyan-400',
    }
  if (status === 'no_reminders')
    return {
      label: 'No reminders',
      icon: Minus,
      badgeClass: cn('bg-muted text-muted-foreground border-border'),
      iconClass: 'text-muted-foreground',
    }
  return {
    label: 'Not started',
    icon: Clock,
    badgeClass: cn('bg-muted text-muted-foreground border-border'),
    iconClass: 'text-muted-foreground',
  }
}

function formatLastTaken(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
  return d.toLocaleDateString('en-US')
}

function MemberCard({ member, index, onClick }: { member: PulseMember; index: number; onClick: () => void }) {
  const cfg = statusConfig(member.status, member.adherence)
  const StatusIcon = cfg.icon
  const grad = avatarGradient(member.color)

  return (
    <Card
      className="group cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-emerald-500/30"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className={`h-11 w-11 bg-gradient-to-br ${grad} text-white ring-2 ring-white/20`}>
            <AvatarFallback className="bg-transparent text-white font-bold text-lg">
              {member.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate text-sm">{member.name}</p>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              {member.relation}
            </Badge>
          </div>
          <Badge className={cn('text-[10px] h-4 px-1.5', cfg.badgeClass)}>
            <StatusIcon className={cn('h-3 w-3 mr-0.5', cfg.iconClass)} />
            {cfg.label}
          </Badge>
        </div>

        <Progress value={Math.max(0, Math.min(100, member.adherence))} className="h-1.5" />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Adherence: {Math.max(0, member.adherence)}%</span>
          {member.lastTaken && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {formatLastTaken(member.lastTaken)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function FamilyCircle({ members, loading }: FamilyCircleProps) {
  const router = useRouter()
  const [showCelebration, setShowCelebration] = React.useState(false)
  const [pulseMembers, setPulseMembers] = React.useState<PulseMember[]>(members)

  // Demo mode fallback: use seeded data when no members provided
  const user = useAppStore((s) => s.user)
  const isDemoMode = isDemoUser(user)
  const demoMembers: PulseMember[] = [
    { memberId: 'fm1', name: 'Robert Wilson', relation: 'Father', color: 'emerald', score: 85, adherence: 85, total: 4, taken: 3, missed: 1, status: 'all_taken', lastTaken: null, conditions: [] },
    { memberId: 'fm2', name: 'Emma Wilson', relation: 'Mother', color: 'teal', score: 78, adherence: 78, total: 2, taken: 1, missed: 1, status: 'in_progress', lastTaken: null, conditions: [] },
    { memberId: 'fm3', name: 'Noah Wilson', relation: 'Child', color: 'cyan', score: 100, adherence: 100, total: 1, taken: 1, missed: 0, status: 'all_taken', lastTaken: null, conditions: [] },
  ]
  const displayMembers = (isDemoMode && (!members || members.length === 0)) ? demoMembers : pulseMembers

  React.useEffect(() => {
    setPulseMembers(members)
  }, [members])

  // Trigger celebration when all members have all_taken status
  React.useEffect(() => {
    let innerTimer: ReturnType<typeof setTimeout> | null = null
    const timer = setTimeout(() => {
      const allGreen = displayMembers.length > 0 && displayMembers.every((m) => m.status === 'all_taken' || m.status === 'no_reminders')
      if (allGreen && displayMembers.length > 0) {
        setShowCelebration(true)
        innerTimer = setTimeout(() => setShowCelebration(false), 5000)
      }
    }, 1000)
    return () => {
      clearTimeout(timer)
      if (innerTimer) clearTimeout(innerTimer)
    }
  }, [displayMembers])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Family Health Circle
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-2/3" />
                      <div className="h-2 bg-muted rounded w-1/3" />
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded" />
                  <div className="h-5 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (displayMembers.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          Family Health Circle
        </h2>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Users className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold">No family members yet</p>
            <p className="text-xs text-muted-foreground">
              Add family members to see their daily health status here.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          Family Health Circle
        </h2>
        {displayMembers.every((m) => m.status === 'all_taken' || m.status === 'no_reminders') && (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            Perfect day!
          </Badge>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {displayMembers.map((m, i) => (
          <MemberCard
            key={m.memberId}
            member={m}
            index={i}
            onClick={() => {
              router.push(`/family/members/${m.memberId}`)
            }}
          />
        ))}
      </div>

      {/* Celebration overlay */}
      {showCelebration && (
        <FamilyCelebration visible={showCelebration} onDone={() => setShowCelebration(false)} />
      )}
    </div>
  )
}
