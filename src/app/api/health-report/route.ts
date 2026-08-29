import { NextRequest, NextResponse } from 'next/server'
import { createChatCompletion, choicesOf } from '@/lib/nvidia'
import { db } from '@/lib/db'
import { requireAuthWithCsrf, checkAiTier, jsonError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { withAiTimeout, AiTimeoutError, AI_TIMEOUTS } from '@/lib/ai-timeout'
import { logger } from '@/lib/logger'
import { dateStr, daysAgo } from '@/lib/utils'
export const dynamic = 'force-dynamic'

// POST /api/health-report — Generate monthly AI health report
export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const tierErr = await checkAiTier(user, 'health report')
  if (tierErr) return tierErr

  // Audit: health report generation (accesses medication + journal + lab sensitive health data)
  await logAudit(user.id, 'health.report.generate', { resourceType: 'HealthScore' })

  try {
    const { days = 30 } = await req.json()
    const span = Math.min(Math.max(days, 7), 90)

    // Gather comprehensive health data
    const meds = await db.medication.findMany({
      where: { userId: user.id, active: true },
    })
    const medIds = meds.map((m: any) => m.id)

    // Get reminders
    const startDate = daysAgo(Math.floor(span))
    const endDate = dateStr(new Date())
    const allReminders = medIds.length
      ? await db.reminder.findMany({
          where: { medicationId: { in: medIds }, date: { gte: startDate, lte: endDate } },
        })
      : []

    // Get health journal entries
    const journalEntries = await db.healthJournal.findMany({
      where: { userId: user.id, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    })

    // Get health scores
    const healthScores = await db.healthScore.findMany({
      where: { userId: user.id, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    })

    // Get chat history (recent health questions)
    const chatMessages = await db.chatMessage.findMany({
      where: {
        userId: user.id,
        source: 'llm',
        createdAt: { gte: new Date(Date.now() - span * 86_400_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Get chronic conditions
    const conditions = await db.chronicCondition.findMany({
      where: { patientId: user.id, active: true },
    })

    // Calculate adherence
    const totalDoses = allReminders.length
    const totalTaken = allReminders.filter((r: any) => r.status === 'taken').length
    const adherence = totalDoses === 0 ? 0 : Math.round((totalTaken / totalDoses) * 100)

    // Build data payload
    const dataPayload = {
      periodDays: span,
      patient: {
        name: user.name,
        age: user.dateOfBirth
          ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null,
        allergies: user.allergies,
      },
      medications: meds.map((m: any) => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        times: m.times,
      })),
      chronicConditions: conditions.map((c: any) => ({
        name: c.name,
        severity: c.severity,
      })),
      adherence: {
        totalDoses,
        totalTaken,
        totalSkipped: allReminders.filter((r: any) => r.status === 'skipped').length,
        adherencePct: adherence,
      },
      healthScores: healthScores.map((h: any) => ({
        date: h.date,
        score: h.score,
      })),
      journalSummary: {
        totalEntries: journalEntries.length,
        symptomsReported: journalEntries.reduce((acc, j) => {
          const syms = JSON.parse(j.symptoms || '[]')
          return acc + syms.length
        }, 0),
        averageMood: getMostCommon(journalEntries.map((j: any) => j.mood).filter(Boolean)),
      },
      recentHealthQuestions: chatMessages.slice(0, 5).map((m: any) => m.content),
    }

    
    const completion = await withAiTimeout(
      createChatCompletion({

        messages: [
          {
            role: 'assistant',
            content: `You are Dr. Kynthai, generating a comprehensive monthly health report for a patient. This report should be thorough, personalized, and actionable.

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "reportTitle": "Monthly Health Report for [Patient Name]",
  "period": "June 1 - June 30, 2026",
  "executiveSummary": "2-3 sentence overview of the patient's health this month",
  "adherenceAnalysis": {
    "score": "Excellent | Good | Fair | Poor",
    "details": "Analysis of medication adherence patterns",
    "improvements": ["Suggestion 1", "Suggestion 2"]
  },
  "medicationEffectiveness": [
    {
      "medication": "Med name",
      "effectiveness": "How well it appears to be working based on data",
      "concerns": "Any concerns observed",
      "recommendations": "Suggestions for the doctor"
    }
  ],
  "healthTrends": {
    "positive": ["Positive trend 1", "Positive trend 2"],
    "concerning": ["Concerning trend 1"],
    "stable": ["Stable aspect 1"]
  },
  "lifestyleRecommendations": [
    {
      "category": "diet | exercise | sleep | stress",
      "recommendation": "Specific actionable recommendation",
      "reason": "Why this matters for their conditions"
    }
  ],
  "upcomingScreenings": [
    {
      "test": "HbA1c",
      "reason": "Diabetes monitoring",
      "suggestedDate": "2026-07-15",
      "frequency": "Every 3 months"
    }
  ],
  "questionsForDoctor": [
    "Question 1 the patient should ask at their next visit",
    "Question 2"
  ],
  "overallHealthScore": {
    "score": 0-100,
    "trend": "improving | stable | declining",
    "explanation": "Why this score"
  },
  "motivationalNote": "A warm, personalized message encouraging the patient"
}

Be thorough, specific, and reference actual data. Use relevant clinical context and region-appropriate preventive-care guidance where relevant.`,
          },
          {
            role: 'user',
            content: `Generate my monthly health report based on this data:\n\n${JSON.stringify(dataPayload, null, 2)}`,
          },
        ],
      }),
      AI_TIMEOUTS.COMPLEX
    )

    const content = choicesOf(completion)[0]?.message?.content || ''
    let report: Record<string, unknown>
    try {
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      report = JSON.parse(cleaned)
    } catch {
      report = {
        reportTitle: `Health Report for ${user.name}`,
        period: `${startDate} to ${endDate}`,
        executiveSummary: content || 'Report generation completed.',
        adherenceAnalysis: { score: 'Good', details: `${adherence}% adherence`, improvements: [] },
        medicationEffectiveness: [],
        healthTrends: { positive: [], concerning: [], stable: [] },
        lifestyleRecommendations: [],
        upcomingScreenings: [],
        questionsForDoctor: [],
        overallHealthScore: { score: adherence, trend: 'stable', explanation: 'Based on medication adherence' },
        motivationalNote: 'Keep up the good work with your health!',
      }
    }

    return NextResponse.json({
      report,
      stats: {
        adherence,
        totalDoses,
        totalTaken,
        journalEntries: journalEntries.length,
        healthScores: healthScores.length,
      },
    })
  } catch (error) {
    logger.phiSafeError(error)
    if (error instanceof AiTimeoutError) {
      return NextResponse.json(
        { error: 'Health report generation timed out. Please try again.' },
        { status: 504 }
      )
    }
    return jsonError('Failed to generate health report', 500, 'REPORT_ERROR')
  }
}

function getMostCommon(arr: (string | null)[]): string | null {
  if (arr.length === 0) return null
  const counts = new Map<string, number>()
  for (const item of arr) {
    if (item) counts.set(item, (counts.get(item) || 0) + 1)
  }
  let maxCount = 0
  let mostCommon: string | null = null
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      mostCommon = item
    }
  }
  return mostCommon
}
