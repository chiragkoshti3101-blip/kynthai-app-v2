/**
 * In-memory capture of outbound emails when SendGrid is disabled (mock-email).
 * Used by automated QA to recover password-reset links without a real mailbox.
 * Never enabled in production.
 */

export type CapturedEmail = {
  to: string
  subject: string
  html?: string
  text?: string
  capturedAt: string
}

const sink: CapturedEmail[] = []
const MAX = 200

export function captureQaEmail(entry: Omit<CapturedEmail, 'capturedAt'>): void {
  if (process.env.NODE_ENV === 'production') return
  sink.push({ ...entry, capturedAt: new Date().toISOString() })
  while (sink.length > MAX) sink.shift()
}

export function getCapturedEmails(to?: string): CapturedEmail[] {
  if (process.env.NODE_ENV === 'production') return []
  if (!to) return [...sink]
  const norm = to.toLowerCase()
  return sink.filter(e => e.to.toLowerCase() === norm)
}

export function lastCapturedEmail(to: string): CapturedEmail | undefined {
  const list = getCapturedEmails(to)
  return list[list.length - 1]
}

export function clearQaEmailSink(): void {
  if (process.env.NODE_ENV === 'production') return
  sink.length = 0
}

/** Extract first `token=` query param from a reset link in email HTML. */
export function extractResetTokenFromEmail(html: string): string | null {
  const m =
    html.match(/reset-password\?token=([a-f0-9]+)/i) ||
    html.match(/token=([a-f0-9]{32,})/i)
  return m?.[1] ?? null
}
