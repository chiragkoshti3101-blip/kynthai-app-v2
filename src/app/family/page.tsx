import type { Metadata } from 'next'
import { isDemoEnabled } from '@/lib/demo-mode'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Family Health Portal',
  description: "Manage your family's medications, reminders, and health alerts.",
}

export default async function FamilyPortalPage() {
  const user = await getAuthUser()
  const isDemoMode = isDemoEnabled()

  if (!user && !isDemoMode) redirect('/login')
  if (user && user.role !== 'caretaker') redirect('/login')
  // The full family experience (Meds, Care, SOS, Health Circle) lives on
  // /caretaker. /family used to render a separate overview with no Meds tab.
  redirect('/caretaker')
}
