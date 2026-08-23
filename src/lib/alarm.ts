/**
 * Kynthai Ringtone System
 * -----------------------
 * Generates in-app alarm sounds using the Web Audio API — no audio files needed.
 *
 * Two modes:
 *   "professional" — gentle ascending chime (hospital-grade, polite)
 *   "alert"        — louder repeating beep for elderly users
 *
 * The user can toggle alarm on/off from settings and dismiss it with a button.
 *
 * Scheduling helpers (msUntilReminder, pickDueReminder) ensure alarms fire
 * at the scheduled dose time — not immediately on tab open.
 */

let audioCtx: AudioContext | null = null
let activeOscillators: OscillatorNode[] = []
let _isRinging = false
let _audioUnlocked = false

/**
 * SSR-safe AudioContext accessor.
 * Returns null when called during server-side rendering.
 */
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Mobile browsers suspend AudioContext until a user gesture.
 * Call once from a click/touch handler (or mount a one-shot listener)
 * so later scheduled alarms can actually play sound.
 */
export function unlockAudio() {
  if (typeof window === 'undefined' || _audioUnlocked) return
  const ctx = getAudioCtx()
  if (!ctx) return
  ctx.resume().then(() => {
    _audioUnlocked = true
  }).catch(() => {})
  // Play a near-silent tick so iOS fully unlocks the context
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = 0.001
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.01)
  } catch { /* ignore */ }
}

/** Milliseconds from now until a "HH:MM" time today (negative = overdue). */
export function msUntilReminder(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number) as [number, number]
  const target = new Date()
  target.setHours(h, m, 0, 0)
  return target.getTime() - Date.now()
}

export type DueCandidate = { id: string; time: string; status: string }

/**
 * Pick the reminder that should ring now:
 * - Prefer the earliest overdue/pending dose (msUntil <= grace)
 * - Else return null (caller should schedule a future timeout)
 */
export function pickDueReminder<T extends DueCandidate>(
  pending: T[],
  graceMs = 60_000,
): T | null {
  if (!pending.length) return null
  const sorted = [...pending].sort((a, b) => msUntilReminder(a.time) - msUntilReminder(b.time))
  const due = sorted.find(r => msUntilReminder(r.time) <= graceMs)
  return due ?? null
}

/** Next future pending reminder (for scheduling a wake timer). */
export function pickNextFutureReminder<T extends DueCandidate>(pending: T[]): T | null {
  if (!pending.length) return null
  const future = pending
    .map(r => ({ r, ms: msUntilReminder(r.time) }))
    .filter(x => x.ms > 0)
    .sort((a, b) => a.ms - b.ms)
  return future[0]?.r ?? null
}

/**
 * Show a system notification when the tab is backgrounded (permission permitting).
 * Safe no-op if permission denied or API unavailable.
 */
export function notifyReminder(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'kynthai-med-reminder',
      requireInteraction: true,
      silent: false,
      renotify: true,
    } as NotificationOptions)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch { /* ignore */ }
}

/** Request notification permission once (call after user enables alarm). */
export function requestAlarmNotificationPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

/** Play a single tone — tracks the oscillator so it can be stopped. */
function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume = 0.3,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, startTime)
  gain.gain.setValueAtTime(volume, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
  activeOscillators.push(osc)
  // Remove from tracking when it naturally finishes
  osc.onended = () => {
    activeOscillators = activeOscillators.filter((o) => o !== osc)
    if (activeOscillators.length === 0) {
      _isRinging = false
    }
  }
}

/** Whether a ringtone is currently playing. */
export function isAlarmRinging(): boolean {
  return _isRinging
}

let _alarmLoop: ReturnType<typeof setInterval> | null = null

/** Immediately stop all active ringtones and the continuous alarm loop. */
export function stopAllRingtones() {
  if (_alarmLoop) {
    clearInterval(_alarmLoop)
    _alarmLoop = null
  }
  for (const osc of activeOscillators) {
    try { osc.stop() } catch { /* already stopped */ }
  }
  activeOscillators = []
  _isRinging = false
}

/**
 * Keep ringing until stopAllRingtones() — real alarm behavior for doses / SOS.
 * mode: 'professional' | 'alert'
 */
export function startContinuousAlarm(mode: 'professional' | 'alert' = 'alert') {
  stopAllRingtones()
  const tick = () => {
    if (mode === 'alert') playAlertRingtoneOnce()
    else playProfessionalRingtoneOnce()
  }
  tick()
  _alarmLoop = setInterval(tick, 8500)
}

function stopOscillatorsOnly() {
  for (const osc of activeOscillators) {
    try { osc.stop() } catch { /* already stopped */ }
  }
  activeOscillators = []
}

function playProfessionalRingtoneOnce() {
  try {
    stopOscillatorsOnly()
    _isRinging = true
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    for (let cycle = 0; cycle < 8; cycle++) {
      const t = now + cycle * 1.25
      playTone(ctx, 523.25, t, 0.4, 0.22, 'sine')
      playTone(ctx, 659.25, t + 0.15, 0.4, 0.22, 'sine')
      playTone(ctx, 783.99, t + 0.3, 0.6, 0.22, 'sine')
      playTone(ctx, 1046.5, t + 0.7, 0.5, 0.15, 'sine')
    }
  } catch {
    _isRinging = false
  }
}

function playAlertRingtoneOnce() {
  try {
    stopOscillatorsOnly()
    _isRinging = true
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < 28; i++) {
      const t = now + i * 0.35
      playTone(ctx, 880, t, 0.25, 0.45, 'square')
      playTone(ctx, 660, t + 0.08, 0.18, 0.2, 'sine')
    }
  } catch {
    _isRinging = false
  }
}

/**
 * Play the professional ringtone — gentle ascending chime.
 * Loops the melody to fill approximately 10 seconds.
 */
export function playProfessionalRingtone() {
  startContinuousAlarm('professional')
}

/**
 * Play the alert ringtone — louder repeating beep for elderly users.
 * Repeats the beep pattern to fill approximately 10 seconds.
 */
export function playAlertRingtone() {
  startContinuousAlarm('alert')
}

/**
 * Play a single gentle chime — for when a medication is marked as taken.
 */
export function playSuccessChime() {
  try {
    // Don't stop existing ringtone — success chime plays on top
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime

    playTone(ctx, 783.99, now, 0.15, 0.2, 'sine')   // G5
    playTone(ctx, 1046.5, now + 0.1, 0.25, 0.2, 'sine') // C6
  } catch {
    // silently ignore
  }
}
