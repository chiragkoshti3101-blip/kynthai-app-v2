'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AppLoader } from '@/components/kynthai/app-loader'
import { ArrowLeft, Pill, Calendar, AlertTriangle, CheckCircle2, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import {Alert, AlertDescription} from '@/components/ui/alert'
import { MedicationsList } from '@/components/medication/medications-list'
import { useToast } from '@/hooks/use-toast'

const COLOR_MAP: Record<string, string> = {
  emerald: 'bg-emerald-500', blue: 'bg-blue-500', amber: 'bg-amber-500',
  rose: 'bg-rose-500', violet: 'bg-violet-500', teal: 'bg-teal-500',
  orange: 'bg-orange-500', pink: 'bg-pink-500',
}

interface MemberData {
  id: string
  name: string
  relation: string
  age: number | null
  role: string
  color: string
  conditions: unknown[]
  photoUrl: string | null
  medications: Array<{
    id: string
    name: string
    dosage: string
    frequency: string
    active: boolean
    instructions: string | null
  }>
  reminders: Array<{ id: string; medicationId: string; date: string; time: string; status: string }>
}

export default function FamilyMemberDetailClient({ memberId, user }: { memberId: string; user: { id: string; role?: string; email?: string; isDemo?: boolean } }) {
  const router = useRouter()
  const { toast } = useToast()
  const [data, setData] = React.useState<MemberData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const demoAccount = !!user.isDemo || (user.email || '').toLowerCase().endsWith('@kynthai.app')

  // ponytail: navigate back to the portal the user came from. The family
  // circle lives in /caretaker (caretaker portal) and /patient (Care Hub),
  // NOT /family — router.back() was unreliable and landed on /family.
  const goBack = React.useCallback(() => {
    router.push(user.role === 'caretaker' ? '/caretaker' : '/patient')
  }, [router, user.role])

  const load = React.useCallback(async () => {
    setLoading(true)
    const DEMO_MEMBERS: Record<string, MemberData> = {
      fm1: { id: 'fm1', name: 'Robert Wilson', relation: 'Father', age: 62, role: 'member', color: 'emerald', conditions: ['Type 2 diabetes', 'Hypertension'], photoUrl: null, medications: [], reminders: [] },
      fm2: { id: 'fm2', name: 'Emma Wilson', relation: 'Mother', age: 58, role: 'member', color: 'teal', conditions: ['Hypothyroidism'], photoUrl: null, medications: [], reminders: [] },
      fm3: { id: 'fm3', name: 'Noah Wilson', relation: 'Child', age: 12, role: 'member', color: 'cyan', conditions: ['Seasonal allergies'], photoUrl: null, medications: [], reminders: [] },
    }
    if (demoAccount && DEMO_MEMBERS[memberId]) {
      setData(DEMO_MEMBERS[memberId]!)
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/family/members/${memberId}`, { credentials: 'include' })
      if (!res.ok) {
        if (DEMO_MEMBERS[memberId]) {
          setData(DEMO_MEMBERS[memberId]!)
        } else {
          setData(null)
        }
        setLoading(false)
        return
      }
      const json = await res.json()
      setData(json)
    } catch {
      if (DEMO_MEMBERS[memberId]) setData(DEMO_MEMBERS[memberId]!)
      else toast({ title: 'Failed to load member', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [memberId, toast, demoAccount])

  React.useEffect(() => { void load() }, [load])

  if (loading) {
    return <AppLoader label="Loading…" />
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Member not found or access denied.</p>
        <Button onClick={goBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Family
        </Button>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  // reminder.date is a full ISO datetime from the API; normalize to a
  // date-only key on both sides or nothing ever matches (adherence → 0).
  const todayReminders = data.reminders.filter((r) => String(r.date).slice(0, 10) === today)
  const takenToday = todayReminders.filter((r) => r.status === 'taken').length
  const totalToday = todayReminders.length
  const adherence = totalToday > 0 ? Math.round((takenToday / totalToday) * 100) : 0
  const avatarColor = COLOR_MAP[data.color] || 'bg-emerald-500'

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      {/* Sticky back button — always visible on mobile */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl -mx-4 px-4 py-2 border-b border-border/40">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Family
        </Button>
      </div>

      {/* Member Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`h-16 w-16 rounded-full ${avatarColor} flex items-center justify-center text-white text-2xl font-bold shrink-0`}>
              {data.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{data.name}</h1>
                <Badge variant="outline">{data.relation}</Badge>
                <Badge>{data.role}</Badge>
              </div>
              {data.age && <p className="text-sm text-muted-foreground mt-1">Age: {data.age}</p>}
              {Array.isArray(data.conditions) && data.conditions.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {((data.conditions as string[]) || []).map((c: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{String(c)}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Today's adherence */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Today's Medication Adherence</span>
              <span className="font-medium">{adherence}%</span>
            </div>
            <Progress value={adherence} className="h-2" />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-500" /> {takenToday} taken</span>
              <span className="flex items-center gap-1"><Clock className="h-4 w-4 text-amber-500" /> {totalToday - takenToday} remaining</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="medications">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="medications"><Pill className="h-4 w-4 mr-1" /> Medications</TabsTrigger>
          <TabsTrigger value="reminders"><Calendar className="h-4 w-4 mr-1" /> Reminders</TabsTrigger>
          <TabsTrigger value="details"><User className="h-4 w-4 mr-1" /> Details</TabsTrigger>
        </TabsList>
        <TabsContent value="medications" className="mt-4">
          <MedicationsList familyMemberId={data.id} isDemo={demoAccount} />
        </TabsContent>
        <TabsContent value="reminders" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Today's Reminders</CardTitle></CardHeader>
            <CardContent>
              {todayReminders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No reminders scheduled for today.</p>
              ) : (
                <div className="space-y-2">
                  {todayReminders.map((r) => {
                    const statusFallback = { icon: Clock, color: 'text-muted-foreground', label: 'Pending' } as const
                    const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
                      taken:   { icon: CheckCircle2, color: 'text-green-500', label: 'Taken' },
                      missed:  { icon: AlertTriangle, color: 'text-red-500', label: 'Missed' },
                      skipped: { icon: Clock, color: 'text-amber-500', label: 'Skipped' },
                      pending: { icon: Clock, color: 'text-muted-foreground', label: 'Pending' },
                    }
                    const cfg = statusConfig[r.status] ?? statusFallback
                    const StatusIcon = cfg.icon
                    return (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <StatusIcon className={`h-5 w-5 ${cfg.color}`} />
                          <div>
                            <p className="font-medium">{r.time}</p>
                            <p className="text-xs text-muted-foreground">Medication ID: {r.medicationId.slice(0, 8)}...</p>
                          </div>
                        </div>
                        <Badge variant={r.status === 'taken' ? 'default' : 'secondary'}>{cfg.label}</Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Member Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Relation:</span> <span className="font-medium ml-2">{data.relation}</span></div>
                <div><span className="text-muted-foreground">Age:</span> <span className="font-medium ml-2">{data.age ?? 'N/A'}</span></div>
                <div><span className="text-muted-foreground">Role:</span> <span className="font-medium ml-2">{data.role}</span></div>
                <div><span className="text-muted-foreground">Color:</span> <span className="font-medium ml-2">{data.color}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Conditions:</span> {Array.isArray(data.conditions) && data.conditions.length > 0 ? data.conditions.join(', ') : 'None'}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
