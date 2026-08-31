import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: { medicalDocument: { findMany } },
}))

import { validateProviderDocuments } from '@/lib/provider-documents'

const doctorLicense = {
  id: 'doc-doctor-license',
  title: 'doctor certification — license',
  description: JSON.stringify({ provider: 'doctor', slot: 'license' }),
  mimeType: 'application/pdf',
  fileSize: 1234,
}

beforeEach(() => findMany.mockReset())

describe('provider certification document references', () => {
  it('accepts a storage document ID without requiring a US NPI', async () => {
    findMany.mockResolvedValue([doctorLicense])

    const result = await validateProviderDocuments(
      { license: { id: doctorLicense.id } },
      'provider-user',
      'doctor',
    )

    expect(result).toEqual({
      ok: true,
      documents: [{ id: doctorLicense.id, name: doctorLicense.title, type: 'application/pdf', size: 1234, slot: 'license' }],
    })
  })

  it('rejects legacy filename-only or base64 profile payloads', async () => {
    const filenameOnly = await validateProviderDocuments(
      { license: { name: 'license.pdf' } },
      'provider-user',
      'doctor',
    )
    const base64Payload = await validateProviderDocuments(
      { license: { id: 'data:application/pdf;base64,abc' } },
      'provider-user',
      'doctor',
    )

    expect(filenameOnly.ok).toBe(false)
    expect(base64Payload.ok).toBe(false)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('rejects a document bound to another provider role or slot', async () => {
    findMany.mockResolvedValue([doctorLicense])

    const result = await validateProviderDocuments(
      { degree: { id: doctorLicense.id } },
      'provider-user',
      'doctor',
    )

    expect(result).toEqual({
      ok: false,
      error: 'Certification document metadata does not match the submitted provider slot.',
    })
  })
})
