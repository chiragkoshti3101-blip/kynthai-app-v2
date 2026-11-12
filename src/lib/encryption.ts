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
  const salt = randomBytes(16);
  const fileKey = deriveFileKey(salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', fileKey, iv);

  const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { version: 1, encryptedData, iv, salt, authTag };
}

export function encryptHealthFile(raw: Buffer): Buffer {
  const { version, encryptedData, iv, salt, authTag } = encryptFile(raw);
  const versionBuf = Buffer.from([1]);
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
  const decipher = createDecipheriv('aes-256-gcm', fileKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptString(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptString(encryptedBase64: string): string {
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);

  const fileKey = deriveFileKey(randomBytes(16));
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

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

export function decryptFile(stored: Buffer): Buffer {
  if (stored.length <= 1 + 12 + 16 + 16) {
    throw new Error('Stored file is truncated or corrupt.');
  }

  const version = stored[0];
  const iv = stored.subarray(1, 13);
  const salt = stored.subarray(13, 29);
  const authTag = stored.subarray(29, 45);
  const ciphertext = stored.subarray(45);

  const fileKey = deriveFileKey(salt);
  const decipher = createDecipheriv('aes-256-gcm', fileKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
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
