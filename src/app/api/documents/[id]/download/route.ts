// src/app/api/documents/[id]/download/route.ts
// Download medical document with decryption

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptFile } from '@/lib/encryption';
import { downloadMedicalDocument, getSignedDocumentUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { requireAuth, jsonError } from '@/lib/api-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user!;

  try {
    const { id } = await params;

    // Get document from database
    const document = await db.medicalDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return jsonError('Document not found', 404);
    }

    // Check access permissions
    const hasAccess = await checkDocumentAccess(u.id, u.role, document);
    if (!hasAccess) {
      return jsonError('Forbidden', 403);
    }

    // Option 1: Return signed URL for direct download (recommended for large files)
    const { url, error: urlError } = await getSignedDocumentUrl(document.storagePath, 3600);
    if (!urlError && url) {
      // Update access tracking
      await db.medicalDocument.update({
        where: { id },
        data: {
          accessedAt: new Date(),
          downloadedAt: new Date(),
        },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: u.id,
          action: 'document.download',
          category: 'access',
          resourceType: 'MedicalDocument',
          resourceId: id,
          httpMethod: 'GET',
          httpPath: `/api/documents/${id}/download`,
          statusCode: 200,
          outcome: 'success',
          details: `Downloaded ${document.type}: ${document.title}`,
        },
      });

      return NextResponse.redirect(url);
    }

    // Option 2: Stream decrypted file (fallback)
    const { data: encryptedData, error: downloadError } = await downloadMedicalDocument(document.storagePath);
    if (downloadError || !encryptedData) {
      return jsonError('File not found', 404);
    }

    // Parse encryption metadata from base64 string
    // Format: iv:salt:authTag (all base64)
    const encryptionKey = document.encryptionKey || '';
    const [ivB64, saltB64, tagB64] = encryptionKey.split(':');
    const iv = Buffer.from(ivB64!, 'base64');
    const salt = Buffer.from(saltB64!, 'base64');
    const authTag = Buffer.from(tagB64!, 'base64');

    // Decrypt file
    const decryptedData = decryptFile(encryptedData, iv, salt, authTag);

    // Update access tracking
    await db.medicalDocument.update({
      where: { id },
      data: {
        accessedAt: new Date(),
        downloadedAt: new Date(),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: u.id,
        action: 'document.download',
        category: 'access',
        resourceType: 'MedicalDocument',
        resourceId: id,
        httpMethod: 'GET',
        httpPath: `/api/documents/${id}/download`,
        statusCode: 200,
        outcome: 'success',
        details: `Downloaded ${document.type}: ${document.title}`,
      },
    });

    // Return decrypted file
    // SECURITY: sanitize the title before it reaches the Content-Disposition
    // header — CR/LF/quote injection via a hostile document title could allow
    // header splitting (response splitting / log injection).
    const safeTitle = (document.title || 'document').replace(/[\r\n"\\]/g, '_').slice(0, 120);
    return new NextResponse(new Uint8Array(decryptedData), {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${safeTitle}.${document.storagePath.split('.').pop()}"`,
        'Content-Length': decryptedData.length.toString(),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error) {
    logger.phiSafeError(error, 'documents.download');
    return jsonError('Internal server error', 500);
  }
}

async function checkDocumentAccess(
  userId: string,
  userRole: string,
  document: {
    id: string;
    userId: string;
    uploadedById: string;
    familyId: string | null;
    category: string;
    visibility: string;
    sharedWith: string[];
  }
): Promise<boolean> {
  // Owner
  if (document.userId === userId) return true;

  // Uploader
  if (document.uploadedById === userId) return true;

  // Explicit sharing is a direct patient/provider grant. It is checked
  // before role-specific defaults so a patient can share a document with a
  // named clinician even when there is no appointment link yet.
  if (document.sharedWith.includes(userId)) return true;

  // Doctor access: a DOCTOR-visible clinical/administrative document is
  // available only to a verified doctor with a real care relationship and
  // active patient clinical-data consent. Previously this check compared the
  // category values against `visibility`, so legitimate chart documents could
  // be listed but not opened.
  if (
    userRole === 'doctor' &&
    document.visibility === 'DOCTOR' &&
    ['CLINICAL', 'ADMINISTRATIVE'].includes(document.category)
  ) {
    const profile = await db.doctorProfile.findUnique({
      where: { userId },
      select: { id: true, verified: true },
    });
    if (profile?.verified) {
      const [patient, apt, rx] = await Promise.all([
        db.user.findUnique({
          where: { id: document.userId },
          select: { consentAccepted: true, dataProcessingConsent: true },
        }),
        db.appointment.findFirst({
          where: { doctorId: profile.id, patientId: document.userId, deletedAt: null },
          select: { id: true },
        }),
        db.prescription.findFirst({
          where: { doctorId: profile.id, patientId: document.userId },
          select: { id: true },
        }),
      ]);
      if (patient?.consentAccepted && patient.dataProcessingConsent && (apt || rx)) return true;
    }
    // No consent, verified care relationship, or valid document visibility.
    return false;
  }

  // Family access
  if (document.familyId && document.visibility === 'FAMILY') {
    const membership = await db.familyMember.findFirst({
      where: { familyId: document.familyId, userId, inviteStatus: 'accepted' },
    });
    if (membership) return true;
  }

  // Emergency access is a break-glass path for verified doctors only.
  if (document.visibility === 'EMERGENCY' && userRole === 'doctor') {
    const profile = await db.doctorProfile.findUnique({
      where: { userId },
      select: { verified: true },
    });
    if (!profile?.verified) return false;
    logger.warn(`EMERGENCY ACCESS: ${userId} accessed document ${document.id}`);
    return true;
  }

  return false;
}