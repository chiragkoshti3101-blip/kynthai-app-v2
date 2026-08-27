'use client'

/**
 * ResponsiveSheet — a Sheet that renders as a bottom sheet on mobile
 * and a right-side drawer on desktop. This is the native app pattern:
 *
 *   Mobile (<768px):  bottom sheet, 90vh, rounded top, drag handle
 *   Desktop (≥768px): right drawer, max-w-md, full height
 *
 * Usage:
 *   <ResponsiveSheet open={open} onOpenChange={setOpen}>
 *     <SheetHeader>...</SheetHeader>
 *     <div>content</div>
 *   </ResponsiveSheet>
 */

import * as React from 'react'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

interface ResponsiveSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  /** Desktop drawer width. Defaults to max-w-md (28rem). */
  desktopMaxWidth?: string
  /** Mobile sheet height. Defaults to 90vh. */
  mobileHeight?: string
  className?: string
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  children,
  desktopMaxWidth = 'sm:max-w-md',
  mobileHeight = 'h-[90vh] max-h-[90vh]',
  className,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'overflow-y-auto custom-scroll overscroll-behavior-contain p-0',
          isMobile
            ? cn(
                mobileHeight,
                'rounded-t-3xl border-t border-border/60 shadow-[0_-12px_40px_rgba(0,0,0,0.25)] pb-safe'
              )
            : cn('w-full h-full', desktopMaxWidth),
          className
        )}
      >
        {/* Mobile drag handle — native iOS/Android sheet affordance.
            Matches iOS spec: ~36px wide, 5px tall, rounded, visible gray. */}
        {isMobile && (
          <div className="flex justify-center pt-3 pb-2 shrink-0">
            <div
              className="h-[5px] w-9 rounded-full bg-foreground/30"
              aria-hidden
            />
          </div>
        )}
        {children}
      </SheetContent>
    </Sheet>
  )
}
