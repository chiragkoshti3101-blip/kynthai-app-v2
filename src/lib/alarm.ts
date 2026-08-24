/**
 * Kynthai Ringtone System
 * -----------------------
 * Dual-path sound so iPhone + Android actually ring:
 *   1. HTML5 Audio (/beep.wav) — most reliable on mobile after a user gesture
 *   2. Web Audio API oscillators — fallback if the file cannot play
 *
 * Continuous alarm loops until stopAllRingtones().
 */

let audioCtx: AudioContext | null = null
let activeOscillators: OscillatorNode[] = []
let _isRinging = false
let _audioUnlocked = false
let _htmlAudio: HTMLAudioElement | null = null
let _alarmLoop: ReturnType<typeof setInterval> | null = null

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

function getHtmlAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!_htmlAudio) {
    try {
      const a = new Audio('/beep.wav')
      a.preload = 'auto'
      a.loop = false
      // iOS requires playsInline for programmatic play
      a.setAttribute('playsinline', 'true')
      a.setAttribute('webkit-playsinline', 'true')
      _htmlAudio = a
    } catch {
      return null
    }
  }
  return _htmlAudio
}

/**
 * Mobile browsers suspend audio until a user gesture.
 * Call from click/touch (portal already does this on first interaction).
 */
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
      gain.gain.value = 0.001
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.01)
      _audioUnlocked = true
    } catch {
      /* ignore */
    }
  }
  const html = getHtmlAudio()
  if (html) {
    try {
      html.volume = 0.01
      const p = html.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          html.pause()
          html.currentTime = 0
          html.volume = 1
          _audioUnlocked = true
        }).catch(() => {})
      }
    } catch {
      /* ignore */
    }
  }
}

/** Milliseconds from now until a "HH:MM" time today (negative = overdue). */
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
  const due = sorted.find((r) => msUntilReminder(r.time) <= graceMs)
  return due ?? null
}

export function pickNextFutureReminder<T extends DueCandidate>(pending: T[]): T | null {
  if (!pending.length) return null
  const future = pending
    .map((r) => ({ r, ms: msUntilReminder(r.time) }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => a.ms - b.ms)
  return future[0]?.r ?? null
}

/**
 * System tray notification when tab is backgrounded.
 * silent:false is required — without it Android/iOS often play nothing.
 */
export function notifyReminder(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    const opts: NotificationOptions = {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'kynthai-med-reminder',
      requireInteraction: true,
      silent: false,
      renotify: true,
      // @ts-expect-error vibrate is widely supported but not in all TS libs
      vibrate: [400, 150, 400, 150, 400],
    }
    const n = new Notification(title, opts)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* ignore */
  }
}

/** Prefer service worker notification (works better on Android Chrome). */
export async function notifyReminderViaSW(title: string, body: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    notifyReminder(title, body)
    return
  }
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'kynthai-med-reminder',
      requireInteraction: true,
      silent: false,
      renotify: true,
      // @ts-expect-error vibrate
      vibrate: [400, 150, 400, 150, 400],
      data: { url: '/patient?alarm=1', isDose: true, isClinical: true },
    })
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

function playHtmlBeepBurst(times: number, gapMs: number) {
  const html = getHtmlAudio()
  if (!html) return false
  let played = 0
  const once = () => {
    if (played >= times || !_isRinging) return
    played++
    try {
      html.loop = false
      html.volume = 1
      html.currentTime = 0
      const p = html.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      /* ignore */
    }
    if (played < times) setTimeout(once, gapMs)
  }
  once()
  return true
}

function playProfessionalRingtoneOnce() {
  try {
    stopOscillatorsOnly()
    _isRinging = true
    // Prefer real audio file on mobile (louder, not blocked as often)
    if (playHtmlBeepBurst(3, 1400)) return
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    for (let cycle = 0; cycle < 8; cycle++) {
      const t = now + cycle * 1.25
      playTone(ctx, 523.25, t, 0.4, 0.35, 'sine')
      playTone(ctx, 659.25, t + 0.15, 0.4, 0.35, 'sine')
      playTone(ctx, 783.99, t + 0.3, 0.6, 0.35, 'sine')
      playTone(ctx, 1046.5, t + 0.7, 0.5, 0.25, 'sine')
    }
  } catch {
    _isRinging = false
  }
}

function playAlertRingtoneOnce() {
  try {
    stopOscillatorsOnly()
    _isRinging = true
    if (playHtmlBeepBurst(6, 900)) return
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < 28; i++) {
      const t = now + i * 0.35
      playTone(ctx, 880, t, 0.25, 0.55, 'square')
      playTone(ctx, 660, t + 0.08, 0.18, 0.3, 'sine')
    }
  } catch {
    _isRinging = false
  }
}

function stopOscillatorsOnly() {
  for (const osc of activeOscillators) {
    try {
      osc.stop()
    } catch {
      /* already stopped */
    }
  }
  activeOscillators = []
}

/** Keep ringing until stopAllRingtones() — real alarm behavior. */
export function startContinuousAlarm(mode: 'professional' | 'alert' = 'alert') {
  stopAllRingtones()
  _isRinging = true
  unlockAudio()
  const tick = () => {
    if (!_isRinging) return
    if (mode === 'alert') playAlertRingtoneOnce()
    else playProfessionalRingtoneOnce()
  }
  tick()
  _alarmLoop = setInterval(tick, mode === 'alert' ? 6000 : 9000)
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
    playTone(ctx, 783.99, now, 0.15, 0.25, 'sine')
    playTone(ctx, 1046.5, now + 0.1, 0.25, 0.25, 'sine')
  } catch {
    /* ignore */
  }
}
