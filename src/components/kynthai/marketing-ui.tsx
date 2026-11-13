import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Max-width marketing document shell — semantic colours only. */
export function MarketingPage({
  className,
  children,
  ...props
}: React.ComponentProps<'main'>) {
  return (
    <main className={cn('mx-auto max-w-3xl px-4 py-16 text-foreground', className)} {...props}>
      {children}
    </main>
  )
}

export function MarketingEyebrow({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('text-sm font-medium text-primary', className)} {...props} />
  )
}

export function MarketingTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      className={cn('mt-2 text-3xl font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  )
}

export function MarketingLead({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('mt-4 text-lg leading-relaxed text-muted-foreground', className)} {...props} />
  )
}

/** Primary marketing CTA — AA contrast via design token `primary`. */
export function MarketingCtaLink({
  href,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Button asChild variant="default" size="ctaSecondary" className={cn('rounded-full shadow-sm', className)}>
      <Link href={href} {...props}>
        {children}
      </Link>
    </Button>
  )
}

/** Secondary outline marketing action (≥44px tap target). */
export function MarketingSecondaryLink({
  href,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Button asChild variant="outline" size="ctaSecondary" className={cn('rounded-full', className)}>
      <Link href={href} {...props}>
        {children}
      </Link>
    </Button>
  )
}

/** Text-only tertiary nav link with touch-safe padding. */
export function MarketingTextLink({
  href,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}

/** Block-level download / external primary action (anchor). */
export function MarketingCtaAnchor({
  className,
  children,
  ...props
}: React.ComponentProps<'a'>) {
  return (
    <Button
      asChild
      variant="default"
      size="lg"
      className={cn('w-full rounded-xl text-base font-semibold shadow-md', className)}
    >
      <a {...props}>{children}</a>
    </Button>
  )
}
