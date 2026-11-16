// Use Supabase REST API instead of Prisma (Vercel can't reach Supabase DB directly)
export { db } from './supabase-db'

export function isDatabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  return !!url
}

export class DatabaseNotConfiguredError extends Error {
  readonly code = 'DATABASE_NOT_CONFIGURED' as const
  constructor(message?: string) {
    super(message ?? 'Database is not configured.')
    this.name = 'DatabaseNotConfiguredError'
  }
}
