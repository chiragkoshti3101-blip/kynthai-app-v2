'use client'

/**
 * Portal-wide medication alarm. Lives in the patient/family shell so the
 * ringtone + banner still fire when the user is on Home / Care / AI — not
 * only while the Meds tab is mounted.
 */

import * as React from 'react'
import { CheckCircle2, Pill, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
import {
  playProfessionalRingtone,
  playAlertRingtone,
  isAlarmRinging,
  stopAllRingtones,
  unlockAudio,
  msUntilReminder,
  pickDueReminder,
  pickNextFutureReminder,
  notifyReminder,
  requestAlarmNotificationPermission,
} from '@/lib/alarm'

type HostReminder = {
  id: string
  time: string
  status: string
  medication?: { name?: string; dosage?: string } | null
}

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function recordInApp(title: string, body: string) {
  try {
    const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => d.token as string)
      .catch(() => null)
    await fetch('/api/notifications/in-app', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ title, body, type: 'reminder' }),
    })
  } catch {
    /* best-effort */
  }
}

export function MedicationAlarmHost({
  userId,
  isDemo,
  familyMemberId,
}: {
  userId?: string
  isDemo?: boolean
  familyMemberId?: string
}) {
  const { alarmEnabled, alarmMode } = useAppStore()
  const [reminders, setReminders] = React.useState<HostReminder[]>([])
  const [alarmTarget, setAlarmTarget] = React.useState<HostReminder | null>(null)
  const alarmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRef = React.useRef<() => void>(() => {})
  const recorded = React.useRef<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    if (isDemo) {
      setReminders([
        {
          id: 'host-dr2',
          time: '13:00',
          status: 'pending',
          medication: { name: 'Atorvastatin', dosage: '10mg' },
        },
        {
          id: 'host-dr3',
          time: '18:00',
          status: 'pending',
          medication: { name: 'Vitamin D3', dosage: '60K IU' },
        },
      ])
      return
    }
    try {
      const qs = new URLSearchParams({ date: todayLocal() })
      if (familyMemberId) qs.set('familyMemberId', familyMemberId)
      else if (userId) qs.set('userId', userId)
      const res = await fetch(`/api/reminders?${qs.toString()}`, { credentials: 'include' })
      if (!res.ok) return
      const raw = await res.json()
      const list: HostReminder[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.reminders)
            ? raw.reminders
            : []
      setReminders(list)
    } catch {
      /* ignore */
    }
  }, [isDemo, userId, familyMemberId])

  React.useEffect(() => {
    void load()
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    const onUpdated = () => void load()
    window.addEventListener('kynthai:reminder-updated', onUpdated)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('kynthai:reminder-updated', onUpdated)
    }
  }, [load])

  const scheduleNext = React.useCallback(() => {
    if (alarmTimer.current) {
      clearTimeout(alarmTimer.current)
      alarmTimer.current = null
    }
    const pending = reminders.filter((r) => r.status === 'pending')
    if (pending.length === 0) {
      setAlarmTarget(null)
      stopAllRingtones()
      return
    }
    const due = pickDueReminder(pending)
    if (due) {
      setAlarmTarget(due)
      unlockAudio()
      if (!isAlarmRinging()) {
        if (alarmMode === 'alert') playAlertRingtone()
        else playProfessionalRingtone()
      }
      const medName = due.medication?.name ?? 'Medication'
      notifyReminder('Time to take medication', `${medName} · ${due.time}`)
      if (!recorded.current.has(due.id) && !isDemo) {
        recorded.current.add(due.id)
        void recordInApp(`Time to take ${medName}`, `${due.medication?.dosage ?? ''} · ${due.time}`.trim())
      }
      const intervalMin = 10
      alarmTimer.current = setTimeout(() => scheduleRef.current(), intervalMin * 60 * 1000)
      return
    }
    setAlarmTarget(null)
    const next = pickNextFutureReminder(pending)
    if (!next) return
    const wait = Math.max(1000, msUntilReminder(next.time))
    alarmTimer.current = setTimeout(
      () => scheduleRef.current(),
      Math.min(wait, 6 * 60 * 60 * 1000),
    )
  }, [reminders, alarmMode, isDemo])

  React.useEffect(() => {
    scheduleRef.current = scheduleNext
  }, [scheduleNext])

  React.useEffect(() => {
    if (!alarmEnabled) {
      if (alarmTimer.current) clearTimeout(alarmTimer.current)
      setAlarmTarget(null)
      stopAllRingtones()
      return
    }
    requestAlarmNotificationPermission()
    const t = setTimeout(() => scheduleNext(), 400)
    return () => {
      clearTimeout(t)
      if (alarmTimer.current) clearTimeout(alarmTimer.current)
    }
  }, [alarmEnabled, reminders, scheduleNext])

  React.useEffect(() => {
    if (!alarmEnabled) return
    const onVis = () => {
      if (document.visibilityState === 'visible') scheduleRef.current()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [alarmEnabled])

  const handleAction = async (reminder: HostReminder, status: 'taken' | 'skipped') => {
    stopAllRingtones()
    if (alarmTimer.current) clearTimeout(alarmTimer.current)
    setAlarmTarget(null)
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, status } : r)))
    window.dispatchEvent(
      new CustomEvent('kynthai:reminder-updated', { detail: { id: reminder.id, status } }),
    )
    if (!isDemo && !reminder.id.startsWith('host-')) {
      try {
        const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
          .then((r) => r.json())
          .then((d) => d.token as string)
          .catch(() => null)
        await fetch('/api/reminders', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          },
          body: JSON.stringify({
            medicationId: reminder.id,
            reminderId: reminder.id,
            date: todayLocal(),
            time: reminder.time,
            status,
          }),
        })
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => scheduleRef.current(), 800)
  }

  if (!alarmEnabled || !alarmTarget) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
      <div className="pointer-events-auto w-full max-w-md rounded-xl border border-amber-500/40 bg-background/95 p-4 shadow-xl shadow-black/10 backdrop-blur-md space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-semibold">Time to take medication</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20">
            <Pill className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{alarmTarget.medication?.name ?? 'Medication'}</p>
            <p className="text-xs text-muted-foreground">
              {alarmTarget.time} · {alarmTarget.medication?.dosage ?? ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => handleAction(alarmTarget, 'skipped')}
          >
            <SkipForward className="h-4 w-4" />
            Skip
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => handleAction(alarmTarget, 'taken')}
          >
            <CheckCircle2 className="h-4 w-4" />
            Take
          </Button>
        </div>
      </div>
    </div>
  )
}
