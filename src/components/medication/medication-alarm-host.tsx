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
  medication?: { id?: string; name?: string; dosage?: string } | null
}

/** Default grace before escalating a still-pending dose to caretakers (ms). */
const DEFAULT_ESCALATION_GRACE_MS = 15 * 60 * 1000

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "13:00" → "1:00 PM" (falls back to the raw value for odd strings). */
function formatTime12(t: string) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t ?? '')
  if (!m) return t
  let h = parseInt(m[1] ?? '0', 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m[2]} ${suffix}`
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
  // Mirror of `reminders` for event listeners that would otherwise close over
  // stale state — lets push/deep-link/native alarms hydrate real med ids.
  const remindersRef = React.useRef<HostReminder[]>([])
  React.useEffect(() => {
    remindersRef.current = reminders
  }, [reminders])

  const load = React.useCallback(async () => {
    if (isDemo) {
      // Demo: force a due dose + full-screen alarm immediately (no schedule race).
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const demoDue = {
        id: 'host-demo-now',
        time: `${hh}:${mm}`,
        status: 'pending',
        medication: { name: 'Atorvastatin', dosage: '10mg' },
      }
      setReminders((prev) => {
        // Preserve the acted status: handleAction marks host-demo-now
        // taken/skipped and fires kynthai:reminder-updated → load() re-runs.
        // Recreating the reminder as fresh 'pending' here resurrected the
        // alarm instantly — Skip → new alarm, forever (inescapable overlay).
        const acted = prev.find((r) => r.id === 'host-demo-now' && r.status !== 'pending')
        return [
          acted ?? demoDue,
          prev.find((r) => r.id === 'host-dr3') ?? {
            id: 'host-dr3',
            time: '18:00',
            status: 'pending',
            medication: { name: 'Vitamin D3', dosage: '60K IU' },
          },
        ]
      })
      // Only auto-show if user has not already dismissed this session
      setAlarmTarget((prev) => {
        if (prev && String(prev.id).startsWith('host-demo')) return prev
        if (escalated.current.has('host-demo-now')) return prev // user already Took/Skipped
        return demoDue
      })
      if (!escalated.current.has('host-demo-now')) {
        // On native Android/iOS, use the native alarm exclusively — Web Audio
        // and MediaPlayer fighting each other causes intermittent ringing.
        let usedNative = false
        try {
          const { scheduleNativeAlarm, isNativeShell } = await import('@/lib/native-alarms')
          if (isNativeShell()) {
            usedNative = true
            await scheduleNativeAlarm({
              id: Date.now(),
              title: 'Time to take Atorvastatin',
              body: '10mg · now',
              at: new Date(Date.now() + 1500),
              medName: 'Atorvastatin',
            })
          }
        } catch { /* web fallback below */ }
        if (!usedNative) {
          try {
            unlockAudio()
            if (!isAlarmRinging()) {
              if (alarmMode === 'alert') playAlertRingtone()
              else playProfessionalRingtone()
            }
          } catch { /* ignore */ }
        }
      }
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
  }, [isDemo, userId, familyMemberId, alarmMode])

  React.useEffect(() => {
    void load()
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    const onUpdated = () => void load()
    window.addEventListener('kynthai:reminder-updated', onUpdated)
    const onTest = () => {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const demoDue = {
        id: `host-demo-test-${Date.now()}`,
        time: `${hh}:${mm}`,
        status: 'pending',
        medication: { name: 'Atorvastatin', dosage: '10mg' },
      }
      setReminders((prev) => [demoDue, ...prev.filter((r) => !String(r.id).startsWith('host-demo'))])
      setAlarmTarget(demoDue)
      try {
        unlockAudio()
        if (alarmMode === 'alert') playAlertRingtone()
        else playProfessionalRingtone()
      } catch { /* ignore */ }
    }
    window.addEventListener('kynthai:test-alarm', onTest)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('kynthai:reminder-updated', onUpdated)
      window.removeEventListener('kynthai:test-alarm', onTest)
    }
  }, [load, alarmMode])

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
      void notifyReminderViaSW('Medication reminder', `${formatTime12(due.time)} · dose due — open to act`)
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
            familyMemberId
              ? `No action after grace · family caretaker notified`
              : `No action after grace · please take or skip when you can`,
            'reminder_escalation',
          )
        }, escalationGraceMs)
      }
      // Re-check soon so overlay + ring stay reliable (not only once per minute)
      alarmTimer.current = setTimeout(() => scheduleRef.current(), 15_000)
      return
    }
    setAlarmTarget(null)
    clearEscalateTimer()

    // Schedule OS-level exact alarms for every pending dose today (native APK).
    // This is what removes server-cron delay when the app is closed.
    for (const r of pending) {
      const ms = msUntilReminder(r.time)
      if (ms < -60_000) continue // more than 1 min past — skip re-schedule noise
      try {
        const at = new Date(Date.now() + Math.max(0, ms))
        const medName = r.medication?.name ?? 'Medication'
        const nid = Math.abs(hashId(r.id)) % 2000000000
        void scheduleNativeAlarm({
          id: nid,
          // FIX #23: keep the lock screen generic; the med name rides in the
          // extra payload so the in-app alarm can still show it after unlock.
          title: 'Medication reminder',
          body: `Dose due · ${formatTime12(r.time)}`.trim(),
          at,
          medName,
          extra: {
            medicationId: r.medication?.id || '',
            reminderId: r.id,
            time: r.time,
          },
        })
      } catch {
        /* ignore */
      }
    }

    const next = pickNextFutureReminder(pending)
    if (!next) return
    // Fire at the exact second (no +1s floor) while the app process is alive
    const wait = Math.max(0, msUntilReminder(next.time))
    // Sub-second wakeups when close: poll every 1s in the last 90s
    const tickMs = wait <= 90_000 ? 1_000 : Math.min(wait, 6 * 60 * 60 * 1000)
    alarmTimer.current = setTimeout(() => scheduleRef.current(), tickMs)
  }, [reminders, alarmMode, isDemo, familyMemberId, escalationGraceMs])

  React.useEffect(() => {
    scheduleRef.current = scheduleNext
  }, [scheduleNext])

  React.useEffect(() => {
    // Demo accounts always run the host so QA sees full-screen Taken/Skip.
    if (!alarmEnabled && !isDemo) {
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
  }, [alarmEnabled, isDemo, reminders, scheduleNext])

  React.useEffect(() => {
    if (!alarmEnabled && !isDemo) return
    const onVis = () => {
      if (document.visibilityState === 'visible') scheduleRef.current()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [alarmEnabled, isDemo])

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
      // FIX #1: the API upserts by MEDICATION id — posting the reminder cuid
      // 404'd and the overlay's Taken/Skip never reached the DB.
      const medId = reminder.medication?.id
      if (medId) {
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
              medicationId: medId,
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
      const name = payload.medName || payload.title || 'Medication'
      // Hydrate a real reminder (with medication id) so Take/Skip persists.
      const match =
        remindersRef.current.find(
          (r) => r.status === 'pending' && r.medication?.id && r.medication?.name === name,
        ) || null
      setAlarmTarget(
        match ?? {
          id: `native-${Date.now()}`,
          time: new Date().toTimeString().slice(0, 5),
          status: 'pending',
          medication: { name, dosage: '' },
        },
      )
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
      const rid = typeof d.reminderId === 'string' && d.reminderId ? d.reminderId : null
      const mid = typeof d.medicationId === 'string' && d.medicationId ? d.medicationId : null
      const match = (rid && remindersRef.current.find((r) => r.id === rid)) || null
      const synthetic: HostReminder =
        match ?? {
          id: rid || `push-${Date.now()}`,
          time: d.time || new Date().toTimeString().slice(0, 5),
          status: 'pending',
          medication: {
            id: mid || undefined,
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
        const rid = params.get('rid')
        const mid = params.get('mid')
        const t = params.get('time') || ''
        const med = params.get('med') || 'Medication'
        unlockAudio()
        const match = (rid && remindersRef.current.find((r) => r.id === rid)) || null
        setAlarmTarget(
          match ?? {
            id: rid || `url-alarm-${Date.now()}`,
            time: /^\d{2}:\d{2}$/.test(t) ? t : new Date().toTimeString().slice(0, 5),
            status: 'pending',
            medication: { id: mid || undefined, name: med, dosage: '' },
          },
        )
        if (!isAlarmRinging()) {
          if (alarmMode === 'alert') playAlertRingtone()
          else playProfessionalRingtone()
        }
        // Clean query so refresh does not re-fire forever
        params.delete('alarm')
        params.delete('med')
        params.delete('rid')
        params.delete('mid')
        params.delete('time')
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
  const isForced =
    String(alarmTarget.id).startsWith('push-') ||
    String(alarmTarget.id).startsWith('url-alarm-') ||
    String(alarmTarget.id).startsWith('host-demo') ||
    !!isDemo
  if (!alarmEnabled && !isForced) {
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
      style={{
        // iOS Safari: inset-0 alone can leave a floating strip when the URL bar collapses
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100dvh',
        minHeight: '-webkit-fill-available',
      }}
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
            {formatTime12(alarmTarget.time)}
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
          {familyMemberId
            ? 'Sound continues until Taken or Skip. If this dose is missed, the family caretaker may be notified.'
            : 'Sound continues until you mark Taken or Skip. Please act so your schedule stays accurate.'}
        </p>
      </div>
    </div>
  )
}
