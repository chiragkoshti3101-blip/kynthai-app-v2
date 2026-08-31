import { db } from '@/lib/db'

type ProviderRole = 'doctor' | 'lab'

export interface ProviderDocumentRef {
  id: string
  slot: string
}

export interface ProviderDocumentRecord {
  id: string
  name: string
  type: string
  size: number
  slot: string
}

const DOCTOR_SLOTS = new Set(['license', 'degree', 'id', 'photo'])
const LAB_SLOTS = new Set(['license', 'clia', 'business_insurance', 'photo'])
const ID_RE = /^[a-zA-Z0-9_-]{1,100}$/

function slotsFor(role: ProviderRole): Set<string> {
  return role === 'doctor' ? DOCTOR_SLOTS : LAB_SLOTS
}

function metadataFromDescription(description: string | null): { provider?: string; slot?: string } {
  if (!description) return {}
  try {
    const parsed = JSON.parse(description) as { provider?: unknown; slot?: unknown }
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
      slot: typeof parsed.slot === 'string' ? parsed.slot : undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Validate that provider document references belong to the current applicant
 * and were uploaded as encrypted CERTIFICATE records. Legacy filename/base64
 * payloads are intentionally rejected rather than copied into profile JSON.
 */
export async function validateProviderDocuments(
  input: Record<string, unknown>,
  userId: string,
  role: ProviderRole,
): Promise<{ ok: true; documents: ProviderDocumentRecord[] } | { ok: false; error: string }> {
  const entries = Object.entries(input ?? {}).filter(([, value]) => value != null)
  if (entries.length > 10) return { ok: false, error: 'Too many certification documents.' }

  const refs: ProviderDocumentRef[] = []
  for (const [slot, value] of entries) {
    if (!slotsFor(role).has(slot)) return { ok: false, error: `Invalid ${role} document slot.` }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'Certification documents must be uploaded before submission.' }
    }
    const id = (value as { id?: unknown }).id
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      return { ok: false, error: 'Certification documents must use storage document IDs.' }
    }
    refs.push({ id, slot })
  }

  const ids = [...new Set(refs.map(ref => ref.id))]
  if (ids.length !== refs.length) return { ok: false, error: 'A certification document cannot be used twice.' }
  if (ids.length === 0) return { ok: true, documents: [] }

  const records = await db.medicalDocument.findMany({
    where: {
      id: { in: ids },
      userId,
      uploadedById: userId,
      type: 'CERTIFICATE',
    },
    select: { id: true, title: true, description: true, mimeType: true, fileSize: true },
  })
  const byId = new Map(records.map(record => [record.id, record]))
  if (records.length !== ids.length) {
    return { ok: false, error: 'One or more certification documents are missing or unauthorized.' }
  }

  const metadataById = new Map(records.map(record => [record.id, metadataFromDescription(record.description)]))
  if (refs.some(ref => {
    const metadata = metadataById.get(ref.id)
    return metadata?.provider !== role || metadata?.slot !== ref.slot
  })) {
    return { ok: false, error: 'Certification document metadata does not match the submitted provider slot.' }
  }

  return {
    ok: true,
    documents: refs.map(ref => {
      const record = byId.get(ref.id)!
      const safeName = (record.title || `${ref.slot} certificate`)
        .replace(/[\r\n\\/]/g, '_')
        .slice(0, 200)
      return {
        id: record.id,
        name: safeName,
        type: record.mimeType,
        size: record.fileSize,
        slot: ref.slot,
      }
    }),
  }
}
