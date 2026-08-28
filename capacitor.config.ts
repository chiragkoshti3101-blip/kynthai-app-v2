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
    // Capacitor 8 built-in SystemBars: injects --safe-area-inset-* CSS
    // variables (real pixel insets) into the WebView. globals.css consumes
    // them for the Android 15+/16 edge-to-edge layout (targetSdk 36).
    // 'css' is the default — pinned explicitly to protect the behaviour.
    SystemBars: {
      insetsHandling: 'css',
    },
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
      // Overlay OFF so the native status bar reserves its own strip and the
      // WebView content never draws under it (no white/emerald gap at top).
      overlaysWebView: false,
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
