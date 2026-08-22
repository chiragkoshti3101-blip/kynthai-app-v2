'use client'

import { useAppStore } from '@/lib/store'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppLoader } from '@/components/kynthai/app-loader'
import { isDemoEnabled } from '@/lib/demo-mode'
import { CaretakerApp } from '@/components/kynthai/caretaker/caretaker-app'

// Family role users get the full caretaker app (Meds, Care, SOS, Health Circle).
export function FamilyPortal() {
  const router = useRouter()
  const { user, setLoginPortal, login: storeLogin } = useAppStore()

  useEffect(() => {
    const isDemoMode = isDemoEnabled()
    if (!user && !isDemoMode) {
      setLoginPortal('caretaker')
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.user) storeLogin(data.user)
          else router.replace('/login')
        })
        .catch(() => router.replace('/login'))
    }
  }, [user, router, setLoginPortal, storeLogin])

  const isDemoMode = isDemoEnabled()
  if (!user && !isDemoMode) {
    return <AppLoader label="Loading…" />
  }

  if (!user) {
    return <AppLoader label="Loading…" />
  }

  return <CaretakerApp user={user} />
}
