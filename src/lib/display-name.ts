import { isDemoUser } from './demo-mode'

/**
 * Display-name resolution.
 *
 * `User.name` is nullable in the schema, and the production demo accounts
 * (patient@/doctor@/lab@/admin@kynthai.app) exist with `name = NULL`. Portals
 * that read `user.name` directly therefore rendered blank headers and fell back
 * to single-letter placeholder initials ('U', 'A') that read like a broken UI
 * rather than an identity.
 *
 * This resolves, in order of trust:
 *   1. the account's real name, when set;
 *   2. the seeded name for a demo account (deterministic, role-based);
 *   3. a humanised form of the email local part (works for every real user);
 *   4. a neutral fallback.
 *
 * It never returns an empty string, so initials can never render blank.
 */

export const DEMO_ROLE_NAMES: Record<string, string> = {
  patient: 'Demo Patient',
  doctor: 'Demo Doctor',
  caretaker: 'Demo Family',
  lab: 'Demo Lab',
  admin: 'Demo Admin',
}

type NameSource =
  | {
      name?: string | null
      email?: string | null
      role?: string | null
      isDemo?: boolean | null
    }
  | null
  | undefined

/** 'jane.doe42' -> 'Jane Doe'. Returns '' when nothing usable remains. */
function humanizeLocalPart(local: string): string {
  const cleaned = local
    .replace(/[._+-]+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function resolveDisplayName(user: NameSource, fallback = 'Member'): string {
  const explicit = user?.name?.trim()
  if (explicit) return explicit

  const demo = isDemoUser({
    isDemo: user?.isDemo === true,
    email: user?.email ?? null,
  })
  if (demo && user?.role) {
    const demoName = DEMO_ROLE_NAMES[user.role]
    if (demoName) return demoName
  }

  const local = (user?.email ?? '').split('@')[0] ?? ''
  const human = humanizeLocalPart(local)
  if (human) return human

  return fallback
}

export function resolveInitial(user: NameSource, fallback = 'M'): string {
  const name = resolveDisplayName(user, fallback)
  return (name.charAt(0) || fallback).toUpperCase()
}
