import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), canAccess: vi.fn(), find: vi.fn(), update: vi.fn(), audit: vi.fn(), download: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { medicalDocument: { findUnique: mocks.find, update: mocks.update }, auditLog: { create: mocks.audit } } }))
vi.mock('@/lib/api-helpers', () => ({ requireAuth: mocks.requireAuth, jsonError: (error: string, status: number) => Response.json({ error }, { status }) }))
vi.mock('@/lib/auth', () => ({ canAccessDocument: mocks.canAccess }))
vi.mock('@/lib/storage', () => ({ downloadMedicalDocument: mocks.download }))
vi.mock('@/lib/logger', () => ({ logger: { phiSafeError: vi.fn() } }))
import { encryptFile } from '../encryption'
import { GET } from '@/app/api/documents/[id]/download/route'

beforeEach(() => { vi.clearAllMocks(); mocks.requireAuth.mockResolvedValue({ user: { id: 'u', email: 'u@test.invalid', role: 'patient' } }); mocks.canAccess.mockResolvedValue(true) })
describe('encrypted document downloads', () => {
  it('returns decrypted bytes, not a signed redirect to ciphertext', async () => {
    const original = Buffer.from('%PDF-1.7\nprivate document')
    const { encryptedData, iv, salt, authTag } = encryptFile(original)
    mocks.find.mockResolvedValue({ id: 'd', userId: 'u', encrypted: true, title: 'Test', type: 'LAB_RESULT', mimeType: 'application/pdf', storagePath: 'u/lab/d.pdf', encryptionKey: [iv,salt,authTag].map(b=>b.toString('base64')).join(':') })
    mocks.download.mockResolvedValue({ data: encryptedData })
    const res = await GET({} as any, { params: Promise.resolve({ id: 'd' }) })
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer())).toEqual(original)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    expect(res.headers.get('location')).toBeNull()
  })
  it('does not fetch storage bytes when the requester is unauthorized', async () => {
    mocks.find.mockResolvedValue({ id: 'd' }); mocks.canAccess.mockResolvedValue(false)
    const res = await GET({} as any, { params: Promise.resolve({ id: 'd' }) })
    expect(res.status).toBe(403)
    expect(mocks.download).not.toHaveBeenCalled()
  })
})
