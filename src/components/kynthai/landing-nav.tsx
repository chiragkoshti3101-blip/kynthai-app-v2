'use client'

import * as React from 'react'
import { useAppStore, type AppScreen, type LoginPortal } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { KynthaiBrand } from './logo'
import { Menu, X, ArrowRight, LogIn } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { isDemoEnabled } from '@/lib/demo-mode'

/* ------------------------------------------------------------------ */
/* LandingNav — scroll-aware navigation bar (client island)           */
/* ------------------------------------------------------------------ */
type NavLink =
  | { label: string; href: string; onClick?: never }
  | { label: string; href?: never; onClick: () => void }

export function LandingNav({ goToLogin }: { goToLogin: (portal: LoginPortal) => void }) {
  const setScreen = useAppStore((s) => s.setScreen)
  const router = useRouter()
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  // SSR guard — window is undefined during server rendering
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    try {
      router.prefetch('/login')
      router.prefetch('/register')
    } catch { /* ignore */ }
    return () => window.removeEventListener('scroll', onScroll)
  }, [router])

  const goScreen = (s: AppScreen) => { setScreen(s); router.push('/') }

  const links: NavLink[] = [
    { label: 'Pricing', href: '/pricing' },
    { label: 'For Families', onClick: () => goToLogin('caretaker') },
    { label: 'For Patients', onClick: () => goToLogin('patient') },
    { label: 'For Doctors', onClick: () => goToLogin('doctor') },
    { label: 'For Labs', onClick: () => goToLogin('lab') },
    ...(isDemoEnabled()
      ? [{ label: 'Try the demo', href: '/login?demo=1' }]
      : []),
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ]

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300 pt-safe',
        scrolled
          ? 'border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => goScreen('landing')}
          className="flex items-center py-2 -my-2"
          aria-label="Kynthai home"
        >
          <KynthaiBrand />
        </button>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map((l) => (
            l.href ? (
              <Link
                key={l.label}
                href={l.href}
                className="group relative flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
                <span className="absolute inset-x-3 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-transform duration-300 group-hover:scale-x-100" />
              </Link>
            ) : (
              <button
                key={l.label}
                onClick={l.onClick}
                className="group relative flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
                <span className="absolute inset-x-3 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-transform duration-300 group-hover:scale-x-100" />
              </button>
            )
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button
            variant="ghost"
            size="ctaSecondary"
            onClick={() => router.push('/login')}
            className="rounded-full px-4"
          >
            <LogIn className="mr-1.5 h-4 w-4" />
            Sign in
          </Button>
          <Button
            variant="brand"
            size="ctaSecondary"
            onClick={() => goToLogin('patient')}
            className="gap-1.5 px-5 shadow-md"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <button
          className="inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-xl border border-border lg:hidden transition-transform duration-200 active:scale-95"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <motion.span
            key={open ? 'close' : 'menu'}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            suppressHydrationWarning
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </motion.span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-border bg-background lg:hidden"
          >
            <div className="space-y-1 px-4 py-3">
            {links.map((l) =>
              l.href ? (
                <Link
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-accent"
                >
                  {l.label}
                </Link>
              ) : (
                <button
                  key={l.label}
                  onClick={() => {
                    setOpen(false)
                    l.onClick?.()
                  }}
                  className="block w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-accent"
                >
                  {l.label}
                </button>
              )
            )}
            <Link href="/login" onClick={() => setOpen(false)}>
              <Button
                variant="brand"
                size="cta"
                className="mt-2 w-full"
              >
                Get Started
              </Button>
            </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
