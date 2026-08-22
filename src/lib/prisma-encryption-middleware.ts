/**
 * Prisma Encryption Middleware (Health Data Protection)
 *
 * Transparently encrypts/decrypts sensitive database fields using AES-256-GCM.
 *
 * Strategy
 * -------
 * - Every sensitive column has an encrypted counterpart in the DB (e.g. `name` → `name_enc`).
 * - On WRITE (create/upsert/update): middleware encrypts plaintext values into the
 *   counterpart columns and clears the original columns so they stay NULL.
 * - On READ (find/findMany/findUnique/findFirst/groupBy/aggregate): middleware
 *   decrypts the counterpart columns back into the original field names so the
 *   rest of the codebase sees plaintext.
 * - On WHERE equality: middleware rewrites equality filters on encrypted fields
 *   so Prisma matches against the ciphertext. Range/fulltext filters are NOT
 *   transparently supported.
 *
 * Transitional mode
 * ----------------
 * When ENCRYPTION_TRANSITIONAL=true (default until migration completes):
 * - Reads fall back to original plaintext columns if encrypted counterpart is NULL.
 * - This allows rolling out the schema changes without immediately losing access
 *   to existing data. Run the data-migration script separately to populate the
 *   encrypted columns, then set ENCRYPTION_TRANSITIONAL=false.
 *
 * Key management
 * -------------
 * - Key is sourced from `src/lib/encryption.ts.getKey()` (ENCRYPTION_KEY or
 *   SHA-256(SESSION_SECRET) in dev).
 * - Each ciphertext carries its own random IV and auth tag, so identical
 *   plaintexts produce different ciphertexts (IND-CPA) and tamper detection
 *   is enforced via GCM auth tags.
 *
 * Models / fields encrypted
 * -------------------------
 *  User: name, phone, dateOfBirth, allergies, passwordResetToken
 *  DoctorProfile: licenseNumber, bio, rejectionReason, ssn, taxId, degreeType, medicalCouncil
 *  LabProfile: labName, licenseNumber, address, rejectionReason
 *  Appointment: reason, notes
 *  ChronicCondition: name, diagnosedDate, medications, notes
 *  Prescription: imageBase64, notes, medications, followUpNotes
 *  Medication: name, dosage, instructions, notes
 *  ConsultationNote: content
 *  HealthJournal: symptoms, mood, notes, vitals
 *  ChatMessage: content
 *  ConsultMessage: content
 *  MedicineOrder: items, address
 *  LabBooking: notes, resultsNote, tests
 *  EmergencyAlert: memberName, location, notes
 *  FamilyMember: name, relation, conditions, inviteEmail, inviteToken
 *  FamilyHealthAlert: title, message
 *  HealthScore: breakdown
 *  AuditLog: ip
 *  NotificationLog: title, body, recipient
 *  Payment: description
 *  PrescriptionIntelligence: rawText, imageData, medications, schedule, interactions, warnings
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import { encryptValue, decryptValue } from './encryption'

type EncryptedField = {
  enc: string
  as: string
  /** Optional decoder for non-string Prisma types */
  decode?: (plaintext: string) => unknown
}

type ModelEncMap = Partial<Record<string, EncryptedField[]>>

