import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { requireAuth, jsonError } from '@/lib/api-helpers'
import {
  loadEncryptedHealthFile,
  decryptHealthFile,
  contentTypeForExt,
  HealthFileStorageError,
} from '@/lib/health-files'
export const dynamic = 'force-dynamic'

/**
 * GET /api/lab-bookings/[id]/results/file — download the actual results file
 *
 * PRIVACY MODEL:
 *   The patient never receives the raw uploader fileToken (the results route
 *   deliberately returns only `hasResultsFile`). This route performs the
 *   authorization HERE instead, so the bytes can flow without leaking the
 *   opaque token across users:
 *     - patient of the booking
 *     - owning lab account
 *     - admin
 *     - any authenticated user presenting the booking's VALID, unexpired
 *       share token (?share=...) — this completes the doctor share flow,
 *       which previously pointed doctors at /api/upload/[token] where the
 *       token ownership check (uploader prefix) would always 403.
 *
 * The stored envelope is decrypted server-side; the client receives the
 * original PDF/JPG/PNG bytes as an attachment with no-store caching.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(req, 20, 60000)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const { id } = await params
  const booking = await db.labBooking.findUnique({
    where: { id },
    include: { lab: { select: { userId: true } } },
  })
  if (!booking) return jsonError('Booking not found', 404)

  const isPatient = booking.patientId === u.id
  const isLab = booking.lab?.userId === u.id
  const isAdmin = u.role === 'admin'

  let shareValid = false
  if (!isPatient && !isLab && !isAdmin) {
    const shareParam = req.nextUrl.searchParams.get('share')
    if (
      shareParam &&
      booking.shareToken &&
      booking.shareToken === shareParam &&
      booking.shareExpiresAt &&
      booking.shareExpiresAt > new Date()
    ) {
      if (u.role === 'doctor') {
        const profile = await db.doctorProfile.findUnique({
          where: { userId: u.id },
          select: { id: true, verified: true },
        })
        if (!profile?.verified) return jsonError('Verified doctor access is required', 403)
        // Empty means a legacy share created before recipient scoping was
        // added. New shares are restricted to the selected doctor profiles.
        if (booking.resultsSharedWith.length > 0 && !booking.resultsSharedWith.includes(profile.id)) {
          return jsonError('These results were not shared with this doctor', 403)
        }
      }
      shareValid = true
    }
  }

  if (!isPatient && !isLab && !isAdmin && !shareValid) {
    return jsonError('Forbidden — you do not have access to this booking', 403)
  }

  if (!booking.resultsFile) {
    return jsonError('No results file has been uploaded for this booking yet', 404)
  }

  await logAudit(u.id, 'lab-bookings.results.file', `booking=${booking.id}`)

  try {
    const { stored, ext } = await loadEncryptedHealthFile(booking.resultsFile)
    const plain = decryptHealthFile(stored)
    const filename = `lab-results-${booking.id}.${ext}`

    const res = new NextResponse(new Uint8Array(plain), {
      status: 200,
      headers: {
        'Content-Type': contentTypeForExt(ext),
        'Content-Length': String(plain.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
    return res
  } catch (err) {
    if (err instanceof HealthFileStorageError) {
      return jsonError(err.message, err.status, err.code)
    }
    return jsonError('Results file could not be loaded', 502)
  }
}
