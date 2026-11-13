import { describe, expect, it, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { hashValue } from '@/lib/encryption'
import { hashPassword } from '@/lib/auth'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('local password reset (QA)', () => {
  const email = 'qa-reset-cycle@demo.kynthai.app'
  const token = 'bb'.repeat(32)

  beforeAll(async () => {
    const hashed = await hashPassword('Old-Passw0rd!')
    await db.user.upsert({
      where: { email },
      create: {
        id: 'clqa000000000000000reset01',
        email,
        name: 'QA Reset',
        role: 'patient',
        password: hashed,
        consentAccepted: true,
        dataProcessingConsent: true,
      },
      update: { password: hashed, name: 'QA Reset' },
    })
  })

  it('stores encrypted reset token with hash lookup', async () => {
    const expires = new Date(Date.now() + 30 * 60 * 1000)
    await db.user.update({
      where: { email },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    })
    const found = await db.user.findFirst({
      where: { passwordResetToken_hash: hashValue(token) },
    })
    expect(found?.email).toBe(email)
    expect(found?.passwordResetToken).toBe(token)
  })
})
