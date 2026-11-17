/**
 * Provider verification pre-screen (doctor + lab applications)
 * ------------------------------------------------------------
 * Runs on every professional application before it reaches the admin queue.
 * Two layers:
 *
 *  1. Deterministic checks that never depend on an external service:
 *     required document slots, license number shape, duplicate-license
 *     detection across accounts, licensed-state validity, optional NPI
 *     checksum. These are authoritative — a failure here always means the
 *     application cannot be auto-approved.
 *  2. An optional AI second opinion (only when an AI provider key is
 *     configured). It can add concerns and downgrade a clean application to
 *     manual review, but it can never auto-approve or auto-reject by itself.
 *
 * No PHI is sent to the model: only role, masked license reference, document
 * slot names, state and NPI validity — never names, emails or file contents.
 * The admin remains the final decision-maker; the screen just orders the queue.
 */

import { aiComplete, isAiAvailable } from './nvidia'
import { logger } from './logger'

export type ProviderRole = 'doctor' | 'lab'
export type CheckStatus = 'pass' | 'warn' | 'fail'
export type VerificationVerdict = 'auto_reject' | 'manual_review' | 'strong_match'

export interface VerificationCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface VerificationScreen {
  verdict: VerificationVerdict
  score: number
  checks: VerificationCheck[]
  reasons: string[]
  aiAssisted: boolean
  model: string | null
  screenedAt: string
}

/** Document slots the applicant must upload before an application is reviewable. */
export const REQUIRED_DOCUMENTS: Record<ProviderRole, ReadonlyArray<{ id: string; label: string }>> = {
  doctor: [
    { id: 'license', label: 'Medical license' },
    { id: 'degree', label: 'Degree certificate' },
    { id: 'id', label: 'Government ID' },
  ],
  lab: [
    { id: 'license', label: 'Lab license' },
    { id: 'clia', label: 'CLIA certificate' },
  ],
}

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(
    ' ',
  ),
)

export function isUsState(value?: string | null): boolean {
  return !!value && US_STATES.has(value.toUpperCase())
}

