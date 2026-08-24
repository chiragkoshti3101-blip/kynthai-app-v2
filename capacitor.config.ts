import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Kynthai native shell — loads production web app and schedules OS-level
 * local notifications (full-screen intent on Android) for dose / emergency.
 */
const config: CapacitorConfig = {
  appId: 'app.kynthai.health',
  appName: 'Kynthai',
  webDir: 'www',
  server: {
    // Live Next.js app — no static export required
    url: 'https://kynthai.app',
    cleartext: false,
    allowNavigation: ['kynthai.app', '*.kynthai.app'],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#10b981',
      sound: 'default',
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#f9fdfb',
      launchShowDuration: 0,
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f9fdfb',
  },
}

export default config
