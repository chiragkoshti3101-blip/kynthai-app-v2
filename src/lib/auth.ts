// src/lib/auth.ts
// Authentication helpers for API routes

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from './storage';
import { db } from './db';

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
          console.error('[auth] Revocation check failed (failing open):', err);
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
    userId: string;
    uploadedById: string;
    familyId: string | null;
    visibility: string;
    sharedWith: string[];
  }
): Promise<boolean> {
  // Owner can always access
  if (user.id === document.userId) return true;

  // Uploader can access
  if (user.id === document.uploadedById) return true;

  // Doctor access: only if a real care relationship exists (appointment or
  // prescription linking this doctor to the patient). Previously any doctor
  // could read any patient's clinical documents (C2 — PHI leak).
  if (user.role === 'doctor' && ['CLINICAL', 'ADMINISTRATIVE'].includes(document.visibility)) {
    const profile = (await supabaseAdmin()
      .from('doctor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()) as unknown as { data: { id: string } | null; error: unknown };
    if (profile.data) {
      const [apt, rx] = await Promise.all([
        supabaseAdmin().from('appointments').select('id').eq('doctor_id', profile.data.id).eq('patient_id', document.userId).maybeSingle(),
        supabaseAdmin().from('prescriptions').select('id').eq('doctor_id', profile.data.id).eq('patient_id', document.userId).maybeSingle(),
      ]);
      if ((apt as { data?: unknown }).data || (rx as { data?: unknown }).data) return true;
    }
    // No care relationship → no access.
    return false;
  }

  // Family access
  if (document.familyId && document.visibility === 'FAMILY') {
    const { data: membership } = await supabaseAdmin()
      .from('family_members')
      .select('id')
      .eq('family_id', document.familyId)
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
      .single();
    if (membership) return true;
  }

  // Explicitly shared
  if (document.sharedWith.includes(user.id)) return true;

  // Emergency access (break-glass)
  if (document.visibility === 'EMERGENCY' && user.role === 'doctor') {
    // Log emergency access
    console.warn(`EMERGENCY ACCESS: ${user.id} accessed document`);
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