import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: mocks.find } } }))
vi.mock('@/lib/api-helpers', () => ({ applyStandardHeaders: (r: Response) => r, jsonOk: (data: unknown) => Response.json(data) }))
import { GET } from '@/app/api/auth/me/route'
beforeEach(() => vi.clearAllMocks())
describe('auth/me shared authentication policy', () => {
  it('does not fetch a profile for invalid or revoked identities', async () => {
    mocks.auth.mockResolvedValue(null)
    expect(await (await GET()).json()).toEqual({ authenticated: false, user: null })
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('returns only selected profile fields from the encrypted adapter', async () => {
    mocks.auth.mockResolvedValue({ id: 'u' })
    mocks.find.mockResolvedValue({ id: 'u', name: 'Decrypted Name', emailVerified: new Date(), dateOfBirth: new Date('2000-01-01Z') })
    const body = await (await GET()).json()
    expect(body.authenticated).toBe(true)
    expect(body.user.name).toBe('Decrypted Name')
    expect(body.user.emailVerified).toBe(true)
    expect(body.user.dateOfBirth).toBe('2000-01-01T00:00:00.000Z')
    expect(mocks.find.mock.calls[0][0].select.password).toBeUndefined()
  })
  it('returns unauthenticated when the identity no longer has a profile', async () => {
    mocks.auth.mockResolvedValue({ id: 'deleted' }); mocks.find.mockResolvedValue(null)
    expect((await (await GET()).json()).authenticated).toBe(false)
  })
})
