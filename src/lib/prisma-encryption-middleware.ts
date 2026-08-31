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
 * - On WHERE equality: middleware rewrites exact filters on fields with a keyed
 *   lookup hash to that hash column; other exact filters use the ciphertext
 *   counterpart.
 * - Fields that need substring search must be filtered after a purpose-limited
 *   read in application code; randomized ciphertext cannot support `contains`.
 * - Lookup-hash columns are one-way HMAC digests for exact matching only; they
 *   are not reversible and must never be used for range or substring search.
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

import { type PrismaClient } from '@prisma/client'
import { encryptValue, decryptValue, hashValue } from './encryption'

type EncryptedField = {
  enc: string
  as: string
  /** Deterministic keyed column used only for exact-match lookups. */
  search?: string
  /** Optional decoder for non-string Prisma types */
  decode?: (plaintext: string) => unknown
  /** Keep a schema-level non-null plaintext column valid after clearing it. */
  required?: boolean
  /** Encrypt a Prisma default before the database can write it in plaintext. */
  defaultValue?: string
}

type ModelEncMap = Partial<Record<string, EncryptedField[]>>

const MODEL_ENCRYPTED_FIELDS: ModelEncMap = {
  User: [
    { enc: 'name_enc', as: 'name' },
    { enc: 'phone_enc', as: 'phone', search: 'phone_hash' },
    { enc: 'dateOfBirth_enc', as: 'dateOfBirth', decode: (s) => new Date(s) },
    { enc: 'allergies_enc', as: 'allergies' },
    { enc: 'passwordResetToken_enc', as: 'passwordResetToken', search: 'passwordResetToken_hash' },
    { enc: 'emailVerificationToken_enc', as: 'emailVerificationToken', search: 'emailVerificationToken_hash' },
  ],
  DoctorProfile: [
    { enc: 'licenseNumber_enc', as: 'licenseNumber', search: 'licenseNumber_hash' },
    { enc: 'bio_enc', as: 'bio' },
    { enc: 'rejectionReason_enc', as: 'rejectionReason' },
    { enc: 'ssn_enc', as: 'ssn' },
    { enc: 'taxId_enc', as: 'taxId' },
    { enc: 'degreeType_enc', as: 'degreeType' },
    { enc: 'medicalCouncil_enc', as: 'medicalCouncil' },
  ],
  LabProfile: [
    { enc: 'labName_enc', as: 'labName' },
    { enc: 'licenseNumber_enc', as: 'licenseNumber', search: 'licenseNumber_hash' },
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
    { enc: 'medications_enc', as: 'medications', required: true, defaultValue: '[]' },
    { enc: 'notes_enc', as: 'notes' },
  ],
  Prescription: [
    { enc: 'imageBase64_enc', as: 'imageBase64' },
    { enc: 'notes_enc', as: 'notes' },
    { enc: 'medications_enc', as: 'medications', required: true, defaultValue: '[]' },
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
    { enc: 'symptoms_enc', as: 'symptoms', required: true, defaultValue: '[]' },
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
    { enc: 'items_enc', as: 'items', required: true, defaultValue: '[]' },
    { enc: 'address_enc', as: 'address', required: true, defaultValue: '' },
  ],
  LabBooking: [
    { enc: 'notes_enc', as: 'notes' },
    { enc: 'resultsNote_enc', as: 'resultsNote' },
    { enc: 'tests_enc', as: 'tests', required: true, defaultValue: '[]' },
  ],
  EmergencyAlert: [
    { enc: 'memberName_enc', as: 'memberName' },
    { enc: 'location_enc', as: 'location' },
    { enc: 'notes_enc', as: 'notes' },
  ],
  FamilyMember: [
    { enc: 'name_enc', as: 'name' },
    { enc: 'relation_enc', as: 'relation', required: true },
    { enc: 'conditions_enc', as: 'conditions', required: true, defaultValue: '[]' },
    { enc: 'inviteEmail_enc', as: 'inviteEmail' },
    { enc: 'inviteToken_enc', as: 'inviteToken' },
  ],
  FamilyHealthAlert: [
    { enc: 'title_enc', as: 'title' },
    { enc: 'message_enc', as: 'message' },
  ],
  HealthScore: [
    { enc: 'breakdown_enc', as: 'breakdown', required: true, defaultValue: '{}' },
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
  Refund: [
    { enc: 'notes_enc', as: 'notes' },
  ],
  Complaint: [
    { enc: 'description_enc', as: 'description' },
  ],
  PrescriptionIntelligence: [
    { enc: 'rawText_enc', as: 'rawText' },
    { enc: 'imageData_enc', as: 'imageData' },
    { enc: 'medications_enc', as: 'medications', required: true, defaultValue: '[]' },
    { enc: 'schedule_enc', as: 'schedule', required: true, defaultValue: '[]' },
    { enc: 'interactions_enc', as: 'interactions', required: true, defaultValue: '[]' },
    { enc: 'warnings_enc', as: 'warnings', required: true, defaultValue: '[]' },
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
 * DEFAULT: true until the controlled backfill has populated every *_enc
 * column and lookup-hash column. This is the only safe rollout default when
 * existing rows may still contain plaintext.
 *
 * - When `false`: reads use ONLY encrypted counterpart columns. Any row where
 *   the encrypted counterpart is NULL returns null for that field. This is the
 *   secure, post-backfill behavior.
 *
 * - When `true`: reads fall back to the original plaintext column when the
 *   encrypted counterpart is NULL. This is ONLY acceptable during an active
 *   database migration. Complete the controlled backfill and verification
 *   before disabling this mode.
 */
const TRANSITIONAL = process.env.ENCRYPTION_TRANSITIONAL !== 'false'

function encryptPayload(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = value instanceof Date
    ? value.toISOString()
    : typeof value === 'string'
      ? value
      : JSON.stringify(value)
  return encryptValue(text)
}

function clearedPlainValue(field: EncryptedField): string | null {
  // Required JSON/text columns keep an empty sentinel so the database
  // constraint remains valid while their real value lives in `*_enc`.
  return field.required ? '' : null
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

function encryptArgs(args: Record<string, unknown>, model: string, applyDefaults = false): void {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields || !args.data) return

  for (const field of fields) {
    const hasPlainInput = Object.prototype.hasOwnProperty.call(args.data as object, field.as)
    const supplied = (args.data as any)[field.as]
    const plain = supplied === undefined && applyDefaults && field.defaultValue !== undefined
      ? field.defaultValue
      : supplied
    if (plain !== undefined && plain !== null && plain !== '') {
      (args.data as any)[field.enc] = encryptPayload(plain)
      if (field.search) (args.data as any)[field.search] = hashValue(String(plain))
      ;(args.data as any)[field.as] = clearedPlainValue(field)
    } else if ((plain === null || plain === '') && (hasPlainInput || (applyDefaults && field.defaultValue !== undefined))) {
      (args.data as any)[field.enc] = null
      if (field.search) (args.data as any)[field.search] = null
      ;(args.data as any)[field.as] = clearedPlainValue(field)
    }
  }
}

function decryptResult(result: Record<string, unknown>, model: string): void {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields) return

  for (const field of fields) {
    const hasEncrypted = Object.prototype.hasOwnProperty.call(result, field.enc)
    const hasPlaintext = Object.prototype.hasOwnProperty.call(result, field.as)
    // Respect an explicit narrow select that did not request either copy.
    if (!hasEncrypted && !hasPlaintext) continue

    const encVal = (result as any)[field.enc]
    if (typeof encVal === 'string' && encVal.length > 0) {
      const decrypted = decryptPayload(encVal, field.decode)
      if (decrypted !== null && decrypted !== '') {
        ;(result as any)[field.as] = decrypted
      } else if (!TRANSITIONAL || !hasPlaintext || !(result as any)[field.as]) {
        ;(result as any)[field.as] = null
      }
    } else if (!TRANSITIONAL || !hasPlaintext || !(result as any)[field.as]) {
      // In strict mode, a missing ciphertext is not exposed as plaintext.
      ;(result as any)[field.as] = null
    }

    // Shadow columns are an implementation detail and must not leak through
    // API serializers or data exports.
    if (hasEncrypted) delete (result as any)[field.enc]
    if (field.search && Object.prototype.hasOwnProperty.call(result, field.search)) {
      delete (result as any)[field.search]
    }
  }
}

function hasEncryptedMetadata(value: Record<string, unknown>, fields: EncryptedField[]): boolean {
  return fields.some((field) =>
    Object.prototype.hasOwnProperty.call(value, field.enc) ||
    (field.search ? Object.prototype.hasOwnProperty.call(value, field.search) : false),
  )
}

function decryptResultGraph(value: unknown, model?: string): void {
  if (!value || typeof value !== 'object' || value instanceof Date || ArrayBuffer.isView(value)) return
  if (Array.isArray(value)) {
    for (const item of value) decryptResultGraph(item)
    return
  }

  const record = value as Record<string, unknown>
  if (model) decryptResult(record, model)

  // Prisma includes can materialize related records inside the same result.
  // Query extensions do not reliably invoke the hook once per nested model, so
  // identify and decrypt any relation that carries one of our shadow columns.
  for (const [nestedModel, fields] of Object.entries(MODEL_ENCRYPTED_FIELDS)) {
    if (nestedModel !== model && hasEncryptedMetadata(record, fields ?? [])) {
      decryptResult(record, nestedModel)
    }
  }

  for (const child of Object.values(record)) decryptResultGraph(child)
}

function decryptResults(results: unknown[], model: string): void {
  for (const item of results) decryptResultGraph(item, model)
}

function rewriteWhereObject(where: Record<string, unknown>, model: string): Record<string, unknown> {
  const transformed: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      if (Array.isArray(value)) {
        transformed[key] = value.map((item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? rewriteWhereObject(item as Record<string, unknown>, model)
            : item,
        )
      } else if (value && typeof value === 'object') {
        transformed[key] = rewriteWhereObject(value as Record<string, unknown>, model)
      } else {
        transformed[key] = value
      }
      continue
    }

    if (isEncryptedField(model, key)) {
      const fields = MODEL_ENCRYPTED_FIELDS[model] ?? []
      const field = fields.find((item) => item.as === key)
      const encCol = field?.enc
      const searchCol = field?.search
      if (typeof value === 'string') {
        transformed[searchCol || encCol!] = searchCol ? hashValue(value) : encryptPayload(value)
        continue
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const filter = { ...(value as Record<string, unknown>) }
        const rewritten: Record<string, unknown> = {}
        let didRewrite = false
        for (const [operator, operand] of Object.entries(filter)) {
          if (operator === 'equals' || operator === 'not') {
            if (typeof operand === 'string') {
              rewritten[operator] = searchCol ? hashValue(operand) : encryptPayload(operand)
              didRewrite = true
            } else {
              rewritten[operator] = operand
            }
          } else if (operator === 'in' && Array.isArray(operand)) {
            rewritten[operator] = operand.map((item) => {
              if (typeof item !== 'string') return item
              return searchCol ? hashValue(item) : encryptPayload(item)
            })
            didRewrite = true
          } else {
            rewritten[operator] = operand
          }
        }
        if (didRewrite) {
          transformed[searchCol || encCol!] = rewritten
          continue
        }
      }
      // contains/startsWith/endsWith and range filters cannot be applied to
      // randomized ciphertext. Keep them visible in the call site rather
      // than pretending they are supported by the extension.
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      transformed[key] = rewriteWhereObject(value as Record<string, unknown>, model)
    } else {
      transformed[key] = value
    }
  }

  return transformed
}

function rewriteWhere(args: Record<string, unknown>, model: string): void {
  args.where = rewriteWhereObject((args.where || {}) as Record<string, unknown>, model)
}

function ensureEncryptedSelect(args: Record<string, any>, model: string): void {
  const select = args.select
  if (!select || typeof select !== 'object' || Array.isArray(select)) return

  for (const field of MODEL_ENCRYPTED_FIELDS[model] ?? []) {
    if (select[field.as] === true) {
      select[field.enc] = true
      if (field.search) select[field.search] = true
    }
  }
}

const WHERE_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'groupBy',
  'aggregate',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'upsert',
])

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
])

