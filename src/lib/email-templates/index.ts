/**
 * Email template utilities for Kynthai.
 *
 * Each function returns { subject, html } — a plain object ready to pass
 * directly to the email transport (SendGrid, Nodemailer, Resend, etc.).
 * No framework dependency — server-only, no React required.
 */

const BRAND = 'Kynthai'
const BRAND_COLOR = '#10b981'
const TEAL = '#0d9488'
const BG = '#f9fafb'
const CARD_BG = '#ffffff'
const TEXT = '#111827'
const MUTED = '#6b7280'
const LINK = BRAND_COLOR

function wrap(subject: string, body: string): { subject: string; html: string } {
  return {
    subject,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${BRAND}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${TEXT};">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,${BRAND_COLOR},${TEAL});padding:18px 24px;">
    <tr>
      <td>
        <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">${BRAND}</span>
        <span style="font-size:11px;color:rgba(255,255,255,.75);display:block;margin-top:2px;">AI Health Companion · Made in USA</span>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:${CARD_BG};border-radius:14px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 20px;font-size:15px;line-height:1.65;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 22px;font-size:11px;color:${MUTED};line-height:1.6;">
              <p style="margin:0 0 6px;">
                You&apos;re receiving this because you have a ${BRAND} account.
                <a href="https://kynthai.app/settings" style="color:${LINK};text-decoration:none;">Manage preferences</a>
              </p>
              <p style="margin:0;">
                &copy; ${new Date().getFullYear()} Kynthai Health Technologies &middot;
                <a href="https://kynthai.app/privacy" style="color:${LINK};text-decoration:none;">Privacy Policy</a>
                &middot;
                <a href="https://kynthai.app/terms" style="color:${LINK};text-decoration:none;">Terms of Service</a>
              </p>
              <p style="margin:6px 0 0;">
                <a href="mailto:privacy@kynthai.app" style="color:${LINK};text-decoration:none;">privacy@kynthai.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

</body>
</html>`,
  }
}

export function ctaButton(href: string, label: string): string {
  return `
  <tr>
    <td style="padding:0 28px 24px;" align="center">
      <a href="${href}"
         style="display:inline-block;padding:12px 28px;border-radius:9999px;background:linear-gradient(135deg,${BRAND_COLOR},${TEAL});color:#fff;font-weight:600;font-size:14px;text-decoration:none;box-shadow:0 2px 8px rgba(16,185,129,.35);">
        ${label}
      </a>
    </td>
  </tr>`
}

export function welcomeEmail({ name, loginLink }: { name: string; loginLink: string }): {
  subject: string
  html: string
} {
  const body = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">
      Welcome to <strong>${BRAND}</strong> — your AI-assisted health companion, built for families everywhere.
      Manage medications, track symptoms, consult doctors, and keep your whole family&apos;s health in one place.
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">
      Your account is active. Log in any time to get started.
    </p>
  `
  const { subject, html } = wrap('Welcome to Kynthai — your health journey starts here', body)
  return { subject, html: html.replace('__CTA__', ctaButton(loginLink, 'Log in to Kynthai')) }
}

export function passwordResetEmail({ name, resetLink, expiresInMinutes }: {
  name: string
  resetLink: string
  expiresInMinutes: number
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">
      We received a request to reset your ${BRAND} account password.
      Click the button below to choose a new password:
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">
      This link expires in <strong>${expiresInMinutes} minutes</strong>.
      If you didn&apos;t request a reset, you can safely ignore this email.
    </p>
  `
  const { subject, html } = wrap('Reset your Kynthai password', body)
  return { subject, html: html.replace('__CTA__', ctaButton(resetLink, 'Reset Password')) }
}

export function prescriptionInviteEmail({
  patientName,
  doctorName,
  medications,
  inviteLink,
}: {
  patientName: string
  doctorName: string
  medications: string
  inviteLink: string
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(patientName)},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(doctorName)}</strong> has shared a prescription with you on
      <strong>${BRAND}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;padding:14px 18px;margin-bottom:16px;">
      <tr>
        <td style="font-size:13px;padding:6px 4px;">
          <strong style="color:${TEAL};">Medications (${escapeHtml(medications)})</strong><br />
          Tap the button below to review, accept, and start reminders.
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">
      This invite is personal — don&apos;t share the link.
    </p>
  `
  const { subject, html } = wrap(`📩 Prescription from ${escapeHtml(doctorName)} — Kynthai`, body)
  return { subject, html: html.replace('__CTA__', ctaButton(inviteLink, 'Review Prescription')) }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export { wrap }
