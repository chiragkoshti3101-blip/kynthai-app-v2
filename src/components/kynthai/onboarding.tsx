'use client'

import * as React from 'react'
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion'
import { ArrowRight, Sparkles, Users, Pill, Stethoscope, FlaskConical, ChevronLeft, ShieldCheck, UserCircle, BrainCircuit, AlertTriangle, Plus, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { KynthaiBrand } from './logo'

interface Slide {
  title: string
  body: string
  accent: string
  icon: React.ComponentType<{ className?: string }>
  illustration: React.ReactNode
  showDots?: boolean
}

const SLIDES: Slide[] = [
  {
    title: 'Welcome to Kynthai',
    body: 'Your AI-assisted health app — reminders, insights, doctors and labs, all in one calm, beautiful app built for the US.',
    accent: 'from-emerald-500 to-teal-600',
    icon: Sparkles,
    illustration: <WelcomeArt />,
  },
  {
    title: 'Care for the whole family',
    body: 'Add up to four family members. Caretakers get live adherence updates — so nobody misses a dose.',
    accent: 'from-teal-500 to-emerald-600',
    icon: Users,
    illustration: <FamilyArt />,
  },
  {
    title: 'Never miss a medicine',
    body: 'Smart reminders, drug-interaction checks, and AI schedule parsing from your prescription photo.',
    accent: 'from-emerald-500 to-emerald-700',
    icon: Pill,
    illustration: <MedsArt />,
  },
  {
    title: 'Choose your role',
    body: 'This personalizes your experience. You can switch later in settings.',
    accent: 'from-teal-600 to-emerald-600',
    icon: Stethoscope,
    illustration: <RoleArt />,
    showDots: false,
  },
  {
    title: 'About our AI',
    body: 'Understanding what Kynthai AI can and cannot do.',
    accent: 'from-amber-500 to-orange-600',
    icon: BrainCircuit,
    illustration: <ConsentArt />,
    showDots: false,
  },
]
const CONSENT_INDEX = SLIDES.length

const ROLE_SLIDE_INDEX = 3; // which slide has role picker (0-indexed)

export function Onboarding({
  onComplete,
  initialRole,
}: {
  onComplete: (role: 'patient' | 'caretaker' | 'doctor' | 'lab' | 'admin') => void
  // Role fixed at signup (stored in DB). When present, the role slide becomes
  // a locked confirmation — the picker choice is ignored by routing anyway,
  // which silently misled users who picked a different portal.
  initialRole?: 'patient' | 'caretaker' | 'doctor' | 'lab' | 'admin'
}) {
  const [index, setIndex] = React.useState(0)
  const [role, setRole] = React.useState<'patient' | 'caretaker' | 'doctor' | 'lab' | 'admin' | null>(initialRole ?? null)
  // Keep role locked to signup/portal selection
  React.useEffect(() => {
    if (initialRole) setRole(initialRole)
  }, [initialRole])
  // COMPLIANCE: consent flags gated by explicit user action before completion.
  const [termsAccepted, setTermsAccepted] = React.useState(false)
  const [dataProcessingAccepted, setDataProcessingAccepted] = React.useState(false)
  const [aiProcessingAccepted, setAiProcessingAccepted] = React.useState(false)

  // Slide entrance animation — deferred until AFTER hydration. framer-motion
  // starts mount-driven animations in a layout effect, so the DOM style is
  // already mid-flight when React diffs the SSR'd inline style → minified
  // error #418 (the same crash class as the login FadeIn regression).
  const slideControls = useAnimationControls()
  React.useEffect(() => {
    // Start invisible, then animate in after hydration. Use setTimeout(0)
    // instead of requestAnimationFrame — iOS Safari doesn't fire rAF
    // reliably when the page is backgrounded or during fast navigations.
    slideControls.set({ opacity: 0, x: 40 })
    const timer = setTimeout(() => {
      slideControls.start({ opacity: 1, x: 0 })
    }, 0)
    return () => clearTimeout(timer)
  }, [slideControls])

  // First-value moment: optional quick-add of a medication after consent.
  // Gives the user something real in their account immediately — the core of
  // "reach first value fast" onboarding. Uses the real /api/medications API.
  const [medName, setMedName] = React.useState('')
  const [medDosage, setMedDosage] = React.useState('')
  const [medTime, setMedTime] = React.useState('08:00')
  const [medSaving, setMedSaving] = React.useState(false)
  const [medSaved, setMedSaved] = React.useState(false)
  const [medError, setMedError] = React.useState<string | null>(null)
  // Consent persistence: the consent slide must WRITE the three flags to the
  // DB (PATCH /api/user/consent) — previously it only set client state, so a
  // user who consented on a fresh browser was blocked again on the next
  // session (ConsentGate / checkConsent 403s). The global CSRF interceptor
  // attaches X-CSRF-Token automatically.
  const [consentSaving, setConsentSaving] = React.useState(false)
  const [consentError, setConsentError] = React.useState<string | null>(null)
  const isMedSlide = index === CONSENT_INDEX + 1
  const canAddMed = medName.trim().length > 0 && medDosage.trim().length > 0

  // Role already chosen at signup/login portal — never ask again
  const roleLocked = !!initialRole
  const skipRoleSlide = roleLocked

  const slide = index < CONSENT_INDEX ? SLIDES[index]! : null
  const isConsentSlide = index === CONSENT_INDEX
  const isRoleSlide = index === ROLE_SLIDE_INDEX && !skipRoleSlide
  const isAiLimitsSlide = index === 4

  const allConsentGiven = termsAccepted && dataProcessingAccepted && aiProcessingAccepted
  const canComplete = isConsentSlide
    ? allConsentGiven && !consentSaving
    : isRoleSlide
    ? !!role
    : true

  /** Ordered step indices the user actually walks (skips role when locked). */
  const walkOrder = React.useMemo(() => {
    const steps: number[] = []
    for (let i = 0; i <= CONSENT_INDEX + 1; i++) {
      if (skipRoleSlide && i === ROLE_SLIDE_INDEX) continue
      steps.push(i)
    }
    return steps
  }, [skipRoleSlide])

  React.useEffect(() => {
    if (skipRoleSlide && index === ROLE_SLIDE_INDEX) {
      setIndex(ROLE_SLIDE_INDEX + 1)
    }
  }, [skipRoleSlide, index])

  const stepPos = Math.max(0, walkOrder.indexOf(index))
  const stepTotal = walkOrder.length

  const goToAdjacent = React.useCallback(
    (dir: 1 | -1) => {
      const pos = walkOrder.indexOf(index)
      const nextPos = pos + dir
      if (nextPos < 0 || nextPos >= walkOrder.length) return
      setIndex(walkOrder[nextPos]!)
    },
    [walkOrder, index],
  )

  const saveFirstMedication = React.useCallback(async () => {
    if (!canAddMed || medSaving) return
    setMedSaving(true)
    setMedError(null)
    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: medName.trim(),
          dosage: medDosage.trim(),
          times: [medTime],
          frequency: 'Daily',
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Could not add medication')
      }
      setMedSaved(true)
    } catch (e) {
      setMedError(e instanceof Error ? e.message : 'Could not add medication')
    } finally {
      setMedSaving(false)
    }
  }, [canAddMed, medSaving, medName, medDosage, medTime])

  const next = React.useCallback(() => {
    if (isConsentSlide) {
      // Persist consent to the DB before advancing. The consent slide
      // checkboxes are the legal consent moment — skipping the write left the
      // DB flags false forever (silent no-op, then ConsentGate on next load).
      if (allConsentGiven && !consentSaving) {
        setConsentSaving(true)
        setConsentError(null)
        fetch('/api/user/consent', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consentAccepted: true,
            dataProcessingConsent: true,
            aiTrainingConsent: true,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const d = await res.json().catch(() => ({}))
              throw new Error(d?.error || 'Could not save consent — please try again.')
            }
            setConsentSaving(false)
            setIndex(CONSENT_INDEX + 1) // consent → first-medication slide
          })
          .catch((e) => {
            setConsentSaving(false)
            setConsentError(e instanceof Error ? e.message : 'Could not save consent — please try again.')
          })
      }
    } else if (isMedSlide) {
      onComplete((role ?? initialRole ?? 'patient') as 'patient' | 'caretaker' | 'doctor' | 'lab' | 'admin')
    } else {
      goToAdjacent(1)
    }
  }, [isConsentSlide, allConsentGiven, consentSaving, isMedSlide, onComplete, role, initialRole, goToAdjacent])

  const prev = React.useCallback(() => goToAdjacent(-1), [goToAdjacent])

  // COMPLIANCE: Skip must navigate to consent slide, never bypass it.
  const handleSkip = React.useCallback(() => {
    if (index < CONSENT_INDEX) setIndex(CONSENT_INDEX)
    else if (isMedSlide) onComplete(role ?? 'patient')
  }, [index, isMedSlide, onComplete, role])

  // COMPLIANCE: Escape key must NOT bypass the consent slide.
  React.useEffect(() => {
    // Guard against SSR - window is undefined during server rendering
    if (typeof window === 'undefined') return
    
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Enter') { if (canComplete) next() }
      else if (e.key === 'Escape' && !isConsentSlide) onComplete(role ?? 'patient')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onComplete, role, canComplete, isConsentSlide])

  const roles = [
    { id: 'patient' as const, label: 'Track my own health', desc: 'Personal health assistant', icon: UserCircle, tint: 'from-emerald-500 to-teal-600' },
    { id: 'caretaker' as const, label: 'Caretaker', desc: 'Manage family members', icon: Users, tint: 'from-teal-500 to-teal-600' },
    { id: 'doctor' as const, label: 'Doctor', desc: 'Healthcare professional', icon: Stethoscope, tint: 'from-cyan-500 to-emerald-600' },
    { id: 'lab' as const, label: 'Lab Partner', desc: 'Diagnostics & reports', icon: FlaskConical, tint: 'from-teal-600 to-emerald-700' },
  ]

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,0.35), transparent 70%)' }} />
      </div>

      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-3">
          <KynthaiBrand />
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
            About 60 seconds
          </span>
        </div>
        <button
          onClick={handleSkip}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            isConsentSlide
              ? 'cursor-not-allowed text-muted-foreground/40'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}>
          Skip
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 pb-3 sm:pb-4">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {isMedSlide ? (
              <motion.div key="med" initial={{ opacity: 0, x: 40 }} animate={slideControls}
                exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center text-center" suppressHydrationWarning>
                <div className="relative mb-5 flex h-32 w-full items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25">
                    {medSaved ? <Check className="h-9 w-9" /> : <Pill className="h-9 w-9" />}
                  </div>
                </div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {medSaved ? 'You set your first medication!' : 'Add your first medication'}
                </h1>
                <p className="mt-2 max-w-sm text-pretty text-sm text-muted-foreground sm:text-base">
                  {medSaved
                    ? 'That was fast. You can always add more and scan prescriptions from your dashboard.'
                    : 'Optional — add one now so Kynthai can start reminding you. Takes about 10 seconds.'}
                </p>
                {!medSaved && (
                  <div className="mt-4 w-full space-y-3 text-left">
                    <div className="space-y-1.5">
                      <Label htmlFor="ob-med-name" className="text-xs font-medium">Medication name</Label>
                      <Input id="ob-med-name" value={medName} onChange={e => setMedName(e.target.value)}
                        placeholder="e.g. Metformin" className="h-10" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-med-dosage" className="text-xs font-medium">Dosage</Label>
                        <Input id="ob-med-dosage" value={medDosage} onChange={e => setMedDosage(e.target.value)}
                          placeholder="e.g. 500mg" className="h-10" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-med-time" className="text-xs font-medium">Time</Label>
                        <Input id="ob-med-time" type="time" value={medTime} onChange={e => setMedTime(e.target.value)}
                          className="h-10" />
                      </div>
                    </div>
                    {medError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400">{medError}</p>
                    )}
                    <Button variant="outline" size="sm" onClick={saveFirstMedication} disabled={!canAddMed || medSaving}
                      className="w-full gap-2">
                      {medSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {medSaving ? 'Adding…' : 'Add medication'}
                    </Button>
                  </div>
                )}
              </motion.div>
            ) : isConsentSlide ? (
              <motion.div key={CONSENT_INDEX} initial={{ opacity: 0, x: 40 }} animate={slideControls}
                exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} suppressHydrationWarning
                className="flex flex-col items-center text-center">
                <div className="relative mb-5 flex h-48 w-full items-center justify-center">
                  <ConsentArt />
                </div>
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg from-emerald-500 to-teal-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your privacy matters</h1>
                <p className="mt-2 max-w-sm text-pretty text-sm text-muted-foreground sm:text-base">
                  Before we get started, we need your agreement on a few things.
                  You can update these anytime in Settings.
                </p>
                <div className="mt-4 w-full space-y-2 text-left">
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
                    <Checkbox
                      checked={termsAccepted}
                      onCheckedChange={(v) => setTermsAccepted(Boolean(v))}
                      className="mt-0.5"
                    />
                    <span className="text-xs leading-relaxed">
                      <strong className="text-foreground">Terms of Service</strong> —
                      I agree to Kynthai&apos;s terms and confirm I am at least 18 years old.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
                    <Checkbox
                      checked={dataProcessingAccepted}
                      onCheckedChange={(v) => setDataProcessingAccepted(Boolean(v))}
                      className="mt-0.5"
                    />
                    <span className="text-xs leading-relaxed">
                      <strong className="text-foreground">Data Processing</strong> —
                      I consent to Kynthai collecting and processing my personal and
                      health information for service delivery, including treatment,
                      payment, and healthcare operations under US privacy, and
                      analytics as described in the Privacy Policy.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
                    <Checkbox
                      checked={aiProcessingAccepted}
                      onCheckedChange={(v) => setAiProcessingAccepted(Boolean(v))}
                      className="mt-0.5"
                    />
                    <span className="text-xs leading-relaxed">
                      <strong className="text-foreground">AI Processing</strong> —
                      I consent to Kynthai using AI to analyze my health data and
                      provide insights. This consent is voluntary and can be
                      withdrawn anytime in Settings without affecting core service
                      functions.
                    </span>
                  </label>
                </div>
              </motion.div>
            ) : slide ? (
              <motion.div key={index} initial={{ opacity: 0, x: 40 }} animate={slideControls}
                exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} suppressHydrationWarning
                className="flex flex-col items-center text-center">
                <div className="relative mb-5 flex h-48 w-full items-center justify-center">
                  {slide.illustration}
                </div>
                <div className={cn('mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', slide.accent)}>
                  {(() => {
                    const Fallback = slide.icon
                    const Icon = (index === 3 && role ? roles.find((r) => r.id === role)?.icon : undefined) || Fallback
                    return <Icon className="h-5 w-5" />
                  })()}
                </div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {isRoleSlide && initialRole ? 'Your portal role' : slide.title}
                </h1>
                <p className="mt-2 max-w-sm text-pretty text-sm text-muted-foreground sm:text-base">
                  {isRoleSlide && initialRole
                    ? 'Your portal is already set based on the role you chose when signing up.'
                    : slide.body}
                </p>

                {/* AI limits content - only on AI limits slide */}
                {isAiLimitsSlide && (
                  <div className="mt-4 w-full space-y-2 text-left">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      What AI can and cannot do
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
                        <span className="text-emerald-600 text-sm mt-0.5">✓</span>
                        <div className="text-xs leading-relaxed text-muted-foreground">
                          <strong className="text-foreground">Answer</strong> questions about your medications, side effects, drug interactions, and general health topics.
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
                        <span className="text-emerald-600 text-sm mt-0.5">✓</span>
                        <div className="text-xs leading-relaxed text-muted-foreground">
                          <strong className="text-foreground">Help understand</strong> lab results, prescription labels, and health documents.
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-50/60 p-3 dark:bg-rose-950/30">
                        <span className="text-rose-500 text-sm mt-0.5">✗</span>
                        <div className="text-xs leading-relaxed text-muted-foreground">
                          <strong className="text-foreground">Cannot diagnose</strong> — always check with your doctor for a proper diagnosis.
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-50/60 p-3 dark:bg-rose-950/30">
                        <span className="text-rose-500 text-sm mt-0.5">✗</span>
                        <div className="text-xs leading-relaxed text-muted-foreground">
                          <strong className="text-foreground">Not a substitute</strong> for professional medical advice, diagnosis, or treatment.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isRoleSlide && (
                  <div className="mt-4 w-full space-y-2">
                    {initialRole ? (
                      <div className="space-y-2">
                        {(() => {
                          const meta = roles.find((r) => r.id === initialRole)
                            ?? (initialRole === 'admin'
                              ? { label: 'Admin', desc: 'Platform management', icon: ShieldCheck, tint: 'from-emerald-600 to-teal-700' }
                              : { label: 'Patient', desc: 'Personal health assistant', icon: UserCircle, tint: 'from-emerald-500 to-teal-600' })
                          const MetaIcon = meta.icon
                          return (
                            <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 p-4 shadow-md">
                              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white', meta.tint)}>
                                <MetaIcon className="h-5 w-5" />
                              </span>
                              <div className="flex-1 text-left">
                                <p className="text-[11px] font-medium text-muted-foreground">Your account is registered as</p>
                                <p className="text-sm font-bold">{meta.label}</p>
                                <p className="text-[11px] text-muted-foreground">{meta.desc}</p>
                              </div>
                              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
                            </div>
                          )
                        })()}
                        <p className="px-2 text-center text-[11px] text-muted-foreground">
                          This is locked to the role you signed up with. Contact support to change it.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">I am a…</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {roles.map((r) => {
                            const Icon = r.icon
                            const selected = role === r.id
                            return (
                              <button key={r.id} onClick={() => setRole(r.id)}
                                className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all',
                                  selected ? 'border-emerald-500 bg-emerald-500/10 shadow-md' : 'border-border/60 bg-card/60 hover:border-emerald-500/30')}>
                                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white', r.tint)}>
                                  <Icon className="h-5 w-5" /></span>
                                <span className="text-xs font-semibold">{r.label}</span>
                                <span className="text-[10px] text-muted-foreground">{r.desc}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-6">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
          <div className="flex w-full flex-col items-center gap-3">
            <div className="flex w-full items-center gap-2">
              {stepPos > 0 ? (
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous step"
                  className="flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : (
                <span className="w-11 shrink-0" aria-hidden />
              )}
              {/* Segmented step rail — not thin line dots */}
              <div
                className="flex flex-1 items-center gap-1.5"
                role="progressbar"
                aria-valuenow={stepPos + 1}
                aria-valuemin={1}
                aria-valuemax={stepTotal}
                aria-label={`Step ${stepPos + 1} of ${stepTotal}`}
              >
                {walkOrder.map((stepIndex, i) => {
                  const done = i < stepPos
                  const active = i === stepPos
                  return (
                    <button
                      key={stepIndex}
                      type="button"
                      onClick={() => {
                        if (i <= stepPos) setIndex(stepIndex)
                      }}
                      className={cn(
                        'h-2 flex-1 rounded-full transition-all duration-300',
                        active && 'h-2.5 bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm shadow-emerald-500/40',
                        done && !active && 'bg-emerald-500/50',
                        !done && !active && 'bg-white/15',
                      )}
                      aria-label={`Step ${i + 1}`}
                      aria-current={active ? 'step' : undefined}
                    />
                  )
                })}
              </div>
              <span className="w-11 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                {stepPos + 1}/{stepTotal}
              </span>
            </div>
          </div>
          <Button
            onClick={next}
            disabled={!canComplete}
            variant="brand"
            size="cta"
            className="w-full gap-2 shadow-emerald-600/25 disabled:opacity-50"
          >
            {consentSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving consent…
              </>
            ) : isConsentSlide ? 'Accept & Continue' : isMedSlide ? (medSaved ? 'Get started' : 'Skip for now') : 'Continue'}
            {!consentSaving && <ArrowRight className="h-4 w-4" />}
          </Button>
          {isConsentSlide && consentError && (
            <p className="text-[11px] text-red-600" role="alert">{consentError}</p>
          )}
          {isConsentSlide && !allConsentGiven && (
            <p className="text-[11px] text-muted-foreground">Please accept all three to continue</p>
          )}
        </div>
      </div>
    </div>
  )
}

function WelcomeArt() {
  return (
    <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full max-w-md">
      <defs><linearGradient id="ob-grad-1" x1="0" y1="0" x2="280" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#10b981" /><stop offset="1" stopColor="#0d9488" /></linearGradient></defs>
      <path d="M140 18c42 0 78 22 96 60 18 38 12 88-22 116-30 25-86 26-126 8-40-18-64-58-58-102 6-44 42-82 110-82Z" fill="url(#ob-grad-1)" opacity="0.12" />
      <rect x="98" y="40" width="84" height="140" rx="18" fill="white" stroke="#0d9488" strokeOpacity="0.2" />
      <rect x="98" y="40" width="84" height="140" rx="18" fill="url(#ob-grad-1)" opacity="0.08" />
      <rect x="128" y="48" width="24" height="6" rx="3" fill="#0d9488" opacity="0.25" />
      <path d="M106 110 H124 L130 96 L138 130 L146 104 L152 110 H174" stroke="url(#ob-grad-1)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="174" cy="110" r="4" fill="#10b981" />
      <rect x="106" y="124" width="68" height="6" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="106" y="136" width="48" height="4" rx="2" fill="#94a3b8" opacity="0.6" />
      <motion.g animate={{ y: [0, -6, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} suppressHydrationWarning>
        <rect x="58" y="80" width="34" height="16" rx="8" fill="#10b981" transform="rotate(-15 75 88)" />
        <rect x="58" y="80" width="17" height="16" rx="8" fill="white" opacity="0.7" transform="rotate(-15 75 88)" />
      </motion.g>
      <motion.g animate={{ y: [0, 6, 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} suppressHydrationWarning>
        <rect x="190" y="120" width="34" height="16" rx="8" fill="#0d9488" transform="rotate(20 207 128)" />
        <rect x="190" y="120" width="17" height="16" rx="8" fill="white" opacity="0.7" transform="rotate(20 207 128)" />
      </motion.g>
      <motion.circle cx="64" cy="150" r="3" fill="#10b981" animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 2, repeat: Infinity }}  suppressHydrationWarning />
      <motion.circle cx="210" cy="74" r="3" fill="#0d9488" animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 2.4, repeat: Infinity }}  suppressHydrationWarning />
    </svg>
  )
}

function FamilyArt() {
  const members = [
    { c: '#10b981', x: 60, y: 130, label: 'Self' },
    { c: '#14b8a6', x: 110, y: 110, label: 'Parent' },
    { c: '#0d9488', x: 170, y: 110, label: 'You' },
    { c: '#0f766e', x: 220, y: 130, label: 'Grandparent' },
  ]
  return (
    <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full max-w-md">
      <defs><linearGradient id="ob-grad-2" x1="0" y1="0" x2="280" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#10b981" /><stop offset="1" stopColor="#0d9488" /></linearGradient></defs>
      <path d="M140 18c42 0 78 22 96 60 18 38 12 88-22 116-30 25-86 26-126 8-40-18-64-58-58-102 6-44 42-82 110-82Z" fill="url(#ob-grad-2)" opacity="0.12" />
      <circle cx="140" cy="80" r="22" fill="url(#ob-grad-2)" />
      <path d="M132 80 h5 l3 -7 l4 14 l3 -7 h6" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {members.map((m) => <line key={m.label} x1="140" y1="80" x2={m.x} y2={m.y} stroke="#0d9488" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="4 4" />)}
      {members.map((m, i) => (
        <motion.g key={m.label} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 220, damping: 14 }} suppressHydrationWarning>
          <circle cx={m.x} cy={m.y} r="20" fill={m.c} />
          <circle cx={m.x} cy={m.y - 4} r="6" fill="white" opacity="0.85" />
          <path d={`M${m.x - 9} ${m.y + 9} q9 -10 18 0`} stroke="white" strokeWidth="2.4" fill="white" opacity="0.85" strokeLinecap="round" />
        </motion.g>
      ))}
      <motion.circle cx="140" cy="80" r="22" fill="none" stroke="#10b981" strokeWidth="2" animate={{ r: [22, 36, 22], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.4, repeat: Infinity }}  suppressHydrationWarning />
    </svg>
  )
}

