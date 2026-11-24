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

export type VerificationLevel = PatientVerificationStatus['overallLevel'];

/**
 * Computes overall verification level from individual flags.
 *
 * `rejected` is a decision rather than a missing step, so a provider review
 * that turned a patient down must not read as "still unverified" — it blocks.
 */
export function computeVerificationLevel(status: {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityConfirmed: boolean;
  idDocumentUploaded: boolean;
  idDocumentVerified: boolean;
  /** Set when an admin rejected the uploaded identity evidence. */
  rejected?: boolean;
}): VerificationLevel {
  if (status.rejected) return 'rejected';
  if (status.idDocumentVerified) return 'id_verified';
  if (status.idDocumentUploaded) return 'pending_review';
  if (status.identityConfirmed && status.phoneVerified) return 'identity_confirmed';
  if (status.emailVerified) return 'email_verified';
  return 'unverified';
}

/**
 * Ordered ladder, lowest first. `rejected` sits below `unverified` because it
 * is a decision to deny, not a step not yet taken. `pending_review` shares a
 * rung with `identity_confirmed`: a submitted document is provisional identity
 * evidence and should not be locked out while a reviewer catches up.
 */
const VERIFICATION_RANK: Record<VerificationLevel, number> = {
  rejected: -1,
  unverified: 0,
  email_verified: 1,
  pending_review: 2,
  identity_confirmed: 2,
  id_verified: 3,
};

export function verificationRank(level: VerificationLevel | string | null | undefined): number {
  return VERIFICATION_RANK[(level ?? 'unverified') as VerificationLevel] ?? 0;
}

/** Does `current` clear the `required` bar? Unknown levels fail closed. */
export function meetsVerificationLevel(
  current: VerificationLevel | string | null | undefined,
  required: VerificationLevel
): boolean {
  return verificationRank(current) >= verificationRank(required);
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
 * Time-to-live for an SMS verification code, in milliseconds.
 * Matches the 10-minute expiry enforced in the verify route.
 */
export const SMS_CODE_TTL_MS = 10 * 60 * 1000;


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
export { ID_DOCUMENT_TYPES } from './identity-document-types';

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
