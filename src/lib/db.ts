import { PrismaClient } from '@prisma/client'
import { installEncryptionMiddleware } from './prisma-encryption-middleware'
import { logger } from './logger'
import { maskArgs } from './data-masking'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaInitError: Error | undefined
}

export class DatabaseNotConfiguredError extends Error {
  readonly code = 'DATABASE_NOT_CONFIGURED' as const
  constructor(message?: string) {
    super(message ?? 'DATABASE_URL is not set.')
    this.name = 'DatabaseNotConfiguredError'
  }
}

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL
  if (!url || typeof url !== 'string' || url.trim() === '') return false
  return url.startsWith('file:') || url.startsWith('postgresql://')
}

function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url
  const filePath = url.slice(5)
  if (path.isAbsolute(filePath)) return url
  const absolutePath = path.resolve(process.cwd(), filePath)
  return `file:${absolutePath}`
}

function requireDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new DatabaseNotConfiguredError()
  }
  if (!rawUrl.startsWith('file:') && !rawUrl.startsWith('postgresql://')) {
    throw new DatabaseNotConfiguredError(`Invalid DATABASE_URL`)
  }
  return resolveDatabaseUrl(rawUrl)
}

let _db: PrismaClient | undefined
let _initError: Error | undefined

function getDb(): PrismaClient {
  if (_db) return _db
  if (_initError) throw _initError

  try {
    const existing = globalForPrisma.prisma
    if (existing) {
      _db = existing
      return _db
    }
    const url = requireDatabaseUrl()
    const client = installEncryptionMiddleware(
      new PrismaClient({
        datasources: { db: { url } },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        errorFormat: 'pretty',
      }),
    )
    _db = client
    globalForPrisma.prisma = _db
    return _db
  } catch (err) {
    _initError = err as Error
    throw err
  }
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return typeof prop === 'string' ? Reflect.get(getDb(), prop) : undefined
  },
})
