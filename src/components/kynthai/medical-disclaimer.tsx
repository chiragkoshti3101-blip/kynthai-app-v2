'use client'

/**
 * MedicalDisclaimer — compact disclaimer shown on all AI-powered features.
 *
 * Legal protection: clarifies that AI outputs are informational only,
 * not medical advice. Required for general medical liability defense
 * and compliance with applicable US federal and state regulations.
 *
 * Use: <MedicalDisclaimer /> or <MedicalDisclaimer compact />
 */

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MedicalDisclaimer({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <p className={cn('text-[10px] text-muted-foreground italic', className)}>
        <AlertTriangle className="inline h-3 w-3 mr-1" />
        AI-generated informational content only. Not medical advice. Consult a qualified healthcare professional. In a medical emergency, contact local emergency services immediately. Kynthai SOS is a separate in-app alert tool and does not connect to emergency dispatch services.
      </p>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/30 bg-amber-500/5 p-3',
        className
      )}
    >
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <span>
          <strong className="text-foreground">Medical disclaimer:</strong> This AI-generated information is for general guidance only and is not a substitute for professional medical advice, diagnosis, or treatment under applicable federal and state laws. Always consult a qualified healthcare professional licensed in your jurisdiction before making decisions about your health or medications. In a medical emergency, call 911 or your local emergency number immediately. Kynthai SOS is a separate in-app alert tool and does not connect to emergency dispatch services; do not rely on it for emergency response.
        </span>
      </p>
    </div>
  )
}
