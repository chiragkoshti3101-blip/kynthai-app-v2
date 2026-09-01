// src/app/api/documents/list/route.ts
// List user's medical documents

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, jsonError, jsonOk } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user!;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const familyId = searchParams.get('familyId');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const skip = (page - 1) * limit;

  const where: any = familyId
    ? { familyId, visibility: 'FAMILY' }
    : { userId: u.id };

  if (type) {
    where.type = type;
  }

  if (familyId) {
    // Verify family membership
    const [membership, family] = await Promise.all([
      db.familyMember.findFirst({
        where: { familyId, userId: u.id, inviteStatus: 'accepted' },
      }),
      db.family.findUnique({ where: { id: familyId }, select: { ownerId: true } }),
    ]);
    if (!membership && family?.ownerId !== u.id) {
      return jsonError('Not a family member', 403);
    }
  }

  const [documents, total] = await Promise.all([
    db.medicalDocument.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        type: true,
        category: true,
        title: true,
        description: true,
        mimeType: true,
        fileSize: true,
        visibility: true,
        uploadedAt: true,
        accessedAt: true,
        downloadedAt: true,
      },
    }),
    db.medicalDocument.count({ where }),
  ]);

  return jsonOk({
    documents,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}