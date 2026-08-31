import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { encryptValue, hashValue } from './encryption'
import {
  installEncryptionMiddleware,
  rewriteWhereForEncryption,
} from './prisma-encryption-middleware'

describe('Prisma field-encryption extension', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.ENCRYPTION_TRANSITIONAL = 'true'
  })

  it('uses Prisma 6 $extends when legacy $use is unavailable', () => {
    let extension: any
    const extendedClient = { marker: 'extended' }
    const baseClient = {
      $use: undefined,
      $extends: vi.fn((value: any) => {
        extension = value
        return extendedClient
      }),
    } as unknown as PrismaClient

    const result = installEncryptionMiddleware(baseClient)

    expect(result).toBe(extendedClient)
    expect(baseClient.$extends).toHaveBeenCalledOnce()
    expect(typeof extension.query.$allModels.$allOperations).toBe('function')
  })

  it('encrypts writes and decrypts selected reads without leaking shadow columns', async () => {
    let extension: any
    const baseClient = {
      $extends: (value: any) => {
        extension = value
        return value
      },
    } as unknown as PrismaClient
    installEncryptionMiddleware(baseClient)
    const operation = extension.query.$allModels.$allOperations

    let seenArgs: any
    const created = await operation({
      model: 'NotificationLog',
      operation: 'create',
      args: {
        data: {
          id: 'notification-1',
          title: 'Medication reminder',
          body: 'Take your medication',
          recipient: 'user-1',
        },
        select: { id: true, title: true, body: true, recipient: true },
      },
      query: async (args: any) => {
        seenArgs = args
        return {
          id: 'notification-1',
          title: null,
          title_enc: encryptValue('Medication reminder'),
          body: null,
          body_enc: encryptValue('Take your medication'),
          recipient: null,
          recipient_enc: encryptValue('user-1'),
        }
      },
    })

    expect(seenArgs.data.title).toBeNull()
    expect(seenArgs.data.body).toBeNull()
    expect(seenArgs.data.recipient).toBeNull()
    expect(typeof seenArgs.data.title_enc).toBe('string')
    expect(typeof seenArgs.data.body_enc).toBe('string')
    expect(typeof seenArgs.data.recipient_enc).toBe('string')
    expect(seenArgs.select.title_enc).toBe(true)
    expect(seenArgs.select.body_enc).toBe(true)
    expect(seenArgs.select.recipient_enc).toBe(true)

    expect(created).toEqual({
      id: 'notification-1',
      title: 'Medication reminder',
      body: 'Take your medication',
      recipient: 'user-1',
    })
  })

  it('rewrites exact encrypted filters inside logical clauses', () => {
    const args: Record<string, unknown> = {
      where: {
        AND: [
          { phone: '+15551234567' },
          { phone: { in: ['+15551234567', '+15557654321'] } },
        ],
      },
    }

    rewriteWhereForEncryption(args, 'User')
    const where = args.where as any

    expect(where.AND[0].phone).toBeUndefined()
    expect(where.AND[0].phone_hash).toBe(hashValue('+15551234567'))
    expect(where.AND[1].phone).toBeUndefined()
    expect(where.AND[1].phone_hash.in).toEqual([
      hashValue('+15551234567'),
      hashValue('+15557654321'),
    ])
  })

  it('keeps required plaintext columns valid while encrypting shadow values', async () => {
    let extension: any
    const baseClient = {
      $extends: (value: any) => {
        extension = value
        return value
      },
    } as unknown as PrismaClient
    installEncryptionMiddleware(baseClient)
    const operation = extension.query.$allModels.$allOperations

    let seenArgs: any
    const created = await operation({
      model: 'LabBooking',
      operation: 'create',
      args: { data: { tests: '[]' } },
      query: async (args: any) => {
        seenArgs = args
        return { id: 'booking-1', tests: '', tests_enc: encryptValue('[]') }
      },
    })

    expect(seenArgs.data.tests).toBe('')
    expect(typeof seenArgs.data.tests_enc).toBe('string')
    expect((created as any).tests).toBe('[]')
    expect((created as any).tests_enc).toBeUndefined()

    const licenseArgs: Record<string, unknown> = { where: { licenseNumber: 'LIC-123' } }
    rewriteWhereForEncryption(licenseArgs, 'DoctorProfile')
    expect((licenseArgs.where as any).licenseNumber_hash).toBe(hashValue('LIC-123'))
  })
})