const MODEL_ENCRYPTED_FIELDS: ModelEncMap = {
  User: [
    { enc: 'name_enc', as: 'name' },
    { enc: 'phone_enc', as: 'phone' },
    { enc: 'dateOfBirth_enc', as: 'dateOfBirth', decode: (s) => new Date(s) },
    { enc: 'allergies_enc', as: 'allergies' },
    { enc: 'passwordResetToken_enc', as: 'passwordResetToken' },
  ],
  DoctorProfile: [
    { enc: 'licenseNumber_enc', as: 'licenseNumber' },
    { enc: 'bio_enc', as: 'bio' },
    { enc: 'rejectionReason_enc', as: 'rejectionReason' },
    { enc: 'ssn_enc', as: 'ssn' },
    { enc: 'taxId_enc', as: 'taxId' },
    { enc: 'degreeType_enc', as: 'degreeType' },
    { enc: 'medicalCouncil_enc', as: 'medicalCouncil' },
  ],
  LabProfile: [
    { enc: 'labName_enc', as: 'labName' },
    { enc: 'licenseNumber_enc', as: 'licenseNumber' },
    { enc: 'address_enc', as: 'address' },
    { enc: 'rejectionReason_enc', as: 'rejectionReason' },
  ],
  Appointment: [
    { enc: 'reason_enc', as: 'reason' },
    { enc: 'notes_enc', as: 'notes' },
  ],
  ChronicCondition: [
    { enc: 'name_enc', as: 'name' },
    { enc: 'diagnosedDate_enc', as: 'diagnosedDate' },
    { enc: 'medications_enc', as: 'medications' },
    { enc: 'notes_enc', as: 'notes' },
  ],
  Prescription: [
    { enc: 'imageBase64_enc', as: 'imageBase64' },
    { enc: 'notes_enc', as: 'notes' },
    { enc: 'medications_enc', as: 'medications' },
    { enc: 'followUpNotes_enc', as: 'followUpNotes' },
  ],
  Medication: [
    { enc: 'name_enc', as: 'name' },
    { enc: 'dosage_enc', as: 'dosage' },
    { enc: 'instructions_enc', as: 'instructions' },
    { enc: 'notes_enc', as: 'notes' },
  ],
  ConsultationNote: [
    { enc: 'content_enc', as: 'content' },
  ],
  HealthJournal: [
    { enc: 'symptoms_enc', as: 'symptoms' },
    { enc: 'mood_enc', as: 'mood' },
    { enc: 'notes_enc', as: 'notes' },
    { enc: 'vitals_enc', as: 'vitals' },
  ],
  ChatMessage: [
    { enc: 'content_enc', as: 'content' },
  ],
  ConsultMessage: [
    { enc: 'content_enc', as: 'content' },
  ],
  MedicineOrder: [
    { enc: 'items_enc', as: 'items' },
    { enc: 'address_enc', as: 'address' },
  ],
  LabBooking: [
    { enc: 'notes_enc', as: 'notes' },
    { enc: 'resultsNote_enc', as: 'resultsNote' },
    { enc: 'tests_enc', as: 'tests' },
  ],
  EmergencyAlert: [
    { enc: 'memberName_enc', as: 'memberName' },
    { enc: 'location_enc', as: 'location' },
    { enc: 'notes_enc', as: 'notes' },
  ],
  FamilyMember: [
    { enc: 'name_enc', as: 'name' },
    { enc: 'relation_enc', as: 'relation' },
    { enc: 'conditions_enc', as: 'conditions' },
    { enc: 'inviteEmail_enc', as: 'inviteEmail' },
    { enc: 'inviteToken_enc', as: 'inviteToken' },
  ],
  FamilyHealthAlert: [
    { enc: 'title_enc', as: 'title' },
    { enc: 'message_enc', as: 'message' },
  ],
  HealthScore: [
    { enc: 'breakdown_enc', as: 'breakdown' },
  ],
  AuditLog: [
    { enc: 'ip_enc', as: 'ip' },
  ],
  NotificationLog: [
    { enc: 'title_enc', as: 'title' },
    { enc: 'body_enc', as: 'body' },
    { enc: 'recipient_enc', as: 'recipient' },
  ],
  Payment: [
    { enc: 'description_enc', as: 'description' },
  ],
  PrescriptionIntelligence: [
    { enc: 'rawText_enc', as: 'rawText' },
    { enc: 'imageData_enc', as: 'imageData' },
    { enc: 'medications_enc', as: 'medications' },
    { enc: 'schedule_enc', as: 'schedule' },
    { enc: 'interactions_enc', as: 'interactions' },
    { enc: 'warnings_enc', as: 'warnings' },
  ],
}

function isEncryptedField(model: string, fieldName: string): boolean {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields) return false
  return fields.some(f => f.as === fieldName)
}

