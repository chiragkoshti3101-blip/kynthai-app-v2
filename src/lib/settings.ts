export interface Settings {
  locale: string;
  theme: 'light' | 'dark';
  notifications: boolean;
  emergencyContacts: string[];
}

export const defaultSettings: Settings = {
  locale: 'en',
  theme: 'light',
  notifications: true,
  emergencyContacts: [],
};

export function validateSettings(settings: any): settings is Settings {
  return (
    typeof settings.locale === 'string' &&
    ['light', 'dark'].includes(settings.theme) &&
    typeof settings.notifications === 'boolean' &&
    Array.isArray(settings.emergencyContacts)
  );
}

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem('kynthai-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (validateSettings(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore parse errors, use defaults
  }
  return defaultSettings;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem('kynthai-settings', JSON.stringify(settings));
}