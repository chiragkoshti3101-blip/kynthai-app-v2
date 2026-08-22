import { isDemoEnabled } from '@/lib/demo-mode'
export const dynamic = 'force-dynamic'

import FamilyMemberDetailClient from '@/components/kynthai/family/family-member-detail'
import { getAuthUser } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'

const isDemoMode = isDemoEnabled();

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FamilyMemberDetailPage({ params }: PageProps) {
  const user = await getAuthUser()

  const demoUser = isDemoMode
    ? { id: 'demo-caretaker', name: 'Demo Family', email: 'caretaker@kynthai.app', role: 'caretaker' }
    : user;

  if (!demoUser) redirect('/login')
  const { id } = await params
  return <FamilyMemberDetailClient memberId={id} user={demoUser as any} />
}
