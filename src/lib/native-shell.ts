/** Detect Capacitor / native WebView so we hide Download CTAs inside the installed app. */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const w = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
    }
    const cap = w.Capacitor
    if (typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()) return true
    const platform = cap?.getPlatform?.()
    if (platform === 'android' || platform === 'ios') return true
    if (/; wv\)/i.test(navigator.userAgent)) return true
    if (document.documentElement?.classList?.contains('plt-capacitor')) return true
    if (document.documentElement?.classList?.contains('hybrid')) return true
  } catch {
    /* ignore */
  }
  return false
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  } catch {
    /* ignore */
  }
  return isNativeShell()
}
