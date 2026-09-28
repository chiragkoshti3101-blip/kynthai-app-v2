
import type { Metadata } from 'next'
import { MedicalDisclaimer as MedicalDisclaimerFull } from '@/components/kynthai/legal/privacy-policy'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export const metadata: Metadata = {
  title: 'Medical Disclaimer',
  description: 'Kynthai provides health information, not medical advice.',
  alternates: { canonical: 'https://kynthai.app/medical-disclaimer' },
}

export default function MedicalDisclaimerPage() {
  return (
    <ErrorBoundary>
      <MedicalDisclaimerFull />
    </ErrorBoundary>
  )
}
