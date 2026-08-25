/**
 * Kynthai medication ringtone — ONE professional clinical chime only.
 * Primary file: /med-chime.wav
 * No loud beep / square-wave / system alarm tones in-app.
 */

let audioCtx: AudioContext | null = null
let activeOscillators: OscillatorNode[] = []
let _isRinging = false
let _audioUnlocked = false
let _htmlAudio: HTMLAudioElement | null = null
let _alarmLoop: ReturnType<typeof setInterval> | null = null

const CHIME_SRC = '/med-chime.wav'

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
  if (!_htmlAudio || _htmlAudio.getAttribute('data-src') !== CHIME_SRC) {
    try {
      const a = new Audio(CHIME_SRC)
      a.preload = 'auto'
      a.loop = false
      a.setAttribute('playsinline', 'true')
      a.setAttribute('webkit-playsinline', 'true')
      a.setAttribute('data-src', CHIME_SRC)
      _htmlAudio = a
    } catch {
      return null
    }
  }
  return _htmlAudio
}

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
      gain.gain.value = 0.0005
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
  const html = getHtmlAudio()
  if (html) {
    try {
      html.volume = 0.01
      const p = html.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          html.pause()
          html.currentTime = 0
          html.volume = 0.8
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
  let ms = target.getTime() - Date.now()
  if (ms < -60_000) ms += 24 * 60 * 60 * 1000
  return ms
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
  volume = 0.18,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, startTime)
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.04)
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

function playChimeFile(): boolean {
  const html = getHtmlAudio()
  if (!html) return false
  try {
    html.loop = false
    html.volume = 0.8
    html.currentTime = 0
    const p = html.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
    return true
  } catch {
    return false
  }
}

/** Soft ascending clinical chime (C–E–G–C) via WAV or sine fallback. */
function playChimeOnce() {
  try {
    stopOscillatorsOnly()
    _isRinging = true
    if (playChimeFile()) return
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    const notes: Array<[number, number, number]> = [
      [523.25, 0, 0.35],
      [659.25, 0.28, 0.32],
      [783.99, 0.56, 0.3],
      [1046.5, 0.9, 0.45],
    ]
    for (const [freq, start, dur] of notes) {
      playTone(ctx, freq, now + start, dur, 0.2, 'sine')
    }
  } catch {
    _isRinging = false
  }
}

/** Continuous soft chime until stopAllRingtones(). Mode arg ignored (always chime). */
export function startContinuousAlarm(_mode?: 'professional' | 'alert') {
  stopAllRingtones()
  _isRinging = true
  unlockAudio()
  const tick = () => {
    if (!_isRinging) return
    playChimeOnce()
  }
  tick()
  _alarmLoop = setInterval(tick, 5500)
}

export function playProfessionalRingtone() {
  startContinuousAlarm('professional')
}

/** @deprecated Always uses soft chime — kept for call-site compatibility */
export function playAlertRingtone() {
  startContinuousAlarm('professional')
}

export function playSuccessChime() {
  try {
    if (playChimeFile()) return
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    playTone(ctx, 659.25, now, 0.12, 0.16, 'sine')
    playTone(ctx, 1046.5, now + 0.1, 0.2, 0.16, 'sine')
  } catch {
    /* ignore */
  }
}

export type TimedReminder = { id: string; time: string; status?: string }

/** Due if scheduled time is now or up to 15 minutes past (still pending). */
export function pickDueReminder<T extends TimedReminder>(reminders: T[]): T | null {
  const now = Date.now()
  let best: T | null = null
  let bestDelta = Infinity
  for (const r of reminders) {
    if (r.status && r.status !== 'pending') continue
    const ms = msUntilReminder(r.time)
    // msUntilReminder returns negative if within last 60s past, else +24h
    // Treat -60s..+15s as due; also 0..wait if we just crossed
    if (ms <= 15_000 && ms >= -60_000) {
      const delta = Math.abs(ms)
      if (delta < bestDelta) {
        bestDelta = delta
        best = r
      }
    }
  }
  return best
}

export function pickNextFutureReminder<T extends TimedReminder>(reminders: T[]): T | null {
  let best: T | null = null
  let bestWait = Infinity
  for (const r of reminders) {
    if (r.status && r.status !== 'pending') continue
    const ms = msUntilReminder(r.time)
    if (ms > 15_000 && ms < bestWait) {
      bestWait = ms
      best = r
    }
  }
  return best
}

export function notifyReminder(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'kynthai-dose-alarm',
      silent: false,
    })
    n.onclick = () => {
      try {
        window.focus()
      } catch {
        /* ignore */
      }
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
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'kynthai-dose-alarm',
      silent: false,
      data: { url: '/patient?alarm=1', isDose: true, isClinical: true },
    })
  } catch {
    notifyReminder(title, body)
  }
}
