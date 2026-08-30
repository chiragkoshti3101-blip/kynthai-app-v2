'use client'

import * as React from 'react'
import { CheckCircle2, Clock, Pill, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { useAppStore } from '@/lib/store'
import { playSuccessChime } from '@/lib/alarm'

export interface MemberMed {
  id: string
  name: string
  dosage: string
  time: string
  status: 'pending' | 'taken' | 'skipped'
  color?: string
  instructions?: string | null
  medicationId?: string
}

interface Props {
  memberName: string
  meds: MemberMed[]
  onUpdate?: (med: MemberMed, status: 'taken' | 'skipped') => void
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number) as [number, number]
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function FamilyMemberSchedule({ memberName, meds, onUpdate }: Props) {
  const { toast } = useToast()
  const { alarmEnabled } = useAppStore()
  const [updating, setUpdating] = React.useState<string | null>(null)

  const updateMed = async (med: MemberMed, status: 'taken' | 'skipped') => {
    setUpdating(med.id)
    if (onUpdate) onUpdate(med, status)
    if (status === 'taken' && alarmEnabled) playSuccessChime()
    // FIX #16: Add undo capability to dose logging
    const undoStatus = status === 'taken' ? 'skipped' : 'taken'
    toast({ 
      title: status === 'taken' ? 'Marked as taken' : 'Skipped', 
      description: status === 'taken' ? `${med.name} — ${med.dosage}` : undefined,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          updateMed(med, undoStatus)
        }}>Undo</ToastAction>
      )
    })
    setUpdating(null)
  }

  if (meds.length === 0) return null

  const pending = meds.filter(m => m.status === 'pending')
  const done = meds.filter(m => m.status !== 'pending')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{memberName}</h3>
        <Badge variant="secondary" className="text-[10px]">
          {pending.length} pending
        </Badge>
      </div>

      <div className="space-y-1.5">
        {pending.map(m => (
          <Card key={m.id} className="border-amber-500/20">
            <CardContent className="flex items-center gap-2.5 p-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                <Pill className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{m.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  <Clock className="inline h-2.5 w-2.5" /> {formatTime(m.time)} · {m.dosage}
                  {m.instructions && <span> · {m.instructions}</span>}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0" onClick={() => updateMed(m, 'skipped')} disabled={updating === m.id}>
                  {updating === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
                <Button size="sm" className="min-h-11 px-3 text-xs bg-emerald-600 text-white" onClick={() => updateMed(m, 'taken')} disabled={updating === m.id}>
                  <CheckCircle2 className="h-3 w-3" /> Take
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {done.length > 0 && (
        <div className="space-y-1">
          {done.map(m => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 opacity-60">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-[11px] font-medium line-through text-muted-foreground">{m.name}</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(m.time)}</span>
              <Badge variant="secondary" className="text-[9px]">{m.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
