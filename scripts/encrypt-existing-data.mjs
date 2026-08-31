#!/usr/bin/env node
/**
 * Controlled field-encryption backfill.
 *
 * This script intentionally uses the same wire format and key derivation as
 * src/lib/encryption.ts, but does not import the application so it can run
 * before the Prisma query extension is switched to strict mode.
 *
 * Default is a read-only dry run. Use --apply only during a reviewed database
 * migration window, with a backup and ENCRYPTION_KEY supplied by the runtime
 * secret manager. Use --verify after the write pass; --apply --verify runs both
 * passes in one process. No plaintext, ciphertext, key, or record identifier is
 * printed.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const BATCH_SIZE = 100

const MODELS = [
  {
    name: 'User',
    delegate: 'user',
    fields: [
      { plain: 'name', enc: 'name_enc' },
      { plain: 'phone', enc: 'phone_enc', search: 'phone_hash' },
      { plain: 'dateOfBirth', enc: 'dateOfBirth_enc', decodeDate: true },
      { plain: 'allergies', enc: 'allergies_enc' },
      { plain: 'passwordResetToken', enc: 'passwordResetToken_enc', search: 'passwordResetToken_hash' },
      { plain: 'emailVerificationToken', enc: 'emailVerificationToken_enc', search: 'emailVerificationToken_hash' },
    ],
  },
  {
    name: 'DoctorProfile',
    delegate: 'doctorProfile',
    fields: [
      { plain: 'licenseNumber', enc: 'licenseNumber_enc', search: 'licenseNumber_hash' },
      { plain: 'bio', enc: 'bio_enc' },
      { plain: 'rejectionReason', enc: 'rejectionReason_enc' },
      { plain: 'ssn', enc: 'ssn_enc' },
      { plain: 'taxId', enc: 'taxId_enc' },
      { plain: 'degreeType', enc: 'degreeType_enc' },
      { plain: 'medicalCouncil', enc: 'medicalCouncil_enc' },
    ],
  },
  {
    name: 'LabProfile',
    delegate: 'labProfile',
    fields: [
      { plain: 'labName', enc: 'labName_enc' },
      { plain: 'licenseNumber', enc: 'licenseNumber_enc', search: 'licenseNumber_hash' },
      { plain: 'address', enc: 'address_enc' },
      { plain: 'rejectionReason', enc: 'rejectionReason_enc' },
    ],
  },
  {
    name: 'Appointment',
    delegate: 'appointment',
    fields: [
      { plain: 'reason', enc: 'reason_enc' },
      { plain: 'notes', enc: 'notes_enc' },
    ],
  },
  {
    name: 'ChronicCondition',
    delegate: 'chronicCondition',
    fields: [
      { plain: 'name', enc: 'name_enc' },
      { plain: 'diagnosedDate', enc: 'diagnosedDate_enc' },
      { plain: 'medications', enc: 'medications_enc', required: true },
      { plain: 'notes', enc: 'notes_enc' },
    ],
  },
  {
    name: 'Prescription',
    delegate: 'prescription',
    fields: [
      { plain: 'imageBase64', enc: 'imageBase64_enc' },
      { plain: 'notes', enc: 'notes_enc' },
      { plain: 'medications', enc: 'medications_enc', required: true },
      { plain: 'followUpNotes', enc: 'followUpNotes_enc' },
    ],
  },
  {
    name: 'Medication',
    delegate: 'medication',
    fields: [
      { plain: 'name', enc: 'name_enc' },
      { plain: 'dosage', enc: 'dosage_enc' },
      { plain: 'instructions', enc: 'instructions_enc' },
      { plain: 'notes', enc: 'notes_enc' },
    ],
  },
  {
    name: 'ConsultationNote',
    delegate: 'consultationNote',
    fields: [{ plain: 'content', enc: 'content_enc' }],
  },
  {
    name: 'HealthJournal',
    delegate: 'healthJournal',
    fields: [
      { plain: 'symptoms', enc: 'symptoms_enc', required: true },
      { plain: 'mood', enc: 'mood_enc' },
      { plain: 'notes', enc: 'notes_enc' },
      { plain: 'vitals', enc: 'vitals_enc' },
    ],
  },
  {
    name: 'ChatMessage',
    delegate: 'chatMessage',
    fields: [{ plain: 'content', enc: 'content_enc' }],
  },
  {
    name: 'ConsultMessage',
    delegate: 'consultMessage',
    fields: [{ plain: 'content', enc: 'content_enc' }],
  },
  {
    name: 'MedicineOrder',
    delegate: 'medicineOrder',
    fields: [
      { plain: 'items', enc: 'items_enc', required: true },
      { plain: 'address', enc: 'address_enc', required: true },
    ],
  },
  {
    name: 'LabBooking',
    delegate: 'labBooking',
    fields: [
      { plain: 'notes', enc: 'notes_enc' },
      { plain: 'resultsNote', enc: 'resultsNote_enc' },
      { plain: 'tests', enc: 'tests_enc', required: true },
    ],
  },
  {
    name: 'EmergencyAlert',
    delegate: 'emergencyAlert',
    fields: [
      { plain: 'memberName', enc: 'memberName_enc' },
      { plain: 'location', enc: 'location_enc' },
      { plain: 'notes', enc: 'notes_enc' },
    ],
  },
  {
    name: 'FamilyMember',
    delegate: 'familyMember',
    fields: [
      { plain: 'name', enc: 'name_enc' },
      { plain: 'relation', enc: 'relation_enc', required: true },
      { plain: 'conditions', enc: 'conditions_enc', required: true },
      { plain: 'inviteEmail', enc: 'inviteEmail_enc', search: 'inviteEmail_hash' },
      { plain: 'inviteToken', enc: 'inviteToken_enc', search: 'inviteToken_hash' },
    ],
  },
  {
    name: 'FamilyHealthAlert',
    delegate: 'familyHealthAlert',
    fields: [
      { plain: 'title', enc: 'title_enc' },
      { plain: 'message', enc: 'message_enc' },
    ],
  },
  {
    name: 'HealthScore',
    delegate: 'healthScore',
    fields: [{ plain: 'breakdown', enc: 'breakdown_enc', required: true }],
  },
  {
    name: 'AuditLog',
    delegate: 'auditLog',
    fields: [{ plain: 'ip', enc: 'ip_enc' }],
  },
  {
    name: 'NotificationLog',
    delegate: 'notificationLog',
    fields: [
      { plain: 'title', enc: 'title_enc' },
      { plain: 'body', enc: 'body_enc' },
      { plain: 'recipient', enc: 'recipient_enc' },
    ],
  },
  {
    name: 'Payment',
    delegate: 'payment',
    fields: [{ plain: 'description', enc: 'description_enc' }],
  },
  {
    name: 'Refund',
    delegate: 'refund',
    fields: [{ plain: 'notes', enc: 'notes_enc' }],
  },
  {
    name: 'Complaint',
    delegate: 'complaint',
    fields: [{ plain: 'description', enc: 'description_enc' }],
  },
  {
    name: 'PrescriptionIntelligence',
    delegate: 'prescriptionIntelligence',
    fields: [
      { plain: 'rawText', enc: 'rawText_enc' },
      { plain: 'imageData', enc: 'imageData_enc' },
      { plain: 'medications', enc: 'medications_enc', required: true },
      { plain: 'schedule', enc: 'schedule_enc', required: true },
      { plain: 'interactions', enc: 'interactions_enc', required: true },
      { plain: 'warnings', enc: 'warnings_enc', required: true },
    ],
  },
]

function parseArgs() {
  const flags = new Set(process.argv.slice(2))
  if (flags.has('--help') || flags.has('-h')) {
    console.log('Usage: node scripts/encrypt-existing-data.mjs [--apply] [--verify]')
    console.log('Default: dry-run. --apply writes encrypted shadows and clears plaintext.')
    process.exit(0)
  }
  return { apply: flags.has('--apply'), verify: flags.has('--verify') }
}

function encryptionKey() {
  const masterKey = (process.env.ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY || '').trim()
  if (!masterKey || masterKey.length < 32) {
    throw new Error('ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY must be set to at least 32 characters')
  }
  // Must match src/lib/encryption.ts exactly. Do not parse the hex-looking
  // value as bytes; existing KynthAI ciphertext uses these UTF-8 key bytes.
  return Buffer.from(masterKey.slice(0, 32), 'utf8')
}

let KEY

function getKey() {
  if (!KEY) KEY = encryptionKey()
  return KEY
}

function encryptValue(value) {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

function decryptValue(value) {
  const parts = String(value).split(':')
  if (parts.length !== 3) throw new Error('invalid ciphertext format')
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(parts[0], 'base64'),
  )
  decipher.setAuthTag(Buffer.from(parts[1], 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2], 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function hashValue(value) {
  return createHmac('sha256', getKey()).update(value, 'utf8').digest('hex')
}

function toText(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function isPresent(value) {
  return value !== null && value !== undefined && value !== ''
}

function selectedFields(model) {
  const select = { id: true }
  for (const field of model.fields) {
    select[field.plain] = true
    select[field.enc] = true
    if (field.search) select[field.search] = true
  }
  return select
}

function emptyPlain(field) {
  return field.required ? '' : null
}

async function walkModel(client, model, apply) {
  const delegate = client[model.delegate]
  let cursor
  const summary = { rowsSeen: 0, valuesEncrypted: 0, hashesWritten: 0, plaintextFound: 0, rowsUpdated: 0, errors: 0 }

  while (true) {
    const query = {
      select: selectedFields(model),
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }
    const rows = await delegate.findMany(query)
    if (rows.length === 0) break

    for (const row of rows) {
      summary.rowsSeen += 1
      const data = {}
      let changed = false
      let rowError = false

      for (const field of model.fields) {
        const plainValue = row[field.plain]
        const ciphertext = row[field.enc]
        const hasPlain = isPresent(plainValue)
        const hasCiphertext = isPresent(ciphertext)
        let canonical = null

        if (hasCiphertext) {
          try {
            canonical = decryptValue(ciphertext)
          } catch {
            summary.errors += 1
            rowError = true
            break
          }
        } else if (hasPlain) {
          canonical = toText(plainValue)
          summary.plaintextFound += 1
        }

        if (canonical !== null) {
          if (!hasCiphertext) {
            data[field.enc] = encryptValue(canonical)
            summary.valuesEncrypted += 1
            changed = true
          }
          if (field.search) {
            const expectedHash = hashValue(canonical)
            if (row[field.search] !== expectedHash) {
              data[field.search] = expectedHash
              summary.hashesWritten += 1
              changed = true
            }
          }
          if (hasPlain || (field.required && plainValue !== '')) {
            data[field.plain] = emptyPlain(field)
            changed = true
          }
        } else {
          if (field.search && row[field.search] !== null && row[field.search] !== undefined) {
            data[field.search] = null
            changed = true
          }
          if (field.required && plainValue === null) {
            data[field.plain] = ''
            changed = true
          }
        }
      }

      if (rowError || !changed) continue
      if (apply) {
        try {
          await delegate.update({ where: { id: row.id }, data })
          summary.rowsUpdated += 1
        } catch {
          summary.errors += 1
        }
      } else {
        summary.rowsUpdated += 1
      }
    }

    cursor = rows[rows.length - 1].id
    if (rows.length < BATCH_SIZE) break
  }

  return summary
}

async function verifyModel(client, model) {
  const delegate = client[model.delegate]
  let cursor
  const summary = { rowsSeen: 0, encryptedValues: 0, plaintextValues: 0, hashMismatches: 0, decryptErrors: 0, requiredNulls: 0 }

  while (true) {
    const query = {
      select: selectedFields(model),
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }
    const rows = await delegate.findMany(query)
    if (rows.length === 0) break

    for (const row of rows) {
      summary.rowsSeen += 1
      for (const field of model.fields) {
        const plainValue = row[field.plain]
        const ciphertext = row[field.enc]
        const hasPlain = isPresent(plainValue)
        const hasCiphertext = isPresent(ciphertext)
        if (hasPlain) summary.plaintextValues += 1
        if (field.required && (plainValue === null || plainValue === undefined)) summary.requiredNulls += 1
        if (!hasCiphertext) continue

        summary.encryptedValues += 1
        let canonical
        try {
          canonical = decryptValue(ciphertext)
        } catch {
          summary.decryptErrors += 1
          continue
        }
        if (field.search && row[field.search] !== hashValue(canonical)) summary.hashMismatches += 1
      }
    }

    cursor = rows[rows.length - 1].id
    if (rows.length < BATCH_SIZE) break
  }

  return summary
}

function total(summary, key) {
  return summary.reduce((count, row) => count + (row.summary[key] || 0), 0)
}

async function main() {
  const { apply, verify } = parseArgs()
  getKey()
  const client = new PrismaClient()
  const result = { mode: apply ? 'apply' : 'dry-run', backfill: [], verification: [] }

  try {
    for (const model of MODELS) {
      result.backfill.push({ model: model.name, summary: await walkModel(client, model, apply) })
    }
    if (verify) {
      for (const model of MODELS) {
        result.verification.push({ model: model.name, summary: await verifyModel(client, model) })
      }
    }

    const errors = total(result.backfill, 'errors') + total(result.verification, 'decryptErrors') + total(result.verification, 'hashMismatches') + total(result.verification, 'plaintextValues')
    console.log(JSON.stringify({
      ...result,
      totals: {
        rowsSeen: total(result.backfill, 'rowsSeen'),
        valuesEncrypted: total(result.backfill, 'valuesEncrypted'),
        hashesWritten: total(result.backfill, 'hashesWritten'),
        rowsUpdated: total(result.backfill, 'rowsUpdated'),
        verificationPlaintextValues: total(result.verification, 'plaintextValues'),
        verificationDecryptErrors: total(result.verification, 'decryptErrors'),
        verificationHashMismatches: total(result.verification, 'hashMismatches'),
        verificationRequiredNulls: total(result.verification, 'requiredNulls'),
        errors,
      },
    }, null, 2))
    if (errors > 0) process.exitCode = 2
  } finally {
    await client.$disconnect()
  }
}

main().catch((error) => {
  console.error(`[encryption-backfill] ${error instanceof Error ? error.message : 'failed'}`)
  process.exitCode = 1
})
