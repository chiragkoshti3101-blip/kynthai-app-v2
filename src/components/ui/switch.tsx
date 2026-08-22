"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * iOS-style switch. Dimensions are owned ONLY by CSS (.kynthai-switch in globals.css):
 * 51×31 track, 27×27 thumb. Do not size via Tailwind — that caused the iPhone oval/donut bug.
 */
function stripSizingClasses(className?: string) {
  if (!className) return undefined
  return className
    .split(/\s+/)
    .filter(
      (c) =>
        !/^(w-|h-|min-w-|min-h-|max-w-|max-h-|size-|scale-|aspect-|p-\d|px-|py-|translate-)/.test(
          c,
        ),
    )
    .join(" ")
}

function Switch({
  className,
  style,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn("kynthai-switch", stripSizingClasses(className))}
      // Never let inline size override the CSS pill
      style={{
        ...style,
        width: 51,
        minWidth: 51,
        height: 31,
        minHeight: 31,
        flexShrink: 0,
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="kynthai-switch-thumb"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
