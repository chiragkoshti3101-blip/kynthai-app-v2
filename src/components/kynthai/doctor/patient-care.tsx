'use client'

/**
 * PatientCare — Doctor's patient-care section.
 *
 * - "Prescribe" dialog: pick patient by email + add multiple medications
 *   (name, dosage, frequency, instructions) + optional follow-up date.
 *   Submits POST /api/doctors/prescribe. After success, shows the invite
 *   link with a copy button.
 * - Patient list pulled from GET /api/doctors/patients/adherence with
 *   adherence tracking, today's progress, and 7-day adherence bar.
 * - "Nudge" button per patient → POST /api/doctors/nudge.
 * - "Copy invite link" per patient (if a prescription exists).
 */

import * as React from 'react'
import {
  Pill,
  Plus,
  Trash2,
  Loader2,
  Send,
  Bell,
  Copy,
  Check,
  Users,
  Activity,
  AlertCircle,
  Stethoscope,
  FileText,

  BookOpen,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { t, initLanguage } from '@/lib/i18n'
import { LoadingState } from '@/components/kynthai/loading-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientAdherence {
  id: string
  name: string
  email: string
  medications: number
  todayReminders: number
  takenToday: number
  weekReminders: number
  takenWeek: number
  adherence: number
  inviteLink?: string | null
}

interface MedInput {
  name: string
  dosage: string
  frequency: string
  instructions: string
  times: string[]
}

