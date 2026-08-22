import { Spinner } from '@/components/kynthai/spinner'
import { KynthaiBrand } from '@/components/kynthai/logo'

/**
 * AppLoader — premium full-page loading state for the whole app.
 */
export function AppLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(16,185,129,0.12), transparent 70%)',
        }}
      />
      <div className="flex flex-col items-center gap-5 px-6" role="status" aria-label={label}>
        <div className="rounded-2xl border border-border/50 bg-card/80 p-5 shadow-lg shadow-emerald-950/5 backdrop-blur-sm">
          <KynthaiBrand iconSize={36} />
        </div>
        <Spinner size={36} color="#10b981" />
        <p className="text-sm font-medium tracking-tight text-muted-foreground">{label}</p>
        <span className="sr-only">{label}</span>
      </div>
    </div>
  )
}
