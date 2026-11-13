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

  it('encrypts medical document title and description', () => {
    const payload = encryptSensitiveFields(
      { title: 'Oncology follow-up', description: 'HIV screening result' },
      'MedicalDocument',
    )
    expect(payload.title_enc).toBeTruthy()
    expect(payload.description_enc).toBeTruthy()
    // `title` is a required column, so it keeps the empty sentinel.
    expect(payload.title).toBe('')
    expect(payload.description).toBeNull()
  })

  it('encrypts post-call clinical notes', () => {
    const payload = encryptSensitiveFields(
      { notes: 'Patient reported chest pain; referred to cardiology' },
      'VideoCall',
    )
    expect(payload.notes_enc).toBeTruthy()
    expect(payload.notes).toBeNull()
  })

  it('encrypts home-collection delivery location', () => {
    const payload = encryptSensitiveFields(
      { deliveryAddress: '12 Main St, Apt 4', deliveryCity: 'Boston', deliveryZip: '02108' },
      'LabBooking',
    )
    expect(payload.deliveryAddress_enc).toBeTruthy()
    expect(payload.deliveryCity_enc).toBeTruthy()
    expect(payload.deliveryZip_enc).toBeTruthy()
    expect(payload.deliveryAddress).toBeNull()
    expect(payload.deliveryCity).toBeNull()
    expect(payload.deliveryZip).toBeNull()
  })

  it('clears plaintext when only *_enc is supplied', () => {
    const ciphertext = encryptSensitiveFields({ name: 'Aspirin' }, 'Medication').name_enc!
    const payload = encryptSensitiveFields({ name_enc: ciphertext }, 'Medication')
    expect(payload.name_enc).toBe(ciphertext)
    expect(payload.name).toBeNull()
  })
})
