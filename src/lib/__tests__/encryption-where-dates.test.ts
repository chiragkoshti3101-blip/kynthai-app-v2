import { describe, it, expect } from 'vitest'
import { rewriteWhereForEncryption } from '@/lib/prisma-encryption-middleware'

describe('encryption where-rewrite preserves Date operands', () => {
  it('keeps a Date inside a range filter (regression: admin overview/fraud 500)', () => {
    const since = new Date(Date.now() - 86_400_000)
    const args: Record<string, unknown> = {
      where: { status: 'completed', createdAt: { gte: since } },
    }
    rewriteWhereForEncryption(args, 'Appointment')
    const where = args.where as any
    console.log('REWRITTEN:', JSON.stringify(where), '| gte is Date:', where.createdAt.gte instanceof Date)
    expect(where.createdAt.gte).toBeInstanceOf(Date)
    expect(where.createdAt.gte.getTime()).toBe(since.getTime())
  })

  it('keeps Dates nested inside OR branches', () => {
    const cutoff = new Date()
    const args: Record<string, unknown> = {
      where: { OR: [{ createdAt: { lt: cutoff } }, { deletedAt: null }] },
    }
    rewriteWhereForEncryption(args, 'Appointment')
    const or = (args.where as any).OR
    expect(or[0].createdAt.lt).toBeInstanceOf(Date)
    expect(or[0].createdAt.lt.getTime()).toBe(cutoff.getTime())
  })
})
