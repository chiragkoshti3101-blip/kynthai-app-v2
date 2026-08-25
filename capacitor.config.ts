import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell for Kynthai.
 * Loads production web app; OS plugins handle alarms, local notifications, chrome UI.
 */
const config: CapacitorConfig = {
  appId: 'app.kynthai.health',
  appName: 'Kynthai',
  webDir: 'www',
  server: {
    url: 'https://kynthai.app',
    cleartext: false,
    allowNavigation: ['kynthai.app', '*.kynthai.app'],
  },
  plugins: {
    LocalNotifications: {
      // Use launcher icon until a dedicated status drawable is added
      smallIcon: 'ic_launcher',
      iconColor: '#10b981',
      sound: 'default',
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#f9fdfb',
      launchShowDuration: 400,
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f9fdfb',
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f9fdfb',
  },
  ios: {
    backgroundColor: '#f9fdfb',
    contentInset: 'automatic',
  },
}

export default config
