import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

type StepResult = {
  step: string
  ok: boolean
  ms: number
  detail?: string
  error?: { name?: string; code?: string; message?: string }
}

async function runStep(name: string, fn: () => Promise<unknown>): Promise<StepResult> {
  const started = Date.now()
  try {
    const value = await fn()
    let detail: string
    if (Array.isArray(value)) detail = `rows=${value.length}`
    else if (value && typeof value === 'object') {
      detail = `keys=${Object.keys(value as Record<string, unknown>).join(',')}`
    } else detail = typeof value
    return { step: name, ok: true, ms: Date.now() - started, detail }
  } catch (error) {
    const err = error as { name?: string; code?: string; message?: string }
    return {
      step: name,
      ok: false,
      ms: Date.now() - started,
      error: {
        name: err?.name,
        code: err?.code,
        message: String(err?.message ?? error).slice(0, 500),
      },
    }
  }
}

// TEMPORARY diagnostic for the /api/admin/overview + /api/admin/fraud 500s.
// Runs each query the shared fraud engine depends on, in isolation, and reports
// which one throws — plus timing, so a pool/timeout failure is distinguishable
// from a hard schema error. Admin-authenticated; returns counts and error codes
// only, never row contents. Remove once the root cause is fixed.
export async function GET(req: NextRequest) {
  const { response, user } = await requireAdmin(req)
  if (response || !user) {
    return response ?? NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const since = new Date()
  since.setDate(since.getDate() - 1)

  const steps: StepResult[] = []
  steps.push(
    await runStep('doctorProfile.findMany({ include: user })', () =>
      db.doctorProfile.findMany({ include: { user: true } })
    )
  )
  steps.push(
    await runStep('labProfile.findMany({ include: user })', () =>
      db.labProfile.findMany({ include: { user: true } })
    )
  )
  steps.push(await runStep('user.findMany()', () => db.user.findMany()))
  steps.push(
    await runStep('appointment.findMany(completed, include doctor.user)', () =>
      db.appointment.findMany({
        where: { status: 'completed', createdAt: { gte: since } },
        include: { doctor: { include: { user: true } } },
      })
    )
  )
  steps.push(
    await runStep('labBooking.findMany({ include: lab.user })', () =>
      db.labBooking.findMany({ include: { lab: { include: { user: true } } } })
    )
  )
  steps.push(
    await runStep('runFraudChecks()', async () => {
      const mod = await import('@/lib/fraud-checks')
      return mod.runFraudChecks()
    })
  )

  return NextResponse.json({ ok: steps.every((s) => s.ok), steps }, { status: 200 })
}
