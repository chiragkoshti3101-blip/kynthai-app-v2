import { buildDeidentifiedContext } from '@/lib/phi-filter';

export const HEALTH_REPORT_DISCLAIMER =
  'This report is AI-generated educational information, not medical advice. Discuss findings with a licensed clinician.';

export type HealthReportSourceData = {
  dateOfBirth?: string | Date | null;
  allergies?: unknown;
  span: number;
  startDate: string;
  endDate: string;
  medications: Array<{ name: string; dosage?: string; frequency?: string }>;
  conditions: Array<{ name: string; severity?: string }>;
  journalEntries: Array<{ mood?: string | null; symptoms?: string | null }>;
  adherence: {
    totalDoses: number;
    totalTaken: number;
    totalSkipped: number;
    adherencePct: number;
  };
  healthScores: Array<{ date: string; score: number }>;
  chatMessageCount: number;
};

/** Build the user message sent to the LLM — de-identified, no raw chat text or patient name. */
export function buildHealthReportLlmUserContent(data: HealthReportSourceData): string {
  const dob =
    data.dateOfBirth instanceof Date
      ? data.dateOfBirth.toISOString()
      : typeof data.dateOfBirth === 'string'
        ? data.dateOfBirth
        : undefined;

  const deidentified = buildDeidentifiedContext({
    dateOfBirth: dob,
    allergies: data.allergies,
    medications: data.medications,
    conditions: data.conditions,
    journals: data.journalEntries.map(j => ({
      mood: j.mood ?? undefined,
      symptoms: j.symptoms ?? undefined,
    })),
    chatHistory: [],
    emergencyAlerts: [],
    familyAlerts: [],
    familyMembers: [],
  });

  const stats = {
    periodDays: data.span,
    reportingWindow: { from: data.startDate, to: data.endDate },
    adherence: data.adherence,
    healthScoreTrend: data.healthScores.map(h => ({ date: h.date, score: h.score })),
    healthJournalEntryCount: data.journalEntries.length,
    recentAiChatTurnCount: data.chatMessageCount,
  };

  return `Generate a monthly health report using ONLY the de-identified context below. Do not invent patient names or quote chat messages.\n\nDE-IDENTIFIED CONTEXT:\n${deidentified}\n\nAGGREGATE STATS (JSON):\n${JSON.stringify(stats, null, 2)}`;
}

/** Regression helper — ensures identifiable chat/name patterns are absent from outbound LLM text. */
export function assertHealthReportPromptDeidentified(
  prompt: string,
  forbidden: { patientName?: string; chatSnippet?: string },
): void {
  if (forbidden.patientName && prompt.includes(forbidden.patientName)) {
    throw new Error('patient name leaked to LLM prompt');
  }
  if (forbidden.chatSnippet && prompt.includes(forbidden.chatSnippet)) {
    throw new Error('raw chat content leaked to LLM prompt');
  }
}
