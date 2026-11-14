// src/lib/emergency.ts
// Emergency/SOS functionality for Kynthai health app
// Safety-critical: handles emergency alert creation and notification

import { createClient } from '@supabase/supabase-js';

// Get Supabase client from environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseKey);

export type EmergencyType = 'sos' | 'medical' | 'fall' | 'chest_pain' | 'stroke' | 'allergic' | 'other';
export type EmergencyTier = 'low' | 'medium' | 'high' | 'critical';

export interface EmergencyAlert {
  id: string;
  user_id: string;
  type: EmergencyType;
  tier: EmergencyTier;
  location?: string | null;
  resolved: boolean;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
}

/**
 * Trigger an SOS emergency alert
 */
export async function triggerSOS(
  userId: string,
  type: EmergencyType = 'sos',
  location?: string
): Promise<{ success: boolean; alertId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        user_id: userId,
        type,
        priority: 'urgent',
        status: 'pending',
        title: 'SOS Emergency Alert',
        body: `Emergency alert triggered by user ${userId}`,
        location,
      })
      .select('id')
      .single();

    if (error) throw error;

    return { success: true, alertId: data.id };
  } catch (error: any) {
    console.error('[emergency] Failed to trigger SOS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for pending emergency alerts
 */
export async function checkEmergencyStatus(userId: string): Promise<{
  hasPendingAlert: boolean;
  alertType?: EmergencyType;
}> {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('type, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const hasPending = data && data.length > 0;
    return {
      hasPendingAlert: hasPending,
      alertType: hasPending ? (data[0].type as EmergencyType) : undefined,
    };
  } catch (error) {
    console.error('[emergency] Failed to check status:', error);
    return { hasPendingAlert: false };
  }
}
