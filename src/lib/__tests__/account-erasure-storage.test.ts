import { describe, expect, it, vi, beforeEach } from 'vitest';
import { eraseUserScopedData } from '../account-erasure';

vi.mock('../storage', () => ({
  deleteMedicalDocument: vi.fn().mockResolvedValue({ success: true }),
  listUserDocuments: vi.fn().mockResolvedValue({ files: ['user-1/clinical/a.pdf'], error: undefined }),
}));

vi.mock('../db', () => ({
  db: {
    medicalDocument: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    pushSubscription: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    complaint: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    consultMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    videoCallParticipant: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    videoCall: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

import { deleteMedicalDocument, listUserDocuments } from '../storage';

describe('eraseUserScopedData storage purge (PR #81)', () => {
  beforeEach(() => {
    vi.mocked(listUserDocuments).mockClear();
    vi.mocked(deleteMedicalDocument).mockClear();
  });

  it('lists and deletes orphan storage paths under the user prefix', async () => {
    const result = await eraseUserScopedData('user-1');
    expect(listUserDocuments).toHaveBeenCalledWith('user-1');
    expect(deleteMedicalDocument).toHaveBeenCalledWith('user-1/clinical/a.pdf');
    expect(result.stripeNote).toBeTruthy();
    expect(result.storageWarnings).toEqual([]);
  });
});