const RESULT_OPERATIONS = new Set([
  'create',
  'createManyAndReturn',
  'update',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
])

type EncryptionQueryParams = {
  model?: string
  operation: string
  args?: Record<string, any>
  query: (args: Record<string, any>) => Promise<unknown>
}

/** Apply encryption before a query and decrypt only the selected result fields. */
async function applyEncryptionQuery({ model, operation, args: rawArgs, query }: EncryptionQueryParams): Promise<unknown> {
  const args = (rawArgs ?? {}) as Record<string, any>

  if (!model || !(model in MODEL_ENCRYPTED_FIELDS)) {
    return query(args)
  }

  const m = model

  if (WRITE_OPERATIONS.has(operation)) {
    const applyDefaults = operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn'
    if (Array.isArray(args.data)) {
      for (const row of args.data) encryptArgs(row, m, applyDefaults)
    } else if (args.data) {
      encryptArgs(args, m, applyDefaults)
    }

    // Upsert has a second write branch that the legacy middleware did not
    // protect. Encrypt both create and update payloads; only the create branch
    // receives schema defaults because update is intentionally partial.
    if (operation === 'upsert' && args.create) {
      encryptArgs({ data: args.create }, m, true)
    }
  }

  if (WHERE_OPERATIONS.has(operation) && args.where) {
    rewriteWhere(args, m)
  }

  // A narrow select normally omits the encrypted shadow column. Include it
  // internally so the returned object can be decrypted without changing the
  // public shape seen by application code.
  ensureEncryptedSelect(args, m)

  const result = await query(args)

  if (RESULT_OPERATIONS.has(operation) && result && typeof result === 'object') {
    if (Array.isArray(result)) {
      decryptResults(result, m)
    } else if (!ArrayBuffer.isView(result)) {
      decryptResultGraph(result, m)
    }
  }

  if (operation === 'aggregate' && result && typeof result === 'object') {
    const agg = result as Record<string, unknown>
    for (const key of Object.keys(agg)) {
      if (agg[key] && typeof agg[key] === 'object' && !Array.isArray(agg[key])) {
        decryptResult(agg[key] as Record<string, unknown>, m)
      }
    }
  }

  if (operation === 'groupBy' && Array.isArray(result)) {
    for (const row of result as Record<string, unknown>[]) decryptResult(row, m)
  }

  return result
}

