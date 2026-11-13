import { beforeAll, describe, expect, it } from 'vitest'
import { decryptHealthFile, encryptHealthFile } from '@/lib/encryption'

beforeAll(() => {
  // 64 hex chars ’ a real 32-byte master key for this suite.
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('decryptHealthFile', () => {
  it('round-trips the envelope format used by medical documents', () => {
    const raw = Buffer.from('Rx: amoxicillin 500mg  BP < 120 and > 90', 'utf8')
    const encrypted = encryptHealthFile(raw)

    const decrypted = decryptHealthFile(encrypted)

    expect(decrypted.equals(raw)).toBe(true)
  })

  it('rejects a tampered auth tag in the envelope format', () => {
    const raw = Buffer.from('phi')
    const encrypted = encryptHealthFile(raw)
    // Tamper with the auth tag (bytes 29-44 in the envelope)
    const tampered = Buffer.from(encrypted)
    const idx = 29
    const val = tampered[idx]
    if (val !== undefined) {
      tampered[idx] = val ^ 0xff
    }

    expect(() => decryptHealthFile(tampered)).toThrow()
  })
})