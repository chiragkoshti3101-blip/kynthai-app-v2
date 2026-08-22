'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Heart, AlertTriangle, CheckCircle, Clock, Users } from 'lucide-react'
import { logger } from '@/lib/logger'
import { isDemoEnabled } from '@/lib/demo-mode'

export interface FamilyMemberPulse {
  id: string
  name: string
  relation: string
  color: string
  todayStatus: 'taken' | 'missed' | 'pending' | 'unknown'
  medications?: Array<{ name: string; dosage: string }>
  adherenceScore?: number
}

export interface FamilyHealthPulseData {
  familyName: string
  overallScore: number
  members: FamilyMemberPulse[]
}

export function FamilyHealthPulse({ onDataLoaded }: { onDataLoaded?: (members: FamilyMemberPulse[]) => void } = {}) {
  const [data, setData] = useState<FamilyHealthPulseData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchFamilyData = async () => {
    const isDemoMode = isDemoEnabled();

    // Demo mode: return seeded data without backend call
    if (isDemoMode) {
      const demoData: FamilyHealthPulseData = {
        familyName: 'Demo Family',
        overallScore: 78,
        members: [
          {
            id: 'fm1',
            name: 'Robert Wilson',
            relation: 'Father',
            color: '#10b981',
            todayStatus: 'taken' as const,
            medications: [{ name: 'Metformin', dosage: '500mg' }, { name: 'Amlodipine', dosage: '5mg' }],
            adherenceScore: 85,
          },
          {
            id: 'fm2',
            name: 'Emma Wilson',
            relation: 'Mother',
            color: '#0d9488',
            todayStatus: 'pending' as const,
            medications: [{ name: 'Thyroxine', dosage: '50mcg' }],
            adherenceScore: 65,
          },
          {
            id: 'fm3',
            name: 'Noah Wilson',
            relation: 'Child',
            color: '#0891b2',
            todayStatus: 'taken' as const,
            medications: [{ name: 'Cetirizine', dosage: '10mg' }],
            adherenceScore: 95,
          },
        ],
      }
      setData(demoData)
      onDataLoaded?.(demoData.members)
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/family', { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          setData(null)
          setLoading(false)
          return
        }
        logger.warn('Family pulse fetch failed:', res.status)
      }
      const familyData = await res.json()

      if (familyData.family && familyData.members) {
        const membersWithStatus: FamilyMemberPulse[] = familyData.members.map((member: any) => {
          return {
            ...member,
            todayStatus: 'unknown' as const,
            adherenceScore: 0,
          }
        })

        setData({
          familyName: familyData.family.name || 'My Family',
          overallScore: 0,
          members: membersWithStatus,
        })

        // Try to get pulse data for more accurate status
        try {
          const pulseRes = await fetch('/api/family/pulse', { credentials: 'include' })
          if (pulseRes.ok) {
            const pulseData = await pulseRes.json()
            if (Array.isArray(pulseData)) {
              const pulseById = new Map(pulseData.map((p: any) => [p.memberId, p]))
              const enriched = membersWithStatus.map((m) => {
                const pulse = pulseById.get(m.id)
                if (!pulse) return m
                let status: FamilyMemberPulse['todayStatus'] = 'unknown'
                if (pulse.total === 0) status = 'unknown'
                else if (pulse.taken === pulse.total) status = 'taken'
                else if (pulse.missed > 0) status = 'missed'
                else if (pulse.taken > 0) status = 'pending'
                return { ...m, todayStatus: status, adherenceScore: pulse.adherence >= 0 ? pulse.adherence : 0 }
              })
              setData((prev) => prev ? {
                ...prev,
                members: enriched,
                overallScore: Math.round(enriched.reduce((s, m) => s + (m.adherenceScore ?? 0), 0) / enriched.length) || 0,
              } : null)
              onDataLoaded?.(enriched)
            }
          }
        } catch { /* pulse is optional */ }
      }
    } catch (error) {
      logger.warn('Failed to fetch family data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchFamilyData() }, [fetchFamilyData])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.members.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Family Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No family members yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add family members to see their daily health status here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
    taken:   { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50',  label: 'Meds taken' },
    missed:  { icon: AlertTriangle, color: 'text-red-500',   bg: 'bg-red-50',    label: 'Missed dose' },
    pending: { icon: Clock, color: 'text-yellow-500',  bg: 'bg-yellow-50', label: 'In progress' },
    unknown: { icon: Clock, color: 'text-gray-500',    bg: 'bg-gray-50',   label: 'No data' },
  }
  const statusFallback = { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Unknown' } as const

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-500" />
            {data.familyName}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{data.overallScore}</span>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Health Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Family Health Score</span>
            <span className="font-medium">{data.overallScore}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                data.overallScore >= 80 ? 'bg-green-500' :
                data.overallScore >= 60 ? 'bg-yellow-500' :
                'bg-red-500'
              }`}
              style={{ width: `${data.overallScore}%` }}
            />
          </div>
        </div>

        {/* Member Status Cards */}
        <div className="space-y-3">
          {data.members.map((member) => {
            const cfg = statusConfig[member.todayStatus] ?? statusFallback
            const StatusIcon = cfg.icon
            const avatarColor = member.color || 'bg-emerald-500'
            return (
              <div key={member.id} className={`flex items-center gap-3 p-3 rounded-lg ${cfg.bg}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: member.color || '#10b981' }}>
                  {member.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{member.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {member.relation}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {member.medications?.length || 0} active medications
                  </p>
                </div>
                <div className={`flex items-center gap-1 ${cfg.color}`}>
                  <StatusIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{cfg.label}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Heart className="h-4 w-4 mr-1" />
            Check In
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <AlertTriangle className="h-4 w-4 mr-1" />
            SOS
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
