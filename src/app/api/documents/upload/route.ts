// src/app/api/documents/upload/route.ts
// Upload medical document with encryption

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkCsrf } from '@/lib/csrf';
import { rateLimit, sanitizeText } from '@/lib/security';
import { encryptFile, generateFileId, sanitizeFilename } from '@/lib/encryption';
import { uploadMedicalDocument } from '@/lib/storage';
import { DocumentType, DocumentCategory, DocumentVisibility } from '@prisma/client';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/dicom',
  'application/zip',
  'text/plain',
];

export async function POST(req: NextRequest) {
  try {
    // SECURITY: uploads are state-changing and store sensitive health data —
    // enforce CSRF (double-submit token) + per-IP rate limiting before anything else.
    const csrfErr = await checkCsrf(req);
    if (csrfErr) return csrfErr;
    const limited = rateLimit(req, 20, 60000);
    if (limited) return limited;

    const user = await requireAuth();

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as unknown as DocumentType;
    const category = (formData.get('category') as unknown as DocumentCategory) || 'CLINICAL';
    const title = formData.get('title') as string;
    const description = formData.get('description') as string || '';
    const visibility = (formData.get('visibility') as unknown as DocumentVisibility) || 'PRIVATE';
    const familyId = formData.get('familyId') as string || null;
    const providerRole = formData.get('providerRole') as string | null;
    const providerSlot = formData.get('providerSlot') as string | null;

    // SECURITY: sharedWith is a JSON array of user IDs — validate strictly.
    // Never trust client JSON blindly (malformed payloads would 500; oversized
    // arrays would bloat the row).
    let sharedWith: string[] = [];
    const sharedWithRaw = formData.get('sharedWith');
    if (sharedWithRaw) {
      try {
        const parsed = JSON.parse(sharedWithRaw as string);
        if (!Array.isArray(parsed)) {
          return NextResponse.json({ error: 'sharedWith must be an array' }, { status: 400 });
        }
        sharedWith = parsed.filter((x): x is string => typeof x === 'string').slice(0, 50);
      } catch {
        return NextResponse.json({ error: 'sharedWith must be valid JSON' }, { status: 400 });
      }
    }

    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }
    if (!type || !Object.values(DocumentType).includes(type)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }
    if (type === 'CERTIFICATE') {
      const validSlots = providerRole === 'doctor'
        ? ['license', 'degree', 'id', 'photo']
        : providerRole === 'lab'
          ? ['license', 'clia', 'business_insurance', 'photo']
          : [];
      if (!validSlots.includes(providerSlot || '')) {
        return NextResponse.json({ error: 'Provider role and certification slot are required' }, { status: 400 });
      }
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
        return NextResponse.json({ error: 'Certification files must be PDF, JPEG, or PNG' }, { status: 400 });
      }
      if (category !== 'ADMINISTRATIVE' || visibility !== 'PRIVATE' || file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Certification uploads must be private administrative files no larger than 5 MB' }, { status: 400 });
      }
    }
    if (!Object.values(DocumentCategory).includes(category)) {
      return NextResponse.json({ error: 'Invalid document category' }, { status: 400 });
    }
    if (!Object.values(DocumentVisibility).includes(visibility)) {
      return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
    }

    // SECURITY: verify magic bytes match the declared MIME type to prevent
    // content-type spoofing (e.g., an HTML/script file disguised as a PDF).
    const head8 = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const head132 = new Uint8Array(await file.slice(0, 132).arrayBuffer());
    const isPdf = head8[0] === 0x25 && head8[1] === 0x50 && head8[2] === 0x44 && head8[3] === 0x46;
    const isJpeg = head8[0] === 0xff && head8[1] === 0xd8;
    const isPng = head8[0] === 0x89 && head8[1] === 0x50 && head8[2] === 0x4e && head8[3] === 0x47;
    const isTiff =
      (head8[0] === 0x49 && head8[1] === 0x49 && head8[2] === 0x2a && head8[3] === 0x00) ||
      (head8[0] === 0x4d && head8[1] === 0x4d && head8[2] === 0x00 && head8[3] === 0x2a);
    const isDicom =
      head132[128] === 0x44 && head132[129] === 0x49 && head132[130] === 0x43 && head132[131] === 0x4d;
    const isZip = head8[0] === 0x50 && head8[1] === 0x4b && head8[2] === 0x03 && head8[3] === 0x04;
    const mimeMatchesContent =
      (file.type === 'application/pdf' && isPdf) ||
      (file.type === 'image/jpeg' && isJpeg) ||
      (file.type === 'image/png' && isPng) ||
      (file.type === 'image/tiff' && isTiff) ||
      (file.type === 'application/dicom' && isDicom) ||
      (file.type === 'application/zip' && isZip) ||
      file.type === 'text/plain'; // plain text has no reliable magic bytes
    if (!mimeMatchesContent) {
      return NextResponse.json(
        { error: 'File content does not match the declared file type' },
        { status: 400 }
      );
    }

    // Verify family membership or ownership if familyId is provided.
    // Owners may not have a FamilyMember row, but must still be able to
    // publish a FAMILY-visible document for their own family.
    if (familyId) {
      const [membership, family] = await Promise.all([
        db.familyMember.findFirst({
          where: { familyId, userId: user.id, inviteStatus: 'accepted' },
        }),
        db.family.findUnique({ where: { id: familyId }, select: { ownerId: true } }),
      ]);
      if (!membership && family?.ownerId !== user.id) {
        return NextResponse.json({ error: 'Not a member of this family' }, { status: 403 });
      }
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Encrypt file
    const { encryptedData, iv, salt, authTag } = encryptFile(fileBuffer);

    // Generate file ID and path
    const fileId = generateFileId();
    const fileExt = sanitizeFilename(file.name.split('.').pop() || 'bin');

    // Upload to Supabase Storage
    const { path: storagePath, error: uploadError } = await uploadMedicalDocument(
      user.id,
      type.toLowerCase(),
      fileId,
      fileExt,
      encryptedData,
      {
        mimeType: file.type,
        uploadedBy: user.id,
      }
    );

    if (uploadError) {
      return NextResponse.json({ error: 'Upload failed: ' + uploadError }, { status: 500 });
    }

    // Store encryption metadata (iv:salt:authTag as base64)
    const encryptionKey = `${iv.toString('base64')}:${salt.toString('base64')}:${authTag.toString('base64')}`;

    // Create database record
    const document = await db.medicalDocument.create({
      data: {
        userId: user.id,
        uploadedById: user.id,
        familyId,
        type,
        category,
        title:
          type === 'CERTIFICATE'
            ? `${providerRole} certification — ${providerSlot}`
            : sanitizeText(title || file.name, 200) || file.name,
        description:
          type === 'CERTIFICATE'
            ? JSON.stringify({ provider: providerRole, slot: providerSlot })
            : description,
        mimeType: file.type,
        fileSize: file.size,
        storagePath,
        bucket: 'medical-documents',
        encrypted: true,
        encryptionKey,
        visibility,
        sharedWith,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'document.upload',
        category: 'modification',
        resourceType: 'MedicalDocument',
        resourceId: document.id,
        httpMethod: 'POST',
        httpPath: '/api/documents/upload',
        statusCode: 200,
        outcome: 'success',
        details: `Uploaded ${type}: ${title || file.name}`,
        metadata: JSON.stringify({ fileSize: file.size, mimeType: file.type }),
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        type: document.type,
        fileSize: document.fileSize,
        uploadedAt: document.uploadedAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.phiSafeError(error, 'documents.upload');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
