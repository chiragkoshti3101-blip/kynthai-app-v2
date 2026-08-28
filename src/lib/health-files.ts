// src/lib/health-files.ts
// Encrypted health-file storage backed by Supabase Storage (serverless-safe).
//
// HISTORY: this store used to live on the local filesystem
// (<cwd>/private-uploads/). On Vercel's read-only serverless filesystem every
// upload failed with an unhandled EROFS 500. Storage now uses the same
// Supabase Storage bucket as the medical-documents pipeline, under a dedicated
// `private-uploads/` folder so the two path schemes never collide.
//
// SECURITY MODEL (unchanged):
//   - Raw bytes are AES-256-GCM encrypted server-side BEFORE they leave the
//     process (lib/encryption.ts, per-file scrypt key; ENCRYPTION_KEY required
//     in production).
//   - Stored layout: iv(12) | salt(16) | authTag(16) | ciphertext — fixed
//     offsets, no DB metadata row required.
//   - fileToken = {sha256(userId)[:12]}_{32-hex fileId}. The token is opaque,
//     contains no URL, and ownership is re-verified on every retrieval by
//     comparing the prefix with the requester's own hash.
//   - Files are only served through authenticated API routes with
//     Content-Disposition: attachment + Cache-Control: no-store.

import { createHash } from 'crypto';
import { getSupabaseAdmin, initializeMedicalDocumentsBucket } from './storage';
import { encryptFile, decryptFile } from './encryption';

export const HEALTH_FILE_BUCKET = 'medical-documents';
// Top-level folder for these files inside HEALTH_FILE_BUCKET.
const ROOT = 'private-uploads';
// iv(12) + salt(16) + authTag(16)
const HEADER_BYTES = 44;
const PREFIX_LEN = 12;
const FILE_ID_LEN = 32;

export class HealthFileStorageError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'STORAGE_ERROR', status = 502) {
    super(message);
    this.name = 'HealthFileStorageError';
    this.code = code;
    this.status = status;
  }
}

export interface FileTokenParts {
  userPrefix: string;
  fileId: string;
}

/** Parse + strictly validate an opaque file token ({12-hex}_{32-hex}). */
export function parseFileToken(token: string): FileTokenParts | null {
  if (!token || !token.includes('_')) return null;
  const [userPrefix, fileId] = token.split('_');
  if (!userPrefix || !fileId) return null;
  if (userPrefix.length !== PREFIX_LEN || fileId.length !== FILE_ID_LEN) return null;
  if (!/^[0-9a-f]+$/.test(userPrefix) || !/^[0-9a-f]+$/.test(fileId)) return null;
  return { userPrefix, fileId };
}

/** Deterministic per-user folder prefix (matches the token prefix). */
export function userPrefixFor(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, PREFIX_LEN);
}

/** Encrypt raw bytes into the stored envelope (iv|salt|tag|ciphertext). */
export function encryptHealthFile(raw: Buffer): Buffer {
  const { encryptedData, iv, salt, authTag } = encryptFile(raw);
  return Buffer.concat([iv, salt, authTag, encryptedData]);
}

/** Decrypt a stored envelope back to raw bytes. */
export function decryptHealthFile(stored: Buffer): Buffer {
  if (stored.length <= HEADER_BYTES) {
    throw new HealthFileStorageError('Stored file is truncated or corrupt.', 'FILE_CORRUPT', 500);
  }
  const iv = stored.subarray(0, 12);
  const salt = stored.subarray(12, 28);
  const authTag = stored.subarray(28, HEADER_BYTES);
  const ciphertext = stored.subarray(HEADER_BYTES);
  try {
    return decryptFile(ciphertext, iv, salt, authTag);
  } catch {
    throw new HealthFileStorageError(
      'File could not be decrypted (encryption key mismatch).',
      'DECRYPT_FAILED',
      500
    );
  }
}

function storageReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return (
    url.length > 0 &&
    key.length > 0 &&
    !url.includes('placeholder') &&
    !key.includes('placeholder')
  );
}

function ensureReady(): void {
  if (!storageReady()) {
    throw new HealthFileStorageError(
      'Encrypted file storage is not configured on the server.',
      'STORAGE_NOT_CONFIGURED',
      503
    );
  }
}

function filePathFor(parts: FileTokenParts, ext: string): string {
  return `${ROOT}/${parts.userPrefix}/${parts.fileId}.${ext}`;
}

/** Upload an encrypted envelope. Retries once after initializing the bucket. */
export async function storeEncryptedHealthFile(
  fileToken: string,
  ext: string,
  encrypted: Buffer
): Promise<{ path: string }> {
  ensureReady();
  const parts = parseFileToken(fileToken);
  if (!parts) {
    throw new HealthFileStorageError('Invalid file token.', 'INVALID_TOKEN', 400);
  }
  const path = filePathFor(parts, ext);
  const admin = getSupabaseAdmin();
  const opts = { contentType: 'application/octet-stream', upsert: false } as const;

  let { error } = await admin.storage.from(HEALTH_FILE_BUCKET).upload(path, encrypted, opts);
  if (error && /bucket/i.test(error.message)) {
    const init = await initializeMedicalDocumentsBucket();
    if (!init.success) {
      throw new HealthFileStorageError(
        'Encrypted file storage is temporarily unavailable.',
        'STORAGE_UNAVAILABLE',
        503
      );
    }
    ({ error } = await admin.storage.from(HEALTH_FILE_BUCKET).upload(path, encrypted, opts));
  }
  if (error) {
    throw new HealthFileStorageError(
      `Storage rejected the upload: ${error.message}`,
      'STORAGE_UPLOAD_FAILED',
      502
    );
  }
  return { path };
}

/** Locate + download an encrypted envelope by token. */
export async function loadEncryptedHealthFile(
  fileToken: string
): Promise<{ stored: Buffer; ext: string }> {
  ensureReady();
  const parts = parseFileToken(fileToken);
  if (!parts) {
    throw new HealthFileStorageError('Invalid file token.', 'INVALID_TOKEN', 400);
  }
  const admin = getSupabaseAdmin();
  const folder = `${ROOT}/${parts.userPrefix}`;
  const { data: entries, error: listErr } = await admin.storage
    .from(HEALTH_FILE_BUCKET)
    .list(folder, { limit: 1000 });
  if (listErr) {
    throw new HealthFileStorageError(
      `File index could not be read: ${listErr.message}`,
      'STORAGE_LIST_FAILED',
      502
    );
  }
  const match = (entries || []).find((e) => e.name.startsWith(`${parts.fileId}.`));
  if (!match) {
    throw new HealthFileStorageError('File not found.', 'FILE_NOT_FOUND', 404);
  }
  const path = `${folder}/${match.name}`;
  const { data, error } = await admin.storage.from(HEALTH_FILE_BUCKET).download(path);
  if (error || !data) {
    throw new HealthFileStorageError(
      'File could not be loaded from storage.',
      'STORAGE_DOWNLOAD_FAILED',
      502
    );
  }
  const stored = Buffer.from(await data.arrayBuffer());
  const dot = match.name.lastIndexOf('.');
  const ext = dot > -1 ? match.name.slice(dot + 1) : 'bin';
  return { stored, ext };
}

export function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}
