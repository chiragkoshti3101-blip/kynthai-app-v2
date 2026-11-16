// src/app/api/documents/[id]/download/route.ts
// Download medical document with decryption

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptFileLegacy as decryptFile } from '@/lib/encryption';
import { downloadMedicalDocument } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { requireAuth, jsonError } from '@/lib/api-helpers';
import { canAccessDocument } from '@/lib/auth';

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

    // Check access permissions through the shared policy used by all callers.
    const hasAccess = await canAccessDocument(
      { id: u.id, email: u.email, role: u.role, name: u.name ?? undefined },
      document,
    );
    if (!hasAccess) {
      return jsonError('Forbidden', 403);
    }

    // Objects are encrypted before storage. A signed URL returns ciphertext,
    // not a usable document; decrypt only after the access policy succeeds.
    const { data: encryptedData, error: downloadError } = await downloadMedicalDocument(document.storagePath);
    if (downloadError || !encryptedData) {
      return jsonError('File not found', 404);
    }

    // Parse encryption metadata from base64 string
    // Format: iv:salt:authTag (all base64)
    const encryptionKey = document.encryptionKey || '';
    const [ivB64, saltB64, tagB64] = encryptionKey.split(':');
    if (document.encrypted && (!ivB64 || !saltB64 || !tagB64)) return jsonError('Document encryption metadata is invalid', 500);
    const iv = Buffer.from(ivB64 || '', 'base64');
    const salt = Buffer.from(saltB64 || '', 'base64');
    const authTag = Buffer.from(tagB64 || '', 'base64');

    // Decrypt file using legacy API (takes 4 separate args)
    const decryptedData = document.encrypted ? decryptFile(encryptedData, iv, salt, authTag) : encryptedData;

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
    // header  CR/LF/quote injection via a hostile document title could allow
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