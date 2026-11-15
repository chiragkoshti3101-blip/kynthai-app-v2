// @ts-nocheck
// src/lib/emergency.ts
// Emergency/SOS functionality for Kynthai health app
// Safety-critical: handles emergency alert creation and notification
// All functions require authentication

import { supabase } from './supabase/client';
import { logAudit } from './auth';

// Type definitions for tables not in Supabase generated types
interface EmergencyAlertRow {
  id: string;
  family_id: string;
  family_member_id: string;
  reporter_id: string;
  type: string;
  tier: string;
  location: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

interface FamilyMemberRow {
  id: string;
  family_id: string;
  user_id: string;
  name: string | null;
  role: string;
}

export type EmergencyType = 'medical' | 'fall' | 'chest_pain' | 'stroke' | 'allergic' | 'other';
export type EmergencyTier = 'low' | 'medium' | 'high' | 'critical';

export interface EmergencyAlert {
  id: string;
  family_id: string;
  family_member_id: string;
  reporter_id: string;
  type: EmergencyType;
  tier: EmergencyTier;
  location?: string | null;
  resolved: boolean;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
  notifiedDoctors: string[];
  summary: string;
}

export interface CreateEmergencyAlertResult {
  success: boolean;
  alert?: EmergencyAlert;
  notifiedDoctors?: string[];
  summary?: string;
  error?: string;
}

export async function getUserFamilyId(userId: string): Promise<{ familyId: string | null; familyMemberId: string | null }> {
  try {
    const { data: family } = await supabase
      .from('families')
      .select('id')
      .eq('owner_id', userId)
      .single();

    if (family) return { familyId: family.id, familyMemberId: null };

    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id, id')
      .eq('user_id', userId)
      .single();

    if (membership) return { familyId: membership.family_id, familyMemberId: membership.id };

    return { familyId: null, familyMemberId: null };
  } catch (error: any) {
    return { familyId: null, familyMemberId: null };
  }
}

export async function getFamilyDoctors(familyId: string): Promise<string[]> {
  try {
    const { data: doctors, error } = await supabase
      .from('family_members')
      .select('name, user_id, role')
      .eq('family_id', familyId)
      .or('role.eq.doctor,role.eq.medical,role.eq.physician');

    if (error || !doctors) return [];

    return (doctors as FamilyMemberRow[]).map(d => d.name || d.user_id || 'Doctor').filter(Boolean);
  } catch (error: any) {
    return [];
  }
}

export async function createEmergencyAlert(
  reporterId: string,
  familyId: string,
  familyMemberId: string,
  type: EmergencyType = 'medical',
  tier: EmergencyTier = 'high',
  location?: string | null
): Promise<CreateEmergencyAlertResult> {
  try {
    const { data, error } = await supabase
      .from('emergency_alerts')
      .insert({
        family_id: familyId,
        family_member_id: familyMemberId,
        reporter_id: reporterId,
        type,
        tier,
        location,
        resolved: false,
      })
      .select()
      .single();

    if (error) throw error;

    const notifiedDoctors = await getFamilyDoctors(familyId);

    const typeLabel = {
      medical: 'Medical emergency',
      fall: 'Fall detected',
      chest_pain: 'Chest pain',
      stroke: 'Possible stroke',
      allergic: 'Allergic reaction',
      other: 'Emergency',
    }[type] ?? 'Emergency';

    const tierLabel = {
      low: 'Low priority',
      medium: 'Medium priority',
      high: 'High priority',
      critical: 'Critical',
    }[tier] ?? 'High priority';

    const summary = typeLabel + ' — ' + tierLabel + '. ' + (notifiedDoctors.length > 0 ? 'Notified ' + notifiedDoctors.length + ' linked doctor(s).' : 'No linked doctors found.') + (location ? ' Location: ' + location : '');

    await logAudit(reporterId, 'emergency_alert_created', {
      resourceType: 'emergency_alert',
      resourceId: data.id,
      details: 'Emergency alert created: ' + type + ' (' + tier + ')',
    }, 'security');

    const alertRow = data as EmergencyAlertRow;
    return {
      success: true,
      alert: {
        id: alertRow.id,
        family_id: alertRow.family_id,
        family_member_id: alertRow.family_member_id,
        reporter_id: alertRow.reporter_id,
        type: alertRow.type as EmergencyType,
        tier: alertRow.tier as EmergencyTier,
        location: alertRow.location,
        resolved: alertRow.resolved,
        resolved_at: alertRow.resolved_at,
        resolved_by: alertRow.resolved_by,
        created_at: alertRow.created_at,
        notifiedDoctors,
        summary,
      },
      notifiedDoctors,
      summary,
    };
  } catch (error: any) {
    console.error('[emergency] Failed to create alert:', error);
    return { success: false, error: error.message };
  }
}

export async function getEmergencyAlerts(userId: string): Promise<EmergencyAlert[]> {
  try {
    const { data: memberships } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) return [];

    const familyIds = memberships.map(m => m.family_id);

    const { data: alerts, error } = await supabase
      .from('emergency_alerts')
      .select('*')
      .in('family_id', familyIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (alerts as EmergencyAlertRow[]).map(alertRow => ({
      id: alertRow.id,
      family_id: alertRow.family_id,
      family_member_id: alertRow.family_member_id,
      reporter_id: alertRow.reporter_id,
      type: alertRow.type as EmergencyType,
      tier: alertRow.tier as EmergencyTier,
      location: alertRow.location,
      resolved: alertRow.resolved,
      resolved_at: alertRow.resolved_at,
      resolved_by: alertRow.resolved_by,
      created_at: alertRow.created_at,
      notifiedDoctors: [],
      summary: '',
    }));
  } catch (error: any) {
    console.error('[emergency] Failed to get alerts:', error);
    return [];
  }
}

export async function resolveEmergencyAlert(
  alertId: string,
  resolvedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('emergency_alerts')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
      })
      .eq('id', alertId);

    if (error) throw error;

    await logAudit(resolvedBy, 'emergency_alert_resolved', {
      resourceType: 'emergency_alert',
      resourceId: alertId,
    }, 'security');

    return { success: true };
  } catch (error: any) {
    console.error('[emergency] Failed to resolve alert:', error);
    return { success: false, error: error.message };
  }
}

