/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Runtime-only require — module names are NOT string literals so
 * Turbopack/Webpack cannot attempt static resolution at build time.
 * @param name Bare module name, e.g. '@sendgrid/mail'
 * @returns the exported module or null if not installed
 */
function runtimeRequire(name: string): unknown {
  try {
     
    return require(name)
  } catch { /* optional dep not installed */ }
  return null
}

/**
 * External service integration layer for Kynthai.
 *
 * sensitive health data BOUNDARY NOTICE:
 * Callers must scrub raw patient health information from payloads before
 * invoking email, SMS, WhatsApp, push, analytics, or payment functions
 * below, unless the downstream provider has executed a Health Data Protection Business Associate Agreement (BAA) and the
 * data transfer is strictly necessary for the service. Internal audit
 * logging is emitted in mock mode; in production, logs must not contain
 * raw sensitive health data values.
 *
 * Each service auto-detects its API key from environment variables. If the
 * key is present, real SDK clients are instantiated and real network calls
 * are made. If the key is absent, the function mocks the call (logs to
 * console) so the app keeps working in development and demo mode.
 *
 * Optional dependencies (sendgrid, firebase-admin, posthog-node) are loaded
 * lazily via a dynamic helper so Turbopack/Webpack do not fail when they are
 * not installed. The app falls back to mock mode automatically.
 *
 * All "real" send/create functions return a normalized result:
 *   { ok: boolean; provider?: string; messageId?: string; raw?: unknown; mock?: boolean }
 */

