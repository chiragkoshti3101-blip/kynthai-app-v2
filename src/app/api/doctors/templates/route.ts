import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
export const dynamic = 'force-dynamic'

interface Medication {
  name: string
  dosage: string
  frequency: string
  instructions?: string
}

// GET /api/doctors/templates
// List saved prescription templates for the authenticated doctor (database-backed).
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  await logAudit(user.id, 'doctor.templates.read', { resourceType: 'PrescriptionTemplate' })
  if (user.role !== 'doctor') return jsonError('Only doctors may access templates', 403)

  const profile = await db.doctorProfile.findUnique({ where: { userId: user.id } })
  // A doctor with no profile yet simply has no templates — not an error.
  // (Demo/seeded accounts and freshly-registered doctors hit this; a 404 here
  // surfaced as a console error every time the prescribe modal opened.)
  if (!profile) return jsonOk({ templates: [] })

  const templates = await db.prescriptionTemplate.findMany({
    where: { doctorId: profile.id },
    orderBy: { updatedAt: 'desc' },
  })

  return jsonOk({
    templates: templates.map((t: any) => ({
      id: t.id,
      doctorId: t.doctorId,
      name: t.name,
      medications: JSON.parse(t.medications || '[]') as Medication[],
      createdAt: t.createdAt.toISOString(),
    })),
  })
}

// POST /api/doctors/templates
// Save a new prescription template to database.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  if (user.role !== 'doctor') return jsonError('Only doctors may save templates', 403)

  const profile = await db.doctorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return jsonError('Doctor profile not found', 404)

  const body = await readJson<{ name?: string; medications?: Medication[] }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  if (!body.name?.trim()) return jsonError('Template name is required', 400)
  if (!Array.isArray(body.medications) || body.medications.length === 0) {
    return jsonError('At least one medication is required', 400)
  }

  const cleanedMeds = body.medications
    .map((m) => ({
      name: (m.name ?? '').trim(),
      dosage: (m.dosage ?? '').trim(),
      frequency: (m.frequency ?? '').trim(),
      instructions: (m.instructions ?? '').trim(),
    }))
    .filter((m) => m.name && m.dosage)

  if (cleanedMeds.length === 0) return jsonError('Medications must include name + dosage', 400)

  const template = await db.prescriptionTemplate.create({
    data: {
      doctorId: profile.id,
      name: body.name.trim(),
      medications: JSON.stringify(cleanedMeds),
    },
  })

  return jsonOk({
    template: {
      id: template.id,
      doctorId: template.doctorId,
      name: template.name,
      medications: cleanedMeds,
      createdAt: template.createdAt.toISOString(),
    },
  })
}

// DELETE /api/doctors/templates?id=...
// Remove a saved template from database.
export async function DELETE(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  if (user.role !== 'doctor') return jsonError('Only doctors may delete templates', 403)

  const profile = await db.doctorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return jsonError('Doctor profile not found', 404)

  const templateId = req.nextUrl.searchParams.get('id')
  if (!templateId) return jsonError('Template id query param is required', 400)

  // Verify ownership before deleting
  const existing = await db.prescriptionTemplate.findFirst({
    where: { id: templateId, doctorId: profile.id },
  })
  if (!existing) return jsonError('Template not found', 404)

  await db.prescriptionTemplate.delete({ where: { id: templateId } })
  return jsonOk({ deleted: true })
}