function MedsArt() {
  return (
    <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full max-w-md">
      <defs><linearGradient id="ob-grad-3" x1="0" y1="0" x2="280" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#10b981" /><stop offset="1" stopColor="#0d9488" /></linearGradient></defs>
      <path d="M140 18c42 0 78 22 96 60 18 38 12 88-22 116-30 25-86 26-126 8-40-18-64-58-58-102 6-44 42-82 110-82Z" fill="url(#ob-grad-3)" opacity="0.12" />
      <rect x="60" y="60" width="160" height="110" rx="14" fill="white" stroke="#0d9488" strokeOpacity="0.2" />
      <rect x="60" y="60" width="160" height="22" rx="14" fill="url(#ob-grad-3)" />
      <text x="74" y="76" fill="white" fontSize="11" fontWeight="600">Today · 3 reminders</text>
      {[0, 1, 2].map((i) => (
        <motion.g key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.12 }} suppressHydrationWarning>
          <rect x="74" y={94 + i * 22} width="12" height="12" rx="3" fill={i === 0 ? '#10b981' : '#e2e8f0'} />
          <rect x="94" y={96 + i * 22} width="70" height="4" rx="2" fill="#0f766e" opacity="0.6" />
          <rect x="94" y={103 + i * 22} width="40" height="3" rx="1.5" fill="#94a3b8" />
          {i === 0 && <circle cx="200" cy={100 + i * 22} r="6" fill="#10b981"><animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" /></circle>}
        </motion.g>
      ))}
      <motion.g animate={{ y: [0, -8, 0], rotate: [0, 8, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} suppressHydrationWarning>
        <rect x="200" y="34" width="34" height="14" rx="7" fill="#10b981" transform="rotate(-12 217 41)" />
        <rect x="200" y="34" width="17" height="14" rx="7" fill="white" opacity="0.7" transform="rotate(-12 217 41)" />
      </motion.g>
      <motion.g animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} suppressHydrationWarning>
        <path d="M50 50 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" fill="#0d9488" />
      </motion.g>
    </svg>
  )
}


