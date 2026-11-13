import { db } from '@/lib/db';
import { deleteMedicalDocument, listUserDocuments } from '@/lib/storage';

export const STRIPE_ERASURE_NOTE =
  'Stripe customer records may be retained for billing compliance; cancel active subscriptions in Stripe before erasure or use Stripe customer deletion per finance policy.';

/**
 * Deletes user-scoped rows that lack full cascade and purges encrypted storage blobs.
 * Returns storage purge warnings (non-fatal) for ops follow-up.
 */
export async function eraseUserScopedData(userId: string): Promise<{
  stripeNote: string;
  storageWarnings: string[];
}> {
  const storageWarnings: string[] = [];

  const docs = await db.medicalDocument.findMany({
    where: { OR: [{ userId }, { uploadedById: userId }] },
    select: { id: true, storagePath: true },
  });
  for (const doc of docs) {
    if (doc.storagePath) {
      const r = await deleteMedicalDocument(doc.storagePath);
      if (!r.success && r.error) storageWarnings.push(`doc ${doc.id}: ${r.error}`);
    }
  }
  if (docs.length) {
    await db.medicalDocument.deleteMany({
      where: { id: { in: docs.map(d => d.id) } },
    });
  }

  const { files: storagePaths, error: listErr } = await listUserDocuments(userId);
  if (listErr) storageWarnings.push(`storage list: ${listErr}`);
  for (const path of storagePaths) {
    const r = await deleteMedicalDocument(path);
    if (!r.success && r.error) storageWarnings.push(`path ${path}: ${r.error}`);
  }

  await db.pushSubscription.deleteMany({ where: { userId } });
  await db.complaint.deleteMany({ where: { userId } });
  await db.consultMessage.deleteMany({ where: { senderId: userId } });

  await db.videoCallParticipant.deleteMany({ where: { userId } });
  await db.videoCall.deleteMany({ where: { initiatedBy: userId } });

  return { stripeNote: STRIPE_ERASURE_NOTE, storageWarnings };
}
