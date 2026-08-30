/** Format a notification timestamp in the recipient's stored IANA timezone. */
export function formatNotificationDate(
  value: Date | string,
  timezone?: string | null,
): string {
  const date = value instanceof Date ? value : new Date(value)
  const fallback = 'America/New_York'
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }
  try {
    return date.toLocaleString('en-US', { ...options, timeZone: timezone || fallback })
  } catch {
    return date.toLocaleString('en-US', { ...options, timeZone: fallback })
  }
}
