import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { jsonError, applyStandardHeaders, requireAuth } from '@/lib/api-helpers'
import {
  loadEncryptedHealthFile,
  decryptHealthFile,
  parseFileToken,
  contentTypeForExt,
  userPrefixFor,
  HealthFileStorageError,
} from '@/lib/health-files'
export const dynamic = 'force-dynamic'

/**
 * GET /api/upload/[token] — authenticated file retrieval
 *
 * SECURITY:
 *   1. Requires valid session (requireAuth).
 *   2. Token ownership check: fileToken = {sha256(userId)[:12]}_{32-hex fileId}.
 *      The prefix in the token must match the requester's prefix.
 *   3. File is served with Content-Disposition: attachment and
 *      Cache-Control: no-store to prevent browser caching of sensitive health data.
 *   4. The stored envelope is decrypted server-side (AES-256-GCM) — the client
 *      receives the original file bytes, not ciphertext.
 *
 * STORAGE:
 *   Files live in the private Supabase Storage bucket (medical-documents /
 *   private-uploads/) via src/lib/health-files.ts. This used to be a local-disk
 *   read which always failed on Vercel's read-only serverless filesystem.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const { response, user: session } = await requireAuth(req)
  if (response || !session) return response!

  await logAudit(session.id, 'upload.retrieve', { resourceType: 'LabBooking' })

  const { token } = await params
  const parts = parseFileToken(token)
  if (!parts) return jsonError('Invalid file token', 400)

  // Ownership check: the prefix must be the requester's SHA-256 prefix
  const requesterPrefix = userPrefixFor(session.id)
  if (parts.userPrefix !== requesterPrefix) {
    return jsonError('Forbidden — file does not belong to you', 403)
  }

  try {
    const { stored, ext } = await loadEncryptedHealthFile(token)
    const plain = decryptHealthFile(stored)
    const filename = `health-file-${parts.fileId}.${ext}`

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
    return applyStandardHeaders(res, req)
  } catch (err) {
    if (err instanceof HealthFileStorageError) {
      return jsonError(err.message, err.status, err.code)
    }
    return jsonError('File not found', 404)
  }
}
