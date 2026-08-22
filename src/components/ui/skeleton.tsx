import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-xl bg-gradient-to-r from-muted via-muted/60 to-muted bg-[length:200%_100%] animate-pulse",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
