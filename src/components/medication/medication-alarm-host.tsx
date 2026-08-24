'use client'

/**
 * Portal-wide medication alarm. Lives in the patient/family shell so the
 * ringtone + full-screen Take/Skip overlay still fire when the user is on
 * Home / Care / AI — not only while the Meds tab is mounted.
 *
 * Overlay is intentionally blocking (z-[100], full viewport) so the user
 * must Take or Skip before continuing. After a configurable grace window
 * with no action, the client triggers family escalation so caretakers
 * are notified of the missed dose.
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
  notifyReminderViaSW,
  requestAlarmNotificationPermission,
} from '@/lib/alarm'
import {
  scheduleNativeAlarm,
  ensureNativeNotificationPermission,
  bindNativeNotificationOpen,
  isNativeShell,
} from '@/lib/native-alarms'

type HostReminder = {
  id: string
  time: string
  status: string
  medication?: { name?: string; dosage?: string } | null
}

/** Default grace before escalating a still-pending dose to caretakers (ms). */
const DEFAULT_ESCALATION_GRACE_MS = 15 * 60 * 1000

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

async function getCsrf(): Promise<string | null> {
  try {
    const r = await fetch('/api/auth/csrf', { credentials: 'include' })
    const d = await r.json()
    return (d?.token as string) || null
  } catch {
    return null
  }
}

async function recordInApp(title: string, body: string, type = 'reminder') {
  try {
    const csrf = await getCsrf()
    await fetch('/api/notifications/in-app', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ title, body, type }),
    })
  } catch {
    /* best-effort */
  }
}

async function triggerEscalation(reminder: HostReminder, familyMemberId?: string) {
  try {
    const csrf = await getCsrf()
    const medName = reminder.medication?.name ?? 'Medication'
    await fetch('/api/reminders/escalate', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        reminderId: reminder.id,
        familyMemberId,
        message: `${medName} scheduled at ${reminder.time} was missed.`,
      }),
    })
    // Also write a family-escalation alert when we have a member id
    if (familyMemberId) {
      await fetch('/api/family-escalation', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({
          memberId: familyMemberId,
          type: 'missed_dose',
          message: `${medName} at ${reminder.time} was not taken.`,
          severity: 'warning',
        }),
      })
    }
  } catch {
    /* best-effort */
  }
}

