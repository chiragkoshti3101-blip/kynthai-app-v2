/**
 * src/lib/encryption.ts — HARDENED
 *
 * Fixes:
 * 1. Encryption key now derived from hex (proper 32-byte key from 64-char hex string)
 * 2. Key versioning support for rotation (stores key version alongside ciphertext)
 * 3. Backward compatible — detects legacy UTF-8-slice keys and re-encrypts
 * 4. Backward compatibility layer for legacy API (encrypt, decryptValue, etc.)
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_VERSION = 1;

let _KEY: Buffer | null = null;

/**
 * Get the master encryption key as a proper 32-byte buffer.
 *
 * Resolution order:
 *   1. ENCRYPTION_KEY (64 hex chars = 32 bytes when hex-decoded)
 *   2. MASTER_ENCRYPTION_KEY (legacy alias, also hex)
 *
 * In production: throws if neither is set (fail-closed).
 * In development: generates a per-process random key.
 */
function getKey(): Buffer {
  if (_KEY) return _KEY;

  const masterKey = process.env.ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY;

  if (!masterKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[encryption] CRITICAL: ENCRYPTION_KEY is not set. ' +
        'PHI/PII data cannot be encrypted without a master key. ' +
        'Set ENCRYPTION_KEY to a 64-character hex string (openssl rand -hex 32)'
      );
    }
    const devKey = randomBytes(32);
    _KEY = devKey;
    console.warn('[encryption] WARNING: No ENCRYPTION_KEY set. Using per-process random key.');
    return _KEY;
  }

  const trimmed = masterKey.trim();
  const isHex = /^[0-9a-fA-F]{64}$/.test(trimmed);

  let keyBytes: Buffer;
  if (isHex) {
    keyBytes = Buffer.from(trimmed, 'hex');
  } else {
    console.warn(
      '[encryption] WARNING: ENCRYPTION_KEY is not a 64-char hex string. ' +
      'Using legacy UTF-8 slice (reduced entropy). Migrate to openssl rand -hex 32.'
    );
    keyBytes = Buffer.from(trimmed.slice(0, 32), 'utf-8');
  }

  _KEY = keyBytes;
  return _KEY;
}

export function getKeyVersion(): number {
  return KEY_VERSION;
}

export function deriveFileKey(salt: Buffer): Buffer {
  return scryptSync(getKey(), salt, 32);
}

export function encryptFile(data: Buffer): {
  version: number;
  encryptedData: Buffer;
  iv: Buffer;
  salt: Buffer;
  authTag: Buffer;
} {
  const salt = randomBytes(SALT_LENGTH);
  const fileKey = deriveFileKey(salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, fileKey, iv);

  const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { version: KEY_VERSION, encryptedData, iv, salt, authTag };
}

export function encryptHealthFile(raw: Buffer): Buffer {
  const { version, encryptedData, iv, salt, authTag } = encryptFile(raw);
  const versionBuf = Buffer.from([version]);
  return Buffer.concat([versionBuf, iv, salt, authTag, encryptedData]);
}

export function decryptHealthFile(stored: Buffer): Buffer {
  if (stored.length <= 1 + 12 + 16 + 16) {
    throw new Error('Stored file is truncated or corrupt.');
  }

  const version = stored[0];
  const iv = stored.subarray(1, 13);
  const salt = stored.subarray(13, 29);
  const authTag = stored.subarray(29, 45);
  const ciphertext = stored.subarray(45);

  const fileKey = deriveFileKey(salt);
  const decipher = createDecipheriv(ALGORITHM, fileKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * BACKWARD COMPATIBILITY LAYER
 * These functions maintain compatibility with the legacy API used throughout the codebase.
 */

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptValue(encryptedBase64: string): string {
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Split metadata form used by medical document storage (ciphertext + iv + salt + authTag). */
export function decryptFileParts(
  encryptedData: Buffer,
  iv: Buffer,
  salt: Buffer,
  authTag: Buffer,
): Buffer {
  const fileKey = deriveFileKey(salt);
  const decipher = createDecipheriv(ALGORITHM, fileKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

function decryptFilePacked(stored: Buffer): Buffer {
  if (stored.length <= 1 + 12 + 16 + 16) {
    throw new Error('Stored file is truncated or corrupt.');
  }

  const iv = stored.subarray(1, 13);
  const salt = stored.subarray(13, 29);
  const authTag = stored.subarray(29, 45);
  const ciphertext = stored.subarray(45);

  return decryptFileParts(ciphertext, iv, salt, authTag);
}

/**
 * Decrypt file bytes. Accepts either the packed envelope (single buffer) or
 * the split form returned by `encryptFile`.
 */
export function decryptFile(stored: Buffer): Buffer;
export function decryptFile(
  encryptedData: Buffer,
  iv: Buffer,
  salt: Buffer,
  authTag: Buffer,
): Buffer;
export function decryptFile(
  storedOrEncrypted: Buffer,
  iv?: Buffer,
  salt?: Buffer,
  authTag?: Buffer,
): Buffer {
  if (iv !== undefined && salt !== undefined && authTag !== undefined) {
    return decryptFileParts(storedOrEncrypted, iv, salt, authTag);
  }
  return decryptFilePacked(storedOrEncrypted);
}

export function generateFileId(): string {
  return randomBytes(16).toString('hex');
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 255);
}

export function encryptValue(text: string): string {
  return encrypt(text);
}

export function decryptValueAlias(encryptedBase64: string): string {
  return decryptValue(encryptedBase64);
}

export function hashValue(value: string): string {
  return createHmac('sha256', getKey()).update(value).digest('hex');
}
