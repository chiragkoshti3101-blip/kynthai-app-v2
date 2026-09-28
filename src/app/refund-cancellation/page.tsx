import type { Metadata } from 'next'
import RefundCancellationClient from './refund-cancellation-client'

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy',
  description: 'Kynthai refund and cancellation policy for subscriptions, consultations, lab tests, and partner payouts.',
  alternates: { canonical: 'https://kynthai.app/refund-cancellation' },
}

export default function RefundCancellationPage() {
  return <RefundCancellationClient />
}
