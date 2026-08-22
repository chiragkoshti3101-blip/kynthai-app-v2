import { isDemoEnabled } from '@/lib/demo-mode'
export const dynamic = 'force-dynamic'

import CaretakerClient from './caretaker-client'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

const isDemoMode = isDemoEnabled();

export default async function CaretakerPage() {
  const user = await getAuthUser()

  const demoUser = isDemoMode
    ? { id: 'demo-caretaker', name: 'Demo Family', email: 'caretaker@kynthai.app', role: 'caretaker' }
    : user;

  if (!user && !isDemoMode) redirect('/login')
  if (user && user.role !== 'caretaker') redirect('/login')
  return <CaretakerClient />
}
