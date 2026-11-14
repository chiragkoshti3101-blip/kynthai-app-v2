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

/**
 * Resolve an emergency alert
 */
export async function resolveEmergencyAlert(
  alertId: string,
  resolvedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
      })
      .eq('id', alertId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('[emergency] Failed to resolve alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get emergency alerts for a user
 */
export async function getEmergencyAlerts(userId: string): Promise<EmergencyAlert[]> {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []) as EmergencyAlert[];
  } catch (error) {
    console.error('[emergency] Failed to get alerts:', error);
    return [];
  }
}
