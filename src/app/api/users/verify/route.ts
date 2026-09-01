import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit } from '@/lib/security';
import { checkCsrf } from '@/lib/csrf';
import {
  jsonError,
  jsonOk,
  readJson,
  requireAuth,
} from '@/lib/api-helpers';
import {
  generateSmsCode,
  isValidSmsCode,
  hashSmsCode,
  verifySmsCode,
  encodeStoredSmsCode,
  decodeStoredSmsCode,
  SMS_MAX_ATTEMPTS,
} from '@/lib/patient-verify';
import { logger } from '@/lib/logger';
import { sendSMSReal, isSMSEnabled } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

const SMS_CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ── GET /api/users/verify — get current user's verification status ──────
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user: session } = await requireAuth(req);
  if (response || !session) return response!;

  try {
    const user = await db.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        phone: true,
        phoneVerified: true,
        identityConfirmed: true,
        identityConfirmedAt: true,
        idDocumentUploaded: true,
        idDocumentVerified: true,
        verificationLevel: true,
        verificationRejectedReason: true,
        name: true,
      },
    });

    if (!user) return jsonError('User not found', 404);

    return jsonOk({
      email: user.email,
      emailVerified: !!user.emailVerified,
      phone: user.phone,
      phoneVerified: !!user.phoneVerified,
      identityConfirmed: !!user.identityConfirmed,
      identityConfirmedAt: user.identityConfirmedAt,
      idDocumentUploaded: !!user.idDocumentUploaded,
      idDocumentVerified: !!user.idDocumentVerified,
      verificationLevel: user.verificationLevel || 'unverified',
      rejectionReason: user.verificationRejectedReason,
      name: user.name,
    });
  } catch (error) {
    logger.phiSafeError(error, 'users.verify.get');
    return jsonError('Failed to fetch verification status', 500);
  }
}

