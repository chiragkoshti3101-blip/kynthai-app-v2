import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ storage: { listBuckets: mocks.list, createBucket: mocks.create, updateBucket: mocks.update } }) }))
vi.mock('@/lib/db', () => ({ db: {} }))
import { initializeMedicalDocumentsBucket } from '../storage'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key')
  mocks.update.mockResolvedValue({ error: null })
  mocks.create.mockResolvedValue({ error: null })
})
describe('medical storage bucket provisioning', () => {
  it('fails on list errors instead of assuming the bucket is absent', async () => {
    mocks.list.mockResolvedValue({ error: new Error('Access denied') })
    expect(await initializeMedicalDocumentsBucket()).toEqual({ success: false, error: 'Access denied' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('makes existing buckets private and accepts encrypted bytes without removing MIME types', async () => {
    mocks.list.mockResolvedValue({ data: [{ name: 'medical-documents', public: true, allowed_mime_types: ['application/pdf'] }] })
    expect(await initializeMedicalDocumentsBucket()).toEqual({ success: true })
    expect(mocks.update).toHaveBeenCalledWith('medical-documents', { public: false, allowedMimeTypes: ['application/pdf', 'application/octet-stream'] })
  })
  it('does not restrict a private bucket with unrestricted MIME types', async () => {
    mocks.list.mockResolvedValue({ data: [{ name: 'medical-documents', public: false, allowed_mime_types: null }] })
    expect(await initializeMedicalDocumentsBucket()).toEqual({ success: true })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('propagates bucket update failures', async () => {
    mocks.list.mockResolvedValue({ data: [{ name: 'medical-documents', public: false, allowed_mime_types: ['image/png'] }] })
    mocks.update.mockResolvedValue({ error: new Error('Update denied') })
    expect(await initializeMedicalDocumentsBucket()).toEqual({ success: false, error: 'Update denied' })
  })
})
