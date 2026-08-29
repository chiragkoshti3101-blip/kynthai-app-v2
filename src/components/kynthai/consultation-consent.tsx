'use client'

import * as React from 'react'
import { AlertTriangle, ShieldCheck, Stethoscope } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'

interface ConsultationConsentProps {
  open: boolean
  doctorName: string
  specialization: string
  consultationFee: number
  currency?: string
  onConfirm: () => void
  onCancel: () => void
  confirming?: boolean
}

export function ConsultationConsent({
  open,
  doctorName,
  specialization,
  consultationFee,
  currency = 'USD',
  onConfirm,
  onCancel,
  confirming = false,
}: ConsultationConsentProps) {
  const [acknowledged, setAcknowledged] = React.useState(false)

  // Reset when dialog opens/closes
  React.useEffect(() => {
    if (!open) setAcknowledged(false)
  }, [open])

  const canProceed = acknowledged && !confirming

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !confirming && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Consultation Liability Acknowledgment
          </DialogTitle>
          <DialogDescription>
            You are about to book a consultation with{' '}
            <span className="font-semibold text-foreground">{doctorName}</span>{' '}
            ({specialization}). Please read the following carefully before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Doctor info summary */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Doctor</span>
              <span className="font-medium">{doctorName}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Specialization</span>
              <span className="font-medium">{specialization}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Consultation fee</span>
              <span className="font-medium">
                {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}
                {consultationFee}
              </span>
            </div>
          </div>

          <Separator />

          {/* Key liability points */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-foreground">Kynthai is NOT a healthcare provider</p>
                <p className="mt-1 text-muted-foreground">
                  Kynthai is a technology platform only. We do not employ, supervise, or control any
                  doctor on our platform. This doctor is an independent practitioner.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3">
              <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-semibold text-foreground">Doctor bears sole responsibility</p>
                <p className="mt-1 text-muted-foreground">
                  Any medical advice, diagnosis, treatment, or prescription you receive comes
                  exclusively from this doctor. Kynthai is not liable for any medical negligence,
                  misdiagnosis, incorrect treatment, or malpractice by the doctor.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-semibold text-foreground">You are responsible for verifying credentials</p>
                <p className="mt-1 text-muted-foreground">
                  You should independently verify the doctor&apos;s qualifications, licensing, and
                  credentials. Kynthai does not guarantee the quality or accuracy of medical services.
                </p>
              </div>
            </div>
          </div>

          {/* Checkbox */}
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <Checkbox
              id="consent-check"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(!!v)}
            />
            <label
              htmlFor="consent-check"
              className="text-sm leading-relaxed cursor-pointer select-none"
            >
              I understand and agree that:{' '}
              <span className="font-medium text-foreground">
                Kynthai is a technology platform only and is not a healthcare provider.
              </span>{' '}
              The doctor I am booking is an independent practitioner solely responsible for their
              own medical advice and treatment. I will not hold Kynthai liable for any medical
              negligence, misdiagnosis, or incorrect treatment by this doctor. I understand this
              consultation does not establish a doctor-patient relationship with Kynthai.
            </label>
          </div>

          {/* Emergency notice */}
          <p className="text-xs text-muted-foreground">
            <strong>Emergency:</strong> If you are experiencing a medical emergency, call{' '}
            contact local emergency services immediately. Do not use Kynthai for emergency medical care.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canProceed}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
          >
            {confirming ? 'Booking...' : 'I Agree — Book Consultation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
