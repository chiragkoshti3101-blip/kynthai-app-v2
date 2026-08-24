/**
 * Kynthai medication ringtone — professional clinical tone.
 *
 * Primary: soft multi-note chime (med-chime.wav)
 * Fallback: Web Audio sine/triangle harmonies (never harsh square beeps)
 * Loops until stopAllRingtones().
 */

let audioCtx: AudioContext | null = null
let activeOscillators: OscillatorNode[] = []
let _isRinging = false
let _audioUnlocked = false
let _htmlAudio: HTMLAudioElement | null = null
let _alarmLoop: ReturnType<typeof setInterval> | null = null
let _preferredSrc = '/med-chime.wav'

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function getHtmlAudio(src = _preferredSrc): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!_htmlAudio || _htmlAudio.getAttribute('data-src') !== src) {
    try {
      const a = new Audio(src)
      a.preload = 'auto'
      a.loop = false
      a.setAttribute('playsinline', 'true')
      a.setAttribute('webkit-playsinline', 'true')
      a.setAttribute('data-src', src)
      _htmlAudio = a
    } catch {
      return null
    }
  }
  return _htmlAudio
}

/** Unlock audio after a user gesture (required on iOS/Android). */
export function unlockAudio() {
  if (typeof window === 'undefined') return
  const ctx = getAudioCtx()
  if (ctx) {
    ctx.resume().then(() => {
      _audioUnlocked = true
    }).catch(() => {})
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0.0008
      osc.type = 'sine'
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.01)
      _audioUnlocked = true
    } catch {
      /* ignore */
    }
  }
  const html = getHtmlAudio('/med-chime.wav')
  if (html) {
    try {
      html.volume = 0.01
      const p = html.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          html.pause()
          html.currentTime = 0
          html.volume = 0.85
          _audioUnlocked = true
        }).catch(() => {})
      }
    } catch {
      /* ignore */
    }
  }
}

export function msUntilReminder(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number) as [number, number]
  const target = new Date()
  target.setHours(h, m, 0, 0)
  return target.getTime() - Date.now()
}

export type DueCandidate = { id: string; time: string; status: string }

export function pickDueReminder<T extends DueCandidate>(
  pending: T[],
  graceMs = 60_000,
): T | null {
  if (!pending.length) return null
  const sorted = [...pending].sort((a, b) => msUntilReminder(a.time) - msUntilReminder(b.time))
  return sorted.find((r) => msUntilReminder(r.time) <= graceMs) ?? null
}

export function pickNextFutureReminder<T extends DueCandidate>(pending: T[]): T | null {
  if (!pending.length) return null
  const future = pending
    .map((r) => ({ r, ms: msUntilReminder(r.time) }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => a.ms - b.ms)
  return future[0]?.r ?? null
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function clinicalNotificationOptions(body: string, extra: NotificationOptions = {}): NotificationOptions {
  const ios = isIOSDevice()
  return {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'kynthai-med-reminder',
    silent: false,
    // iOS: sticky requireInteraction leaves floating banners that will not dismiss
    requireInteraction: ios ? false : true,
    renotify: ios ? false : true,
    ...(ios ? {} : { vibrate: [300, 120, 300] }),
    ...extra,
  }
}

export function notifyReminder(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    const opts = clinicalNotificationOptions(body)
    const n = new Notification(title, opts)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* ignore */
  }
}

export async function notifyReminderViaSW(title: string, body: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    notifyReminder(title, body)
    return
  }
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(
      title,
      clinicalNotificationOptions(body, {
        data: { url: '/patient?alarm=1', isDose: true, isClinical: true },
      }),
    )
  } catch {
    notifyReminder(title, body)
  }
}

export function requestAlarmNotificationPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume = 0.22,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, startTime)
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
  activeOscillators.push(osc)
  osc.onended = () => {
    activeOscillators = activeOscillators.filter((o) => o !== osc)
  }
}

export function isAlarmRinging(): boolean {
  return _isRinging
}

export function stopAllRingtones() {
  if (_alarmLoop) {
    clearInterval(_alarmLoop)
    _alarmLoop = null
  }
  for (const osc of activeOscillators) {
    try {
      osc.stop()
    } catch {
      /* already stopped */
    }
  }
  activeOscillators = []
  if (_htmlAudio) {
    try {
      _htmlAudio.pause()
      _htmlAudio.currentTime = 0
      _htmlAudio.loop = false
    } catch {
      /* ignore */
    }
  }
  _isRinging = false
}

function stopOscillatorsOnly() {
  for (const osc of activeOscillators) {
    try {
      osc.stop()
    } catch {
      /* ignore */
    }
  }
  activeOscillators = []
}

/** Play soft WAV chime once; returns true if playback started. */
function playChimeFile(src: string): boolean {
  const html = getHtmlAudio(src)
  if (!html) return false
  try {
    html.loop = false
    html.volume = 0.85
    html.currentTime = 0
    const p = html.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
    return true
  } catch {
    return false
  }
}

/** Soft ascending clinical chime (C–E–G–C). */
function playProfessionalRingtoneOnce() {
  try {
    stopOscillatorsOnly()
    _isRinging = true
    if (playChimeFile('/med-chime.wav')) return
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    // Gentle sine arpeggio — hospital / wellness style
    const notes = [
      [523.25, 0, 0.35],
      [659.25, 0.28, 0.32],
      [783.99, 0.56, 0.3],
      [1046.5, 0.9, 0.28],
    ] as const
    for (let cycle = 0; cycle < 2; cycle++) {
      const base = now + cycle * 1.6
      for (const [freq, offset, vol] of notes) {
        playTone(ctx, freq, base + offset, 0.4, vol, 'sine')
      }
    }
  } catch {
    _isRinging = false
  }
}

/** Clearer but still soft two-pulse + resolve (not square-wave alarm). */
function playAlertRingtoneOnce() {
  try {
    stopOscillatorsOnly()
    _isRinging = true
    if (playChimeFile('/sounds/med-alert.wav')) return
    if (playChimeFile('/med-chime.wav')) return
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.9
      playTone(ctx, 784, t, 0.22, 0.32, 'sine')
      playTone(ctx, 784, t + 0.28, 0.22, 0.3, 'sine')
      playTone(ctx, 988, t + 0.55, 0.35, 0.28, 'triangle')
    }
  } catch {
    _isRinging = false
  }
}

/** Continuous professional ring until stopAllRingtones(). */
export function startContinuousAlarm(mode: 'professional' | 'alert' = 'professional') {
  stopAllRingtones()
  _isRinging = true
  unlockAudio()
  const tick = () => {
    if (!_isRinging) return
    if (mode === 'alert') playAlertRingtoneOnce()
    else playProfessionalRingtoneOnce()
  }
  tick()
  // Soft spacing — not frantic
  _alarmLoop = setInterval(tick, mode === 'alert' ? 4500 : 5500)
}

export function playProfessionalRingtone() {
  startContinuousAlarm('professional')
}

export function playAlertRingtone() {
  startContinuousAlarm('alert')
}

export function playSuccessChime() {
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    playTone(ctx, 659.25, now, 0.12, 0.18, 'sine')
    playTone(ctx, 1046.5, now + 0.1, 0.2, 0.18, 'sine')
  } catch {
    /* ignore */
  }
}
