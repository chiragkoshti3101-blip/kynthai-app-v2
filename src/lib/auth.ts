// src/lib/auth.ts
// Authentication helpers for API routes

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from './storage';
import { db } from './db';
import { recordAuditSync } from './audit-logger';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name?: string;
}

/**
 * Get authenticated user from request cookies
 * Returns null if not authenticated
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();

    // ── 1. Try Supabase auth first ──────────────────────────────────────
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {
                // Server component context
              }
            },
          },
        }
      );

      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user) {
        // Get user profile for role
        const { data: profile } = await supabaseAdmin()
          .from('users')
          .select('id, email, role, name')
          .eq('id', user.id)
          .single();

        const p = profile as any;
        if (p) {
          return {
            id: p.id,
            email: p.email,
            role: p.role,
            name: p.name || undefined,
          };
        }
      }
    } catch {
      // Supabase unavailable — fall through to local session
    }

    // ── 2. Fallback: local HMAC session cookie ──────────────────────────
    const { verifySessionToken } = await import('./session-signing');
    const localSessionCookie = cookieStore.get('kynthai-session');
    if (localSessionCookie?.value) {
      const userId = await verifySessionToken(localSessionCookie.value);
      // Revocation check (Node runtime — see lib/api-helpers.ts requireAuth):
      // unexpired revoked_sessions rows invalidate the fallback session.
      let active = userId;
      if (userId) {
        try {
          const revoked = await db.revokedSession.findFirst({
            where: { userId, expiresAt: { gt: new Date() } },
            orderBy: { revokedAt: 'desc' },
            take: 1,
          });
          if (revoked) active = null;
        } catch (err) {
          // A database failure must not turn a signed but revoked session into
          // an authenticated session. Deny access until revocation state is
          // available again.
          console.error('[auth] Revocation check failed (failing closed):', err);
          active = null;
        }
      }
      if (active) {
        const user = await db.user.findUnique({
          where: { id: active },
          select: { id: true, email: true, role: true, name: true },
        });
        if (user) {
          return {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name || undefined,
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get authenticated user - throws if not authenticated
 * For use in server components
 */
export async function requireSessionUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

/**
 * Alias for getAuthUser - for backward compatibility
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  return getAuthUser();
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

/**
 * Log audit event
 * Supports both old signature (userId, action) and new object format
 */
export async function logAudit(
  userIdOrData: string | Record<string, any>,
  action?: string,
  extra?: string | Record<string, any>,
  category?: string,
  details?: string
): Promise<void> {
  // Support old signature: logAudit(userId, action, category, details)
  // And: logAudit(userId, action, extraObject, category, details)
  if (typeof userIdOrData === 'string' && action) {
    try {
      let cat = category;
      let det = details;
      let resourceType: string | undefined;
      
      // If third argument is an object, extract resourceType
      if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        resourceType = extra.resourceType;
      } else if (extra && typeof extra === 'string') {
        // Old signature: userId, action, category, details
        if (!category) cat = extra;
      }
      
      try {
        await db.auditLog.create({
          data: {
            userId: userIdOrData,
            action,
            category: cat || 'access',
            resourceType,
            details: det || `Performed ${action}`,
            outcome: 'success',
          },
        });
      } catch (error) {
        console.error('Audit log failed:', error);
      }
    } catch (error) {
      console.error('Audit log failed:', error);
    }
    return;
  }

  // New object format
  const data = userIdOrData as {
    userId?: string;
    action: string;
    category: string;
    resourceType?: string;
    resourceId?: string;
    httpMethod?: string;
    httpPath?: string;
    statusCode?: number;
    outcome: 'success' | 'failure' | 'forbidden' | 'error';
    riskScore?: number;
    details?: string;
    metadata?: Record<string, any>;
    ip?: string;
    userAgent?: string;
  };

  try {
    await db.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        category: data.category,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        httpMethod: data.httpMethod,
        httpPath: data.httpPath,
        statusCode: data.statusCode,
        outcome: data.outcome,
        riskScore: data.riskScore || 0,
        details: data.details,
        metadata: data.metadata ? JSON.stringify(data.metadata) : '{}',
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}

/**
 * Check if user has required role
 */
export function hasRole(user: AuthUser, roles: string[]): boolean {
  return roles.includes(user.role);
}

/**
 * Check if user can access document
 */
export async function canAccessDocument(
  user: AuthUser,
  document: {
    id: string;
    userId: string;
    uploadedById: string;
    familyId: string | null;
    category: string;
    visibility: string;
    sharedWith: string[];
  }
): Promise<boolean> {
  // Owner can always access their own document.
  if (user.id === document.userId) return true;

  // Uploader can access the document they uploaded.
  if (user.id === document.uploadedById) return true;

  // Explicit sharing is a direct patient/provider grant. It is checked before
  // role-specific defaults so a patient can share a document with a named
  // clinician even when there is no appointment link yet.
  if (document.sharedWith.includes(user.id)) return true;

  // Doctor access requires all three safeguards: verified clinician, active
  // patient clinical-data consent, and a real treatment relationship. Keep the
  // category check separate from visibility; comparing the wrong fields was
  // the reason legitimate chart documents could be listed but not opened.
  if (
    user.role === 'doctor' &&
    document.visibility === 'DOCTOR' &&
    ['CLINICAL', 'ADMINISTRATIVE'].includes(document.category)
  ) {
    const profile = await db.doctorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, verified: true },
    });
    if (!profile?.verified) return false;

    const [patient, appointment, prescription] = await Promise.all([
      db.user.findUnique({
        where: { id: document.userId },
        select: { consentAccepted: true, dataProcessingConsent: true },
      }),
      db.appointment.findFirst({
        where: {
          doctorId: profile.id,
          patientId: document.userId,
          status: { in: ['pending', 'confirmed', 'rescheduled', 'completed'] },
          deletedAt: null,
        },
        select: { id: true },
      }),
      db.prescription.findFirst({
        where: { doctorId: profile.id, patientId: document.userId },
        select: { id: true },
      }),
    ]);

    return Boolean(
      patient?.consentAccepted &&
      patient.dataProcessingConsent &&
      (appointment || prescription),
    );
  }

  // Family access is limited to accepted membership in the document's family.
  if (document.familyId && document.visibility === 'FAMILY') {
    const membership = await db.familyMember.findFirst({
      where: { familyId: document.familyId, userId: user.id, inviteStatus: 'accepted' },
      select: { id: true },
    });
    if (membership) return true;
  }

  // Emergency access is a verified-doctor break-glass path. The durable audit
  // record is mandatory; if it cannot be written, deny the document.
  if (document.visibility === 'EMERGENCY' && user.role === 'doctor') {
    const profile = await db.doctorProfile.findUnique({
      where: { userId: user.id },
      select: { verified: true },
    });
    if (!profile?.verified) return false;

    const auditResult = await recordAuditSync(user.id, 'document.break_glass.read', {
      category: 'security',
      resourceType: 'MedicalDocument',
      resourceId: document.id,
      outcome: 'success',
      metadata: { visibility: 'EMERGENCY' },
    });
    if (!auditResult.ok) return false;
    return true;
  }

  return false;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}