/** US NPI: 10 digits whose Luhn checksum validates with the 80840 prefix. */
export function npiIsValid(npi?: string | null): boolean {
  if (!npi) return false
  const digitsOnly = npi.replace(/\D/g, '')
  if (!/^\d{10}$/.test(digitsOnly)) return false
  const digits = (`80840${digitsOnly}`).split('').map(Number)
  let sum = 0
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let d = digits[i]!
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export interface ScreenInput {
  role: ProviderRole
  licenseNumber: string
  /** Document slot ids that actually have a stored file. */
  documents: string[]
  state?: string | null
  city?: string | null
  npiNumber?: string | null
  /** True when another account already submitted this license number. */
  duplicateLicense?: boolean
}

const WEIGHTS = { documents: 40, license: 15, duplicate: 20, location: 10, identity: 10, npi: 5 }

function weightFor(role: ProviderRole, checkId: string): number {
  if (checkId === 'npi' && role === 'lab') return 0
  return (WEIGHTS as Record<string, number>)[checkId] ?? 0
}

export function screenProvider(input: ScreenInput): VerificationScreen {
  const checks: VerificationCheck[] = []
  const required = REQUIRED_DOCUMENTS[input.role]
  const uploaded = new Set(input.documents)
  const missing = required.filter((d) => !uploaded.has(d.id))

  checks.push({
    id: 'documents',
    label: 'Required documents',
    status: missing.length === 0 ? 'pass' : 'fail',
    detail:
      missing.length === 0
        ? `All ${required.length} required documents uploaded`
        : `Missing: ${missing.map((d) => d.label).join(', ')}`,
  })

  const license = input.licenseNumber.trim()
  const licenseOk = license.length >= 5 && license.length <= 60 && /^[A-Za-z0-9][A-Za-z0-9 /.-]*$/.test(license)
  checks.push({
    id: 'license',
    label: 'License number format',
    status: licenseOk ? 'pass' : 'fail',
    detail: licenseOk ? 'License number shape is valid' : 'License number is too short or contains invalid characters',
  })

  checks.push({
    id: 'duplicate',
    label: 'Duplicate license check',
    status: input.duplicateLicense ? 'fail' : 'pass',
    detail: input.duplicateLicense
      ? 'This license number is already linked to another account'
      : 'No other account uses this license number',
  })

  // Labs are licensed per facility, not per US state, so only a city is required.
  const locationOk = !!input.city?.trim() && (input.role === 'lab' || isUsState(input.state))
  checks.push({
    id: 'location',
    label: input.role === 'lab' ? 'City' : 'Licensed state & city',
    status: locationOk ? 'pass' : 'fail',
    detail: locationOk
      ? input.role === 'lab'
        ? `Located in ${input.city!.trim()}`
        : `Licensed in ${input.state!.toUpperCase()}, ${input.city!.trim()}`
      : input.role === 'lab'
        ? 'A city is required'
        : 'A valid US licensed state and city are required',
  })

  const identitySlot = input.role === 'doctor' ? 'id' : 'business_insurance'
  const hasIdentity = uploaded.has(identitySlot)
  checks.push({
    id: 'identity',
    label: input.role === 'doctor' ? 'Government ID' : 'Business insurance',
    status: hasIdentity ? 'pass' : 'warn',
    detail: hasIdentity ? 'Identity/insurance document uploaded' : 'Not uploaded — manual identity review needed',
  })

  if (input.role === 'doctor') {
    if (!input.npiNumber) {
      checks.push({ id: 'npi', label: 'NPI', status: 'warn', detail: 'No NPI supplied — verify license through the state board manually' })
    } else {
      const valid = npiIsValid(input.npiNumber)
      checks.push({
        id: 'npi',
        label: 'NPI checksum',
        status: valid ? 'pass' : 'fail',
        detail: valid ? 'NPI passes the Luhn check' : 'NPI failed the Luhn checksum — likely mistyped or invented',
      })
    }
  }

  let score = 0
  for (const check of checks) {
    const weight = weightFor(input.role, check.id)
    if (check.status === 'pass') score += weight
    else if (check.status === 'warn') score += Math.round(weight / 2)
  }
  score = Math.max(0, Math.min(100, score))

  const failed = checks.filter((c) => c.status === 'fail')
  const warned = checks.filter((c) => c.status === 'warn')
  const verdict: VerificationVerdict =
    failed.length > 0 ? 'auto_reject' : score >= 85 && warned.length === 0 ? 'strong_match' : 'manual_review'

  return {
    verdict,
    score,
    checks,
    reasons: [...failed, ...warned].map((c) => c.detail),
    aiAssisted: false,
    model: null,
    screenedAt: new Date().toISOString(),
  }
}

function extractJson(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return raw.slice(start, end + 1)
}

/**
 * Deterministic screen plus an optional AI second opinion. AI failures,
 * timeouts and malformed output are ignored — the deterministic result is
 * always returned, so an AI outage can never block applications.
 */
export async function screenProviderWithAi(input: ScreenInput): Promise<VerificationScreen> {
  const base = screenProvider(input)
  if (!isAiAvailable()) return base

  const maskedLicense = input.licenseNumber.length > 4 ? `${input.licenseNumber.slice(0, 2)}••${input.licenseNumber.slice(-2)}` : '••••'
  const prompt = [
    'You are a compliance pre-screener for a US telehealth platform. Do not invent facts.',
    'Given only these non-PHI signals, flag anything suspicious about the application.',
    `role: ${input.role}`,
    `license_reference: ${maskedLicense} (length ${input.licenseNumber.length})`,
    `documents_uploaded: ${input.documents.join(', ') || 'none'}`,
    `required_documents: ${REQUIRED_DOCUMENTS[input.role].map((d) => d.id).join(', ')}`,
    `licensed_state: ${input.state || 'missing'}`,
    `city_present: ${Boolean(input.city?.trim())}`,
    `npi_present: ${Boolean(input.npiNumber)}`,
    `duplicate_license: ${Boolean(input.duplicateLicense)}`,
    `rule_based_verdict: ${base.verdict} (score ${base.score})`,
    'Reply with strict JSON only: {"verdict":"strong_match|manual_review","reasons":["..."]}.',
    'Never output "auto_reject" — a rule failure is already handled before you.',
  ].join('\n')

  try {
    const raw = await Promise.race([
      aiComplete(prompt, { maxTokens: 300, temperature: 0.1 }),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 8000)),
    ])
    const json = extractJson(raw)
    if (!json) return base
    const parsed = JSON.parse(json) as { verdict?: string; reasons?: unknown }
    const aiReasons = Array.isArray(parsed.reasons) ? parsed.reasons.filter((r): r is string => typeof r === 'string').slice(0, 5) : []
    const aiVerdict = parsed.verdict === 'strong_match' ? 'strong_match' : 'manual_review'

    // AI can only downgrade confidence, never overturn a rule failure.
    const verdict: VerificationVerdict =
      base.verdict === 'auto_reject' ? 'auto_reject' : aiVerdict === 'strong_match' ? base.verdict : 'manual_review'

    return {
      ...base,
      verdict,
      reasons: [...new Set([...base.reasons, ...aiReasons])],
      checks: [
        ...base.checks,
        { id: 'ai_review', label: 'AI document review', status: aiVerdict === 'strong_match' ? 'pass' : 'warn', detail: aiReasons[0] || 'AI review completed' },
      ],
      aiAssisted: true,
      model: 'configured-provider',
    }
  } catch (error) {
    logger.phiSafeError(error, 'provider-verification.ai')
    return base
  }
}

/** Formats a screen for storage in the profile's aiReview column. */
export function serializeScreen(screen: VerificationScreen): string {
  return JSON.stringify(screen)
}

export function parseScreen(raw?: string | null): VerificationScreen | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as VerificationScreen
  } catch {
    return null
  }
}

/** Review SLA: applications are promised a decision within this window. */
export const VERIFICATION_SLA_HOURS = { min: 20, max: 48 } as const

export function reviewDeadline(submittedAt?: string | Date | null): Date | null {
  if (!submittedAt) return null
  const start = new Date(submittedAt).getTime()
  if (Number.isNaN(start)) return null
  return new Date(start + VERIFICATION_SLA_HOURS.max * 60 * 60 * 1000)
}
