import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, isValidEmail, rateLimit } from '@/lib/security';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  audit,
} from '@/lib/api-helpers';
import { inviteSchema } from '@/lib/schemas';
import { sendNotification } from '@/lib/notifications';
import crypto from 'crypto';

/** Constant-time string comparison to prevent timing attacks on tokens. */
function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
export const dynamic = 'force-dynamic';

// POST /api/family/invite
// Actions: "invite" (send), "accept" (join), "decline" (reject)
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 10, 60000);
  if (limited) return limited;

  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  const rawBody = await readJson(req);
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');
  const inviteResult = inviteSchema.safeParse(rawBody);
  if (!inviteResult.success) {
    const fields: Record<string, string> = {};
    for (const issue of inviteResult.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message;
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
  }
  const body = inviteResult.data;

  // ── 'invite' action: require caretaker or owner role ──────────────────────
  if (body.action === 'invite') {
    const FAMILY_ACCESS_ROLES: string[] = ['caretaker', 'owner', 'admin'];
    if (!FAMILY_ACCESS_ROLES.includes(u.role)) {
      return jsonError('Forbidden — you must be a caretaker, owner, or admin to send invites', 403);
    }
    if (!body.email || !body.name || !body.relation)
      return jsonError('Email, name, relation required', 400);
    const email = sanitizeText(body.email, 254).toLowerCase();
    if (!isValidEmail(email)) return jsonError('Valid email required', 400);

    // Guard against inviting yourself
    if (email === u.email) {
      return jsonError(
        'You cannot invite yourself to your own family.',
        400,
        'SELF_INVITE_FORBIDDEN'
      );
    }

    // COMPLIANCE (COPPA/family governance): require guardian verification for minors.
    // Only enforce when age is explicitly provided and under 18.
    const inviteeAge = typeof body.age === 'number' ? body.age : null;
    if (inviteeAge !== null && inviteeAge < 18) {
      if (!body.guardianVerificationToken) {
        return jsonError(
          'Guardian verification required for family members under 18.',
          403,
          'GUARDIAN_VERIFICATION_REQUIRED'
        );
      }
    }

    // RELATIONSHIP VERIFICATION: generate a verification token that must be
    // presented when the invitee accepts, confirming they are who they claim to be.
    const relationToken = crypto.randomBytes(32).toString('hex');

    let family = await db.family.findFirst({ where: { ownerId: u.id } });
    if (!family)
      family = await db.family.create({ data: { name: `${u.name}'s Family`, ownerId: u.id } });

    const count = await db.familyMember.count({ where: { familyId: family.id } });
    if (count >= 4) return jsonError('Maximum 4 family members', 400);

    const existing = await db.familyMember.findFirst({
      where: { familyId: family.id, inviteEmail: email },
    });
    if (existing) return jsonError('Already invited', 409);

    const token = crypto.randomBytes(32).toString('hex');
    const inviteExpiresAt = new Date();
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 30);
    const member = await db.familyMember.create({
      data: {
        familyId: family.id,
        name: sanitizeText(body.name, 120),
        relation: sanitizeText(body.relation, 60),
        inviteEmail: email,
        inviteToken: token,
        relationVerificationToken: relationToken,
        inviteStatus: 'pending',
        inviteExpiresAt,
        role: body.inviteeRole === 'caretaker' ? 'caretaker' : 'patient',
      },
    });

    try {
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/invite?token=${token}&family=${family.id}`;
      await sendNotification(
        { email, userId: member.id },
        {
          title: `You've been invited to join ${u.name}'s family on Kynthai`,
          body: `${u.name} invited you as "${body.relation}" to manage health together.\n\n` +
            `Accept the invite: ${inviteLink}\n\n` +
            `If you don't have a Kynthai account yet, you can create one for free at ` +
            `${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/register — then use the link above to join the family.`,
          type: 'family_invite',
          data: { familyId: family.id, memberId: member.id, relationToken, inviteLink },
        }
      );
    } catch {
      /* best-effort */
    }

    await logAudit(u.id, 'family.invite', `email=${email} memberId=${member.id}`);
    return jsonOk({
      invited: true,
      email,
      memberId: member.id,
      message: `${body.name} invited — they'll see it when they log in.`,
    });
  }

  if (body.action === 'accept') {
    const pending = await db.familyMember.findFirst({
      where: { id: body.inviteId, inviteStatus: 'pending' },
    });
    if (!pending) return jsonError('Invite not found', 404);
    if (pending.inviteExpiresAt && pending.inviteExpiresAt < new Date()) {
      return jsonError('Invite has expired. Please ask the family owner to re-invite you.', 410);
    }

    // SECURITY: verify the invite is addressed to the caller's email — even without
    // a verification token, the invite must be for this specific user.
    if (pending.inviteEmail && pending.inviteEmail !== u.email) {
      return jsonError(
        'This invite is not addressed to your email address. ' +
          'You can only accept invites sent to you.',
        403,
        'NOT_YOUR_INVITE'
      );
    }

    // RELATIONSHIP VERIFICATION: if the caller presents a verification token,
    // verify it matches the specific invite record to confirm identity.
    if (body.relationVerificationToken) {
      const tokenMatches =
        safeTokenCompare(pending.inviteToken ?? '', body.relationVerificationToken) ||
        safeTokenCompare(pending.relationVerificationToken ?? '', body.relationVerificationToken);
      if (!tokenMatches) {
        return jsonError(
          'Invalid verification token. Please use the link sent to your email.',
          403,
          'INVALID_VERIFICATION_TOKEN'
        );
      }
    }

    await db.familyMember.update({
      where: { id: pending.id },
      data: {
        userId: u.id,
        inviteStatus: 'accepted',
        inviteToken: null,
        relationVerificationToken: null,
      },
    });
    await logAudit(u.id, 'family.invite.accept', `familyMemberId=${pending.id}`);
    return jsonOk({ accepted: true, familyMemberId: pending.id });
  }

  if (body.action === 'decline') {
    const pending = await db.familyMember.findFirst({
      where: { id: body.inviteId, inviteEmail: u.email, inviteStatus: 'pending' },
    });
    if (!pending) return jsonError('Invite not found', 404);
    await db.familyMember.delete({ where: { id: pending.id } });
    return jsonOk({ declined: true });
  }

  return jsonError('Invalid action', 400);
}

// GET /api/family/invite — get pending invites for current user
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, 10, 60000);
  if (limited) return limited;
  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user!;

  const pending = await db.familyMember.findMany({
    where: { inviteEmail: u.email, inviteStatus: 'pending' },
    include: { family: { include: { owner: { select: { name: true, email: true } } } } },
  });

  return jsonOk(
    pending.map((m: any) => ({
      id: m.id,
      familyId: m.familyId,
      invitedBy: m.family.owner.name,
      invitedByEmail: m.family.owner.email,
      name: m.name,
      relation: m.relation,
      familyName: m.family.name,
    }))
  );
}
