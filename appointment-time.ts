/**
 * Format an appointment instant for the patient's local display.
 *
 * API appointments are ISO timestamps (UTC in production). Leaving timeZone
 * unset lets the browser render the instant in the patient's local timezone;
 * callers can provide an IANA timezone when a stored preference is available.
 * Invalid timestamps never surface "Invalid Date" in the UI.
 */
const APPOINTMENT_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
};

export function formatAppointmentTime(value: unknown, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '';

  try {
    return date.toLocaleTimeString('en-US', {
      ...APPOINTMENT_TIME_OPTIONS,
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    // An invalid/stale IANA timezone must not prevent the appointment card
    // from rendering. Fall back to the browser's local timezone.
    try {
      return date.toLocaleTimeString('en-US', APPOINTMENT_TIME_OPTIONS);
    } catch {
      return '';
    }
  }
}
