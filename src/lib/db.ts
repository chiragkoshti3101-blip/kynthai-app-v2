import { PrismaClient } from '@prisma/client'
import { installEncryptionMiddleware } from './prisma-encryption-middleware'
import { logger } from './logger'
import { maskArgs } from './data-masking'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaInitError: Error | undefined
}

/** Thrown when DATABASE_URL is missing or invalid — callers may map to HTTP 503. */
export class DatabaseNotConfiguredError extends Error {
  readonly code = 'DATABASE_NOT_CONFIGURED' as const

  constructor(message?: string) {
    super(
      message ??
        'DATABASE_URL is not set. Configure DATABASE_URL in .env.local (see .env.example).',
    )
    this.name = 'DatabaseNotConfiguredError'
  }
}

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL
  if (!url || typeof url !== 'string' || url.trim() === '') return false
  return url.startsWith('file:') || url.startsWith('postgresql://')
}

// Resolve Prisma datasource URL — handle relative `file:` paths against project root
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url
  const filePath = url.slice(5) // strip 'file:'
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
    throw new DatabaseNotConfiguredError(
      `Invalid DATABASE_URL: must start with 'file:' or 'postgresql://'`,
    )
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

// Lazy Prisma accessor — do NOT construct/validate Prisma at import time.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return typeof prop === 'string' ? Reflect.get(getDb(), prop) : undefined
  },
})

// ── Connection lifecycle ──────────────────────────────────────────────

/**
 * Gracefully disconnect the Prisma Client.
 * Call this in your server shutdown / process termination handler.
 */
export async function disconnectDb(): Promise<void> {
  try {
    await db.$disconnect()
  } catch (err) {
    logger.phiSafeError(err, 'db.disconnect')
  }
}

/**
 * Handle unhandled promise rejections by disconnecting before exit.
 */
;(() => {
  if (process.env.NODE_ENV !== 'test') {
    process.on('SIGINT', async () => {
      await disconnectDb()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      await disconnectDb()
      process.exit(0)
    })

    process.on('uncaughtException', (error: Error) => {
      logger.phiSafeError(error, 'uncaughtException')
      process.exit(1)
    })
  }
})()

/**
 * Log a query-count summary when the process is about to exit (dev only).
 */
export function logQueryStats(): void {
  if (process.env.NODE_ENV !== 'development') return
  const engine = (db as PrismaClient & { _engine?: { metrics?: () => Promise<Record<string, number>> } })?._engine
  if (typeof engine?.metrics === 'function') {
    engine
      .metrics()
      .then((m: Record<string, number>) => {
        console.table({
          totalQueries: m.totalQueries ?? 0,
          totalQueriesFailed: m.totalQueriesFailed ?? 0,
        })
      })
      .catch(() => {
        // Silently ignore if metrics are unavailable
      })
  }
}

if (process.env.NODE_ENV === 'production') {
  const _maskArgs = maskArgs
  const _origError = console.error.bind(console)
  const _origWarn = console.warn.bind(console)
  const _origInfo = console.info.bind(console)

  console.log = (...a: any[]) => { /* disabled — use logger */ }
  console.error = (...a: any[]) => _origError(..._maskArgs(a))
  console.warn = (...a: any[]) => _origWarn(..._maskArgs(a))
  console.info = (...a: any[]) => _origInfo(..._maskArgs(a))
}
