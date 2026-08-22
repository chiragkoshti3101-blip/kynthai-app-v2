import type { Metadata } from 'next'
import { isDemoEnabled } from '@/lib/demo-mode'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Doctor Portal',
  description: 'Manage consultations, patients, and practice on Kynthai.',
}

import DoctorClient from './doctor-client'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

const isDemoMode = isDemoEnabled();

export default async function DoctorPage() {
  const user = await getAuthUser()

  const demoUser = isDemoMode
    ? { id: 'demo-doctor', name: 'Dr. Demo', email: 'doctor@kynthai.app', role: 'doctor' }
    : user;

  if (!user && !isDemoMode) redirect('/login')
  if (user && user.role !== 'doctor') redirect('/login')
  return <DoctorClient />
}