// ── PATCH /api/users/verify — update verification status ───────────────
export async function PATCH(req: NextRequest) {
  const csrfError = await checkCsrf(req);
  if (csrfError) return csrfError;

  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user: session } = await requireAuth(req);
  if (response || !session) return response!;

  const body = await readJson<{
    action?: string;
    phone?: string;
    smsCode?: string;
    identityConfirmed?: boolean;
    idDocumentType?: string;
    idDocumentName?: string;
    documentId?: string;
    selfieDocumentId?: string;
  }>(req);
  if (!body) return jsonError('Invalid JSON', 400);

  try {
    const action = body.action;

    // ── Action: send_sms ──────────────────────────────────────────────
    if (action === 'send_sms') {
      const phone = sanitizeText(body.phone || '', 20);
      if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
        return jsonError('Valid phone number required (E.164 format, e.g. +15551234567)', 400);
      }

      const code = generateSmsCode();
      const expiresAt = new Date(Date.now() + SMS_CODE_EXPIRY_MS);

      // SECURITY: store an HMAC digest of the code (never plaintext) plus a
      // zeroed attempt counter. A DB leak no longer exposes usable codes.
      await db.user.update({
        where: { id: session.id },
        data: {
          smsVerificationCode: encodeStoredSmsCode(hashSmsCode(code), 0),
          smsCodeExpiresAt: expiresAt,
          phone,
        },
      });

      // SECURITY: deliver the OTP over the real SMS channel when configured.
      // Never log the plaintext code to stdout in production (OTP leakage).
      if (isSMSEnabled()) {
        const sms = await sendSMSReal({
          to: phone,
          body: `Your Kynthai verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.`,
        });
        if (!sms.ok) {
          logger.phiSafeError(
            new Error(sms.error || 'SMS send failed'),
            `users.verify.sms_send (${sms.provider})`
          );
          return jsonError('Failed to send verification code. Please try again.', 502, 'SMS_SEND_FAILED');
        }
        await logAudit(session.id, 'user.verify.sms_sent', `phone=${phone} provider=${sms.provider}`);
      } else if (process.env.NODE_ENV !== 'production') {
        // Dev/demo only — no SMS provider configured, surface the code for testing.
        console.log(`[VERIFY][DEV] SMS code for ${session.id}: ${code}`);
        await logAudit(session.id, 'user.verify.sms_sent', `phone=${phone} dev`);
      } else {
        // Production without a working SMS provider: fail loudly rather than
        // telling the user a code was sent when none can be delivered.
        return jsonError(
          'SMS verification is temporarily unavailable. Please contact support.',
          503,
          'SMS_UNAVAILABLE'
        );
      }
      return jsonOk({ message: 'Verification code sent', phone });
    }

    // ── Action: verify_sms ────────────────────────────────────────────
    if (action === 'verify_sms') {
      const user = await db.user.findUnique({
        where: { id: session.id },
        select: { smsVerificationCode: true, smsCodeExpiresAt: true },
      });

      if (!user?.smsVerificationCode) {
        return jsonError('No verification code found. Request a new one.', 400);
      }

      if (user.smsCodeExpiresAt && new Date() > user.smsCodeExpiresAt) {
        // Clear expired code
        await db.user.update({
          where: { id: session.id },
          data: { smsVerificationCode: null, smsCodeExpiresAt: null },
        });
        return jsonError('Verification code expired. Request a new one.', 400);
      }

      const stored = user.smsVerificationCode ?? '';
      const { hash, attempts } = decodeStoredSmsCode(stored);

      // SECURITY: cap failed attempts — a 6-digit code must not be brute-able
      // within its 10-minute window. Past the cap, invalidate and force re-send.
      if (attempts >= SMS_MAX_ATTEMPTS) {
        await db.user.update({
          where: { id: session.id },
          data: { smsVerificationCode: null, smsCodeExpiresAt: null },
        });
        return jsonError('Too many failed attempts. Request a new code.', 429);
      }

      // Legacy tolerance: pre-hashing plaintext codes are still accepted once
      // (then cleared). New codes always go through the constant-time path.
      const legacyPlainMatch = stored === body.smsCode;
      if (!legacyPlainMatch && !verifySmsCode(body.smsCode || '', hash)) {
        // SECURITY: increment the attempt counter on failure, then reject.
        await db.user.update({
          where: { id: session.id },
          data: {
            smsVerificationCode: encodeStoredSmsCode(hash, attempts + 1),
          },
        });
        return jsonError('Invalid verification code', 400);
      }

      // Clear code and mark phone as verified
      await db.user.update({
        where: { id: session.id },
        data: {
          smsVerificationCode: null,
          smsCodeExpiresAt: null,
          phoneVerified: true,
        },
      });

      await logAudit(session.id, 'user.verify.sms_confirmed', '');
      return jsonOk({ message: 'Phone verified successfully', phoneVerified: true });
    }

    // ── Action: confirm_identity ──────────────────────────────────────
    if (action === 'confirm_identity') {
      if (!body.identityConfirmed) {
        return jsonError('You must accept the identity confirmation statement', 400);
      }

      await db.user.update({
        where: { id: session.id },
        data: {
          identityConfirmed: true,
          identityConfirmedAt: new Date(),
          verificationLevel: 'identity_confirmed',
        },
      });

      await logAudit(session.id, 'user.verify.identity_confirmed', '');
      return jsonOk({ message: 'Identity confirmed', verificationLevel: 'identity_confirmed' });
    }

    // ── Action: upload_id ─────────────────────────────────────────────
    if (action === 'upload_id') {
      const allowedDocumentTypes = new Set(['passport', 'drivers_license', 'national_id', 'other']);
      if (!body.idDocumentType || !allowedDocumentTypes.has(body.idDocumentType)) {
        return jsonError('Valid identity document type required', 400);
      }

      // Identity files must go through the encrypted medical-document upload
      // route. Never accept or persist base64 document data in this endpoint.
      const documentId = sanitizeText(body.documentId || '', 100);
      const selfieDocumentId = sanitizeText(body.selfieDocumentId || '', 100) || null;
      if (!documentId) {
        return jsonError('Secure document upload required before verification submission', 400);
      }

      const documentIds = [documentId, selfieDocumentId].filter(
        (id): id is string => Boolean(id),
      );
      const documents = await db.medicalDocument.findMany({
        where: {
          id: { in: documentIds },
          userId: session.id,
          uploadedById: session.id,
          visibility: 'PRIVATE',
        },
        select: {
          id: true,
          type: true,
          category: true,
          mimeType: true,
          title: true,
        },
      });

      const idDocument = documents.find((document) => document.id === documentId);
      if (
        !idDocument ||
        idDocument.type !== 'OTHER' ||
        idDocument.category !== 'LEGAL' ||
        !['application/pdf', 'image/jpeg', 'image/png'].includes(idDocument.mimeType)
      ) {
        return jsonError('Invalid identity document upload', 400);
      }

      if (selfieDocumentId) {
        const selfieDocument = documents.find((document) => document.id === selfieDocumentId);
        if (
          !selfieDocument ||
          selfieDocument.type !== 'OTHER' ||
          selfieDocument.category !== 'LEGAL' ||
          !['image/jpeg', 'image/png'].includes(selfieDocument.mimeType)
        ) {
          return jsonError('Invalid selfie upload', 400);
        }
      }

      // Store only private document IDs and non-sensitive metadata in the user
      // row. The encrypted file remains in the medical-documents bucket.
      const docRef = JSON.stringify({
        documentId,
        selfieDocumentId,
        type: body.idDocumentType,
        name: sanitizeText(body.idDocumentName || '', 200) || 'id_document',
        uploadedAt: new Date().toISOString(),
      });

      await db.user.update({
        where: { id: session.id },
        data: {
          idDocumentUploaded: true,
          idDocumentRef: docRef,
          verificationLevel: 'pending_review',
        },
      });

      await logAudit(session.id, 'user.verify.id_uploaded', 'type=' + body.idDocumentType);
      return jsonOk({ message: 'Document uploaded. Pending admin review.', verificationLevel: 'pending_review' });
    }

    return jsonError('Unknown action', 400);
  } catch (error) {
    logger.phiSafeError(error, 'users.verify.patch');
    return jsonError('Verification update failed', 500);
  }
}
