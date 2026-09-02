import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, sanitizeText } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { escapeHtml } from '@/lib/validations/sanitize'
export const dynamic = 'force-dynamic'

/** Alias for backwards-compat — prefer escapeHtml in new code */
const esc = escapeHtml

// POST /api/doctors/prescription-pdf
// Returns a printable HTML prescription with Kynthai branding.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const isDoctor = user.role === 'doctor'
  const isPatient = user.role === 'patient'
  await logAudit(user.id, isDoctor ? 'doctor.prescription.pdf' : 'patient.prescription.pdf', {
    resourceType: 'Prescription',
  })
  if (!isDoctor && !isPatient) {
    return jsonError('Only the issuing doctor or the patient may download this prescription', 403)
  }

  const body = await readJson<{ prescriptionId: string }>(req)
  if (!body?.prescriptionId) return jsonError('prescriptionId is required', 400)

  const prescription = await db.prescription.findUnique({
    where: { id: body.prescriptionId },
    include: { doctor: { include: { user: true } }, patient: true },
  })
  if (!prescription) return jsonError('Prescription not found', 404)
  if (isDoctor && prescription.doctor.userId !== user.id) return jsonError('Forbidden', 403)
  if (isPatient && prescription.patientId !== user.id) return jsonError('Forbidden', 403)

  const doctor = prescription.doctor
  const patient = prescription.patient
  const meds = JSON.parse(prescription.medications || '[]') as Array<{
    name: string
    dosage: string
    frequency: string
    instructions?: string
  }>

  const dateStr = prescription.createdAt.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const followUpStr = prescription.followUpDate
    ? prescription.followUpDate.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—'

  const medRows = meds
    .map(
      (m, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${esc(m.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${esc(m.dosage)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${esc(m.frequency)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${esc(m.instructions || '—')}</td>
      </tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prescription — Kynthai</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      <h1 style="font-size:24px;font-weight:700;color:#059669;">Kynthai</h1>
      <p style="font-size:11px;color:#6b7280;margin-top:2px;">AI Health Management Platform</p>
    </div>
    <div style="text-align:right;">
      <p style="font-size:12px;color:#6b7280;">Date</p>
      <p style="font-size:14px;font-weight:600;">${dateStr}</p>
    </div>
  </div>

  <hr style="border:none;border-top:2px solid #059669;margin-bottom:24px;" />

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
    <div>
      <p style="font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.05em;margin-bottom:4px;">Doctor</p>
      <p style="font-size:15px;font-weight:600;">Dr. ${esc(doctor.user.name)}</p>
      <p style="font-size:13px;color:#374151;">${esc(doctor.specialization)}</p>
      <p style="font-size:12px;color:#6b7280;">License: ${esc(doctor.licenseNumber)}</p>
    </div>
    <div>
      <p style="font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.05em;margin-bottom:4px;">Patient</p>
      <p style="font-size:15px;font-weight:600;">${esc(patient.name)}</p>
      <p style="font-size:12px;color:#6b7280;">${esc(patient.email)}</p>
    </div>
  </div>

  ${prescription.notes ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
    <p style="font-size:11px;text-transform:uppercase;color:#059669;font-weight:600;margin-bottom:4px;">Notes</p>
    <p style="font-size:13px;color:#374151;">${esc(prescription.notes)}</p>
  </div>` : ''}

  <h2 style="font-size:16px;font-weight:700;margin-bottom:12px;">Medications</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">#</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Name</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Dosage</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Frequency</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Instructions</th>
      </tr>
    </thead>
    <tbody>${medRows}</tbody>
  </table>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:40px;">
    <div>
      <p style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Follow-up Date</p>
      <p style="font-size:14px;font-weight:600;">${followUpStr}</p>
    </div>
    ${prescription.followUpNotes ? `<div>
      <p style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Follow-up Notes</p>
      <p style="font-size:13px;">${esc(prescription.followUpNotes)}</p>
    </div>` : ''}
  </div>

  <div style="margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px;">
    <div>
      <div style="border-top:1px solid #d1d5db;width:200px;padding-top:8px;">
        <p style="font-size:12px;color:#6b7280;">Patient Signature</p>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="border-top:1px solid #d1d5db;width:200px;padding-top:8px;margin-left:auto;">
        <p style="font-size:12px;color:#6b7280;">Dr. ${esc(doctor.user.name)}</p>
        <p style="font-size:11px;color:#9ca3af;">${esc(doctor.specialization)} · ${doctor.licenseNumber}</p>
      </div>
    </div>
  </div>

  <div class="no-print" style="margin-top:32px;text-align:center;">
    <button onclick="window.print()" style="background:#059669;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;">
      Print / Save as PDF
    </button>
  </div>

  <p style="margin-top:24px;text-align:center;font-size:10px;color:#9ca3af;">
    Generated by Kynthai · ${dateStr} · Rx#${prescription.id.slice(0, 8).toUpperCase()}
  </p>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
