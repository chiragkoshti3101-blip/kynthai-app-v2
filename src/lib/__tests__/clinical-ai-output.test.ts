import { describe, expect, it } from 'vitest'
import {
  sanitizeInteractionAnalysisOutput,
  sanitizeSymptomAnalysisOutput,
  CLINICAL_AI_DISCLAIMER,
} from '@/lib/clinical-ai-output'

describe('clinical AI output controls (KYN-HIGH-003/004)', () => {
  it('caps OTC options and appends disclaimer for symptom analysis', () => {
    const out = sanitizeSymptomAnalysisOutput({
      otcOptions: ['a', 'b', 'c', 'd', 'e'],
      possibleCauses: ['viral'],
      disclaimer: 'Educational only.',
    })
    expect((out.otcOptions as string[]).length).toBeLessThanOrEqual(3)
    expect(String(out.disclaimer)).toContain(CLINICAL_AI_DISCLAIMER)
  })

  it('replaces alternative medication suggestions with prescriber framing', () => {
    const out = sanitizeInteractionAnalysisOutput({
      interactions: [
        {
          alternativeSuggestion: 'Switch to Drug X immediately',
          recommendation: 'Stop drug A',
        },
      ],
      generalNote: 'Be careful',
    })
    const row = (out.interactions as Array<Record<string, string>>)[0]
    expect(row?.alternativeSuggestion).toMatch(/prescriber|pharmacist/i)
    expect(row?.alternativeSuggestion).not.toMatch(/Switch to Drug X/i)
  })
})
