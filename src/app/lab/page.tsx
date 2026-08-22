import { isDemoEnabled } from '@/lib/demo-mode'
export const dynamic = 'force-dynamic'

import LabClient from './lab-client'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

const isDemoMode = isDemoEnabled();

export default async function LabPage() {
  const user = await getAuthUser()

  const demoUser = isDemoMode
    ? { id: 'demo-lab', name: 'Demo Lab', email: 'lab@kynthai.app', role: 'lab' }
    : user;

  if (!user && !isDemoMode) redirect('/login')
  if (user && user.role !== 'lab') redirect('/login')
  return <LabClient />
}
