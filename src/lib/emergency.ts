// src/lib/emergency.ts
// Emergency/SOS functionality for Kynthai health app
// Safety-critical: handles emergency alert creation and notification
// All functions require authentication

import { supabase } from './supabase';
import { logAudit } from './auth';

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
}

/**
 * Get the current user's family ID from families or family_members tables
 */
export async function getUserFamilyId(userId: string): Promise<{ familyId: string | null; familyMemberId: string | null }> {
  try {
    // Check if user is a family owner
    const { data: family } = await supabase
      .from('families')
      .select('id')
      .eq('owner_id', userId)
      .single();

    if (family) return { familyId: family.id, familyMemberId: null };

    // Check if user is a family member
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id, id')
      .eq('user_id', userId)
      .single();

    if (membership) return { familyId: membership.family_id, familyMemberId: membership.id };

    return { familyId: null, familyMemberId: null };
  } catch (error: any) {
    console.error('[emergency] Failed to get family ID:', error);
    return { familyId: null, familyMemberId: null };
  }
}

/**
 * Create an emergency alert when SOS is triggered
 */
export async function createEmergencyAlert(
  reporterId: string,
  familyId: string,
  familyMemberId: string,
  type: EmergencyType = 'medical',
  tier: EmergencyTier = 'high',
  location?: string | null
): Promise<{ success: boolean; alert?: EmergencyAlert; error?: string }> {
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

    // Log audit
    await logAudit(reporterId, 'emergency_alert_created', {
      resourceType: 'emergency_alert',
      resourceId: data.id,
      details: 'Emergency alert created: ' + type + ' (' + tier + ')',
    }, 'security');

    return { success: true, alert: data as EmergencyAlert };
  } catch (error: any) {
    console.error('[emergency] Failed to create alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get emergency alerts for a user's family
 */
export async function getEmergencyAlerts(userId: string): Promise<EmergencyAlert[]> {
  try {
    // Get user's family memberships
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

    return (alerts || []) as EmergencyAlert[];
  } catch (error: any) {
    console.error('[emergency] Failed to get alerts:', error);
    return [];
  }
}

/**
 * Resolve an emergency alert
 */
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
