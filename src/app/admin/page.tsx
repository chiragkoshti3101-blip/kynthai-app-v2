import type { Metadata } from 'next'
import { isDemoEnabled } from '@/lib/demo-mode'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  description: 'Platform administration and system management.',
}

import AdminClient from './admin-client'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

const isDemoMode = isDemoEnabled();

export default async function AdminPage() {
  const user = await getAuthUser()

  const demoUser = isDemoMode
    ? { id: 'demo-admin', name: 'Demo Admin', email: 'admin@kynthai.app', role: 'admin' }
    : user;

  if (!user && !isDemoMode) redirect('/login')
  if (user && user.role !== 'admin') redirect('/login')
  return <AdminClient />
}