/**
 * Install the encryption layer on a PrismaClient instance.
 *
 * Prisma 5 exposed `$use` middleware; Prisma 6 removed it in favor of query
 * extensions. Prefer the extension and retain the legacy branch for projects
 * that still run an older generated client. The function returns the effective
 * client because `$extends` intentionally returns a new client facade.
 */
export function installEncryptionMiddleware(prisma: PrismaClient): PrismaClient {
  const legacyUse = (prisma as any).$use
  if (typeof legacyUse === 'function') {
    legacyUse(async (params: any, next: any) =>
      applyEncryptionQuery({
        model: params.model,
        operation: params.action,
        args: params.args,
        query: (nextArgs) => next({ ...params, args: nextArgs }),
      }),
    )
    return prisma
  }

  const extend = (prisma as any).$extends
  if (typeof extend !== 'function') {
    throw new Error('Prisma client exposes neither $use nor $extends; encryption layer cannot be installed')
  }

  const encryptedClient = extend.call(prisma, {
    query: {
      $allModels: {
        $allOperations: (params: EncryptionQueryParams) => applyEncryptionQuery(params),
      },
    },
  })

  return encryptedClient as PrismaClient
}

/**
 * Application-level encryption helpers for use without Prisma middleware.
 * Use these functions directly in your service/API code when middleware is not available.
 */

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
      result[field.enc] = encryptPayload(plain)
      if (field.search) result[field.search] = hashValue(String(plain))
      result[field.as] = clearedPlainValue(field)
    } else if ((plain === null || plain === '') && result[field.as] !== undefined) {
      result[field.enc] = null
      if (field.search) result[field.search] = null
      result[field.as] = clearedPlainValue(field)
    }
  }
  return result
}

/**
 * Decrypt sensitive fields in a result object after reading from database.
 * Usage: decryptSensitiveFields(userRecord, 'User')
 */
export function decryptSensitiveFields(result: Record<string, unknown>, model: string): Record<string, unknown> {
  const fields = MODEL_ENCRYPTED_FIELDS[model]
  if (!fields) return result

  const result2 = { ...result }
  for (const field of fields) {
    const encVal = result[field.enc]
    if (typeof encVal === 'string') {
      const decrypted = decryptPayload(encVal, field.decode)
      if (decrypted !== null) result2[field.as] = decrypted
    }
    delete result2[field.enc]
    if (field.search) delete result2[field.search]
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
  return decryptValue(ciphertext)
}
