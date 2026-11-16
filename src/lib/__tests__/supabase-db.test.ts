import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, createRecordsAtomically } from '../supabase-db'

const fetchMock = vi.fn()
const reply = (rows: any, status = 200, headers = {}) => new Response(JSON.stringify(rows), { status, headers })
const query = (i = 0) => new URL(fetchMock.mock.calls[i][0])
const body = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body)

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-key')
  vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

describe('PostgREST database contract', () => {
  it('requires the server credential, never silently falls back to anon', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    await expect(db.medication.findMany()).rejects.toThrow('SERVICE_ROLE_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('surfaces database failure instead of returning empty success', async () => {
    fetchMock.mockResolvedValue(reply({ code: '42501' }, 403))
    await expect(db.medication.findMany()).rejects.toMatchObject({ status: 403, code: 'DATABASE_ERROR' })
  })
  it('maps uniqueness failures for existing conflict handlers', async () => {
    fetchMock.mockResolvedValue(reply({ code: '23505' }, 409))
    await expect(db.reminder.create({ data: { medicationId: 'm', date: '2026-11-16', time: '09:00' } })).rejects.toMatchObject({ code: 'P2002' })
  })
  it('preserves all date range operators and grouped OR/null filters', async () => {
    fetchMock.mockResolvedValue(reply([]))
    await db.reminder.findMany({ where: { date: { gte: new Date('2026-11-16'), lt: new Date('2026-11-17') }, OR: [{ status: 'pending' }, { takenAt: null }] } })
    expect(query().searchParams.get('and')).toContain('date.gte."2026-11-16T00:00:00.000Z"')
    expect(query().searchParams.get('and')).toContain('date.lt."2026-11-17T00:00:00.000Z"')
    expect(query().searchParams.get('and')).toContain('or(status.eq."pending",takenAt.is.null)')
  })
  it('escapes values that contain PostgREST grammar characters', async () => {
    fetchMock.mockResolvedValue(reply([]))
    await db.user.findFirst({ where: { email: 'x,or(role.eq.admin)@test.invalid' } })
    expect(query().searchParams.get('and')).toBe('(email.eq."x,or(role.eq.admin)@test.invalid")')
  })
  it('rejects unknown filter operators rather than widening authorization', async () => {
    await expect(db.user.findMany({ where: { email: { evil: 'ignored?' } } })).rejects.toThrow('Unsupported filter')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('flattens compound keys and updates only the update branch in upsert', async () => {
    fetchMock.mockResolvedValueOnce(reply([{ id: 'r', medicationId: 'm', status: 'pending' }]))
      .mockResolvedValueOnce(reply([{ id: 'r', status: 'taken' }]))
    const result = await db.reminder.upsert({ where: { medicationId_date_time: { medicationId: 'm', date: '2026-11-16', time: '09:00' } }, create: { medicationId: 'm', date: '2026-11-16', time: '09:00', status: 'pending' }, update: { status: 'taken' } })
    expect(query().searchParams.get('and')).toContain('medicationId.eq."m"')
    expect(body(1)).toMatchObject({ status: 'taken' })
    expect(body(1)).not.toHaveProperty('medicationId')
    expect(result.status).toBe('taken')
  })
  it('supports batch reminder creation without imaginary timestamp columns', async () => {
    fetchMock.mockResolvedValue(reply([{ id: 'r' }]))
    expect(await db.reminder.createMany({ data: [{ medicationId: 'm', date: '2026-11-16', time: '09:00' }], skipDuplicates: true })).toEqual({ count: 1 })
    expect(body()[0]).toHaveProperty('updatedAt')
    expect(body()[0]).not.toHaveProperty('uploadedAt')
    expect(fetchMock.mock.calls[0][1].headers.Prefer).toContain('ignore-duplicates')
  })
  it('executes conditional bulk updates and reports their real count', async () => {
    fetchMock.mockResolvedValue(reply([{ id: 'n1' }, { id: 'n2' }]))
    expect(await db.notificationLog.updateMany({ where: { userId: 'u', status: 'sent' }, data: { status: 'read' } })).toEqual({ count: 2 })
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
    expect(query().searchParams.get('and')).toContain('status.eq."sent"')
  })
  it('executes deletion and reports the real count', async () => {
    fetchMock.mockResolvedValue(reply([{ id: 'c' }]))
    expect(await db.chatMessage.deleteMany({ where: { userId: 'u' } })).toEqual({ count: 1 })
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })
  it('does not mutate caller input and encrypts medication PHI on writes', async () => {
    fetchMock.mockImplementation(async (_url, options) => reply([JSON.parse(options.body)]))
    const data = { userId: 'u', name: 'Private medication', dosage: '10mg' }
    const result = await db.medication.create({ data })
    expect(data).toEqual({ userId: 'u', name: 'Private medication', dosage: '10mg' })
    expect(body().name).toBeNull()
    expect(body().name_enc).toBeTruthy()
    expect(result.name).toBe('Private medication')
    expect(result).not.toHaveProperty('name_enc')
    expect(result.createdAt).toBeInstanceOf(Date)
  })
  it('decrypts narrow selected journal fields without leaking shadows', async () => {
    fetchMock.mockImplementationOnce(async (_url, options) => reply([JSON.parse(options.body)]))
    await db.healthJournal.create({ data: { userId: 'u', date: new Date('2026-11-16'), symptoms: '["headache"]', notes: 'private' } })
    const stored = body()
    fetchMock.mockResolvedValueOnce(reply([stored]))
    const rows = await db.healthJournal.findMany({ select: { notes: true, date: true } })
    expect(rows[0]).toEqual({ notes: 'private', date: new Date('2026-11-16') })
  })
  it('loads relations used by family ownership and reminder delivery', async () => {
    fetchMock.mockResolvedValueOnce(reply([{ id: 'member', familyId: 'f' }]))
      .mockResolvedValueOnce(reply([{ id: 'f', ownerId: 'u' }]))
    const member = await db.familyMember.findUnique({ where: { id: 'member' }, include: { family: true } })
    expect(member.family.ownerId).toBe('u')
  })
  it('resolves relation predicates before the parent ownership query', async () => {
    fetchMock.mockResolvedValueOnce(reply([{ id: 'f', ownerId: 'u' }])).mockResolvedValueOnce(reply([{ id: 'm', familyId: 'f' }]))
    await db.familyMember.findFirst({ where: { id: 'm', family: { ownerId: 'u' } } })
    expect(query(1).searchParams.get('and')).toContain('familyId.in.("f")')
  })
  it('select does not accidentally expose the whole user profile', async () => {
    fetchMock.mockResolvedValue(reply([{ id: 'u', email: 'u@test.invalid', password: 'secret' }]))
    expect(await db.user.findUnique({ where: { id: 'u' }, select: { id: true } })).toEqual({ id: 'u' })
  })
  it('reads exact counts without downloading all rows', async () => {
    fetchMock.mockResolvedValue(reply([], 200, { 'content-range': '*/11' }))
    expect(await db.medication.count({ where: { userId: 'u', active: true } })).toBe(11)
    expect(query().searchParams.get('limit')).toBe('0')
  })
  it('refuses to pretend HTTP requests are an atomic transaction', () => {
    expect(() => db.$transaction(async () => {})).toThrow('atomic database RPC')
    expect(() => db.$executeRawUnsafe('DELETE FROM users')).toThrow('atomic database RPC')
  })
})

describe('atomic clinical write contract', () => {
  it('sends all encrypted rows through one database RPC', async () => {
    fetchMock.mockImplementation(async (_url, options) => reply(JSON.parse(options.body).records.map((r: any) => r.data)))
    const rows = await createRecordsAtomically([
      { model: 'medication', data: { userId: 'u', name: 'Test', dosage: '10mg' } },
      { model: 'prescription', data: { doctorId: 'd', patientId: 'u', medications: '[]' } },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(query().pathname).toBe('/rest/v1/rpc/kynthai_atomic_create')
    expect(body().records[0].data.name).toBeNull()
    expect(rows[0].name).toBe('Test')
  })
  it('propagates a failed batch without claiming any rows succeeded', async () => {
    fetchMock.mockResolvedValue(reply({ code: '23503' }, 409))
    await expect(createRecordsAtomically([{ model: 'emergencyAlert', data: { familyId: 'missing', reporterId: 'u' } }])).rejects.toMatchObject({ code: 'P2003' })
  })
})

describe('relation expansion and grouped summaries', () => {
  it('omits empty AND objects from relation queries', async () => {
    fetchMock.mockResolvedValueOnce(reply([{ id: 'f', ownerId: 'u' }])).mockResolvedValueOnce(reply([]))
    await db.family.findUnique({ where: { id: 'f' }, include: { members: true } })
    expect(query(1).searchParams.get('and')).toBe('(and(familyId.eq."f"))')
    expect(query(1).searchParams.get('and')).not.toContain('and()')
  })
  it('groups distinct patient identifiers and aggregates counts', async () => {
    fetchMock.mockResolvedValue(reply([{ patientId: 'a', price: 5 }, { patientId: 'a', price: 7 }, { patientId: 'b', price: 2 }]))
    const groups = await db.appointment.groupBy({ by: ['patientId'], _count: { _all: true }, _sum: { price: true } })
    expect(groups).toEqual([{ patientId: 'a', _count: { _all: 2 }, _sum: { price: 12 } }, { patientId: 'b', _count: { _all: 1 }, _sum: { price: 2 } }])
  })
})
