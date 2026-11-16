import crypto from 'crypto';

export function verifyVideoToken(
  token: string
): { uid: string; name: string; room: string; exp: number } | null {
  const secret = process.env.VIDEO_TOKEN_SECRET;
  if (!secret) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig || token.split('.').length !== 2) return null;
  try {
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const data = JSON.parse(payload);
    if (typeof data.uid !== 'string' || typeof data.name !== 'string' || typeof data.room !== 'string' || typeof data.exp !== 'number' || !Number.isFinite(data.exp) || Date.now() >= data.exp) return null;
    return data;
  } catch {
    return null;
  }
}
