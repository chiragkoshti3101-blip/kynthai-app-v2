'use client'

import * as React from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useReducedMotion,
  useAnimationControls,
  AnimatePresence,
  type Variants,
} from 'framer-motion'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Shared animation constants — import these in components             */
/* ------------------------------------------------------------------ */
export const EASE_STANDARD = [0.16, 1, 0.3, 1] as const
export const EASE_OUT     = [0.22, 1, 0.36, 1] as const
export const DURATION_STANDARD = 0.75 as const

/* ------------------------------------------------------------------ */
/* Reveal — fade + slide up when scrolled into view                    */
/* ------------------------------------------------------------------ */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  once = true,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  once?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once, margin: '-80px' })
  const reduced = useReducedMotion()

  // Respect prefers-reduced-motion: just fade, no slide
  const effectiveY = reduced ? 0 : y

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: effectiveY }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: effectiveY }}
      transition={{ duration: reduced ? 0.2 : 0.75, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      // ponytail: framer-motion writes a mid-flight inline transform on the
      // client while React is still hydrating the SSR'd style, which throws
      // minified React error #418 and (with the old fatal catcher) blanked
      // the page — exactly the login "can't sign in" regression. Suppressing
      // hydration warnings here is safe: the element's className/layout are
      // deterministic; only the transient animated transform differs.
      suppressHydrationWarning
    >
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* StaggerGroup + StaggerItem                                          */
/* ------------------------------------------------------------------ */
const groupVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
  },
}

export function StaggerGroup({
  children,
  className,
  once = true,
}: {
  children: React.ReactNode
  className?: string
  once?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once, margin: '-60px' })
  const reduced = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      variants={reduced ? {} : groupVariants}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      className={className}
      style={reduced ? { opacity: inView ? 1 : 0 } : undefined}
      // ponytail: see Reveal — transient animated styles must not throw #418
      suppressHydrationWarning
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div variants={itemVariants} className={className} suppressHydrationWarning>
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Magnetic — button that subtly follows the cursor                    */
/* ------------------------------------------------------------------ */
export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: React.ReactNode
  strength?: number
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 180, damping: 14 })
  const sy = useSpring(y, { stiffness: 180, damping: 14 })

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const relX = e.clientX - (rect.left + rect.width / 2)
    const relY = e.clientY - (rect.top + rect.height / 2)
    x.set(relX * strength)
    y.set(relY * strength)
  }
  function onLeave() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy }}
      className={cn('inline-block', className)}
    >
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* FadeIn helper for tab/page transitions                              */
/* ------------------------------------------------------------------ */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const reduced = useReducedMotion()
  const controls = useAnimationControls()

  // Start the entrance animation only AFTER hydration: framer-motion kicks
  // off mount-driven animations in a layout effect, so the DOM style is
  // already mid-flight (e.g. translateY(9.7px)) when React diffs the
  // SSR'd inline style (translateY(12px)) → minified error #418 → the old
  // fatal catcher blanked the whole page (the login "can't sign in"
  // regression). useEffect + rAF runs strictly after the hydration diff.
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      controls.start({
        opacity: 1,
        y: 0,
        transition: { duration: reduced ? 0 : 0.18, delay: reduced ? 0 : delay * 0.5, ease: 'easeOut' },
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [controls, reduced, delay])

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={controls}
      exit={reduced ? undefined : { opacity: 0, transition: { duration: 0.1 } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export { AnimatePresence, motion }
