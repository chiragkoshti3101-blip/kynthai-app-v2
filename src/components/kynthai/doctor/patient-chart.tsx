'use client'

import * as React from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Download,
  FileText,
  HeartPulse,
  Loader2,
  Pill,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export interface DoctorPatientChart {
  patient: {
    id: string
    name: string
    email: string
    phone: string | null
    age: number | null
    allergies: string[]
    consent: { termsAccepted: boolean; clinicalDataSharing: boolean }
  }
  summary: {
    activeMedicationCount: number
    totalMedicationCount: number
    chronicConditionCount: number
    prescriptionCount: number
    encounterCount: number
    sharedDocumentCount: number
  }
  chronicConditions: Array<{
    id: string
    name: string
    diagnosedDate: string | null
    severity: string
    medications: string[]
    notes: string | null
    active: boolean
    createdAt: string
  }>
  medications: Array<{
    id: string
    name: string
    dosage: string | null
    frequency: string
    times: string[]
    instructions: string | null
    notes: string | null
    active: boolean
    createdAt: string
    updatedAt: string
    adherence: { sampleSize: number; taken: number; percentage: number | null }
  }>
  prescriptions: Array<{
    id: string
    medications: unknown
    notes: string | null
    followUpDate: string | null
    followUpNotes: string | null
    createdAt: string
    prescriber: { name: string; specialization: string }
  }>
  appointments: Array<{
    id: string
    scheduledAt: string
    type: string
    status: string
    reason: string | null
    notes: string | null
    doctor: { name: string; specialization: string }
  }>
  labHistory: Array<{
    id: string
    labName: string
    tests: unknown
    scheduledAt: string
    status: string
    resultsAvailable: boolean
    notes: string | null
    resultsNote: string | null
    resultUploadedAt: string | null
    resultsShared: boolean
    resultDownloadPath: string | null
  }>
  consultationNotes: Array<{
    id: string
    content: string | null
    type: string
    createdAt: string
  }>
  documents: Array<{
    id: string
    type: string
    category: string
    title: string
    description: string | null
    mimeType: string
    fileSize: number
    visibility: string
    uploadedAt: string
    downloadPath: string
  }>
  access: {
    relationship: string
    privateJournalsExcluded: boolean
    privateDocumentsExcluded: boolean
  }
}

