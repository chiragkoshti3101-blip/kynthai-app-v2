/**
 * Patient Identity Verification — utilities for:
 * - Sending SMS verification codes
 * - Storing verification status
 * - Uploading identity documents
 * - Identity confirmation affidavits
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export interface IdentityDocument {
  id: string;
  type: 'passport' | 'drivers_license' | 'national_id' | 'other';
  fileName: string;
  uploadedAt: string;
  verified: boolean;
}

export interface PatientVerificationStatus {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityConfirmed: boolean;
  idDocumentUploaded: boolean;
  idDocumentVerified: boolean;
  overallLevel: 'unverified' | 'email_verified' | 'identity_confirmed' | 'id_verified' | 'pending_review' | 'rejected';
}

/**
 * Computes overall verification level from individual flags.
 */
export function computeVerificationLevel(status: {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityConfirmed: boolean;
  idDocumentUploaded: boolean;
  idDocumentVerified: boolean;
}): PatientVerificationStatus['overallLevel'] {
  if (status.idDocumentVerified) return 'id_verified';
  if (status.idDocumentUploaded) return 'pending_review';
  if (status.identityConfirmed && status.phoneVerified) return 'identity_confirmed';
  if (status.emailVerified) return 'email_verified';
  return 'unverified';
}

/**
 * Generates a 6-digit SMS verification code using cryptographically secure random.
 * In production, this would be sent via Twilio or similar.
 */
export function generateSmsCode(): string {
  // Use crypto.randomInt for cryptographically secure generation
  return String(randomInt(100000, 999999));
}

/**
 * Validates a 6-digit SMS verification code format.
 */
export function isValidSmsCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Maximum failed verification attempts before a code is invalidated.
 */
export const SMS_MAX_ATTEMPTS = 5;

/**
 * Constant-time string comparison — mitigates timing side-channels when
 * comparing secrets (OTP codes, tokens). Returns false immediately on
 * length mismatch without leaking how many leading bytes matched.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * HMAC key for hashing SMS codes at rest. Falls back to SESSION_SECRET so
 * environments without ENCRYPTION_KEY still fail closed (never plaintext).
 */
function smsHmacKey(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || '';
  if (!key) {
    throw new Error('ENCRYPTION_KEY or SESSION_SECRET must be set to store SMS codes');
  }
  return key;
}

/**
 * HMAC-SHA256 of a 6-digit code. Codes are never stored or compared in
 * plaintext; only this digest is persisted.
 */
export function hashSmsCode(code: string): string {
  return createHmac('sha256', smsHmacKey()).update(code, 'utf8').digest('hex');
}

/**
 * Verify a submitted code against a stored digest in constant time.
 */
export function verifySmsCode(code: string, storedHash: string): boolean {
  if (!isValidSmsCode(code) || !storedHash) return false;
  return constantTimeEqual(hashSmsCode(code), storedHash);
}

/**
 * Persisted SMS record encoding: `<hmac-hex>:<attempts>`. Encoding the
 * attempt counter inside the existing column avoids a schema migration while
 * keeping the counter atomic with the code itself.
 */
export function encodeStoredSmsCode(hash: string, attempts: number): string {
  return `${hash}:${Math.max(0, attempts)}`;
}

/**
 * Decode a persisted SMS record. Legacy plaintext codes (pre-hashing) decode
 * with attempts=0 and are handled gracefully by callers.
 */
export function decodeStoredSmsCode(stored: string): { hash: string; attempts: number } {
  if (!stored) return { hash: '', attempts: 0 };
  const idx = stored.lastIndexOf(':');
  if (idx <= 0) return { hash: stored, attempts: 0 };
  const attempts = Number.parseInt(stored.slice(idx + 1), 10);
  return {
    hash: stored.slice(0, idx),
    attempts: Number.isFinite(attempts) ? attempts : 0,
  };
}

/**
 * Creates an identity confirmation affidavit payload.
 * This is the legal "I am a real person" statement the user signs.
 */
export function createAffidavitPayload(name: string, email: string): {
  statement: string;
  name: string;
  email: string;
  timestamp: string;
} {
  return {
    statement: `I, ${name}, hereby confirm that I am a real person and that all information provided to Kynthai is true and accurate to the best of my knowledge. I understand that providing false information may result in permanent account suspension.`,
    name,
    email,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Allowed ID document types for patient verification.
 */
export const ID_DOCUMENT_TYPES = [
  { value: 'drivers_license', label: "Driver's licence / driving ID" },
  { value: 'national_id', label: 'National ID / government ID card' },
  { value: 'passport', label: 'Passport' },
  { value: 'other', label: 'Other Government ID' },
] as const;

/**
 * US state list for doctor/license verification
 */
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;
