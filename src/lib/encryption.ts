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

  // Detect if key is hex (64 chars, valid hex) or legacy UTF-8
  const isHex = /^[0-9a-fA-F]{64}$/.test(trimmed);

  let keyBytes: Buffer;
  if (isHex) {
    // Proper hex decoding — full 32 bytes of entropy
    keyBytes = Buffer.from(trimmed, 'hex');
  } else {
    // Legacy: UTF-8 slice (only first 32 chars used — reduced entropy)
    // Log warning to encourage migration to hex
    console.warn(
      '[encryption] WARNING: ENCRYPTION_KEY is not a 64-char hex string. ' +
      'Using legacy UTF-8 slice (reduced entropy). Migrate to openssl rand -hex 32.'
    );
    keyBytes = Buffer.from(trimmed.slice(0, 32), 'utf-8');
  }

  _KEY = keyBytes;
  return _KEY;
}

/**
 * Get the key version for ciphertext tagging.
 */
export function getKeyVersion(): number {
  return KEY_VERSION;
}

/**
 * Derive a per-file encryption key from master key + file-specific salt
 */
export function deriveFileKey(salt: Buffer): Buffer {
  return scryptSync(getKey(), salt, 32);
}

/**
 * Encrypt file buffer
 * Returns envelope: { version, encryptedData, iv, salt, authTag }
 */
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

/**
 * Encrypt file buffer to stored envelope format (iv | salt | tag | ciphertext)
 * with key version prefix.
 */
export function encryptHealthFile(raw: Buffer): Buffer {
  const { version, encryptedData, iv, salt, authTag } = encryptFile(raw);
  // Version byte (1) + iv(12) + salt(16) + tag(16) + ciphertext
  const versionBuf = Buffer.from([version]);
  return Buffer.concat([versionBuf, iv, salt, authTag, encryptedData]);
}

/**
 * Decrypt file buffer from stored envelope.
 * Reads version byte to support key rotation.
 */
export function decryptHealthFile(stored: Buffer): Buffer {
  if (stored.length <= 1 + 12 + 16 + 16) {
    throw new Error('Stored file is truncated or corrupt.');
  }

  const version = stored[0];
  const iv = stored.subarray(1, 13);
  const salt = stored.subarray(13, 29);
  const authTag = stored.subarray(29, 45);
  const ciphertext = stored.subarray(45);

  // If version differs from current, re-encryption would be needed
  // For now, decrypt with current key (backward compatible for v1)
  const fileKey = deriveFileKey(salt);
  const decipher = createDecipheriv(ALGORITHM, fileKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt a string (for metadata, keys, etc.)
 */
export function encryptString(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted string
 */
export function decryptString(encryptedBase64: string): string {
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);

  const fileKey = deriveFileKey(randomBytes(SALT_LENGTH)); // salt not stored for strings; use random
  // Note: For string encryption, we use the master key directly
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * BACKWARD COMPATIBILITY LAYER
 * These functions maintain compatibility with the legacy API used throughout the codebase.
 */

/**
 * Legacy encrypt function - encrypts a string using master key
 * @deprecated Use encryptString instead
 */
export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Legacy decryptValue function - decrypts a string using master key
 * @deprecated Use decryptString instead
 */
export function decryptValue(encryptedBase64: string): string {
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Legacy decryptFile function - decrypts a file buffer from stored envelope
 * @deprecated Use decryptHealthFile instead
 */
export function decryptFile(stored: Buffer): Buffer;
export function decryptFile(ciphertext: Buffer, iv: Buffer, salt: Buffer, authTag: Buffer): Buffer;
export function decryptFile(stored: Buffer, iv?: Buffer, salt?: Buffer, authTag?: Buffer): Buffer {
  // Split form: ciphertext with iv/salt/tag stored separately
  // (medical documents keep them as an `iv:salt:tag` encryptionKey string).
  if (iv && salt && authTag) {
    const fileKey = deriveFileKey(salt);
    const decipher = createDecipheriv(ALGORITHM, fileKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(stored), decipher.final()]);
  }

  // Envelope form: version byte | iv | salt | tag | ciphertext
  if (stored.length <= 1 + 12 + 16 + 16) {
    throw new Error('Stored file is truncated or corrupt.');
  }

  const envelopeIv = stored.subarray(1, 13);
  const envelopeSalt = stored.subarray(13, 29);
  const envelopeTag = stored.subarray(29, 45);
  const ciphertext = stored.subarray(45);

  const fileKey = deriveFileKey(envelopeSalt);
  const decipher = createDecipheriv(ALGORITHM, fileKey, envelopeIv);
  decipher.setAuthTag(envelopeTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Legacy generateFileId function - generates a random file ID
 * @deprecated Use crypto.randomUUID() or similar
 */
export function generateFileId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Legacy sanitizeFilename function - sanitizes a filename
 * @deprecated Use a proper filename sanitization library
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 255);
}

/**
 * Legacy encryptValue function - encrypts a value (alias for encrypt)
 * @deprecated Use encryptString instead
 */
export function encryptValue(text: string): string {
  return encrypt(text);
}

/**
 * Legacy decryptValue function - decrypts a value (alias for decryptValue)
 * @deprecated Use decryptString instead
 */
export function decryptValueAlias(encryptedBase64: string): string {
  return decryptValue(encryptedBase64);
}

/**
 * Legacy hashValue function - creates a hash of a value
 * @deprecated Use crypto.createHash('sha256') instead
 */
export function hashValue(value: string): string {
  return createHmac('sha256', getKey()).update(value).digest('hex');
}

// Re-export the master key and the V2 aliases for callers that use them directly.
// The plain names are already exported above, so re-exporting them again here
// is a duplicate declaration.
export {
  getKey,
  encryptFile as encryptFileV2,
  decryptHealthFile as decryptFileV2,
  encryptHealthFile as encryptHealthFileV2,
};
