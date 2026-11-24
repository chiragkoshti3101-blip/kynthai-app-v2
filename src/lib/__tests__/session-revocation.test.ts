import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ create: vi.fn(), audit: vi.fn(), auth: vi.fn(), session: vi.fn(), user: vi.fn(), signOut: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { revokedSession: { create: m.create } } }));
vi.mock('@/lib/auth', () => ({ logAudit: m.audit }));
vi.mock('@/lib/logger', () => ({ logger: { phiSafeError: vi.fn() } }));
vi.mock('@/lib/security', () => ({ rateLimit: m.limit }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getSession: m.session, getUser: m.user, admin: { signOut: m.signOut } } }) }));
vi.mock('@/lib/api-helpers', () => ({
  requireAuthWithCsrf: m.auth,
  readJson: async (r: NextRequest) => r.json().catch(() => null),
  jsonOk: (b: unknown) => Response.json(b),
  jsonError: (error: string, status: number, extra: unknown) => Response.json({ error, ...(typeof extra === 'object' ? extra : { code: extra }) }, { status }),
}));
import { POST as revoke } from '@/app/api/auth/revoke-sessions/route';
import { POST as sessions } from '@/app/api/auth/sessions/route';
const req = (body: unknown, local = false) => new NextRequest('https://example.test/api/auth/sessions', {
  method: 'POST', body: JSON.stringify(body), headers: local ? { cookie: 'kynthai-session=signed' } : {},
});
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ user: { id: 'owner' }, response: null });
  m.session.mockResolvedValue({ data: { session: { access_token: 'access.jwt' } }, error: null });
  m.user.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  m.signOut.mockResolvedValue({ error: null });
});
describe('session revocation', () => {
  it('persists user-scoped local revocation and passes access JWT, never user ID', async () => {
    const before = Date.now();
    expect((await revoke(req({ revokeAll: true }))).status).toBe(200);
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'owner', sessionJti: expect.any(String), reason: 'user_initiated', expiresAt: expect.any(Date) }) });
    expect(m.create.mock.calls[0][0].data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * 86400000);
    expect(m.signOut).toHaveBeenCalledWith('access.jwt', 'global');
    expect(m.user).toHaveBeenCalledWith('access.jwt');
  });
  it('returns honest partial failure and does not audit success on provider error', async () => {
    m.signOut.mockResolvedValue({ error: new Error('provider unavailable') });
    const response = await revoke(req({ revokeAll: true }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ localRevoked: true, providerRevoked: false });
    expect(m.create).toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it('fails closed on local persistence errors before provider mutation', async () => {
    m.create.mockRejectedValue(new Error('db unavailable'));
    expect((await revoke(req({ revokeAll: true }))).status).toBe(500);
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it.each([revoke, sessions])('preserves shared authentication/CSRF denials', async handler => {
    m.auth.mockResolvedValue({ response: Response.json({ error: 'denied' }, { status: 403 }), user: null });
    expect((await handler(req({ revokeAll: true, all: true }))).status).toBe(403);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.signOut).not.toHaveBeenCalled();
  });
  it('sessions POST actually revokes others using the provider scope', async () => {
    expect((await sessions(req({}))).status).toBe(200);
    expect(m.signOut).toHaveBeenCalledWith('access.jwt', 'others');
    expect(m.create).not.toHaveBeenCalled();
  });
  it('sessions POST all also persists local revocation', async () => {
    expect((await sessions(req({ all: true }, true))).status).toBe(200);
    expect(m.create).toHaveBeenCalled();
    expect(m.signOut).toHaveBeenCalledWith('access.jwt', 'global');
  });
  it('does not pretend local others-only revocation is supported', async () => {
    expect((await sessions(req({}, true))).status).toBe(501);
    expect(m.signOut).not.toHaveBeenCalled();
  });
  it('rejects arbitrary targeted JTIs without user-wide side effects', async () => {
    expect((await revoke(req({ sessionJti: 'someone-elses-jti' }))).status).toBe(501);
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each([null, [], { all: 'true' }])('validates sessions body %j', async body => {
    expect((await sessions(req(body))).status).toBe(400);
    expect(m.signOut).not.toHaveBeenCalled();
  });
  it('never signs out a provider session belonging to a different user', async () => {
    m.user.mockResolvedValue({ data: { user: { id: 'other' } }, error: null });
    expect((await revoke(req({ revokeAll: true }))).status).toBe(502);
    expect(m.signOut).not.toHaveBeenCalled();
  });
  it('does not claim provider revocation without an access JWT', async () => {
    m.session.mockResolvedValue({ data: { session: null }, error: null });
    const response = await revoke(req({ revokeAll: true }, true));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ localRevoked: true, providerRevoked: false });
    expect(m.audit).not.toHaveBeenCalled();
  });
});
