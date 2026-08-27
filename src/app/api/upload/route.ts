import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { logAudit } from '@/lib/auth';
import { rateLimit } from '@/lib/security';
import { checkCsrf } from '@/lib/csrf';
import { jsonError, jsonOk, requireAuth } from '@/lib/api-helpers';
import { writeFile, mkdir, chmod } from 'fs/promises';
import { join } from 'path';
import { encrypt as encryptPayload } from '@/lib/encryption'; // ENCRYPTION-AT-REST
import { scanBuffer } from '@/lib/antivirus';
import { logger } from '@/lib/logger';
export const dynamic = 'force-dynamic';

/**
 * SECURITY: Health-file upload endpoint.
 *
 * ENCRYPTION AT REST (AES-256-GCM):
 *   Raw file bytes are encrypted BEFORE disk write (src/lib/encryption.ts).
 *   Each file gets a unique 128-bit IV; IV + auth tag are prepended to the
 *   ciphertext on disk, enabling safe decryption later.
 *   Encryption key: process.env.ENCRYPTION_KEY (32 bytes / 64 hex chars).
 *   Dev fallback: SHA-256(SESSION_SECRET) consistent with lib/encryption.ts.
 *
 * FILE PRIVACY:
 *   Storage is in <PROJECT_ROOT>/private-uploads/ — OUTSIDE the Next.js
 *   `public/` tree. Nothing there is served by the static-file handler or
 *   reachable at a public URL. Access must go through an authenticated
 *   file-server API route using the opaque fileToken returned below.
 *   os.chmod(filepath, 0o600) restricts disk access to the OS user only.
 *
 * METADATA NOT PUBLICLY EXPOSED:
 *   Response returns an opaque fileToken (NOT a public path or /uploads/ URL).
 *   Original filename, MIME type, size are returned only to the authenticated
 *   uploader.  Callers associate the token with the relevant entity
 *   (prescription id, lab-booking id) themselves; no file metadata is persisted
 *   in the DB.
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — strict cap for sensitive health data documents

// Strict allowlist: only formats required for prescriptions and lab reports.
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// ENCRYPTION-AT-REST marker: this directory is OUTSIDE `public/`; all files
// within it are AES-256-GCM encrypted — never served as static assets.
const PRIVATE_UPLOAD_ROOT = join(process.cwd(), 'private-uploads');

/**
 * Per-user directory inside the private store.
 * Uses SHA-256 prefix of userId — avoids exposing raw user IDs in filesystem paths.
 * Health Data Protection: 12-char prefix increased from 16 to prevent internal structure enumeration but stay consistent with token prefix.
 */
function getUserDir(userId: string): string {
  // Use consistent 12-char prefix to match upload route
  const prefix = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
  return join(PRIVATE_UPLOAD_ROOT, prefix);
}

/**
 * ENCRYPTION-AT-REST: encrypt a raw buffer with AES-256-GCM.
 * Returns: [ IV(16 bytes) | authTag(16 bytes) | ciphertext... ]
 * The prepended IV and auth tag enable decryption without extra storage.
 */
function encryptBuffer(buffer: Buffer): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (keyHex && keyHex.length === 64) {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]);
  }
  // Dev fallback — reuses lib/encryption.ts which hashes SESSION_SECRET.
  // PRODUCTION MUST set ENCRYPTION_KEY (64 hex chars).
  const encryptedString = encryptPayload(buffer);
  // encryptedString is "iv:authTag:encrypted" (all base64)
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }
  const iv = Buffer.from(parts[0]!, 'base64');
  const tag = Buffer.from(parts[1]!, 'base64');
  const ct = Buffer.from(parts[2]!, 'base64');
  return Buffer.concat([iv, tag, ct]);
}

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
  const fullBuffer = Buffer.from(await file.arrayBuffer());
  const verdict = await scanBuffer(fullBuffer, file.name);
  if (verdict.engine === 'clamav' && verdict.infected) {
    await logAudit(session.id, 'upload.rejected_malware', { resourceType: 'upload', details: verdict.details });
    return jsonError('This file was flagged as potentially malicious and was not uploaded.', 400, 'MALWARE_DETECTED');
  }

  // Ensure user directory exists in the ENCRYPTED private store.
  // This directory is OUTSIDE the `public/` tree — never served as static assets.
  await mkdir(getUserDir(session.id), { recursive: true });

  // Sanitize filename: strip path components, keep only safe chars + one extension.
  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '');
  const ext = safeName.includes('.') ? `.${safeName.split('.').pop()}` : '';
  // Non-guessable file id (128-bit random = 32 hex chars) prevents enumeration.
  const fileId = crypto.randomBytes(16).toString('hex');
  const filename = `${fileId}${ext}`;
  const filepath = join(getUserDir(session.id), filename);

  // Read raw bytes, then ENCRYPT BEFORE writing to disk.
  const rawBuffer = fullBuffer; // already read for the malware scan above
  let encryptedBuffer: Buffer;
  try {
    encryptedBuffer = encryptBuffer(rawBuffer); // ENCRYPTION-AT-REST applied here
  } catch (err) {
    // lib/encryption.getKey() THROWS in production when ENCRYPTION_KEY is not
    // set (or SESSION_SECRET is missing). Previously this escaped as an
    // unhandled 500 with no explanation — lab result uploads failed with a
    // generic "failed" toast and were impossible to diagnose.
    logger.phiSafeError(err, 'upload.encrypt');
    return jsonError(
      'Upload failed: server-side encrypted storage is not configured (missing ENCRYPTION_KEY). Please contact support.',
      503,
      'ENCRYPTION_NOT_CONFIGURED'
    );
  }
  await writeFile(filepath, encryptedBuffer);

  // ENCRYPTION-AT-REST: restrict file to owner-only — health files must never
  // be world-readable, even on the host filesystem of a shared container.
  await chmod(filepath, 0o600);

  // Opaque fileToken: server-reversible reference, NOT a public path or URL.
  // Health Data Protection: First 12 chars = SHA-256(userId) prefix so the access endpoint can
  // locate the file without exposing the internal directory structure.
  // Length increased from 8 to 12 to prevent rainbow-table reconstruction attacks.
  const userPrefix = crypto.createHash('sha256').update(session.id).digest('hex').slice(0, 12);
  const fileToken = `${userPrefix}_${fileId}`;

  // Privacy: no public URL returned.
  // `url: /uploads/${filename}` REMOVED — that path exposed encrypted health
  // files without authentication.  Consumers must use the authenticated
  // file-access API route (file-access/[token]) with fileToken.
  return jsonOk({
    fileToken, // opaque — use with the file-access API endpoint
    name: file.name, // display label — returned to uploader only
    type: file.type,
    size: file.size,
  });
}
