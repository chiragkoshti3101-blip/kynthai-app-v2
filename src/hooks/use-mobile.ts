import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * SSR-safe mobile detection. Always starts as `false` on the server and on
 * the first client render, then updates after mount — avoids hydration
 * mismatches that caused layout/render glitches on phones.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  // Before mount, assume mobile-first for touch layouts is safer for app shells
  // but we return false to match SSR. Callers that need "unknown" can check mounted.
  return mounted ? isMobile : false
}
