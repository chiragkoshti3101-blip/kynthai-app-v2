import type { Metadata } from 'next'
import { isDemoEnabled } from '@/lib/demo-mode'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Patient Dashboard',
  description: 'Manage your medications, track health, and chat with AI health assistant.',
}

import PatientClient from './patient-client'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

const isDemoMode = isDemoEnabled();

export default async function PatientPage() {
  const user = await getAuthUser()

  // Demo mode: allow access without a real session
  const demoUser = isDemoMode
    ? { id: 'demo-patient', name: 'Demo Patient', email: 'patient@kynthai.app', role: 'patient' }
    : user;

  if (!user && !isDemoMode) redirect('/login')
  if (user && user.role !== 'patient') redirect('/login')
  return <PatientClient />
}
