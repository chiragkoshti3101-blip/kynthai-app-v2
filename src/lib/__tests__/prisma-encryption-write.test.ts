import { beforeAll, describe, expect, it } from 'vitest'
import { encryptSensitiveFields } from '@/lib/prisma-encryption-middleware'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'b'.repeat(64)
})

describe('prisma encryption writes', () => {
  it('clears plaintext when encrypting medication fields on create', () => {
    const payload = encryptSensitiveFields(
      { name: 'Lisinopril', dosage: '10mg', instructions: 'Take daily', notes: '' },
      'Medication',
    )
    expect(payload.name_enc).toBeTruthy()
    expect(payload.name).toBeNull()
    expect(payload.dosage_enc).toBeTruthy()
    expect(payload.dosage).toBeNull()
  })

  it('clears plaintext when only *_enc is supplied', () => {
    const ciphertext = encryptSensitiveFields({ name: 'Aspirin' }, 'Medication').name_enc!
    const payload = encryptSensitiveFields({ name_enc: ciphertext }, 'Medication')
    expect(payload.name_enc).toBe(ciphertext)
    expect(payload.name).toBeNull()
  })
})
