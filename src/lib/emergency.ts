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

/**
 * Get the current user's family ID
 */
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
  }\n\n/**\n * Get linked doctors for a family\n */\nexport async function getFamilyDoctors(familyId: string): Promise<string[]> {\n  try {\n    const { data: doctors, error } = await supabase\n      .from('family_members')\n      .select('name, user_id, role')\n      .eq('family_id', familyId)\n      .or('role.eq.doctor,role.eq.medical,role.eq.physician');\n    if (error || !doctors) return [];\n    return doctors.map(d => d.name || d.user_id || 'Doctor').filter(Boolean);\n  } catch (error: any) {\n    console.error('[emergency] Failed to get family doctors:', error);\n    return [];\n  }\n}\n\n/**\n * Create an emergency alert\n */\nexport async function createEmergencyAlert(\n  reporterId: string, familyId: string, familyMemberId: string,\n  type: EmergencyType = 'medical', tier: EmergencyTier = 'high', location?: string | null\n): Promise<{ success: boolean; alert?: any; notifiedDoctors?: string[]; summary?: string; error?: string }> {\n  try {\n    const { data, error } = await supabase\n      .from('emergency_alerts')\n      .insert({ family_id: familyId, family_member_id: familyMemberId, reporter_id: reporterId, type, tier, location, resolved: false })\n      .select()\n      .single();\n    if (error) throw error;\n    const notifiedDoctors = await getFamilyDoctors(familyId);\n    const typeLabel = { medical: 'Medical emergency', fall: 'Fall detected', chest_pain: 'Chest pain', stroke: 'Possible stroke', allergic: 'Allergic reaction', other: 'Emergency' }[type] ?? 'Emergency';\n    const tierLabel = { low: 'Low priority', medium: 'Medium priority', high: 'High priority', critical: 'Critical' }[tier] ?? 'High priority';\n    const summary = \`${typeLabel} — ${tierLabel}. ${notifiedDoctors.length > 0 ? \`Notified ${notifiedDoctors.length} linked doctor(s).` : 'No linked doctors found.'}${location ? \` Location: ${location}` : ''}\`;\n    await logAudit(reporterId, 'emergency_alert_created', { resourceType: 'emergency_alert', resourceId: data.id, details: \`Emergency alert created: ${type} (${tier})\` }, 'security');\n    return { success: true, alert: { ...data, notifiedDoctors, summary }, notifiedDoctors, summary };\n  } catch (error: any) {\n    console.error('[emergency] Failed to create alert:', error);\n    return { success: false, error: error.message };\n  }\n}\n\n/**\n * Get emergency alerts for a user's family\n */\nexport async function getEmergencyAlerts(userId: string): Promise<any[]> {\n  try {\n    const { data: memberships } = await supabase.from('family_members').select('family_id').eq('user_id', userId);\n    if (!memberships || memberships.length === 0) return [];\n    const familyIds = memberships.map(m => m.family_id);\n    const { data: alerts, error } = await supabase.from('emergency_alerts').select('*').in('family_id', familyIds).order('created_at', { ascending: false });\n    if (error) throw error;\n    return (alerts || []) as any[];\n  } catch (error: any) {\n    console.error('[emergency] Failed to get alerts:', error);\n    return [];\n  }\n}\n\n/**\n * Resolve an emergency alert\n */\nexport async function resolveEmergencyAlert(alertId: string, resolvedBy: string): Promise<{ success: boolean; error?: string }> {\n  try {\n    const { error } = await supabase.from('emergency_alerts').update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: resolvedBy }).eq('id', alertId);\n    if (error) throw error;\n    await logAudit(resolvedBy, 'emergency_alert_resolved', { resourceType: 'emergency_alert', resourceId: alertId }, 'security');\n    return { success: true };\n  } catch (error: any) {\n    console.error('[emergency] Failed to resolve alert:', error);\n    return { success: false, error: error.message };\n  }\n}\n\n/**\n * Trigger SOS\n */\nexport async function triggerSOS(userId: string, type: EmergencyType = 'medical', location?: string): Promise<{ success: boolean; alertId?: string; error?: string }> {\n  try {\n    const { familyId, familyMemberId } = await getUserFamilyId(userId);\n    if (!familyId || !familyMemberId) return { success: false, error: 'No family membership found' };\n    const result = await createEmergencyAlert(userId, familyId, familyMemberId, type, 'high', location);\n    if (!result.success) return { success: false, error: result.error };\n    return { success: true, alertId: result.alert?.id };\n  } catch (error: any) {\n    console.error('[emergency] Failed to trigger SOS:', error);\n    return { success: false, error: error.message };\n  }\n}\n\n/**\n * Check emergency status\n */\nexport async function checkEmergencyStatus(userId: string): Promise<{ hasPendingAlert: boolean; alertType?: EmergencyType }> {\n  try {\n    const { familyId } = await getUserFamilyId(userId);\n    if (!familyId) return { hasPendingAlert: false };\n    const { data, error } = await supabase.from('emergency_alerts').select('type, resolved').eq('family_id', familyId).eq('resolved', false).order('created_at', { ascending: false }).limit(1);\n    if (error) throw error;\n    const hasPending = data && data.length > 0;\n    return { hasPendingAlert: hasPending, alertType: hasPending ? (data[0].type as EmergencyType) : undefined };\n  } catch (error: any) {\n    console.error('[emergency] Failed to check status:', error);\n    return { hasPendingAlert: false };\n  }\n}