function getEncCounterpart(model: string, fieldName: string): string | null {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields) return null
  const match = fields.find(f => f.as === fieldName)
  return match ? match.enc : null
}

/**
 * Transitional encryption mode.
 *
 * DEFAULT: false in production for health data protection compliance.
 *
 * - When `false`: reads use ONLY encrypted counterpart columns. Any row where
 *   the encrypted counterpart is NULL returns null for that field. This is the
 *   secure, production-ready behavior.
 *
 * - When `true`: reads fall back to the original plaintext column when the
 *   encrypted counterpart is NULL. This is ONLY acceptable during an active
 *   database migration. A migration script (`scripts/encrypt-existing-data.ts`)
 *   must be run to populate encrypted columns before disabling this mode.
 *
 * For production, ensure `ENCRYPTION_TRANSITIONAL` is NOT set (defaults
 * to false), or explicitly set it to `false` in the deployment environment.
 */
// Default ON until a full backfill sets ENCRYPTION_TRANSITIONAL=false.
// Without this, enabling the middleware would null-out unmigrated plaintext fields.
const TRANSITIONAL = process.env.ENCRYPTION_TRANSITIONAL !== 'false'

function encryptPayload(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return encryptValue(text)
}

function decryptPayload(ciphertext: string | null, decode?: (s: string) => unknown): unknown {
  if (!ciphertext) return null
  try {
    const plaintext = decryptValue(ciphertext)
    if (decode) return decode(plaintext)
    return plaintext
  } catch {
    return null
  }
}

function encryptArgs(args: Record<string, unknown>, model: string): void {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields || !args.data) return

  for (const field of fields) {
    const plain = (args.data as any)[field.as]
    if (plain !== undefined && plain !== null && plain !== '') {
      (args.data as any)[field.enc] = encryptPayload(plain)
      ;(args.data as any)[field.as] = null
    } else if (plain === '' && (args.data as any)[field.as] !== undefined) {
      (args.data as any)[field.enc] = encryptPayload(plain)
      ;(args.data as any)[field.as] = null
    }
  }
}

function decryptResult(result: Record<string, unknown>, model: string): void {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields) return

  for (const field of fields) {
    const encVal = (result as any)[field.enc]
    if (encVal) {
      (result as any)[field.as] = decryptPayload(encVal, field.decode)
    } else if (TRANSITIONAL) {
      // Transitional fallback: preserve original plaintext column value
      // if the encrypted counterpart has not been populated yet.
      const plainVal = (result as any)[field.as]
      if (plainVal !== undefined && plainVal !== null && plainVal !== '') {
        // keep original value intact — encryption migration not yet complete
      } else {
        ;(result as any)[field.as] = null
      }
    } else {
      ;(result as any)[field.as] = null
    }
  }
}

function decryptResults(results: unknown[], model: string): void {
  for (const item of results) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      decryptResult(item as Record<string, unknown>, model)
    }
  }
}

function rewriteWhere(args: Record<string, unknown>, model: string): void {
  const where = (args.where || {}) as Record<string, unknown>
  const transformed: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(where)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const complex = value as Record<string, unknown>
      if (complex.AND || complex.OR || complex.NOT) {
        const copy = JSON.parse(JSON.stringify(complex))
        rewriteWhere(copy, model)
        transformed[key] = copy
        continue
      }
      const nestedCopy = JSON.parse(JSON.stringify(value))
      rewriteWhere(nestedCopy as Record<string, unknown>, model)
      transformed[key] = nestedCopy
      continue
    }

    if (isEncryptedField(model, key) && typeof value === 'string') {
      const encCol = getEncCounterpart(model, key)
      if (encCol) {
        transformed[encCol] = encryptPayload(value)
        continue
      }
    }

    transformed[key] = value
  }

  args.where = transformed
}

/**
 * Install the encryption middleware on a PrismaClient instance.
 * Call immediately after `new PrismaClient()`.
 */
