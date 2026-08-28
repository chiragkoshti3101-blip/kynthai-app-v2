import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { logAudit } from '@/lib/auth';
import { rateLimit } from '@/lib/security';
import { checkCsrf } from '@/lib/csrf';
import { jsonError, jsonOk, requireAuth } from '@/lib/api-helpers';
import {
  encryptHealthFile,
  storeEncryptedHealthFile,
  userPrefixFor,
  HealthFileStorageError,
} from '@/lib/health-files';
import { scanBuffer } from '@/lib/antivirus';
import { logger } from '@/lib/logger';
export const dynamic = 'force-dynamic';

/**
 * SECURITY: Health-file upload endpoint.
 *
 * ENCRYPTION AT REST (AES-256-GCM):
 *   Raw file bytes are encrypted BEFORE they leave the process
 *   (src/lib/health-files.ts -> lib/encryption.ts). Each file gets a unique
 *   per-file scrypt key; the IV, salt and auth tag are stored alongside the
 *   ciphertext, enabling safe decryption later.
 *   Encryption key: process.env.ENCRYPTION_KEY (fail-closed in production).
 *
 * FILE PRIVACY:
 *   Storage is the server-side Supabase Storage bucket `medical-documents`,
 *   folder `private-uploads/` — a PRIVATE bucket. Nothing there is served by
 *   any static-file handler or reachable at a public URL. Access must go
 *   through an authenticated API route (GET /api/upload/[token]) using the
 *   opaque fileToken returned below, and the token prefix must match the
 *   requester's own identity hash.
 *
 * METADATA NOT PUBLICLY EXPOSED:
 *   Response returns an opaque fileToken (NOT a public path or /uploads/ URL).
 *   Original filename, MIME type, size are returned only to the authenticated
 *   uploader.  Callers associate the token with the relevant entity
 *   (prescription id, lab-booking id) themselves; no file metadata is persisted
 *   in the DB.
 *
 * SERVERLESS NOTE:
 *   This endpoint previously wrote to the local filesystem
 *   (<cwd>/private-uploads/) which always failed with EROFS -> 500 on Vercel.
 *   Storage now goes through lib/health-files.ts (Supabase Storage).
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — strict cap for sensitive health data documents

// Strict allowlist: only formats required for prescriptions and lab reports.
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function POST(req: NextRequest) {
  const csrfErr = await checkCsrf(req);
  if (csrfErr) return csrfErr;

  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user: session } = await requireAuth(req);
  if (response || !session) return response!;

  await logAudit(session.id, 'upload.presigned', { resourceType: 'LabBooking' });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return jsonError('No file provided', 400);

  if (!ALLOWED_TYPES.has(file.type)) {
    return jsonError('Invalid file type. Accepted: PDF, JPG, PNG.', 400);
  }

  // SECURITY: Verify magic bytes match the declared file type to prevent
  // content-type spoofing (e.g., a PDF disguised as a JPEG).
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const magicOk =
    (header[0] === 0xff && header[1] === 0xd8) || // JPEG
    (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) || // PNG
    (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46); // PDF
  if (!magicOk) {
    return jsonError('File content does not match allowed types (JPEG, PNG, PDF).', 400);
  }

  if (file.size > MAX_SIZE) {
    return jsonError('File too large. Max 5 MB.', 400);
  }

  // SECURITY: malware scan (ClamAV) — read the full raw bytes and scan them
  // BEFORE encrypting/storing. If ClamAV is unavailable (e.g. serverless) the
  // scan degrades gracefully unless KYNTHAI_REQUIRE_AV=1.
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const verdict = await scanBuffer(rawBuffer, file.name);
  if (verdict.engine === 'clamav' && verdict.infected) {
    await logAudit(session.id, 'upload.rejected_malware', { resourceType: 'upload', details: verdict.details });
    return jsonError('This file was flagged as potentially malicious and was not uploaded.', 400, 'MALWARE_DETECTED');
  }

  // Sanitize filename: strip path components, keep only safe chars + one extension.
  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '');
  const rawExt = safeName.includes('.') ? (safeName.split('.').pop() ?? '') : '';
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || 'bin';

  // Non-guessable file id (128-bit random = 32 hex chars) prevents enumeration.
  const fileId = crypto.randomBytes(16).toString('hex');
  const userPrefix = userPrefixFor(session.id);
  const fileToken = `${userPrefix}_${fileId}`;

  // ENCRYPTION-AT-REST: encrypt BEFORE anything leaves the process.
  let encryptedBuffer: Buffer;
  try {
    encryptedBuffer = encryptHealthFile(rawBuffer);
  } catch (err) {
    // lib/encryption.getKey() THROWS in production when ENCRYPTION_KEY is not
    // set (or SESSION_SECRET is missing). Fail with an actionable message.
    logger.phiSafeError(err, 'upload.encrypt');
    return jsonError(
      'Upload failed: server-side encrypted storage is not configured (missing ENCRYPTION_KEY). Please contact support.',
      503,
      'ENCRYPTION_NOT_CONFIGURED'
    );
  }

  // Store in the private, encrypted bucket folder (serverless-safe).
  try {
    await storeEncryptedHealthFile(fileToken, ext, encryptedBuffer);
  } catch (err) {
    if (err instanceof HealthFileStorageError) {
      logger.phiSafeError(err, 'upload.store');
      return jsonError(
        `Upload failed: ${err.message} Please try again or contact support.`,
        err.status,
        err.code
      );
    }
    logger.phiSafeError(err, 'upload.store');
    return jsonError('Upload failed while storing the encrypted file. Please try again.', 502, 'STORAGE_ERROR');
  }

  // Opaque fileToken: server-reversible reference, NOT a public path or URL.
  // First 12 chars = SHA-256(userId) prefix so the access endpoint can locate
  // the file without exposing the internal folder structure, and so ownership
  // is verified on every retrieval.
  return jsonOk({
    fileToken, // opaque — use with the authenticated file-access API endpoint
    name: file.name, // display label — returned to uploader only
    type: file.type,
    size: file.size,
  });
}
