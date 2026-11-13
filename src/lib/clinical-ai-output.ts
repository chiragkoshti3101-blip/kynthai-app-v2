import { safeAIResponse } from '@/lib/ai-output-filter';

export const CLINICAL_AI_DISCLAIMER =
  'This information is educational only and not a diagnosis. For urgent symptoms, seek emergency care. Always consult a licensed clinician or pharmacist before starting or changing medications.';

const MAX_OTC_OPTIONS = 3;

export function sanitizeSymptomAnalysisOutput(analysis: Record<string, unknown>): Record<string, unknown> {
  const otc = Array.isArray(analysis.otcOptions)
    ? analysis.otcOptions.slice(0, MAX_OTC_OPTIONS).map(x => safeAIResponse(String(x)))
    : [];

  const disclaimer =
    typeof analysis.disclaimer === 'string' && analysis.disclaimer.trim()
      ? safeAIResponse(analysis.disclaimer)
      : CLINICAL_AI_DISCLAIMER;

  return {
    ...analysis,
    otcOptions: otc,
    disclaimer: `${disclaimer} ${CLINICAL_AI_DISCLAIMER}`.trim(),
    possibleCauses: Array.isArray(analysis.possibleCauses)
      ? analysis.possibleCauses.map(x => safeAIResponse(String(x)))
      : [],
    selfCareTips: Array.isArray(analysis.selfCareTips)
      ? analysis.selfCareTips.map(x => safeAIResponse(String(x)))
      : [],
    redFlags: Array.isArray(analysis.redFlags)
      ? analysis.redFlags.map(x => safeAIResponse(String(x)))
      : [],
    whenToSeeDoctor:
      typeof analysis.whenToSeeDoctor === 'string'
        ? safeAIResponse(analysis.whenToSeeDoctor)
        : CLINICAL_AI_DISCLAIMER,
  };
}

export function sanitizeInteractionAnalysisOutput(result: Record<string, unknown>): Record<string, unknown> {
  const interactions = Array.isArray(result.interactions)
    ? result.interactions.map((row: Record<string, unknown>) => ({
        ...row,
        alternativeSuggestion: 'Discuss any medication changes with your prescriber or pharmacist.',
        recommendation:
          typeof row.recommendation === 'string'
            ? safeAIResponse(row.recommendation)
            : 'Consult your prescriber or pharmacist.',
        description: typeof row.description === 'string' ? safeAIResponse(row.description) : row.description,
      }))
    : [];

  const generalNote =
    typeof result.generalNote === 'string' && result.generalNote.trim()
      ? safeAIResponse(result.generalNote)
      : CLINICAL_AI_DISCLAIMER;

  return {
    ...result,
    interactions,
    summary: typeof result.summary === 'string' ? safeAIResponse(result.summary) : result.summary,
    generalNote: `${generalNote} ${CLINICAL_AI_DISCLAIMER}`.trim(),
  };
}
