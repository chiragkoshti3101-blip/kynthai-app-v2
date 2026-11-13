'use client'

export const analytics = {
  // Call this on app initialization
  init() {
    if (typeof window === 'undefined') return
    
    // Mixpanel
    if (process.env.NEXT_PUBLIC_MIXPANEL_TOKEN) {
      this.loadScript('https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js')
    }
    // GA4 is loaded via next/script in layout.tsx — just send initial page_view here
    if (process.env.NEXT_PUBLIC_GA_ID && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'page_view', { page_title: document.title, page_location: window.location.href })
    }
  },

  // Track events
  track(eventName: string, properties?: Record<string, unknown>) {
    if (typeof window === 'undefined') return
    
    // Mixpanel
    if (process.env.NEXT_PUBLIC_MIXPANEL_TOKEN && (window as any).mixpanel) {
      (window as any).mixpanel.track(eventName, properties)
    }
    // GA4
    if (process.env.NEXT_PUBLIC_GA_ID && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', eventName, properties)
    }
  },

  // Identify users
  identify(userId: string, traits?: Record<string, unknown>) {
    if (typeof window === 'undefined') return
    
    if (process.env.NEXT_PUBLIC_MIXPANEL_TOKEN && (window as any).mixpanel) {
      (window as any).mixpanel.identify(userId)
      if (traits) {
        (window as any).mixpanel.people.set(traits)
      }
    }
    // GA4 — set user_id for cross-session tracking
    if (process.env.NEXT_PUBLIC_GA_ID && typeof (window as any).gtag === 'function') {
      (window as any).gtag('set', 'user_id', userId)
    }
  },

  // Page view tracking (call on route change)
  pageView(pagePath: string, pageTitle?: string) {
    if (typeof window === 'undefined') return
    if (process.env.NEXT_PUBLIC_GA_ID && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'page_view', {
        page_title: pageTitle || document.title,
        page_path: pagePath,
        page_location: window.location.href,
      })
    }
  },

  // Load external script
  loadScript(src: string) {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    document.head.appendChild(script)
  },
}