export function MedicationAlarmHost({
  userId,
  isDemo,
  familyMemberId,
  escalationGraceMs = DEFAULT_ESCALATION_GRACE_MS,
}: {
  userId?: string
  isDemo?: boolean
  familyMemberId?: string
  /** How long after a dose becomes due before escalating to caretaker. */
  escalationGraceMs?: number
}) {
  const { alarmEnabled, alarmMode } = useAppStore()
  const [reminders, setReminders] = React.useState<HostReminder[]>([])
  const [alarmTarget, setAlarmTarget] = React.useState<HostReminder | null>(null)
  const alarmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const escalateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRef = React.useRef<() => void>(() => {})
  const recorded = React.useRef<Set<string>>(new Set())
  const escalated = React.useRef<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    if (isDemo) {
      // Demo: surface a due dose immediately so QA can verify full-screen overlay
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      setReminders([
        {
          id: 'host-demo-now',
          time: `${hh}:${mm}`,
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

  const clearEscalateTimer = () => {
    if (escalateTimer.current) {
      clearTimeout(escalateTimer.current)
      escalateTimer.current = null
    }
  }

  const scheduleNext = React.useCallback(() => {
    if (alarmTimer.current) {
      clearTimeout(alarmTimer.current)
      alarmTimer.current = null
    }
    const pending = reminders.filter((r) => r.status === 'pending')
    if (pending.length === 0) {
      setAlarmTarget(null)
      stopAllRingtones()
      clearEscalateTimer()
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
      void notifyReminderViaSW('Time to take medication', `${medName} · ${due.time}`)
      if (!recorded.current.has(due.id) && !isDemo) {
        recorded.current.add(due.id)
        void recordInApp(
          `Time to take ${medName}`,
          `${due.medication?.dosage ?? ''} · ${due.time}`.trim(),
        )
      }
      // Schedule caretaker escalation if still pending after grace
      if (!escalated.current.has(due.id) && !isDemo) {
        clearEscalateTimer()
        escalateTimer.current = setTimeout(() => {
          if (escalated.current.has(due.id)) return
          escalated.current.add(due.id)
          void triggerEscalation(due, familyMemberId)
          void recordInApp(
            `Missed: ${medName}`,
            `No action after grace · caretaker notified`,
            'reminder_escalation',
          )
        }, escalationGraceMs)
      }
      // Keep re-checking so the overlay stays until action
      const intervalMin = 1
      alarmTimer.current = setTimeout(() => scheduleRef.current(), intervalMin * 60 * 1000)
      return
    }
    setAlarmTarget(null)
    clearEscalateTimer()
    const next = pickNextFutureReminder(pending)
    if (!next) return
    const wait = Math.max(1000, msUntilReminder(next.time))
    // Native shell: exact OS alarm so dose covers the phone outside the app
    try {
      const at = new Date(Date.now() + wait)
      const medName = next.medication?.name ?? 'Medication'
      const nid = Math.abs(hashId(next.id)) % 2000000000
      void scheduleNativeAlarm({
        id: nid,
        title: `Time to take ${medName}`,
        body: `${next.medication?.dosage ?? ''} · ${next.time}`.trim() || 'Open Taken / Skip',
        at,
        medName,
      })
    } catch { /* ignore */ }
    alarmTimer.current = setTimeout(
      () => scheduleRef.current(),
      Math.min(wait, 6 * 60 * 60 * 1000),
    )
  }, [reminders, alarmMode, isDemo, familyMemberId, escalationGraceMs])

  React.useEffect(() => {
    scheduleRef.current = scheduleNext
  }, [scheduleNext])

  React.useEffect(() => {
    if (!alarmEnabled) {
      if (alarmTimer.current) clearTimeout(alarmTimer.current)
      clearEscalateTimer()
      setAlarmTarget(null)
      stopAllRingtones()
      return
    }
    requestAlarmNotificationPermission()
    const t = setTimeout(() => scheduleNext(), 400)
    return () => {
      clearTimeout(t)
      if (alarmTimer.current) clearTimeout(alarmTimer.current)
      clearEscalateTimer()
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

  // Lock body scroll while full-screen overlay is up
  React.useEffect(() => {
    if (!alarmTarget) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [alarmTarget])

  const handleAction = async (reminder: HostReminder, status: 'taken' | 'skipped') => {
    stopAllRingtones()
    if (alarmTimer.current) clearTimeout(alarmTimer.current)
    clearEscalateTimer()
    escalated.current.add(reminder.id) // don't escalate after explicit action
    setAlarmTarget(null)
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, status } : r)))
    window.dispatchEvent(
      new CustomEvent('kynthai:reminder-updated', { detail: { id: reminder.id, status } }),
    )
    if (!isDemo && !reminder.id.startsWith('host-')) {
      try {
        const csrf = await getCsrf()
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
    // If user explicitly skipped, still notify caretaker in family context
    if (status === 'skipped' && familyMemberId && !isDemo) {
      void triggerEscalation(reminder, familyMemberId)
    }
    setTimeout(() => scheduleRef.current(), 800)
  }



  React.useEffect(() => {
    void ensureNativeNotificationPermission()
    let unsub = () => {}
    void bindNativeNotificationOpen((payload) => {
      unlockAudio()
      setAlarmTarget({
        id: `native-${Date.now()}`,
        time: new Date().toTimeString().slice(0, 5),
        status: 'pending',
        medication: { name: payload.medName || payload.title || 'Medication', dosage: '' },
      })
      if (!isAlarmRinging()) {
        if (alarmMode === 'alert') playAlertRingtone()
        else playProfessionalRingtone()
      }
    }).then((u) => {
      unsub = u
    })
    return () => unsub()
  }, [alarmMode])

  // Closed-app / background: service worker push → full-screen alarm + ring
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const onMsg = (event: MessageEvent) => {
      const d = event.data
      if (!d || d.type !== 'SHOW_MED_ALARM') return
      unlockAudio()
      const synthetic: HostReminder = {
        id: d.reminderId || `push-${Date.now()}`,
        time: d.time || new Date().toTimeString().slice(0, 5),
        status: 'pending',
        medication: {
          name: d.medName || d.title || 'Medication',
          dosage: d.dosage || '',
        },
      }
      setAlarmTarget(synthetic)
      if (!isAlarmRinging()) {
        if (alarmMode === 'alert') playAlertRingtone()
        else playProfessionalRingtone()
      }
    }

    navigator.serviceWorker.addEventListener('message', onMsg)

    // Deep link: /patient?alarm=1 after tapping system notification
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('alarm') === '1') {
        const med = params.get('med') || 'Medication'
        unlockAudio()
        setAlarmTarget({
          id: `url-alarm-${Date.now()}`,
          time: new Date().toTimeString().slice(0, 5),
          status: 'pending',
          medication: { name: med, dosage: '' },
        })
        if (!isAlarmRinging()) {
          if (alarmMode === 'alert') playAlertRingtone()
          else playProfessionalRingtone()
        }
        // Clean query so refresh does not re-fire forever
        params.delete('alarm')
        params.delete('med')
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
        window.history.replaceState({}, '', next)
      }
    } catch {
      /* ignore */
    }

    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [alarmMode])

  // Try browser Fullscreen API while alarm is active (best-effort; may need gesture)
  React.useEffect(() => {
    if (!alarmTarget) return
    const el = document.documentElement
    const go = async () => {
      try {
        if (!document.fullscreenElement && el.requestFullscreen) {
          await el.requestFullscreen()
        }
      } catch {
        /* blocked without user gesture — overlay still covers viewport */
      }
    }
    void go()
    return () => {
      try {
        if (document.fullscreenElement) void document.exitFullscreen()
      } catch {
        /* ignore */
      }
    }
  }, [alarmTarget])

  // Clinical: push-driven SHOW_MED_ALARM always shows full-screen even if
  // the user muted scheduled local timers (alarmEnabled=false).
  if (!alarmTarget) return null
  if (!alarmEnabled && !String(alarmTarget.id).startsWith("push-") && !String(alarmTarget.id).startsWith("url-alarm-")) {
    return null
  }

  const medName = alarmTarget.medication?.name ?? 'Medication'
  const dosage = alarmTarget.medication?.dosage ?? ''

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dose-alarm-title"
      aria-describedby="dose-alarm-desc"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#064e3b] text-white px-4 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pointer-events-auto"
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400 shadow-lg">
            <Pill className="h-12 w-12" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium tracking-wide text-emerald-200/90">
            Medication reminder
          </p>
          <h2 id="dose-alarm-title" className="text-2xl font-bold tracking-tight text-white">
            Time to take {medName}
          </h2>
          <p id="dose-alarm-desc" className="text-sm text-emerald-100/80">
            {alarmTarget.time}
            {dosage ? ` · ${dosage}` : ''}
          </p>
        </div>

        <div className="w-full flex flex-col gap-3 pt-2">
          <Button
            size="lg"
            className="h-14 w-full text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
            onClick={() => handleAction(alarmTarget, 'taken')}
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Taken
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full text-base font-semibold border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => handleAction(alarmTarget, 'skipped')}
          >
            <SkipForward className="h-5 w-5 mr-2" />
            Skip
          </Button>
        </div>

        <p className="text-[11px] text-emerald-100/70 max-w-[260px]">
          Full-screen alarm — sound keeps playing until you mark Taken or Skip.
          If you miss the window, your caretaker may be notified.
        </p>
      </div>
    </div>
  )
}
