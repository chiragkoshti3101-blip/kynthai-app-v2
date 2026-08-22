"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * iOS-style switch. Dimensions are owned by CSS (globals.css) so they cannot
 * collapse into a circle on iPhone: 51×31 track, 27×27 thumb, 20px travel.
 * Do not pass scale-* / size-* / w-* / h-* via className — those caused the
 * green "donut / radio" bug on Settings → Notifications.
 */
function Switch({
  className,
  style,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn("kynthai-switch", className)}
      style={style}
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
