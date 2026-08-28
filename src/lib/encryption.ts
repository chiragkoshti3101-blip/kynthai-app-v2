// src/lib/encryption.ts
// Encryption utilities for medical documents
// Uses AES-256-GCM for authenticated encryption
//
// SECURITY: getKey() THROWS in production if ENCRYPTION_KEY is not set.
// In development, a per-process random key is generated for convenience,
// but this means encrypted data from dev sessions cannot be decrypted
// after a server restart. NEVER use dev-generated keys for production data.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;

let _KEY: Buffer | null = null;

/**
 * Get the master encryption key.
 *
 * Resolution order:
 *   1. ENCRYPTION_KEY (preferred, 64 hex chars = 32 bytes)
 *   2. MASTER_ENCRYPTION_KEY (legacy alias)
 *
 * In production: throws if neither is set (fail-closed — do not encrypt with a
 * weak or static key).
 * In development: generates a per-process random key. Data encrypted with this
 * key is lost on restart.
 */
function getKey(): Buffer {
  if (_KEY) return _KEY;

  const masterKey = process.env.ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY;

  if (!masterKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[encryption] CRITICAL: ENCRYPTION_KEY is not set. ' +
        'PHI/PII data cannot be encrypted without a master key. ' +
        'Set ENCRYPTION_KEY to a 64-character hex string (generate with: openssl rand -hex 32)'
      );
    }
    // Development: per-process random key. DO NOT use for real data.
    const devKey = randomBytes(32);
    _KEY = devKey;
    console.warn(
      '[encryption] WARNING: No ENCRYPTION_KEY set. Using per-process random key. ' +
      'Encrypted data will be lost on restart.'
    );
    return _KEY;
  }

  const trimmed = masterKey.trim();
  if (trimmed.length < 32) {
    throw new Error(
      `[encryption] ENCRYPTION_KEY must be at least 32 characters (got ${trimmed.length}). ` +
      'Generate a strong key with: openssl rand -hex 32'
    );
  }

  // NOTE: derivation MUST stay 'utf-8' slice(0,32) — every _enc column in the
  // live database was produced under this exact key bytes. Switching to
  // Buffer.from(..., 'hex') yields a DIFFERENT 32-byte key and silently makes
  // ALL existing ciphertext undecryptable. If the master key is a 64-char hex
  // string (openssl rand -hex 32), migrating to hex parsing requires a
  // read-under-old-key → re-encrypt-under-new-key data migration FIRST.
  _KEY = Buffer.from(trimmed.slice(0, 32), 'utf-8');
  return _KEY;
}

/**
 * Derive a per-file encryption key from master key + file-specific salt
 */
export function deriveFileKey(salt: Buffer): Buffer {
  return scryptSync(getKey(), salt, 32);
}

/**
 * Encrypt file buffer
 * Returns: { encryptedData, iv, salt, authTag }
 */
export function encryptFile(data: Buffer): {
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

  return { encryptedData, iv, salt, authTag };
}

/**
 * Decrypt file buffer
 */
export function decryptFile(
  encryptedData: Buffer,
  iv: Buffer,
  salt: Buffer,
  authTag: Buffer
): Buffer {
  const fileKey = deriveFileKey(salt);
  const decipher = createDecipheriv(ALGORITHM, fileKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

/**
 * Encrypt a string (for metadata, keys, etc.)
 */
export function encryptString(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a string
 */
export function decryptString(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length < 3) throw new Error('Invalid encrypted format');
  const ivB64 = parts[0]!;
  const tagB64 = parts[1]!;
  const dataB64 = parts[2]!;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Encrypt a string with a specific key (for per-file keys)
 */
export function encryptWithKey(text: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a string with a specific key
 */
export function decryptWithKey(encrypted: string, key: Buffer): string {
  const parts = encrypted.split(':');
  if (parts.length < 3) throw new Error('Invalid encrypted format');
  const ivB64 = parts[0]!;
  const tagB64 = parts[1]!;
  const dataB64 = parts[2]!;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Generate a secure random file ID
 */
export function generateFileId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Sanitize filename for storage
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 255);
}

/**
 * Decrypt buffer with master key (for backwards compatibility)
 */
export function decrypt(buffer: Buffer): string {
  // Expects format: iv:authTag:encrypted (all base64)
  const parts = buffer.toString('base64').split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  
  const iv = Buffer.from(parts[0]!, 'base64');
  const authTag = Buffer.from(parts[1]!, 'base64');
  const encrypted = Buffer.from(parts[2]!, 'base64');
  
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Encrypt buffer with master key (for backwards compatibility)
 */
export function encrypt(buffer: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Encrypt a string value for database storage
 */
export function encryptValue(value: string): string {
  return encrypt(Buffer.from(value, 'utf8'));
}

/**
 * Decrypt a string value from database storage
 */
export function decryptValue(encrypted: string): string {
  try {
    const buffer = Buffer.from(encrypted, 'utf8');
    return decrypt(buffer);
  } catch (err) {
    // Log loudly for observability, but degrade gracefully (''): a med-reminder
    // app must keep rendering when a single legacy/undecryptable field appears.
    // Throwing here would crash whole pages over one bad row (availability >).
    console.error('[encryption] Failed to decrypt a value:', err);
    return '';
  }
}
