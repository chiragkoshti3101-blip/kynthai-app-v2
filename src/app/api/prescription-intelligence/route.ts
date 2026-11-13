import { NextRequest, NextResponse } from 'next/server'
import { createChatCompletion, isAiAvailable, choicesOf } from '@/lib/nvidia'
import { db } from '@/lib/db'
import { requireAuthWithCsrf, jsonError, readJson, checkAiTier } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { sanitizeText } from '@/lib/security'
import { sanitizeForAi, PROMPT_BOUNDARY_OPEN, PROMPT_BOUNDARY_CLOSE } from '@/lib/validations/sanitize'
import { withAiTimeout, AiTimeoutError, AI_TIMEOUTS } from '@/lib/ai-timeout'
import { logger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

const MAX_TEXT_LEN = 5000

export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  // Audit: prescription scan access (queries medication + allergy sensitive health data)
  await logAudit(user.id, 'prescription_intelligence.create', { resourceType: 'PrescriptionIntelligence' })

  const tierErr = await checkAiTier(user, 'prescription analysis')
  if (tierErr) return tierErr

  try {
    const body = await readJson<{ imageData?: unknown; text?: unknown }>(req)
    if (!body) return jsonError('Invalid JSON', 400)

    const imageData = body.imageData ? String(body.imageData) : null
    const text = body.text ? sanitizeText(String(body.text), MAX_TEXT_LEN) : null

    if (!imageData && !text) {
      return jsonError('Either imageData (base64/data URI) or text is required', 400)
    }

    // Build patient context for interaction checking
    const patientContextParts: string[] = []
    if (user.allergies) {
      const safeAllergies = sanitizeForAi(user.allergies, 500)
      patientContextParts.push(`${PROMPT_BOUNDARY_OPEN}\nPatient allergies (from user profile):\n${safeAllergies}\n${PROMPT_BOUNDARY_CLOSE}`)
    }
    try {
      const meds = await db.medication.findMany({
        where: { userId: user.id, active: true },
        select: { name: true, dosage: true },
      })
      if (meds.length > 0) {
        patientContextParts.push(`Current medications: ${meds.map((m: any) => `${m.name} ${m.dosage}`).join(', ')}`)
      }
    } catch { /* ignore */ }

    const patientContext = patientContextParts.length > 0
      ? `\n\nPATIENT CONTEXT:\n${patientContextParts.join('\n')}\n\nCheck for interactions between new prescriptions and current medications.`
      : ''

    if (!isAiAvailable()) return NextResponse.json({ intelligence: null, message: 'AI prescription intelligence requires NVIDIA_API_KEY.' })
    
    const safeText = text ? sanitizeForAi(text, MAX_TEXT_LEN) : ''
    const textUserContent = `Analyze this prescription text and extract all medication information:\n\n"${safeText}"${patientContext}`

    let userMessage: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
    if (imageData) {
      const imageUrl = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`
      if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(imageUrl)) {
        return jsonError('imageData must be a base64 JPEG/PNG/WebP/GIF data URI', 400)
      }
      userMessage = [
        {
          type: 'text',
          text: `Analyze this prescription image and extract all medication information.${patientContext}`,
        },
        { type: 'image_url', image_url: { url: imageUrl } },
      ]
    } else {
      userMessage = textUserContent
    }

    const completion = await withAiTimeout(
      createChatCompletion({

        messages: [
          {
            role: 'assistant',
            content: `You are a clinical pharmacist AI assistant focused on US prescription analysis. Analyze the provided prescription and extract comprehensive medication information.

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "medications": [
    {
      "name": "Medicine name as prescribed",
      "genericName": "Generic/chemical name",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "timing": "With breakfast and dinner",
      "duration": "30 days or as prescribed",
      "instructions": "Special instructions from the prescription",
      "purpose": "What this medicine is for (in simple language)",
      "warnings": ["Warning 1", "Warning 2"],
      "patientExplanation": "Simple explanation the patient can understand"
    }
  ],
  "schedule": [
    {
      "time": "08:00",
      "medications": ["Medicine Name 500mg"],
      "instructions": "Take with breakfast"
    }
  ],
  "interactions": [
    {
      "medications": ["Med A", "Med B"],
      "severity": "mild | moderate | severe",
      "description": "What the interaction is",
      "recommendation": "What to do about it"
    }
  ],
  "warnings": [
    {
      "type": "allergy | interaction | contraindication | timing",
      "message": "Warning message",
      "severity": "info | caution | critical"
    }
  ],
  "refillReminder": {
    "daysSupply": 30,
    "refillBy": "2026-07-29"
  },
  "patientNotes": "Summary of key points the patient should know",
  "doctorNotes": "Clinical notes for the prescribing doctor"
}

Guidelines:
- Provide patient-friendly explanations for each medication
- Flag any drug interactions with current medications
- Include timing optimization advice
- If you cannot read something clearly, note it as "unclear" rather than guessing
- Always include a disclaimer that this is AI analysis and the patient should verify with their doctor`,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
      imageData ? AI_TIMEOUTS.MEDIA : AI_TIMEOUTS.COMPLEX
    )

    const content = choicesOf(completion)[0]?.message?.content || ''
    let result: Record<string, unknown>
    try {
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      result = JSON.parse(cleaned)
    } catch {
      result = {
        medications: [],
        schedule: [],
        interactions: [],
        warnings: [],
        patientNotes: content || 'Unable to parse prescription. Please try again with a clearer image or text.',
        doctorNotes: '',
      }
    }

    // Store the prescription intelligence for future reference
    try {
      await db.prescriptionIntelligence.create({
        data: {
          userId: user.id,
          rawText: text || null,
          imageData: imageData ? '[stored]' : null,
          medications: JSON.stringify(result.medications || []),
          schedule: JSON.stringify(result.schedule || []),
          interactions: JSON.stringify(result.interactions || []),
          warnings: JSON.stringify(result.warnings || []),
        },
      })
    } catch { /* ignore storage errors */ }

    return NextResponse.json(result)
  } catch (error) {
    // Security: never log raw prescription images, text, or AI analysis errors
    logger.phiSafeError(error, 'prescription-intelligence.POST')
    if (error instanceof AiTimeoutError) {
      return NextResponse.json(
        { error: 'Prescription analysis timed out. Please try again.' },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to analyze prescription' },
      { status: 500 }
    )
  }
}
