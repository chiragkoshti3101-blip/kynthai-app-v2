import { db } from '@/lib/db';

export type MedicationOwnershipRow = {
  userId: string | null;
  familyMemberId: string | null;
};

export function canAccessMedication(
  med: MedicationOwnershipRow,
  userId: string,
  isFamilyCaretaker: boolean,
): boolean {
  if (med.userId === userId) return true;
  if (med.familyMemberId && isFamilyCaretaker) return true;
  return false;
}

/**
 * True when the authenticated user owns the medication directly or via family caretaker rights.
 */
export async function userOwnsMedication(
  med: MedicationOwnershipRow,
  userId: string,
): Promise<boolean> {
  if (med.userId === userId) return true;
  if (!med.familyMemberId) return false;
  const member = await db.familyMember.findFirst({
    where: { id: med.familyMemberId, family: { ownerId: userId } },
    select: { id: true },
  });
  return canAccessMedication(med, userId, !!member);
}
