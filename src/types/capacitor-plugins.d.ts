/**
 * Ambient fallbacks so production `tsc` / Next build never fail if
 * node_modules resolution lags. Real packages override these when present.
 */
declare module '@capacitor/local-notifications' {
  export interface PermissionStatus {
    display: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'
  }
  export const LocalNotifications: {
    checkPermissions(): Promise<PermissionStatus>
    requestPermissions(): Promise<PermissionStatus>
    createChannel(options: Record<string, unknown>): Promise<void>
    schedule(options: { notifications: Array<Record<string, unknown>> }): Promise<void>
    cancel(options: { notifications: Array<{ id: number }> }): Promise<void>
    getPending(): Promise<{ notifications: Array<{ id: number }> }>
    addListener(
      eventName: string,
      listenerFunc: (event: { notification?: { extra?: Record<string, unknown> } }) => void
    ): Promise<{ remove: () => void }>
  }
}

declare module '@capacitor/status-bar' {
  export enum Style {
    Dark = 'DARK',
    Light = 'LIGHT',
    Default = 'DEFAULT',
  }
  export const StatusBar: {
    setStyle(options: { style: Style }): Promise<void>
    setBackgroundColor(options: { color: string }): Promise<void>
  }
}

declare module '@capacitor/app' {
  export const App: {
    addListener(
      eventName: 'appStateChange' | 'backButton',
      listenerFunc: (state: { isActive?: boolean; canGoBack?: boolean }) => void
    ): Promise<{ remove: () => void }>
  }
}

declare module '@capacitor/haptics' {
  export enum ImpactStyle {
    Heavy = 'HEAVY',
    Medium = 'MEDIUM',
    Light = 'LIGHT',
  }
  export const Haptics: {
    impact(options: { style: ImpactStyle }): Promise<void>
  }
}