import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Lazy dynamic require — avoids bundler static analysis of optional deps.
// Return type is `unknown` so callers cast — the module may not be installed.
// ---------------------------------------------------------------------------

 
function lazyRequire(name: string): unknown {
  let mod: unknown = null
  try {
     
    mod = require(name)
  } catch { /* optional dep not installed */ }
  return mod
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendResult {
  ok: boolean
  provider: string
  messageId?: string
  raw?: unknown
  mock?: boolean
  error?: string
}

export interface PaymentIntentResult {
  ok: boolean
  provider: 'stripe' | 'mock'
  clientSecret?: string
  paymentIntentId?: string
  amount?: number
  currency?: string
  mock?: boolean
  error?: string
}

export interface ConfirmResult {
  ok: boolean
  provider: 'stripe' | 'mock'
  paymentIntentId?: string
  status: 'succeeded' | 'processing' | 'requires_action' | 'failed' | 'mock'
  mock?: boolean
  error?: string
}

interface EmailPayload {
  to: string
  subject: string
  html?: string
  text?: string
  from?: string
}

interface SmsPayload {
  to: string
  body: string
  from?: string
}

interface WhatsAppPayload {
  to: string
  body: string
  template?: string
  from?: string
}

interface PushPayload {
  token: string
  title: string
  body: string
  data?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Env-var detection helpers
// ---------------------------------------------------------------------------

function env(key: string): string | undefined {
  // Works in both server runtime (process.env) and Next.config build context.
  if (typeof process !== 'undefined' && process.env) return process.env[key]
  return undefined
}

function hasEnv(key: string): boolean {
  const v = env(key)
  return !!v && v.length > 0 && v !== 'unset' && v !== 'undefined'
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

let _stripe: unknown = null
let _stripeLoaded = false

export function getStripe(): unknown | null {
  if (!isStripeEnabled()) return null
  if (!_stripeLoaded) {
    try {
      const Stripe = require('stripe').default || require('stripe')
      _stripe = new Stripe(env('STRIPE_SECRET_KEY')!, {
        apiVersion: '2025-08-27.basil' as unknown as string,
      })
    } catch (e) {
      console.warn('[integrations] Failed to load Stripe SDK', e)
      _stripe = null
    }
    _stripeLoaded = true
  }
  return _stripe
}

export function isStripeEnabled(): boolean {
  return hasEnv('STRIPE_SECRET_KEY')
}

export async function createStripePaymentIntent(
  amount: number,
  currency = 'usd',
  metadata: Record<string, string> = {},
): Promise<PaymentIntentResult> {
  if (!isStripeEnabled()) {
    return {
      ok: true,
      provider: 'mock',
      clientSecret: `mock_secret_${Date.now()}`,
      paymentIntentId: `mock_pi_${Date.now()}`,
      amount,
      currency,
      mock: true,
    }
  }
  try {
    const stripe = getStripe() as {
      paymentIntents: {
        create: (p: {
          amount: number
          currency: string
          metadata: Record<string, string>
          automatic_payment_methods?: { enabled: boolean }
        }) => Promise<{ id: string; client_secret: string }>
      }
    }
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
    })
    return {
      ok: true,
      provider: 'stripe',
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amount,
      currency,
    }
  } catch (e) {
    return {
      ok: false,
      provider: 'stripe',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function confirmStripePayment(
  paymentIntentId: string,
): Promise<ConfirmResult> {
  if (!isStripeEnabled() || paymentIntentId.startsWith('mock_')) {
    return {
      ok: true,
      provider: 'mock',
      paymentIntentId,
      status: 'mock',
      mock: true,
    }
  }
  try {
    const stripe = getStripe() as {
      paymentIntents: {
        retrieve: (id: string) => Promise<{ id: string; status: string }>
      }
    }
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
    return {
      ok: true,
      provider: 'stripe',
      paymentIntentId: intent.id,
      status: (intent.status as ConfirmResult['status']) ?? 'processing',
    }
  } catch (e) {
    return {
      ok: false,
      provider: 'stripe',
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---------------------------------------------------------------------------
// SendGrid (Email)
// ---------------------------------------------------------------------------

let _sendGrid: unknown = null
let _sgLoaded = false

function lazyRequireSendgrid() {
  // runtime-only — no literal string direct require
  return runtimeRequire('@sendgrid/mail') as { setApiKey: (key: string) => void; send: (msg: unknown) => Promise<[{ messageId?: string }]> } | null
}

export function getSendGrid(): unknown | null {
  if (!isEmailEnabled()) return null
  if (!_sgLoaded) {
    try {
      const sgMail = lazyRequireSendgrid()
      if (sgMail) {
        ;(sgMail as { setApiKey: (key: string) => void }).setApiKey(env('SENDGRID_API_KEY')!)
        _sendGrid = sgMail
      }
    } catch (e) {
      console.warn('[integrations] Failed to load @sendgrid/mail', e)
      _sendGrid = null
    }
    _sgLoaded = true
  }
  return _sendGrid
}

export function isEmailEnabled(): boolean {
  return hasEnv('SENDGRID_API_KEY') && hasEnv('SENDGRID_FROM_EMAIL')
}

export async function sendEmailReal(p: EmailPayload): Promise<SendResult> {
  // ── sensitive health data BOUNDARY ──────────────────────────────────────────────────────────
  // Email (SendGrid) is generally NOT a Health Data Protection-covered transmission path.
  // Scrub subject / body / html of raw sensitive health data before calling this function.
  // Only send transactional, non-clinical content.
  // ──────────────────────────────────────────────────────────────────────────
  if (!isEmailEnabled()) {
    // Email disabled in this environment; avoid logging sensitive health data.
    try {
      const { captureQaEmail } = await import('@/lib/qa-email-sink')
      captureQaEmail({ to: p.to, subject: p.subject, html: p.html, text: p.text })
    } catch {
      /* optional QA sink */
    }
    return { ok: true, provider: 'mock-email', messageId: `mock_${Date.now()}`, mock: true }
  }
  try {
    const sgMail = getSendGrid() as {
      send: (msg: unknown) => Promise<[{ messageId?: string }]>
    }
    const [res] = await sgMail.send({
      to: p.to,
      from: p.from || env('SENDGRID_FROM_EMAIL'),
      subject: p.subject,
      html: p.html || `<p>${p.text || ''}</p>`,
      text: p.text,
    })
    return { ok: true, provider: 'sendgrid', messageId: res?.messageId }
  } catch (e) {
    return {
      ok: false,
      provider: 'sendgrid',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---------------------------------------------------------------------------
// Twilio (SMS)
// ---------------------------------------------------------------------------

let _twilio: unknown = null
let _twilioLoaded = false

export function getTwilio(): unknown | null {
  if (!isSMSEnabled()) return null
  if (!_twilioLoaded) {
    try {
      const twilio = require('twilio').default || require('twilio')
      _twilio = twilio(env('TWILIO_ACCOUNT_SID'), env('TWILIO_AUTH_TOKEN'))
    } catch (e) {
      console.warn('[integrations] Failed to load twilio SDK', e)
      _twilio = null
    }
    _twilioLoaded = true
  }
  return _twilio
}

export function isSMSEnabled(): boolean {
  return (
    hasEnv('TWILIO_ACCOUNT_SID') &&
    hasEnv('TWILIO_AUTH_TOKEN') &&
    hasEnv('TWILIO_FROM_NUMBER')
  )
}

export async function sendSMSReal(p: SmsPayload): Promise<SendResult> {
  // ── sensitive health data BOUNDARY ──────────────────────────────────────────────────────────
  // SMS (Twilio) is a high-risk channel for sensitive health data leakage. Only send
  // non-sensitive notifications. Never include diagnoses, medications,
  // or free-text health content unless a BAA and encryption are in place.
  // ──────────────────────────────────────────────────────────────────────────
  if (!isSMSEnabled()) {
    // SMS disabled in this environment.
    return { ok: true, provider: 'mock-sms', messageId: `mock_${Date.now()}`, mock: true }
  }
  try {
    const client = getTwilio() as {
      messages: {
        create: (m: { to: string; from: string; body: string }) => Promise<{ sid: string }>
      }
    }
    const msg = await client.messages.create({
      to: p.to,
      from: p.from || env('TWILIO_FROM_NUMBER')!,
      body: p.body,
    })
    return { ok: true, provider: 'twilio', messageId: msg.sid }
  } catch (e) {
    return {
      ok: false,
      provider: 'twilio',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---------------------------------------------------------------------------
// WhatsApp (Meta Cloud API)
// ---------------------------------------------------------------------------

export interface WhatsAppConfig {
  token: string
  phoneNumberId: string
  baseUrl: string
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  if (!isWhatsAppEnabled()) return null
  return {
    token: env('WHATSAPP_API_KEY')!,
    phoneNumberId: env('WHATSAPP_PHONE_ID')!,
    baseUrl: env('WHATSAPP_API_BASE_URL') || 'https://graph.facebook.com/v18.0',
  }
}

export function isWhatsAppEnabled(): boolean {
  return hasEnv('WHATSAPP_API_KEY') && hasEnv('WHATSAPP_PHONE_ID')
}

export async function sendWhatsAppReal(p: WhatsAppPayload): Promise<SendResult> {
  // ── sensitive health data BOUNDARY ──────────────────────────────────────────────────────────
  // WhatsApp Business API messages must be scrubbed of raw sensitive health data unless
  // Meta/WhatsApp is a covered processor with valid BAA. Use only for
  // appointment reminders or generic notifications.
  // ──────────────────────────────────────────────────────────────────────────
  if (!isWhatsAppEnabled()) {
    // WhatsApp disabled in this environment.
    return { ok: true, provider: 'mock-whatsapp', messageId: `mock_${Date.now()}`, mock: true }
  }
  try {
    const cfg = getWhatsAppConfig()!
    const url = `${cfg.baseUrl}/${cfg.phoneNumberId}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: p.to.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { body: p.body },
      }),
    })
    const data = await res.json().catch(() => ({}))
    const messageId = data?.messages?.[0]?.id
    if (!res.ok) {
      return {
        ok: false,
        provider: 'whatsapp',
        error: data?.error?.message || `HTTP ${res.status}`,
        raw: data,
      }
    }
    return { ok: true, provider: 'whatsapp', messageId, raw: data }
  } catch (e) {
    return {
      ok: false,
      provider: 'whatsapp',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---------------------------------------------------------------------------
// Firebase (FCM Push)
// ---------------------------------------------------------------------------

let _firebase: unknown = null
let _fbLoaded = false

export function getFirebase(): unknown | null {
  if (!isPushEnabled()) return null
  if (!_fbLoaded) {
    try {
      // Hide from static bundlers so missing package does not fail the build.
      if (typeof window === 'undefined') {
        let admin: any = null
        try {
          // Use dynamic require via Function to avoid static module resolution.
           
          const dynamicRequire = new Function('mod', 'return require(mod)')
          admin = dynamicRequire('firebase-admin')
        } catch {
          admin = null
        }
        if (admin && admin.apps && admin.apps.length === 0) {
          try {
            admin.initializeApp({
              credential: admin.credential.cert({
                projectId: env('FIREBASE_PROJECT_ID'),
                clientEmail: env('FIREBASE_CLIENT_EMAIL'),
                privateKey: env('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
              }),
            })
          } catch {
            // ignore init issues in environments without valid FCM config
          }
        }
        _firebase = admin ? admin.messaging() : null
      }
    } catch (e) {
      console.warn('[integrations] Failed to load firebase-admin', e)
      _firebase = null
    }
    _fbLoaded = true
  }
  return _firebase
}

export function isPushEnabled(): boolean {
  // Web Push (VAPID) is the actual push mechanism. Check for VAPID keys,
  // not Firebase — Firebase FCM is not configured for this app.
  return hasEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY') && hasEnv('VAPID_PRIVATE_KEY')
}

export async function sendPushReal(p: PushPayload): Promise<SendResult> {
  // ── sensitive health data BOUNDARY ──────────────────────────────────────────────────────────
  // FCM push notifications must not carry raw sensitive health data in title/body or data.
  // Firebase is not automatically a Health Data Protection Business Associate; verify BAA
  // before sending any health-related content via push.
  // ──────────────────────────────────────────────────────────────────────────
  if (!isPushEnabled()) {
    // Push disabled in this environment.
    return { ok: true, provider: 'mock-push', messageId: `mock_${Date.now()}`, mock: true }
  }
  try {
    const messaging = getFirebase() as {
      send: (m: {
        token: string
        notification: { title: string; body: string }
        data?: Record<string, string>
      }) => Promise<string>
    }
    const id = await messaging.send({
      token: p.token,
      notification: { title: p.title, body: p.body },
      data: p.data,
    })
    return { ok: true, provider: 'firebase', messageId: id }
  } catch (e) {
    return {
      ok: false,
      provider: 'firebase',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---------------------------------------------------------------------------
// PostHog (Analytics)
// ---------------------------------------------------------------------------

let _postHog: unknown = null
let _phLoaded = false

export function getPostHog(): unknown | null {
  if (!hasEnv('POSTHOG_KEY')) return null
  if (!_phLoaded) {
    try {
      const PostHog = (lazyRequire('posthog-node') as { PostHog?: new (key: string, opts: Record<string, unknown>) => unknown } | null)?.PostHog ?? null
      if (PostHog) {
        _postHog = new PostHog(env('POSTHOG_KEY')!, {
          host: env('POSTHOG_HOST') || 'https://app.posthog.com',
        })
      }
    } catch (e) {
      console.warn('[integrations] Failed to load posthog-node', e)
      _postHog = null
    }
    _phLoaded = true
  }
  return _postHog
}

export function isPostHogEnabled(): boolean {
  return hasEnv('POSTHOG_KEY')
}

export async function captureEvent(
  // ── sensitive health data BOUNDARY ──────────────────────────────────────────────────────────
  // PostHog is an analytics processor. Ensure `properties` does not contain
  // raw sensitive health data (diagnoses, medications, journal content, identifiers beyond
  // internal userId / distinctId). Only send non-sensitive interaction events.
  // ──────────────────────────────────────────────────────────────────────────
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  const ph = getPostHog() as {
    capture: (e: { distinctId: string; event: string; properties: Record<string, unknown> }) => void
    shutdown?: () => Promise<void>
  } | null
  if (!ph) {
    // PostHog disabled; events skipped silently in dev/mock.
    return
  }
  try {
    ph.capture({ distinctId, event, properties })
  } catch (e) {
    console.warn('[integrations] PostHog capture failed', e)
  }
}

// ---------------------------------------------------------------------------
// Request IP helper (used by Sentry + audit)
// ---------------------------------------------------------------------------

export function getRequestIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}
