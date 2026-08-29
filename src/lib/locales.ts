export type Locale = 'en-US' | 'en-IE' | 'en-GB'

export const LOCALES: Record<
  Locale,
  { code: Locale; label: string; flag: string }
> = {
  'en-US': { code: 'en-US', label: 'English', flag: '🇺🇸' },
  'en-IE': { code: 'en-IE', label: 'English (EU)', flag: '🇪🇺' },
  'en-GB': { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
}

const translations: Record<Locale, Record<string, string>> = {
  'en-US': {},
  'en-IE': {},
  'en-GB': {},
}

export function getLocale(locale: Locale): Record<string, string> {
  return translations[locale] ?? translations['en-US']
}

export function detectLocale(): Locale {
  return 'en-US'
}
