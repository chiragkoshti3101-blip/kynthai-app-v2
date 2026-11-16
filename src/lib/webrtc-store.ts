/**
 * WebRTC Signaling Store — Redis-backed (Upstash) for multi-instance deployments.
 *
 * Falls back to in-memory Map when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * are not configured (single-instance dev only).
 *
 * Message order: newest-first (LPUSH), capped at MAX_PER_ROOM per appointment room.
 */

import { Redis } from '@upstash/redis';

const MAX_PER_ROOM = 200;
const ROOM_TTL = 60 * 60 * 2; // 2 hours

interface SignalingMessage {
  id?: string;
  appointmentId: string;
  type: string;
  role?: string;
  userId?: string;
  userName?: string;
  from?: string;
  to?: string;
  payload?: any;
  timestamp?: number;
  createdAt: number;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') throw new Error('Distributed signaling requires Redis in production');
    return null;
  }
  return new Redis({ url, token });
}

const fallbackStore = new Map<string, SignalingMessage[]>();

export const signalingStore = {
  /**
   * Store a signaling message in a room.
   */
  async push(message: SignalingMessage): Promise<void> {
    const apptId = message.appointmentId;
    if (!apptId) throw new Error('SignalingMessage must have appointmentId');

    const redis = getRedis();
    const key = `webrtc:room:${apptId}`;
    const serialized = JSON.stringify({ ...message, createdAt: message.createdAt || Date.now() });

    if (redis) {
      await redis.lpush(key, serialized);
      await redis.ltrim(key, 0, MAX_PER_ROOM - 1);
      await redis.expire(key, ROOM_TTL);
    } else {
      const arr = fallbackStore.get(key) || [];
      arr.unshift({ ...message, createdAt: message.createdAt || Date.now() });
      if (arr.length > MAX_PER_ROOM) arr.length = MAX_PER_ROOM;
      fallbackStore.set(key, arr);
    }
  },

  /**
   * Get all messages in a room (newest first).
   * @param afterId Optional message type to filter after (for polling)
   */
  async list(appointmentId: string, afterId?: string): Promise<SignalingMessage[]> {
    const redis = getRedis();
    const key = `webrtc:room:${appointmentId}`;

    if (redis) {
      const raw = await redis.lrange(key, 0, MAX_PER_ROOM - 1);
      const messages = raw.map((r: unknown) => (typeof r === 'string' ? JSON.parse(r) : r) as SignalingMessage);

      if (afterId) {
        const idx = messages.findIndex(m => m.id === afterId || m.type === afterId);
        return idx >= 0 ? messages.slice(0, idx) : messages;
      }
      return messages;
    }

    const messages = (fallbackStore.get(key) || []).filter(m => m.createdAt > Date.now() - ROOM_TTL * 1000);
    if (messages.length) fallbackStore.set(key, messages); else fallbackStore.delete(key);
    if (afterId) {
      const idx = messages.findIndex(m => m.id === afterId || m.type === afterId);
      return idx >= 0 ? messages.slice(0, idx) : messages;
    }
    return messages;
  },

  /**
   * Clear all messages for a room.
   */
  async removeRoom(appointmentId: string): Promise<void> {
    const redis = getRedis();
    const key = `webrtc:room:${appointmentId}`;

    if (redis) {
      await redis.del(key);
    } else {
      fallbackStore.delete(key);
    }
  },

  /**
   * Get active room count (for monitoring).
   */
  async getActiveRoomCount(): Promise<number> {
    const redis = getRedis();
    if (redis) {
      const keys = await redis.keys('webrtc:room:*');
      return keys.length;
    }
    return fallbackStore.size;
  },
};
