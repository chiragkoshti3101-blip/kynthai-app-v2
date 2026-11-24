import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ lrange: vi.fn(), lpush: vi.fn(), ltrim: vi.fn(), expire: vi.fn(), del: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: class { lrange = m.lrange; lpush = m.lpush; ltrim = m.ltrim; expire = m.expire; del = m.del; } }));
import { signalingStore } from '../webrtc-store';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://unit.test'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test'); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it('accepts automatically deserialized and string Redis messages, preserving cursor ordering', async () => {
  const first = { id: 'new', appointmentId: 'a', type: 'offer', createdAt: Date.now() };
  const old = { ...first, id: 'old' };
  m.lrange.mockResolvedValue([first, JSON.stringify(old)]);
  expect(await signalingStore.list('a')).toEqual([first, old]);
  expect(await signalingStore.list('a', 'old')).toEqual([first]);
});
it('sets bounds and expiry on Redis writes', async () => {
  await signalingStore.push({ appointmentId: 'a', type: 'offer', createdAt: Date.now() });
  expect(m.ltrim).toHaveBeenCalledWith('webrtc:room:a', 0, 199);
  expect(m.expire).toHaveBeenCalledWith('webrtc:room:a', 7200);
});
it('expires development fallback messages and never uses local storage in production', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', ''); vi.stubEnv('NODE_ENV', 'development');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  await signalingStore.push({ appointmentId: 'ttl', type: 'offer', createdAt: Date.now() });
  expect(await signalingStore.list('ttl')).toHaveLength(1);
  vi.advanceTimersByTime(7200001);
  expect(await signalingStore.list('ttl')).toEqual([]);
  vi.stubEnv('NODE_ENV', 'production');
  await expect(signalingStore.list('ttl')).rejects.toThrow('requires Redis');
});