export function PatientChart({
  chart,
  loading,
  error,
  isDemo,
  onRetry,
}: {
  chart: DoctorPatientChart | null
  loading: boolean
  error: string | null
  isDemo: boolean
  onRetry?: () => void
}) {
  if (isDemo) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-50/60 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        Demo patient record — the chart below is illustrative only. Real patient data is loaded only for an authenticated, verified doctor with a treatment relationship.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the authorized clinical chart…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p>{error}</p>
          {onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry} className="mt-2 h-8 text-xs">
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (!chart) return null

  const formatDate = (value: string | null | undefined) => {
    if (!value) return 'Not recorded'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  }
  const formatDateTime = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  const medicationItems = (value: unknown) => {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Authorized clinical view with the complete permitted longitudinal history. Treatment relationship: {chart.access.relationship}. Private journals and private documents are excluded; every chart view is audit logged.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="Active medicines" value={chart.summary.activeMedicationCount} />
        <Metric label="Conditions" value={chart.summary.chronicConditionCount} />
        <Metric label="Prescriptions" value={chart.summary.prescriptionCount} />
        <Metric label="Encounters" value={chart.summary.encounterCount} />
        <Metric label="Shared documents" value={chart.summary.sharedDocumentCount} />
        <Metric label="Age" value={chart.patient.age == null ? '—' : `${chart.patient.age}y`} />
      </div>

      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardContent className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <p className="text-sm font-semibold">Allergies</p>
          </div>
          {chart.patient.allergies.length ? (
            <div className="flex flex-wrap gap-1.5">
              {chart.patient.allergies.map((allergy) => <Badge key={allergy} variant="destructive" className="text-[10px]">{allergy}</Badge>)}
            </div>
          ) : <p className="text-xs text-muted-foreground">No allergies recorded — confirm with the patient before prescribing.</p>}
        </CardContent>
      </Card>

      <Section title="Chronic conditions" icon={<HeartPulse className="h-4 w-4 text-rose-600" />} empty="No chronic conditions recorded.">
        {chart.chronicConditions.map((condition) => (
          <div key={condition.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{condition.name}</p>
                <p className="text-[11px] text-muted-foreground">Diagnosed: {condition.diagnosedDate || 'Not recorded'}</p>
              </div>
              <Badge variant={condition.active ? 'secondary' : 'outline'} className="text-[10px]">{condition.active ? 'Active' : 'History'}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Severity: {condition.severity || 'Not recorded'}</p>
            {condition.medications.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Related medicines: {condition.medications.join(', ')}</p>}
            {condition.notes && <p className="mt-2 whitespace-pre-wrap text-xs">{condition.notes}</p>}
          </div>
        ))}
      </Section>

      <Section title="Medication history" icon={<Pill className="h-4 w-4 text-emerald-600" />} empty="No medication history recorded.">
        {chart.medications.map((medication) => (
          <div key={medication.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{medication.name} {medication.dosage && <span className="font-normal text-muted-foreground">· {medication.dosage}</span>}</p>
                <p className="text-[11px] text-muted-foreground">{medication.frequency || 'Frequency not recorded'}{medication.times.length ? ` · ${medication.times.join(', ')}` : ''}</p>
              </div>
              <Badge variant={medication.active ? 'secondary' : 'outline'} className="text-[10px]">{medication.active ? 'Current' : 'Inactive'}</Badge>
            </div>
            {medication.adherence.sampleSize > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Progress value={medication.adherence.percentage ?? 0} className="h-1.5 flex-1" />
                <span>{medication.adherence.percentage}% adherence ({medication.adherence.taken}/{medication.adherence.sampleSize})</span>
              </div>
            )}
            {medication.instructions && <p className="mt-2 text-xs"><span className="font-medium">Instructions:</span> {medication.instructions}</p>}
            {medication.notes && <p className="mt-1 text-xs text-muted-foreground">{medication.notes}</p>}
            <p className="mt-2 text-[10px] text-muted-foreground">Updated {formatDate(medication.updatedAt)}</p>
          </div>
        ))}
      </Section>

      <Section title="Prescription history" icon={<FileText className="h-4 w-4 text-blue-600" />} empty="No prescriptions recorded.">
        {chart.prescriptions.map((prescription) => (
          <div key={prescription.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{formatDate(prescription.createdAt)}</p>
                <p className="text-[11px] text-muted-foreground">{prescription.prescriber.name} · {prescription.prescriber.specialization}</p>
              </div>
              {prescription.followUpDate && <Badge variant="outline" className="text-[10px]">Follow-up {formatDate(prescription.followUpDate)}</Badge>}
            </div>
            <div className="mt-2 space-y-1">
              {medicationItems(prescription.medications).map((item, index) => (
                <p key={`${prescription.id}-${index}`} className="text-xs">
                  <span className="font-medium">{String(item.name ?? 'Medicine')}</span>{item.dosage ? ` · ${String(item.dosage)}` : ''}{item.frequency ? ` · ${String(item.frequency)}` : ''}
                </p>
              ))}
            </div>
            {prescription.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{prescription.notes}</p>}
            {prescription.followUpNotes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Follow-up: {prescription.followUpNotes}</p>}
          </div>
        ))}
      </Section>

      <Section title="Encounter history" icon={<CalendarDays className="h-4 w-4 text-violet-600" />} empty="No encounters recorded.">
        {chart.appointments.map((appointment) => (
          <div key={appointment.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium">{formatDateTime(appointment.scheduledAt)}</p>
              <p className="text-[11px] text-muted-foreground">{appointment.doctor.name} · {appointment.doctor.specialization}</p>
              {appointment.reason && <p className="mt-1 text-xs">Reason: {appointment.reason}</p>}
              {appointment.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Clinical note: {appointment.notes}</p>}
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{appointment.type.replace('_', ' ')} · {appointment.status.replace('_', ' ')}</Badge>
          </div>
        ))}
      </Section>

      <Section title="Laboratory history" icon={<FileText className="h-4 w-4 text-amber-600" />} empty="No laboratory bookings recorded.">
        {chart.labHistory.map((booking) => (
          <div key={booking.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{booking.labName}</p>
                <p className="text-[11px] text-muted-foreground">{formatDateTime(booking.scheduledAt)}</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{booking.status.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {medicationItems(booking.tests).map((item, index) => (
                <Badge key={`${booking.id}-${index}`} variant="secondary" className="text-[10px]">{String(item.name ?? 'Laboratory test')}</Badge>
              ))}
            </div>
            {booking.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">Collection note: {booking.notes}</p>}
            {booking.resultsAvailable ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                <p>
                  Results uploaded {booking.resultUploadedAt ? formatDate(booking.resultUploadedAt) : ''}{booking.resultsShared ? ' and shared with a doctor.' : ' — patient sharing is still required for the report file.'}
                </p>
                {booking.resultDownloadPath && (
                  <a href={booking.resultDownloadPath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 font-medium hover:bg-emerald-500/10">
                    <Download className="h-3 w-3" /> Open report
                  </a>
                )}
              </div>
            ) : <p className="mt-2 text-xs text-muted-foreground">No result file recorded yet.</p>}
            {booking.resultsNote && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Lab note: {booking.resultsNote}</p>}
          </div>
        ))}
      </Section>

      <Section title="Your consultation notes" icon={<Stethoscope className="h-4 w-4 text-teal-600" />} empty="No notes recorded for this patient.">
        {chart.consultationNotes.map((note) => (
          <div key={note.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary" className="text-[10px] capitalize">{note.type.replace('-', ' ')}</Badge>
              <span className="text-[10px] text-muted-foreground">{formatDateTime(note.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs">{note.content || 'Empty note'}</p>
          </div>
        ))}
      </Section>

      <Section title="Shared clinical documents" icon={<FileText className="h-4 w-4 text-amber-600" />} empty="No documents shared with doctors.">
        {chart.documents.map((document) => (
          <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{document.title}</p>
              <p className="text-[11px] text-muted-foreground">{document.type.replaceAll('_', ' ')} · {formatDate(document.uploadedAt)}</p>
            </div>
            <a href={document.downloadPath} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
              <Download className="h-3 w-3" /> Open
            </a>
          </div>
        ))}
      </Section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border/60 p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  )
}

function Section({
  title,
  icon,
  empty,
  children,
}: {
  title: string
  icon: React.ReactNode
  empty: string
  children: React.ReactNode
}) {
  const hasChildren = React.Children.count(children) > 0
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2 border-b border-border/40 pb-2">
          {icon}
          <p className="text-sm font-semibold">{title}</p>
        </div>
        {hasChildren ? children : <p className="py-2 text-xs text-muted-foreground">{empty}</p>}
      </CardContent>
    </Card>
  )
}
