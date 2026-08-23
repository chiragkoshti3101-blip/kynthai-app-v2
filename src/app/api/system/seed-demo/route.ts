import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { hashPassword } from '@/lib/auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST/GET /api/system/seed-demo
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Upserts production demo accounts with password Demo@2024 so QA can sign in.
 * Both email domains are created (@kynthai.app and @demo.kynthai.app).
 */
const DEMOS: Array<{ email: string; name: string; role: string }> = [
  { email: 'patient@kynthai.app', name: 'Demo Patient', role: 'patient' },
  { email: 'patient@demo.kynthai.app', name: 'Demo Patient', role: 'patient' },
  { email: 'caretaker@kynthai.app', name: 'Demo Family', role: 'caretaker' },
  { email: 'caretaker@demo.kynthai.app', name: 'Demo Family', role: 'caretaker' },
  { email: 'doctor@kynthai.app', name: 'Demo Doctor', role: 'doctor' },
  { email: 'priya@demo.kynthai.app', name: 'Demo Doctor', role: 'doctor' },
  { email: 'lab@kynthai.app', name: 'Demo Lab', role: 'lab' },
  { email: 'pathlabs@demo.kynthai.app', name: 'Demo Lab', role: 'lab' },
  { email: 'admin@kynthai.app', name: 'Demo Admin', role: 'admin' },
  { email: 'admin@demo.kynthai.app', name: 'Demo Admin', role: 'admin' },
]

async function run(req: NextRequest) {
  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  try {
    const password = await hashPassword('Demo@2024')
    const results: Array<{ email: string; action: string }> = []

    for (const d of DEMOS) {
      const existing = await db.user.findUnique({ where: { email: d.email } })
      if (existing) {
        await db.user.update({
          where: { id: existing.id },
          data: {
            password,
            isDemo: true,
            role: d.role as 'patient' | 'caretaker' | 'doctor' | 'lab' | 'admin',
            name: d.name,
            consentAccepted: true,
            dataProcessingConsent: true,
            aiTrainingConsent: true,
            emailVerified: existing.emailVerified ?? new Date(),
            verificationLevel: existing.verificationLevel === 'blocked' ? 'email' : existing.verificationLevel,
          },
        })
        results.push({ email: d.email, action: 'updated' })
      } else {
        await db.user.create({
          data: {
            email: d.email,
            name: d.name,
            role: d.role as 'patient' | 'caretaker' | 'doctor' | 'lab' | 'admin',
            password,
            isDemo: true,
            consentAccepted: true,
            dataProcessingConsent: true,
            aiTrainingConsent: true,
            emailVerified: new Date(),
          },
        })
        results.push({ email: d.email, action: 'created' })
      }
    }

    return jsonOk({ ok: true, count: results.length, results, password: 'Demo@2024' })
  } catch (e) {
    logger.phiSafeError(e, 'system.seed-demo')
    return jsonError('Seed failed', 500)
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
