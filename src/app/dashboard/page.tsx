import type { Metadata } from 'next'
import { isDemoEnabled } from '@/lib/demo-mode'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your health management dashboard.',
}

import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

const isDemoMode = isDemoEnabled();

export default async function DashboardPage() {
  const user = await getAuthUser()

  // Demo mode: redirect to patient portal by default
  if (!user && isDemoMode) redirect('/patient')
  if (!user) redirect('/login')
  redirect(`/${user.role}`)
}
