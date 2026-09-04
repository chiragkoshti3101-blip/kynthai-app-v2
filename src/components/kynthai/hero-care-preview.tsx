import { CalendarCheck2, CheckCircle2, ShieldCheck, Users } from 'lucide-react'

/**
 * Marketing hero visual. Keep this content-first rather than depicting a
 * phone, laptop, or other device so the product story works on every screen.
 */
export function HeroCarePreview() {
  return (
    <div
      role="img"
      aria-label="Kynthai care overview with medication reminders, care team, and family updates"
      className="w-full max-w-[600px] rounded-[2rem] border border-emerald-500/25 bg-card p-4 text-card-foreground shadow-xl shadow-emerald-950/10 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold">Kynthai</p>
            <p className="text-xs text-muted-foreground">Care overview</p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          All on track
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
              Medication routine
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Today&apos;s progress</p>
          </div>
          <p className="text-2xl font-bold tracking-tight">3 <span className="text-sm font-medium text-muted-foreground">of 4</span></p>
        </div>
        <div className="mt-4 h-2 rounded-full bg-emerald-950/10 dark:bg-white/10" aria-hidden="true">
          <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Morning routine complete
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
          <CalendarCheck2 className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Care team
          </p>
          <p className="mt-1 text-sm font-semibold">Next visit tomorrow</p>
          <p className="mt-1 text-xs text-muted-foreground">10:00 AM · Cardiology</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
          <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Family updates
          </p>
          <p className="mt-1 text-sm font-semibold">2 new check-ins</p>
          <p className="mt-1 text-xs text-muted-foreground">Everyone stays connected</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-4 text-xs font-medium text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        Private by design
      </div>
    </div>
  )
}