interface PrescribeResult {
  prescription?: {
    id: string
    inviteLink: string
    inviteToken: string
    medications: Array<{ name: string; dosage: string; frequency: string }>
    followUpDate: string | null
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatientCare({ onPatientClick, isDemo = false }: { onPatientClick?: (patient: PatientAdherence) => void; isDemo?: boolean } = {}) {
  const { toast } = useToast()
  React.useEffect(() => { initLanguage() }, [])
  const [patients, setPatients] = React.useState<PatientAdherence[]>([])
  const [loading, setLoading] = React.useState(true)
  const [prescribeOpen, setPrescribeOpen] = React.useState(false)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    if (isDemo) {
      setPatients([
        { id: 'dp1', name: 'Alex Johnson', email: 'alex@example.com', medications: 2, todayReminders: 3, takenToday: 2, weekReminders: 21, takenWeek: 18, adherence: 86, inviteLink: '/invite?t=demo' },
        { id: 'dp2', name: 'Jordan Smith', email: 'jordan@example.com', medications: 1, todayReminders: 1, takenToday: 0, weekReminders: 7, takenWeek: 5, adherence: 71 },
        { id: 'dp3', name: 'Casey Lee', email: 'casey@example.com', medications: 3, todayReminders: 4, takenToday: 4, weekReminders: 28, takenWeek: 27, adherence: 96 },
      ])
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/doctors/patients/adherence', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setPatients(data.patients ?? [])
    } catch {
      // Show empty state on error
      setPatients([])
    } finally {
      setLoading(false)
    }
  }, [isDemo])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleNudge = React.useCallback(
    async (p: PatientAdherence) => {
      if (isDemo || p.id.startsWith('dp')) {
        toast({
          title: t('nudge_sent'),
          description: `${p.name.split(' ')[0]} ${t('has_been_notified')}`,
        })
        return
      }
      try {
        const res = await fetch('/api/doctors/nudge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: p.id,
            message: `Hi ${p.name.split(' ')[0]}, gentle reminder to take your medications on time. — Kynthai`,
            channel: 'in-app',
          }),
        })
        if (!res.ok) throw new Error('Failed')
        toast({
          title: t('nudge_sent'),
          description: `${p.name.split(' ')[0]} ${t('has_been_notified')}`,
        })
      } catch {
        toast({ title: t('could_not_nudge'), description: t('try_again_later'), variant: 'destructive' })
      }
    },
    [toast, isDemo],
  )

  const copyInvite = React.useCallback(
    async (p: PatientAdherence) => {
      if (!p.inviteLink) return
      const url = `${window.location.origin}${p.inviteLink}`
      try {
        await navigator.clipboard.writeText(url)
        setCopiedId(p.id)
        setTimeout(() => setCopiedId(null), 2000)
        toast({ title: t('invite_copied'), description: url })
      } catch {
        toast({ title: t('copy_failed'), description: url, variant: 'destructive' })
      }
    },
    [toast],
  )

  // Stats
  const totalPatients = patients.length
  const avgAdherence = totalPatients
    ? Math.round(patients.reduce((s, p) => s + p.adherence, 0) / totalPatients)
    : 0
  const needsAttention = patients.filter((p) => p.adherence < 60 || p.todayReminders - p.takenToday > 0).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            {t('patient_care')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('prescribe_track_nudge')}
          </p>
        </div>
        <Button onClick={() => setPrescribeOpen(true)} className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
          <Pill className="h-4 w-4" />
          {t('prescribe')}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label={t('patients')} value={totalPatients} tint="emerald" />
        <StatCard icon={<Activity className="h-4 w-4" />} label={t('avg_adherence')} value={`${avgAdherence}%`} tint="teal" />
        <StatCard icon={<AlertCircle className="h-4 w-4" />} label={t('needs_attention')} value={needsAttention} tint="amber" />
        <StatCard icon={<Pill className="h-4 w-4" />} label={t('active_meds')} value={patients.reduce((s, p) => s + p.medications, 0)} tint="cyan" />
      </div>

      {/* Patient list */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('your_patients')}</h3>
        {loading ? (
          <LoadingState label="Loading patients…" fullPage={false} />
        ) : patients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <Stethoscope className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t('no_patients')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('add_patient_prescribe')}
                </p>
              </div>
              <Button onClick={() => setPrescribeOpen(true)} size="sm" variant="outline" className="mt-1 border-emerald-500/40 text-emerald-600">
                <Plus className="h-3.5 w-3.5" />
                {t('prescribe_to_patient')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {patients.map((p) => (
              <PatientCard
                key={p.id}
                patient={p}
                onNudge={() => handleNudge(p)}
                onCopyInvite={() => copyInvite(p)}
                copied={copiedId === p.id}
                onClick={() => onPatientClick?.(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Prescribe dialog */}
      <PrescribeDialog
        open={prescribeOpen}
        onOpenChange={setPrescribeOpen}
        onPrescribed={(result) => {
          toast({
            title: 'Prescription sent',
            description: `Patient added. Invite link: ${result.prescription?.inviteLink ?? '/invite'}`,
          })
          void load()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// PatientCard
// ---------------------------------------------------------------------------

function PatientCard({
  patient,
  onNudge,
  onCopyInvite,
  copied,
  onClick,
}: {
  patient: PatientAdherence
  onNudge: () => void
  onCopyInvite: () => void
  copied: boolean
  onClick?: () => void
}) {
  const todayPct = patient.todayReminders
    ? Math.round((patient.takenToday / patient.todayReminders) * 100)
    : 0
  const adherenceColor =
    patient.adherence >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : patient.adherence >= 60
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400'

  return (
    <Card
      className={cn(patient.adherence < 60 && 'ring-1 ring-amber-500/20', onClick && 'cursor-pointer hover:ring-2 hover:ring-emerald-500/30 transition-all')}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs">
              {patient.name[0]?.toUpperCase() ?? 'P'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{patient.name}</p>
              <Badge variant="outline" className={cn('text-[10px]', adherenceColor)}>
                {patient.adherence}%
              </Badge>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{patient.email}</p>
          </div>
        </div>

        {/* Today + week progress */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-border/60 p-2">
            <p className="text-muted-foreground">Today</p>
            <p className="font-semibold">
              {patient.takenToday}/{patient.todayReminders} taken
            </p>
            <Progress value={todayPct} className="mt-1 h-1" />
          </div>
          <div className="rounded-lg border border-border/60 p-2">
            <p className="text-muted-foreground">7-day</p>
            <p className="font-semibold">
              {patient.takenWeek}/{patient.weekReminders} taken
            </p>
            <Progress value={patient.adherence} className="mt-1 h-1" />
          </div>
        </div>

        {/* Meds count + low-adherence flag */}
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {patient.medications} {patient.medications === 1 ? t('med') : t('meds')}
          </Badge>
          {patient.adherence < 60 && (
            <Badge variant="secondary" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px]">
              {t('low_adherence')}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={onNudge} className="flex-1 h-8 text-xs">
            <Bell className="h-3 w-3" />
            {t('nudge')}
          </Button>
          {patient.inviteLink && (
            <Button size="sm" variant="outline" onClick={onCopyInvite} className="flex-1 h-8 text-xs">
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              {copied ? t('copied') : t('invite_link')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PrescribeDialog
// ---------------------------------------------------------------------------

function PrescribeDialog({
  open,
  onOpenChange,
  onPrescribed,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPrescribed: (result: PrescribeResult) => void
}) {
  const { toast } = useToast()
  const [patientEmail, setPatientEmail] = React.useState('')
  const [patientSearch, setPatientSearch] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<Array<{ id: string; name: string; email: string; allergies?: string }>>([])
  const [searching, setSearching] = React.useState(false)
  const [patientAllergies, setPatientAllergies] = React.useState<string[]>([])
  const [followUpDate, setFollowUpDate] = React.useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().split('T')[0]
  })
  const [notes, setNotes] = React.useState('')
  const [meds, setMeds] = React.useState<MedInput[]>([
    { name: '', dosage: '', frequency: 'Twice daily', instructions: '', times: ['09:00', '21:00'] },
  ])
  const [submitting, setSubmitting] = React.useState(false)
  const [inviteLink, setInviteLink] = React.useState<string | null>(null)
  const [linkCopied, setLinkCopied] = React.useState(false)

  // Templates
  type Template = { id: string; name: string; medications: Array<{ name: string; dosage: string; frequency: string; instructions?: string }> }
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [templatesLoaded, setTemplatesLoaded] = React.useState(false)
  const [showTemplates, setShowTemplates] = React.useState(false)
  const [templateName, setTemplateName] = React.useState('')
  const [showSaveTemplate, setShowSaveTemplate] = React.useState(false)

  const reset = React.useCallback(() => {
    setPatientEmail('')
    const d = new Date()
    d.setDate(d.getDate() + 14)
    setFollowUpDate(d.toISOString().split('T')[0])
    setNotes('')
    setMeds([{ name: '', dosage: '', frequency: 'Twice daily', instructions: '', times: ['09:00', '21:00'] }])
    setInviteLink(null)
    setLinkCopied(false)
    setShowTemplates(false)
    setShowSaveTemplate(false)
    setTemplateName('')
  }, [])

  React.useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  // Load templates on first open
  React.useEffect(() => {
    if (open && !templatesLoaded) {
      fetch('/api/doctors/templates', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { setTemplates(d.templates ?? []); setTemplatesLoaded(true) })
        .catch(() => setTemplatesLoaded(true))
    }
  }, [open, templatesLoaded])

  // Search patients by name, email, or phone
  React.useEffect(() => {
    if (patientSearch.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/doctors/patients/search?q=${encodeURIComponent(patientSearch)}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.patients ?? [])
        }
      } catch { /* ignore */ }
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [patientSearch])

  const loadTemplate = (tpl: Template) => {
    setMeds(tpl.medications.map((m) => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      instructions: m.instructions ?? '',
      times: ['09:00'],
    })))
    setShowTemplates(false)
    toast({ title: 'Template loaded', description: `"${tpl.name}" applied to medications.` })
  }

  const deleteTemplate = async (tpl: Template) => {
    try {
      await fetch(`/api/doctors/templates?id=${tpl.id}`, { method: 'DELETE' })
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id))
      toast({ title: 'Template deleted' })
    } catch { /* ignore */ }
  }

  const saveAsTemplate = async () => {
    const validMeds = meds.filter((m) => m.name.trim() && m.dosage.trim())
    if (!templateName.trim()) {
      toast({ title: 'Template name required', variant: 'destructive' })
      return
    }
    if (validMeds.length === 0) {
      toast({ title: 'Add medications first', variant: 'destructive' })
      return
    }
    try {
      const res = await fetch('/api/doctors/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          medications: validMeds.map((m) => ({ name: m.name.trim(), dosage: m.dosage.trim(), frequency: m.frequency, instructions: m.instructions.trim() })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates((prev) => [...prev, data.template])
        setShowSaveTemplate(false)
        setTemplateName('')
        toast({ title: 'Template saved', description: `"${templateName.trim()}" saved for future use.` })
      }
    } catch { /* ignore */ }
  }

  const addMed = () => {
    setMeds((m) => [...m, { name: '', dosage: '', frequency: 'Once daily', instructions: '', times: ['09:00'] }])
  }

  const removeMed = (idx: number) => {
    setMeds((m) => m.filter((_, i) => i !== idx))
  }

  const updateMed = (idx: number, patch: Partial<MedInput>) => {
    setMeds((m) => m.map((med, i) => (i === idx ? { ...med, ...patch } : med)))
  }

  const [interactionWarning, setInteractionWarning] = React.useState<string | null>(null)
  const [checkingInteractions, setCheckingInteractions] = React.useState(false)

  const checkInteractions = async (medNames: string[]) => {
    if (medNames.length < 2) {
      setInteractionWarning(null)
      return true
    }
    setCheckingInteractions(true)
    try {
      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medications: medNames }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.riskLevel === 'high' || data.riskLevel === 'moderate') {
          const severe = (data.interactions ?? []).filter((i: { severity: string }) => i.severity === 'severe' || i.severity === 'moderate')
          if (severe.length > 0) {
            setInteractionWarning(
              `⚠️ ${severe.length} interaction(s) found:\n` +
              severe.map((i: { medications: string[]; description: string }) =>
                `${i.medications.join(' + ')}: ${i.description}`
              ).join('\n')
            )
            setCheckingInteractions(false)
            return false
          }
        }
      }
    } catch { /* ignore — proceed without check */ }
    setInteractionWarning(null)
    setCheckingInteractions(false)
    return true
  }

  const submit = async () => {
    if (!patientEmail.trim()) {
      toast({ title: t('patient_email_required'), variant: 'destructive' })
      return
    }
    const validMeds = meds.filter((m) => m.name.trim() && m.dosage.trim())
    if (validMeds.length === 0) {
      toast({ title: t('add_medication_required'), variant: 'destructive' })
      return
    }

    // Check drug interactions before prescribing
    const medNames = validMeds.map((m) => `${m.name.trim()} ${m.dosage.trim()}`)
    const safe = await checkInteractions(medNames)
    if (!safe) return // User must confirm after seeing warning

    const followUpIso = followUpDate ? new Date(followUpDate + 'T00:00:00').toISOString() : undefined

    setSubmitting(true)
    try {
      const res = await fetch('/api/doctors/prescribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientEmail: patientEmail.trim().toLowerCase(),
          medications: validMeds.map((m) => ({
            name: m.name.trim(),
            dosage: m.dosage.trim(),
            frequency: m.frequency,
            instructions: m.instructions.trim(),
            times: m.times,
          })),
          notes: notes.trim() || undefined,
          followUpDate: followUpIso,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to prescribe')
      }
      const result = data as PrescribeResult
      setInviteLink(result.prescription?.inviteLink ?? '/invite')
      onPrescribed(result)
      toast({
        title: t('prescription_created'),
        description: `${validMeds.length} ${t('medications_added')}`,
      })
    } catch (e) {
      toast({
        title: t('could_not_prescribe'),
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const copyInvite = async () => {
    if (!inviteLink) return
    const url = `${window.location.origin}${inviteLink}`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
      toast({ title: 'Invite link copied' })
    } catch {
      toast({ title: 'Copy failed', description: url, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('create_prescription')}</DialogTitle>
          <DialogDescription>
            {t('create_prescription_desc')}
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 py-2">
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {t('prescription_sent')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('share_invite_link')}
                </p>
                <div className="mt-3 flex gap-2">
                  <Input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}${inviteLink}`} className="font-mono text-xs" />
                  <Button onClick={copyInvite} size="icon" variant="outline">
                    {linkCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('close')}</Button>
              <Button onClick={reset} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                {t('prescribe_again_button')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1 relative">
              {/* Load template */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowTemplates(!showTemplates)}
                >
                  <BookOpen className="h-3 w-3" />
                  {showTemplates ? 'Hide templates' : 'Load template'}
                </Button>
              </div>
              {showTemplates && (
                <Card className="bg-muted/30">
                  <CardContent className="p-3 space-y-2">
                    {templates.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">No saved templates yet.</p>
                    ) : (
                      templates.map((tpl) => (
                        <div key={tpl.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                          <button
                            className="flex-1 text-left"
                            onClick={() => loadTemplate(tpl)}
                          >
                            <p className="text-xs font-semibold">{tpl.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {tpl.medications.map((m) => `${m.name} ${m.dosage}`).join(', ')}
                            </p>
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => deleteTemplate(tpl)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Patient search + follow-up */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-search">Search Patient (name, email, or phone)</Label>
                  <div className="relative">
                    <Input
                      id="p-search"
                      type="text"
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value)
                        if (!e.target.value) setPatientEmail('')
                      }}
                      placeholder="Search by name, email, or phone..."
                    />
                    {searching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border bg-background shadow-lg">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            setPatientEmail(p.email)
                            setPatientSearch(`${p.name} (${p.email})`)
                            setSearchResults([])
                            // Parse allergies
                            if (p.allergies) {
                              try { setPatientAllergies(JSON.parse(p.allergies)) } catch { setPatientAllergies([]) }
                            } else {
                              setPatientAllergies([])
                            }
                          }}
                        >
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {patientEmail && (
                    <p className="text-xs text-emerald-600">Selected: {patientEmail}</p>
                  )}
                  {patientAllergies.length > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">⚠️ Known Allergies</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {patientAllergies.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-followup">{t('follow_up_date')}</Label>
                  <Input
                    id="p-followup"
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Medications */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t('medications')} ({meds.length})</Label>
                  <Button size="sm" variant="outline" onClick={addMed} className="h-7 text-xs">
                    <Plus className="h-3 w-3" />
                    {t('add_medication')}
                  </Button>
                </div>

                {meds.map((m, idx) => (
                  <Card key={idx} className="bg-muted/30">
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t('medication_number')} {idx + 1}
                        </span>
                        {meds.length > 1 && (
                          <Button size="icon" variant="ghost" onClick={() => removeMed(idx)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder={t('name_placeholder')}
                          value={m.name}
                          onChange={(e) => updateMed(idx, { name: e.target.value })}
                        />
                        <Input
                          placeholder={t('dosage_placeholder')}
                          value={m.dosage}
                          onChange={(e) => updateMed(idx, { dosage: e.target.value })}
                        />
                      </div>
                      <Input
                        placeholder={t('frequency_placeholder')}
                        value={m.frequency}
                        onChange={(e) => updateMed(idx, { frequency: e.target.value })}
                      />
                      <Textarea
                        placeholder={t('instructions_optional')}
                        value={m.instructions}
                        onChange={(e) => updateMed(idx, { instructions: e.target.value })}
                        rows={2}
                        className="text-xs"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="p-notes">{t('notes_optional')}</Label>
                <Textarea
                  id="p-notes"
                  rows={2}
                  placeholder={t('general_notes')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Save as template */}
              {showSaveTemplate ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                  <Input
                    placeholder="Template name (e.g. Diabetes regimen)"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="h-7 text-xs flex-1"
                  />
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={saveAsTemplate}>
                    <Save className="h-3 w-3" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowSaveTemplate(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 self-start"
                  onClick={() => setShowSaveTemplate(true)}
                >
                  <FileText className="h-3 w-3" />
                  Save as template
                </Button>
              )}
            </div>

            {/* Drug interaction warning */}
            {interactionWarning && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-3">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Drug Interaction Alert</p>
                  <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{interactionWarning}</pre>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setInteractionWarning(null)}
                    >
                      Edit Medications
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={() => {
                        setInteractionWarning(null)
                        submit()
                      }}
                    >
                      Prescribe Anyway
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {checkingInteractions && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking drug interactions...
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
              <Button
                onClick={submit}
                disabled={submitting}
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t('send_prescription')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tint: 'emerald' | 'cyan' | 'teal' | 'amber'
}) {
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  }[tint]
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">
          <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md', cls)}>
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        <div className={cn('text-xl font-bold', cls.split(' ').slice(1).join(' '))}>{value}</div>
      </CardContent>
    </Card>
  )
}
