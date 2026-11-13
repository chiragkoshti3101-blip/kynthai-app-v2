/** Strip medication-identifying fields from push `data` — lock-screen / FCM logs stay opaque. */
export function privacySafeReminderPushData(
  data: Record<string, unknown>,
  ids?: { reminderId?: string; medicationId?: string },
): Record<string, string> {
  const urlParams = new URLSearchParams({ alarm: '1', type: 'reminder' });
  if (ids?.reminderId) urlParams.set('rid', ids.reminderId);
  if (ids?.medicationId) urlParams.set('mid', ids.medicationId);
  if (typeof data.scheduledTime === 'string') urlParams.set('time', data.scheduledTime);

  return {
    type: 'reminder',
    url: `/patient?${urlParams.toString()}`,
    ...(ids?.reminderId ? { reminderId: ids.reminderId } : {}),
    ...(ids?.medicationId ? { medicationId: ids.medicationId } : {}),
  } as Record<string, string>;
}

export function privacySafeEscalationPushData(
  forUserId?: string,
): Record<string, string> {
  return {
    type: 'reminder_escalation',
    escalated: '1',
    url: '/patient',
    ...(forUserId ? { forUserId } : {}),
  } as Record<string, string>;
}
