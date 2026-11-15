// src/lib/emergency.ts
// Server-side emergency/SOS helpers. Client-safe types live in ./emergency-client.
export * from './emergency-client';

import { supabase as _supabase } from './supabase/client';
const supabase: any = _supabase;

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
    console.error('[emergency] Failed to get family ID:', error);
    return { familyId: null, familyMemberId: null };
  }
}

export async function createEmergencyAlert(
  reporterId: string,
  familyId: string,
  familyMemberId: string,
  type: any = 'medical',
  tier: any = 'high',
  location?: string | null
): Promise<{ success: boolean; alert?: any; error?: string }> {
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

    try {
      const { logAudit } = await import('./auth');
      await logAudit(reporterId, 'emergency_alert_created', {
        resourceType: 'emergency_alert',
        resourceId: data.id,
        details: 'Emergency alert created: ' + type + ' (' + tier + ')',
      }, 'security');
    } catch { /* audit best-effort */ }

    return { success: true, alert: data };
  } catch (error: any) {
    console.error('[emergency] Failed to create alert:', error);
    return { success: false, error: error.message };
  }
}

export async function getEmergencyAlerts(userId: string): Promise<any[]> {
  try {
    const { data: memberships } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) return [];

    const familyIds = memberships.map((m: any) => m.family_id);

    const { data: alerts, error } = await supabase
      .from('emergency_alerts')
      .select('*')
      .in('family_id', familyIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (alerts || []);
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

    try {
      const { logAudit } = await import('./auth');
      await logAudit(resolvedBy, 'emergency_alert_resolved', {
        resourceType: 'emergency_alert',
        resourceId: alertId,
      }, 'security');
    } catch { /* audit best-effort */ }

    return { success: true };
  } catch (error: any) {
    console.error('[emergency] Failed to resolve alert:', error);
    return { success: false, error: error.message };
  }
}
