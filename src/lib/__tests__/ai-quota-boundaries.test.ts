import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@prisma/client';
const m = vi.hoisted(() => ({ reserve: vi.fn() }));
vi.mock('@/lib/supabase-db', () => ({ reserveAiUsage: m.reserve }));
vi.mock('@/lib/db', () => ({ db: {}, isDatabaseConfigured: () => true }));
import { checkAiTier } from '@/lib/api-helpers';
const user = (subscriptionTier = 'free') => ({ id: 'quota-owner', subscriptionTier }) as User;
beforeEach(() => vi.resetAllMocks());
describe('shared AI quota boundaries', () => {
  it('reserves against the same user limit regardless of feature name', async () => {
    m.reserve.mockResolvedValue(true);
    expect(await checkAiTier(user(), 'chat')).toBeNull();
    expect(await checkAiTier(user(), 'symptom-analyze')).toBeNull();
    expect(m.reserve.mock.calls).toEqual([['quota-owner', 5], ['quota-owner', 5]]);
  });
  it('rejects exhausted reservations with a quota response', async () => {
    m.reserve.mockResolvedValue(false);
    const response = await checkAiTier(user(), 'chat');
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ limitReached: true, dailyLimit: 5, usedToday: 5 });
  });
  it.each(['plus', 'pro', 'family_pro'])('does not consume free quota for %s', async tier => {
    expect(await checkAiTier(user(tier), 'chat')).toBeNull();
    expect(m.reserve).not.toHaveBeenCalled();
  });
  it('treats unknown tiers as limited rather than granting paid access', async () => {
    m.reserve.mockResolvedValue(false);
    expect((await checkAiTier(user('unexpected-tier'), 'chat'))?.status).toBe(403);
  });
  it('does not allow an AI call when quota persistence fails', async () => {
    m.reserve.mockRejectedValue(new Error('database unavailable'));
    await expect(checkAiTier(user(), 'chat')).rejects.toThrow('database unavailable');
  });
});