export async function triggerSOS(
  userId: string,
  type: EmergencyType = 'medical',
  location?: string
): Promise<{ success: boolean; alertId?: string; notifiedDoctors?: string[]; summary?: string; error?: string }> {
  try {
    const { familyId, familyMemberId } = await getUserFamilyId(userId);

    if (!familyId || !familyMemberId) {
      return { success: false, error: 'No family membership found' };
    }

    const result = await createEmergencyAlert(userId, familyId, familyMemberId, type, 'high', location);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      alertId: result.alert?.id,
      notifiedDoctors: result.notifiedDoctors,
      summary: result.summary,
    };
  } catch (error: any) {
    console.error('[emergency] Failed to trigger SOS:', error);
    return { success: false, error: error.message };
  }
}

export async function checkEmergencyStatus(userId: string): Promise<{
  hasPendingAlert: boolean;
  alertType?: EmergencyType;
}> {
  try {
    const { familyId } = await getUserFamilyId(userId);

    if (!familyId) {
      return { hasPendingAlert: false };
    }

    const { data, error } = await supabase
      .from('emergency_alerts')
      .select('type, resolved')
      .eq('family_id', familyId)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const hasPending = data && data.length > 0;
    return {
      hasPendingAlert: hasPending,
      alertType: hasPending ? (data[0] as { type: string }).type as EmergencyType : undefined,
    };
  } catch (error: any) {
    console.error('[emergency] Failed to check status:', error);
    return { hasPendingAlert: false };
  }
}