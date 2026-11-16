import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
const m = vi.hoisted(() => ({ appointment: vi.fn(), doctor: vi.fn(), memberships: vi.fn(), member: vi.fn(), prescriptions: vi.fn(), prescription: vi.fn(), update: vi.fn(), auth: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { appointment: { findUnique: m.appointment }, doctorProfile: { findUnique: m.doctor }, familyMember: { findMany: m.memberships, findFirst: m.member }, prescription: { findMany: m.prescriptions, findFirst: m.prescription, update: m.update } } }))
vi.mock('@/lib/auth', () => ({ logAudit: m.audit }))
vi.mock('@/lib/security', () => ({ rateLimit: () => null, sanitizeText: (v: string) => v }))
vi.mock('@/lib/api-helpers', () => ({ requireAuth: m.auth, requireAuthWithCsrf: m.auth, checkConsent: () => null, readJson: (r: Request) => r.json(), jsonError: (error: string, status: number) => Response.json({ error }, { status }), jsonOk: (data: unknown) => Response.json(data), parseJsonCol: (v: string) => JSON.parse(v) }))
import { canJoinAppointment } from '../video-authorization'
import { POST as token } from '@/app/api/video-call/token/route'
import { verifyVideoToken } from '@/lib/video-token'
import { GET as prescriptions, POST as createPrescription } from '@/app/api/prescriptions/route'
import { POST as acceptInvite } from '@/app/api/invite/route'
const user = { id: 'patient', name: 'Patient', role: 'patient', email: 'patient@test.invalid' }
const req = (body: unknown) => new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }) as any
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ user }); m.memberships.mockResolvedValue([]); process.env.VIDEO_TOKEN_SECRET = 'test-only-secret'; m.appointment.mockResolvedValue({ patientId: user.id, doctorId: 'd', status: 'confirmed', deletedAt: null }) })
describe('video transport and token authorization', () => {
  it('permits the patient but rejects canceled/deleted appointments', async () => {
    expect(await canJoinAppointment(user, 'a')).toBe(true)
    m.appointment.mockResolvedValue({ patientId: user.id, status: 'cancelled' })
    expect(await canJoinAppointment(user, 'a')).toBe(false)
    m.appointment.mockResolvedValue({ patientId: user.id, status: 'confirmed', deletedAt: new Date() })
    expect(await canJoinAppointment(user, 'a')).toBe(false)
  })
  it('requires an assigned verified doctor', async () => {
    m.doctor.mockResolvedValue({ id: 'other', verified: true })
    expect(await canJoinAppointment({ id: 'doc', role: 'doctor' }, 'a')).toBe(false)
    m.doctor.mockResolvedValue({ id: 'd', verified: true })
    expect(await canJoinAppointment({ id: 'doc', role: 'doctor' }, 'a')).toBe(true)
  })
  it('filters family access to accepted caretakers and accepted patients', async () => {
    m.memberships.mockResolvedValue([{ familyId: 'f' }]); m.member.mockResolvedValue({ id: 'p' })
    expect(await canJoinAppointment({ id: 'care', role: 'caretaker' }, 'a')).toBe(true)
    expect(m.memberships).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'care', role: 'caretaker', inviteStatus: 'accepted' } }))
    expect(m.member.mock.calls[0][0].where.inviteStatus).toBe('accepted')
  })
  it('cannot mint arbitrary rooms and derives the room from the authorized appointment', async () => {
    expect((await token(req({ roomName: 'secret-room' }))).status).toBe(400)
    const res = await token(req({ appointmentId: 'a', roomName: 'secret-room' }))
    const data = await res.json(); expect(data.roomName).toBe('kynthai-a'); expect(verifyVideoToken(data.token)?.uid).toBe(user.id)
    m.appointment.mockResolvedValue(null)
    expect((await token(req({ appointmentId: 'other' }))).status).toBe(403)
  })
  it('rejects signed tokens without expiry or with trailing segments', () => {
    const payload = JSON.stringify({ uid: 'u', name: 'U', room: 'r' })
    const signed = `${Buffer.from(payload).toString('base64url')}.${crypto.createHmac('sha256', process.env.VIDEO_TOKEN_SECRET!).update(payload).digest('hex')}`
    expect(verifyVideoToken(signed)).toBeNull(); expect(verifyVideoToken(signed + '.extra')).toBeNull()
  })
})
describe('prescription confidentiality and integrity', () => {
  it('doctorId alone cannot expose other patients prescriptions', async () => {
    m.prescriptions.mockResolvedValue([])
    await prescriptions({ nextUrl: new URL('http://localhost/api/prescriptions?doctorId=d') } as any)
    expect(m.prescriptions.mock.calls[0][0].where.AND).toContainEqual({ patientId: user.id })
  })
  it('a leaked invite cannot transfer a prescription to another account', async () => {
    m.prescription.mockResolvedValue({ id: 'rx', patientId: 'victim' })
    expect((await acceptInvite(req({ token: 'leaked' }))).status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('consumes a legitimate invite without changing patient ownership', async () => {
    m.prescription.mockResolvedValue({ id: 'rx', patientId: user.id }); m.update.mockResolvedValue({})
    expect((await acceptInvite(req({ token: 'valid' }))).status).toBe(200)
    expect(m.update.mock.calls[0][0].data).toEqual({ inviteStatus: 'accepted', inviteToken: null })
  })
  it('cannot bypass the verified clinical issuing workflow', async () => {
    expect((await createPrescription(req({ doctorId: 'impersonated', medications: [] }))).status).toBe(403)
  })
})
