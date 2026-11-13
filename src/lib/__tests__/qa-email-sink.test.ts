import { describe, expect, it, beforeEach } from 'vitest'
import {
  captureQaEmail,
  clearQaEmailSink,
  extractResetTokenFromEmail,
  lastCapturedEmail,
} from '@/lib/qa-email-sink'

describe('qa-email-sink', () => {
  beforeEach(() => clearQaEmailSink())

  it('captures mock emails and extracts reset tokens', () => {
    const token = 'a'.repeat(64)
    captureQaEmail({
      to: 'patient@demo.kynthai.app',
      subject: 'Reset',
      html: `<a href="http://localhost:3000/reset-password?token=${token}">Reset</a>`,
    })
    const last = lastCapturedEmail('patient@demo.kynthai.app')
    expect(last?.subject).toBe('Reset')
    expect(extractResetTokenFromEmail(last!.html!)).toBe(token)
  })
})
