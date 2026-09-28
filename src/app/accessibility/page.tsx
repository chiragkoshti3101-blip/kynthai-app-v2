export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { AccessibilityStatement } from "@/components/kynthai/legal/privacy-policy"

export const metadata: Metadata = {
  title: 'Accessibility Statement',
  description: "Kynthai's commitment to WCAG 2.1 AA accessibility.",
  alternates: { canonical: 'https://kynthai.app/accessibility' },
}

export default function AccessibilityPage() {
  return <AccessibilityStatement />
}
