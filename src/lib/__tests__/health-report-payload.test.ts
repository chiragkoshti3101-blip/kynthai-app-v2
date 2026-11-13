import { describe, expect, it } from 'vitest'
import {
  assertHealthReportPromptDeidentified,
  buildHealthReportLlmUserContent,
} from '@/lib/health-report-payload'

describe('health report LLM payload (KYN-HIGH-002)', () => {
  it('omits patient name and raw chat content from outbound prompt', () => {
    const secretChat = 'My chest pain started after stopping lisinopril yesterday'
    const prompt = buildHealthReportLlmUserContent({
      dateOfBirth: '1988-06-01',
      allergies: ['penicillin'],
      span: 30,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      medications: [{ name: 'Metformin', dosage: '500mg', frequency: 'BID' }],
      conditions: [{ name: 'Type 2 diabetes' }],
      journalEntries: [{ mood: 'okay', symptoms: '["fatigue"]' }],
      adherence: { totalDoses: 10, totalTaken: 8, totalSkipped: 2, adherencePct: 80 },
      healthScores: [{ date: '2026-01-15', score: 72 }],
      chatMessageCount: 3,
    })

    expect(prompt).not.toContain('Jane Doe')
    expect(prompt).not.toContain(secretChat)
    expect(prompt).toContain('AGE RANGE:')
    expect(prompt).toContain('recentAiChatTurnCount')

    expect(() =>
      assertHealthReportPromptDeidentified(prompt, {
        patientName: 'Jane Doe',
        chatSnippet: secretChat,
      }),
    ).not.toThrow()
  })
})
