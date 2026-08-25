import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.kynthai.health',
  appName: 'Kynthai',
  webDir: 'www',
  server: {
    // Load production; local www is only a fallback shell
    url: 'https://kynthai.app',
    cleartext: false,
    allowNavigation: [
      'kynthai.app',
      '*.kynthai.app',
      'https://kynthai.app',
      'https://*.kynthai.app',
    ],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#10b981',
      sound: 'default',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: '#10b981',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#10b981',
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