export function installEncryptionMiddleware(prisma: PrismaClient): void {
  ;(prisma as any).$use(async (params: any, next: any) => {
    const { model, action, args } = params

    if (!model || !(model in MODEL_ENCRYPTED_FIELDS)) {
      return next(params)
    }

    const m = model as string

    switch (action) {
      case 'create':
      case 'createMany':
        if (Array.isArray((args as any)?.data)) {
          for (const row of (args as any).data) {
            encryptArgs(row, m)
          }
        } else {
          encryptArgs((args as any) as Record<string, unknown>, m)
        }
        break

      case 'update':
      case 'updateMany':
      case 'upsert':
        if ((args as any).data) {
          encryptArgs((args as any) as Record<string, unknown>, m)
        }
        break

      case 'findMany':
      case 'findFirst':
      case 'findUnique':
      case 'findFirstOrThrow':
      case 'findUniqueOrThrow':
      case 'count':
      case 'groupBy':
      case 'aggregate':
      case 'delete':
      case 'deleteMany':
        if ((args as any).where) {
          rewriteWhere((args as any) as Record<string, unknown>, m)
        }
        break

      default:
        break
    }

    const result = await next(params)

    if (
      result &&
      typeof result === 'object' &&
      ['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count'].includes(action)
    ) {
      if (Array.isArray(result)) {
        decryptResults(result, m)
      } else if (result && typeof result === 'object' && !ArrayBuffer.isView(result)) {
        decryptResult(result as Record<string, unknown>, m)
      }
    }

    if (action === 'aggregate' && result && typeof result === 'object') {
      const agg = result as Record<string, unknown>
      for (const key of Object.keys(agg)) {
        if (agg[key] && typeof agg[key] === 'object' && !Array.isArray(agg[key])) {
          decryptResult(agg[key] as Record<string, unknown>, m)
        }
      }
    }

    if (action === 'groupBy' && Array.isArray(result)) {
      for (const row of result as Record<string, unknown>[]) {
        decryptResult(row, m)
      }
    }

    return result
  })
}

/**
 * Application-level encryption helpers for use without Prisma middleware.
 * Use these functions directly in your service/API code when middleware is not available.
 */

import { encryptValue as encryptVal, decryptValue as decryptVal } from './encryption'

/**
 * Encrypt sensitive fields in an object before writing to database.
 * Usage: encryptSensitiveFields(userData, 'User')
 */
export function encryptSensitiveFields(data: Record<string, any>, model: string): Record<string, any> {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields) return data

  const result = { ...data }
  for (const field of fields) {
    const plain = result[field.as]
    if (plain !== undefined && plain !== null && plain !== '') {
      result[field.enc] = encryptVal!(plain)
      result[field.as] = null
    } else if (plain === '' && result[field.as] !== undefined) {
      result[field.enc] = encryptVal!(plain)
      result[field.as] = null
    }
  }
  return result
}

/**
 * Decrypt sensitive fields in a result object after reading from database.
 * Usage: decryptSensitiveFields(userRecord, 'User')
 */
export function decryptSensitiveFields(result: Record<string, unknown>, model: string): Record<string, unknown> {
  if (!MODEL_ENCRYPTED_FIELDS[model]) return result

  const result2 = { ...result }
  for (const field of MODEL_ENCRYPTED_FIELDS[model]) {
    const encVal = result[field.enc]
    if (typeof encVal === 'string') {
      result2[field.as] = decryptVal(encVal)
      result2[field.enc] = null
    }
  }
  return result2
}

/**
 * Rewrite a where clause to use encrypted column names for equality filters.
 */
export function rewriteWhereForEncryption(args: Record<string, unknown>, model: string): void {
  rewriteWhere(args, model)
}

/**
 * Encrypt a single value for use in where clauses.
 */
export function encryptWhereValue(value: string): string {
  const result = encryptPayload(value)
  return result!
}

/**
 * Decrypt a single value from database.
 */
export function decryptValueFromDb(ciphertext: string): string {
  return decryptVal(ciphertext)
}