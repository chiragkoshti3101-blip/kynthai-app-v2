import { beforeAll, describe, expect, it } from 'vitest'
import { decryptFile, encryptFile } from '@/lib/encryption'

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

  it('rejects a tampered auth tag in the split form', () => {
    const { encryptedData, iv, salt, authTag } = encryptFile(Buffer.from('phi'))
    const tampered = Buffer.from(authTag)
    tampered[0] = (tampered[0] ?? 0) ^ 0xff

    expect(() => decryptFile(encryptedData, iv, salt, tampered)).toThrow()
  })
})
