import { test, expect } from 'vitest'
import { randomUUID, randomBytes } from 'node:crypto'
import { db, createRecordsAtomically, recordUsageAtomically, reserveAiUsage } from '../src/lib/supabase-db'
import { initializeMedicalDocumentsBucket, uploadAndStoreDocument, downloadMedicalDocument, decryptDocument, deleteMedicalDocument } from '../src/lib/storage'

test.skipIf(process.env.RUN_LIVE_PERSISTENCE !== '1')('live synthetic encrypted persistence, isolation, storage, and rollback', async () => {
  if (process.env.RUN_LIVE_PERSISTENCE !== '1') throw new Error('Explicit RUN_LIVE_PERSISTENCE=1 required')
  // Synthetic-only process key; no production PHI is read or decrypted.
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex')
  const id = randomUUID(), uid = `probe-${id}`, other = `probe-other-${id}`
  let storagePath: string | undefined
  try {
    await db.user.create({ data: { id: uid, email: `${uid}@example.invalid`, name: 'Synthetic persistence probe' } })
    await db.user.create({ data: { id: other, email: `${other}@example.invalid`, name: 'Synthetic other user' } })
    await Promise.all(Array.from({ length: 8 }, () => recordUsageAtomically(uid, 'ai_chat', 'ai_chat')))
    expect((await db.freeTierUsage.findFirst({ where: { userId: uid, feature: 'ai_chat' } })).count).toBe(8)
    expect(await db.freeTierUsageAudit.count({ where: { userId: uid } })).toBe(8)
    const reservations = await Promise.all(Array.from({ length: 9 }, () => reserveAiUsage(other, 5)))
    expect(reservations.filter(Boolean)).toHaveLength(5)
    expect((await db.freeTierUsage.findFirst({ where: { userId: other, feature: 'ai_chat' } })).count).toBe(5)
    const subscriber = await db.newsletterSubscriber.create({ data: { email: `${uid}@example.invalid`, source: 'synthetic-repair-test' } })
    expect(subscriber.createdAt).toBeInstanceOf(Date)
    expect((await db.newsletterSubscriber.findFirst({ where: { email: `${uid}@example.invalid` }, orderBy: { createdAt: 'desc' } })).id).toBe(subscriber.id)
    const medication = await db.medication.create({ data: { userId: uid, name: 'Synthetic medication', dosage: 'test only', times: '[]', frequency: 'daily' } })
    expect(medication.name).toBe('Synthetic medication')
    expect(await db.medication.findFirst({ where: { id: medication.id, userId: other } })).toBeNull()
    await db.medication.update({ where: { id: medication.id }, data: { dosage: 'updated synthetic dose' } })
    expect((await db.medication.findUnique({ where: { id: medication.id } })).dosage).toBe('updated synthetic dose')
    const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
    const raw = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/medications?id=eq.${medication.id}&select=name,name_enc`, { headers })
    expect(raw.status).toBe(200)
    const stored = (await raw.json())[0]
    expect(stored.name).not.toBe('Synthetic medication')
    expect(stored.name_enc).toBeTruthy()
    await db.healthJournal.create({ data: { userId: uid, date: new Date('2026-11-16'), notes: 'Synthetic journal', symptoms: '[]' } })
    expect((await db.healthJournal.findFirst({ where: { userId: uid } })).notes).toBe('Synthetic journal')
    const family = await db.family.create({ data: { ownerId: uid, name: 'Synthetic test family' } })
    const member = await db.familyMember.create({ data: { familyId: family.id, userId: uid, name: 'Synthetic member', relation: 'self' } })
    const alertId = `rollback-${id}`
    await expect(createRecordsAtomically([
      { model: 'FamilyHealthAlert', data: { id: alertId, familyId: family.id, memberId: member.id, type: 'test', title: 'Synthetic rollback', message: 'Synthetic message' } },
      { model: 'User', data: { id: `forbidden-${id}`, email: 'forbidden@example.invalid' } },
    ])).rejects.toThrow()
    expect(await db.familyHealthAlert.findUnique({ where: { id: alertId } })).toBeNull()
    expect((await createRecordsAtomically([{ model: 'FamilyHealthAlert', data: { familyId: family.id, memberId: member.id, type: 'test', title: 'Synthetic atomic write', message: 'Synthetic message' } }]))[0].title).toBe('Synthetic atomic write')
    expect(await initializeMedicalDocumentsBucket()).toEqual({ success: true })
    const bytes = Buffer.from('Synthetic document roundtrip; no patient data')
    const result = await uploadAndStoreDocument(uid, uid, bytes, 'synthetic.txt', 'text/plain', { type: 'OTHER', title: 'Synthetic encrypted document' })
    expect(result.error).toBeUndefined()
    const document = await db.medicalDocument.findUnique({ where: { id: result.documentId } })
    storagePath = document.storagePath
    const downloaded = await downloadMedicalDocument(storagePath!)
    expect(downloaded.error).toBeUndefined()
    expect(downloaded.data!.equals(bytes)).toBe(false)
    expect(decryptDocument(downloaded.data!, document.encryptionKey)).toEqual(bytes)
    console.log('LIVE CHECKS PASSED: encrypted CRUD, cross-user filter, ciphertext at rest, journal, atomic rollback/create, storage roundtrip')
  } finally {
    if (storagePath) expect((await deleteMedicalDocument(storagePath)).success).toBe(true)
    const families = await db.family.findMany({ where: { ownerId: uid } })
    for (const family of families) await db.familyHealthAlert.deleteMany({ where: { familyId: family.id } })
    await db.family.deleteMany({ where: { ownerId: uid } })
    await db.healthJournal.deleteMany({ where: { userId: uid } })
    await db.freeTierUsageAudit.deleteMany({ where: { userId: { in: [uid, other] } } })
    await db.freeTierUsage.deleteMany({ where: { userId: { in: [uid, other] } } })
    await db.newsletterSubscriber.deleteMany({ where: { email: `${uid}@example.invalid` } })
    await db.user.deleteMany({ where: { id: { in: [uid, other] } } })
    console.log('Synthetic database fixtures cleaned')
  }
}, 120000)
