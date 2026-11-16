import { test, expect } from 'vitest'
import { randomUUID, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { db } from '../src/lib/supabase-db'
import { signSessionToken } from '../src/lib/session-signing'
import { deleteMedicalDocument } from '../src/lib/storage'

// No external target option: this harness always owns its loopback server.
test.skipIf(process.env.RUN_LIVE_NONPAYMENT_HTTP !== '1')('authenticated synthetic nonpayment HTTP journeys', async () => {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[key]) throw new Error(`Missing ${key}`)
  }
  process.env.SESSION_SIGNING_SECRET = randomBytes(32).toString('hex')
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex')
  const socket = createServer()
  await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = (socket.address() as { port: number }).port
  await new Promise<void>(resolve => socket.close(() => resolve()))
  const origin = `http://127.0.0.1:${port}`
  const server = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore',
  })
  const ids = [ `http-probe-${randomUUID()}`, `http-probe-${randomUUID()}` ]
  let familyId: string | undefined
  const milestones: string[] = []
  try {
    let ready = false
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${origin}/api/auth/csrf`)).ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    expect(ready, 'isolated Next server ready').toBe(true)
    for (const id of ids) await db.user.create({ data: { id, email: `${id}@example.invalid`, name: 'Synthetic HTTP QA', role: 'caretaker', consentAccepted: true, dataProcessingConsent: true, timezone: 'UTC' } })
    async function client(id: string) {
      const token = await signSessionToken(id)
      expect(token).toBeTruthy()
      const csrfResponse = await fetch(`${origin}/api/auth/csrf`)
      const csrf = (await csrfResponse.json()).token
      expect(csrf).toBeTruthy()
      return async (path: string, method = 'GET', body?: unknown, expected: number | null = 200, withCsrf = true) => {
        const headers: Record<string, string> = { cookie: `kynthai-session=${token}; kynthai-csrf=${csrf}`, origin }
        if (withCsrf) headers['x-csrf-token'] = csrf
        if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json'
        const response = await fetch(origin + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: 'manual' })
        // Deliberately do not print response bodies, cookies, or environment values.
        if (expected !== null) expect(response.status, `${method} ${path}`).toBe(expected)
        return response
      }
    }
    const a = await client(ids[0]), b = await client(ids[1])
    expect((await fetch(`${origin}/api/medications`)).status).toBe(401)
    await a('/api/medications', 'POST', { name: 'Synthetic', dosage: 'test' }, 403, false)
    milestones.push('anonymous denied; missing CSRF denied')
    const med = await (await a('/api/medications', 'POST', { name: 'Synthetic medication', dosage: 'test only', times: ['09:00'] })).json()
    expect(med.id).toBeTruthy()
    await b(`/api/medications/${med.id}`, 'GET', undefined, 403)
    await b(`/api/medications/${med.id}`, 'PUT', { dosage: 'forbidden' }, 403)
    await b(`/api/medications/${med.id}`, 'DELETE', undefined, 403)
    await a(`/api/medications/${med.id}`, 'PUT', { dosage: 'updated synthetic dose' })
    expect((await (await a(`/api/medications/${med.id}`)).json()).dosage).toBe('updated synthetic dose')
    milestones.push('medication create/read/update; cross-user read/write/delete denied')
    const date = new Date().toISOString().slice(0, 10)
    const reminders = await (await a(`/api/reminders?date=${date}`)).json()
    expect(reminders.some((r: any) => r.medicationId === med.id)).toBe(true)
    const dose = { medicationId: med.id, date, time: '09:00', status: 'taken' }
    await b('/api/reminders', 'POST', dose, 403)
    await a('/api/reminders', 'POST', dose)
    expect((await (await a('/api/reminders', 'POST', { ...dose, status: 'skipped' })).json()).status).toBe('taken')
    milestones.push('reminders generated; ownership enforced; taken is terminal')
    const journal = { date, notes: 'Synthetic journal', symptoms: ['synthetic'], mood: 'good' }
    await a('/api/health-journal', 'POST', journal)
    await a('/api/health-journal', 'POST', { ...journal, notes: 'Synthetic updated' })
    const entries = (await (await a('/api/health-journal')).json()).entries
    expect(entries).toHaveLength(1)
    expect(entries[0].notes).toBe('Synthetic updated')
    expect((await (await b('/api/health-journal')).json()).entries).toHaveLength(0)
    milestones.push('journal daily upsert and isolation')
    const family = await (await a('/api/family', 'POST', { name: 'Synthetic HTTP family' })).json()
    familyId = family.id
    expect(familyId).toBeTruthy()
    // Family relation expansion currently fails in the shared adapter. Keep
    // exercising independent modules and fail the overall run at the end.
    const familyRead = await fetch(`${origin}/api/family`, { headers: { cookie: `kynthai-session=${await signSessionToken(ids[0])}` } })
    const familyReadStatus = familyRead.status
    if (familyReadStatus === 200) expect((await familyRead.json()).family.id).toBe(familyId)
    await a('/api/family', 'POST', { name: 'Duplicate' }, 409)
    // Safety invariant: owner-only accepted membership, no recipients or phone targets.
    const members = await db.familyMember.findMany({ where: { familyId } })
    expect(members.every((m: any) => m.userId === ids[0])).toBe(true)
    expect(members.some((m: any) => m.userId === ids[0] && m.inviteStatus === 'accepted')).toBe(true)
    const sosResponse = await a('/api/emergency-sos', 'POST', { notes: 'Synthetic QA; no emergency' }, null)
    const sos = await sosResponse.json()
    if (sosResponse.status === 200) {
      expect(sos.success).toBe(true)
      expect(sos.notifiedContacts).toEqual([])
      expect(sos.smsSent).toBe(0)
      expect((await (await a('/api/emergency-sos')).json()).alerts).toHaveLength(1)
    }
    expect((await (await b('/api/emergency-sos')).json()).alerts).toHaveLength(0)
    milestones.push(`family create/duplicate verified; family read HTTP ${familyReadStatus}; SOS POST HTTP ${sosResponse.status}; outsider SOS list empty`)
    const complaint = await (await a('/api/complaints', 'POST', { category: 'technical', subject: 'Synthetic QA', description: 'Synthetic test only', priority: 'low' }, 201)).json()
    expect((await (await a('/api/complaints')).json()).some((c: any) => c.id === complaint.id)).toBe(true)
    expect(await (await b('/api/complaints')).json()).toEqual([])
    milestones.push('low-priority complaint persisted and isolated; no admin notification path')
    const form = new FormData()
    form.set('file', new Blob(['Synthetic HTTP document; no patient data'], { type: 'text/plain' }), 'synthetic.txt')
    form.set('type', 'OTHER'); form.set('title', 'Synthetic HTTP document')
    const uploaded = await (await a('/api/documents/upload', 'POST', form)).json()
    const docId = uploaded.document.id
    expect((await (await a('/api/documents/list')).json()).documents.some((d: any) => d.id === docId)).toBe(true)
    await b(`/api/documents/${docId}/download`, 'GET', undefined, 403)
    expect(await (await a(`/api/documents/${docId}/download`)).text()).toBe('Synthetic HTTP document; no patient data')
    expect((await (await b('/api/documents/list')).json()).documents).toEqual([])
    milestones.push('document encrypted upload/list/download and cross-user denial')
    await a(`/api/medications/${med.id}`, 'DELETE')
    await a(`/api/medications/${med.id}`, 'GET', undefined, 404)
    milestones.push('medication delete verified')
    expect(familyReadStatus, 'family read must succeed (shared adapter relation blocker)').toBe(200)
    expect(sosResponse.status, 'SOS persistence must succeed').toBe(200)
  } finally {
    server.kill('SIGTERM')
    for (const id of ids) {
      for (const doc of await db.medicalDocument.findMany({ where: { userId: id } })) {
        expect((await deleteMedicalDocument(doc.storagePath)).success, 'synthetic blob cleanup').toBe(true)
      }
      await db.medicalDocument.deleteMany({ where: { userId: id } })
      if (familyId) {
        await db.emergencyAlert.deleteMany({ where: { familyId } })
        await db.familyHealthAlert.deleteMany({ where: { familyId } })
      }
      await db.family.deleteMany({ where: { ownerId: id } })
      await db.complaint.deleteMany({ where: { userId: id } })
      await db.healthJournal.deleteMany({ where: { userId: id } })
      await db.medication.deleteMany({ where: { userId: id } })
      await db.auditLog.deleteMany({ where: { userId: id } })
      await db.user.deleteMany({ where: { id } })
      expect(await db.user.findUnique({ where: { id } })).toBeNull()
    }
    console.log('Verified HTTP milestones:', milestones.join('; '))
    console.log('Synthetic fixtures and blobs cleaned; server stopped')
  }
}, 600000)
