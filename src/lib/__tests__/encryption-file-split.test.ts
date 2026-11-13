import { beforeAll, describe, expect, it } from 'vitest'
import { decryptFile, encryptFile, encryptHealthFile } from '@/lib/encryption'

beforeAll(() => {
  // 64 hex chars → a real 32-byte master key for this suite.
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('decryptFile', () => {
  it('round-trips the split form used by medical documents', () => {
    const raw = Buffer.from('Rx: amoxicillin 500mg — BP < 120 and > 90', 'utf8')
    const { encryptedData, iv, salt, authTag } = encryptFile(raw)

    const decrypted = decryptFile(encryptedData, iv, salt, authTag)

    expect(decrypted.equals(raw)).toBe(true)
  })

  it('still reads the packed envelope form', () => {
    const raw = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x7f])
    const stored = encryptHealthFile(raw)

    expect(decryptFile(stored).equals(raw)).toBe(true)
  })

  it('rejects a tampered auth tag in the split form', () => {
    const { encryptedData, iv, salt, authTag } = encryptFile(Buffer.from('phi'))
    const tampered = Buffer.from(authTag)
    tampered[0] = (tampered[0] ?? 0) ^ 0xff

    expect(() => decryptFile(encryptedData, iv, salt, tampered)).toThrow()
  })

  it('rejects a truncated packed envelope', () => {
    expect(() => decryptFile(Buffer.alloc(10))).toThrow(/truncated or corrupt/)
  })
})
