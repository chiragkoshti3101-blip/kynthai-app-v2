import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), sign: vi.fn() }))
vi.mock('@/lib/auth', () => ({ logAudit: async () => {} }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: m.find, create: m.create } } }))
vi.mock('@/lib/security', () => ({ rateLimit: () => null, sanitizeText: (s: string) => s, isValidEmail: () => true, isValidE164: () => true, validatePasswordStrengthAsync: async () => ({ valid: true }), getIp: () => 'test' }))
vi.mock('@/lib/csrf', () => ({ checkCsrf: async () => null, isSecureRequest: () => false }))
vi.mock('@/lib/session-signing', () => ({ signSessionToken: m.sign }))
vi.mock('@/lib/captcha', () => ({ isCaptchaConfigured: () => false }))
vi.mock('@/lib/fraud-guard', () => ({ checkEnrollmentGate: async () => ({ allowed: true }) }))
vi.mock('@/lib/api-helpers', () => ({ jsonError: (error: string, status: number) => Response.json({ error }, { status }), jsonOk: (v: any) => Response.json(v), readJson: (r: Request) => r.json() }))
import { POST } from '@/app/api/auth/register/route'
const req = () => new NextRequest('http://localhost/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'synthetic@example.invalid', password: 'SyntheticStrong!927', name: 'Synthetic', phone: '+15555550123', dateOfBirth: '1990-01-01' }) })
beforeEach(() => { vi.clearAllMocks(); m.sign.mockResolvedValue('signed'); m.find.mockResolvedValue(null); m.create.mockResolvedValue({ id: 'u' }) })
it('does not create an account when session signing is unavailable', async () => { m.sign.mockResolvedValue(null); expect((await POST(req())).status).toBe(503); expect(m.create).not.toHaveBeenCalled() })
it('does not expose database details on creation failure', async () => { m.create.mockRejectedValue(new Error('private-database-detail')); const response = await POST(req()); expect(response.status).toBe(500); expect(await response.text()).not.toContain('private-database-detail'); expect(m.create).toHaveBeenCalled() })
it('uses the server database adapter for duplicate checks, without outgoing email', async () => { m.find.mockResolvedValue({ id: 'existing' }); expect((await POST(req())).status).toBe(200); expect(m.find).toHaveBeenCalledWith({ where: { email: 'synthetic@example.invalid' } }); expect(m.create).not.toHaveBeenCalled() })