function ConsentArt() {
  return (
    <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full max-w-md">
      <defs><linearGradient id="consent-grad" x1="0" y1="0" x2="280" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#10b981" /><stop offset="1" stopColor="#0d9488" /></linearGradient></defs>
      <circle cx="140" cy="100" r="70" fill="url(#consent-grad)" opacity="0.10" />
      <circle cx="140" cy="100" r="44" fill="white" stroke="#10b981" strokeOpacity="0.25" strokeWidth="2" />
      <motion.path d="M124 100 l8 8 l20 -20" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
      <motion.g animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 3, repeat: Infinity }} suppressHydrationWarning>
        <circle cx="80" cy="55" r="4" fill="#10b981" />
        <circle cx="200" cy="55" r="4" fill="#0d9488" />
        <circle cx="80" cy="155" r="4" fill="#14b8a6" />
        <circle cx="200" cy="155" r="4" fill="#10b981" />
      </motion.g>
    </svg>
  )
}

function RoleArt() {
  const items = [
    { c: '#10b981', x: 70, y: 100, label: 'S' },
    { c: '#14b8a6', x: 140, y: 70, label: 'P' },
    { c: '#0891b2', x: 210, y: 100, label: 'G' },
    { c: '#0f766e', x: 140, y: 150, label: 'C' },
  ]
  return (
    <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full max-w-md">
      <defs><linearGradient id="ob-grad-4" x1="0" y1="0" x2="280" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#10b981" /><stop offset="1" stopColor="#0891b2" /></linearGradient></defs>
      <path d="M140 18c42 0 78 22 96 60 18 38 12 88-22 116-30 25-86 26-126 8-40-18-64-58-58-102 6-44 42-82 110-82Z" fill="url(#ob-grad-4)" opacity="0.12" />
      {items.map((r, i) => (
        <motion.g key={r.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * i, type: 'spring', stiffness: 200, damping: 14 }} suppressHydrationWarning>
          <circle cx={r.x} cy={r.y} r="26" fill={r.c} />
          <text x={r.x} y={r.y + 5} textAnchor="middle" fill="white" fontSize="16" fontWeight="700">{r.label}</text>
        </motion.g>
      ))}
      <motion.circle cx="140" cy="95" r="4" fill="#10b981" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.8, repeat: Infinity }}  suppressHydrationWarning />
      <line x1="80" y1="130" x2="200" y2="130" stroke="#0d9488" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 4" />
    </svg>
  )
}
