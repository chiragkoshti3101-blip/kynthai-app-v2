import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit, checkConsent } from '@/lib/api-helpers'
import { sendNotification } from '@/lib/notifications'
export const dynamic = 'force-dynamic'

/**
 * PUT /api/lab-bookings/[id]/results — lab uploads test results
 *
 * PRIVACY MODEL for resultsFile:
 * ──────────────────────────────
 * `resultsFile` stores an opaque file reference token (e.g. upload API fileToken),
 * NOT a public URL.  The underlying encrypted file lives in private-uploads/ and
 * is only accessible via an authenticated file-access API route.
 * No public/static URL is accepted or returned here.
 *
 * The patient receives `hasResultsFile` (boolean, not the raw token) in both
 * PUT and GET responses — this prevents leaking health-file references that
 * could be used for cross-user enumeration.
 */

// PUT /api/lab-bookings/[id]/results — lab uploads test results
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, 20, 60000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const { id } = await params

  const booking = await db.labBooking.findUnique({ where: { id }, include: { lab: true } })
  if (!booking) return jsonError('Booking not found', 404)

  if (booking.lab.userId !== u.id && u.role !== 'admin') {
    return jsonError('Forbidden — only the owning lab can upload results', 403)
  }

  const body = await readJson<{ resultsFile?: string; resultsNote?: string; status?: string }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  const updates: Record<string, unknown> = {}
  if (body.resultsFile) {
    // Reject any public/static path — resultsFile must be an opaque token.
    const raw = sanitizeText(body.resultsFile, 500)
    if (/^[\/.]|https?:\/\//i.test(raw)) {
      return jsonError('resultsFile must be an opaque file reference token, not a URL or path', 400)
    }
    updates.resultsFile = raw
  }
  if (body.resultsNote !== undefined) updates.resultsNote = sanitizeText(body.resultsNote, 2000) || null
  if (body.status) updates.status = sanitizeText(body.status, 30)
  updates.resultUploadedAt = new Date()

  const updated = await db.labBooking.update({
    where: { id },
    data: updates,
    include: { patient: true, lab: { include: { user: true } } },
  })

  // Notify patient that results are ready.
  try {
    await sendNotification(
      { userId: updated.patientId },
      {
        title: 'Your lab test results are ready',
        body: updated.resultsNote
          ? `${updated.lab.labName}: ${updated.resultsNote.slice(0, 120)}`
          : `Results from ${updated.lab.labName} have been uploaded. Open the app to view them.`,
        type: 'lab_results',
        data: { bookingId: updated.id, url: '/patient' },
        dedupeKey: `lab-booking:${updated.id}:results:patient`,
      },
    )
  } catch { /* best-effort */ }

  // Also notify family caretakers so they can help review results.
  try {
    const { db } = await import('@/lib/db')
    const family = await db.family.findFirst({
      where: { members: { some: { userId: updated.patientId } } },
      include: {
        members: {
          where: { role: 'caretaker', inviteStatus: 'accepted', userId: { not: null } },
          select: { userId: true },
        },
      },
    })
    if (family) {
      const { sendNotification: sendNotif } = await import('@/lib/notifications')
      for (const caretaker of family.members) {
        if (caretaker.userId && caretaker.userId !== updated.patientId) {
          await sendNotif(
            { userId: caretaker.userId },
            {
              title: '🧪 Lab results ready for your family member',
              body: updated.resultsNote
                ? `${updated.lab.labName}: ${updated.resultsNote.slice(0, 120)}`
                : `Results from ${updated.lab.labName} have been uploaded. Open the app to help review them.`,
              type: 'lab_results',
              data: { bookingId: updated.id, forUserId: updated.patientId, url: '/caretaker' },
              dedupeKey: `lab-booking:${updated.id}:results:caretaker:${caretaker.userId}`,
            },
          )
        }
      }
    }
  } catch { /* best-effort */ }

  await logAudit(u.id, 'lab-bookings.results', `booking=${id}`)
  return jsonOk({
    id: updated.id,
    status: updated.status,
    hasResultsFile: !!updated.resultsFile, // boolean — opaque to patient
    resultsNote: updated.resultsNote,
    resultUploadedAt: updated.resultUploadedAt?.toISOString() ?? null,
  })
}

// GET /api/lab-bookings/[id]/results
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const { id } = await params

  const booking = await db.labBooking.findUnique({ where: { id }, include: { lab: { include: { user: true } } } })
  if (!booking) return jsonError('Booking not found', 404)

  const isPatient = booking.patientId === u.id
  const isLab = booking.lab.userId === u.id
  if (!isPatient && !isLab && u.role !== 'admin') return jsonError('Forbidden', 403)

  // PRIVACY: patients see only a boolean presence flag for resultsFile.
  // Labs and admins see the opaque token so they can re-upload / manage it.
  const canViewToken = isLab || u.role === 'admin'

  return jsonOk({
    id: booking.id,
    status: booking.status,
    tests: JSON.parse(booking.tests || '[]'),
    resultsFile: canViewToken ? booking.resultsFile : null, // token only for lab/admin
    hasResultsFile: !!booking.resultsFile,                    // visible to all authorized roles
    resultsNote: booking.resultsNote,
    resultUploadedAt: booking.resultUploadedAt?.toISOString() ?? null,
    labName: booking.lab.labName,
  })
}
