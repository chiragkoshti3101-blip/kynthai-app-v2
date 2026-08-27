import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/auth';
import { jsonOk, jsonError, requireAuth } from '@/lib/api-helpers';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

import { todayStr, yesterdayStr, startOfWeek } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    const { response, user } = await requireAuth(req);
    if (response || !user) return response!;

    const userId = user.id;

    // Audit: health pulse read
    await logAudit(user.id, 'health.pulse.read', { resourceType: 'HealthScore' });

    const isDemo = user.isDemo || false;
    const today = todayStr();
    const yesterday = yesterdayStr();
    const weekStart = startOfWeek();

    if (isDemo) {
      // FIX #8: demo accounts used to return before the HealthScore upsert,
      // so the profile card stayed on "No data yet" forever. Persist the demo
      // score the same way the real path persists its computed score.
      const demoBreakdown = { adherence: 32, streak: 16, journal: 10, symptoms: 8, ai: 6 };
      db.healthScore
        .upsert({
          where: { userId_date: { userId, date: today } },
          create: { userId, date: today, score: 78, breakdown: JSON.stringify(demoBreakdown) },
          update: { score: 78, breakdown: JSON.stringify(demoBreakdown) },
        })
        .catch(() => {
          /* non-fatal */
        });
      return jsonOk({
        score: 78,
        breakdown: { adherence: 32, streak: 16, journal: 10, symptoms: 8, ai: 6 },
        trend: 'up' as const,
        insight: 'Great adherence this week! Keep it going.',
        streakDays: 5,
      });
    }

    // Fetch medications first, then reminders by medication IDs
    const medications = await db.medication.findMany({
      where: { userId, active: true },
      select: { id: true },
    });
    const medIds = medications.map((m: any) => m.id);

    const [
      todayRems,
      yesterdayRems,
      streak,
      weekJournals,
      todayJournal,
      todayChatCount,
      yesterdayScore,
    ] = await Promise.all([
      medIds.length > 0
        ? db.reminder.findMany({ where: { medicationId: { in: medIds }, date: todayStr() } })
        : [],
      medIds.length > 0
        ? db.reminder.findMany({ where: { medicationId: { in: medIds }, date: yesterday } })
        : [],
      db.userStreak.findMany({ where: { userId } }),
      db.healthJournal.findMany({ where: { userId, date: { gte: weekStart } } }),
      db.healthJournal.findUnique({ where: { userId_date: { userId, date: today } } }),
      db.chatMessage.count({
        where: { userId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      db.healthScore.findUnique({ where: { userId_date: { userId, date: yesterday } } }),
    ]);

    // 1. Medication adherence (40 points)
    let adherence = 0;
    if (todayRems.length > 0) {
      const taken = todayRems.filter((r: any) => r.status === 'taken').length;
      adherence = Math.round((taken / todayRems.length) * 40);
    } else if (medications.length > 0) {
      // Meds exist but no reminders generated yet
      adherence = 10;
    }

    // 2. Streak status (20 points)
    const medsStreak = streak.find((s: any) => s.type === 'daily_meds');
    const streakDays = medsStreak?.count ?? 0;
    const streakScore = streakDays >= 3 ? 20 : streakDays >= 1 ? 10 : 0;

    // 3. Journal entries this week (20 points)
    const journalScore = weekJournals.length >= 3 ? 20 : weekJournals.length >= 1 ? 10 : 0;

    // 4. Symptoms logged today (10 points)
    let symptomScore = 0;
    if (todayJournal) {
      try {
        const symptoms = JSON.parse(todayJournal.symptoms || '[]');
        if (Array.isArray(symptoms) && symptoms.length > 0) symptomScore = 10;
      } catch {
        /* ignore */
      }
    }

    // 5. AI chat usage today (10 points)
    const aiScore = todayChatCount > 0 ? 10 : 0;

    const totalScore = Math.min(
      100,
      adherence + streakScore + journalScore + symptomScore + aiScore
    );

    // Determine trend vs yesterday
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (yesterdayScore) {
      if (totalScore > yesterdayScore.score) trend = 'up';
      else if (totalScore < yesterdayScore.score) trend = 'down';
    }

    // Generate contextual insight
    const insight = generateInsight(
      totalScore,
      adherence,
      streakDays,
      weekJournals.length,
      todayJournal,
      todayChatCount,
      medications.length
    );

    // Persist score for trend tracking (non-blocking)
    const todayScore = totalScore;
    const todayBreakdown = {
      adherence,
      streak: streakScore,
      journal: journalScore,
      symptoms: symptomScore,
      ai: aiScore,
    };
    const todayDate = todayStr();
    const responseBody = {
      score: todayScore,
      breakdown: todayBreakdown,
      trend,
      insight,
      streakDays,
    };

    // Save score asynchronously — don't block the response
    db.healthScore
      .upsert({
        where: { userId_date: { userId, date: todayDate } },
        create: {
          userId,
          date: todayDate,
          score: todayScore,
          breakdown: JSON.stringify(todayBreakdown),
        },
        update: { score: todayScore, breakdown: JSON.stringify(todayBreakdown) },
      })
      .catch(() => {
        /* ignore persistence errors */
      });

    return jsonOk(responseBody);
  } catch (err) {
    logger.phiSafeError(err);
    return jsonError('Failed to calculate health pulse', 500);
  }
}

function generateInsight(
  score: number,
  adherence: number,
  streakDays: number,
  journalCount: number,
  todayJournal: { symptoms: string } | null,
  chatCount: number,
  medCount: number
): string {
  const parts: string[] = [];

  // Score-based opening
  if (score >= 80) {
    parts.push('Great adherence today!');
  } else if (score >= 60) {
    if (adherence < 30 && medCount > 0) {
      parts.push('Missed some doses — stay on track');
    } else {
      parts.push('Good progress today');
    }
  } else if (score >= 40) {
    if (adherence === 0 && medCount > 0) {
      parts.push('Missed all doses — time to get back on track');
    } else {
      parts.push('Room for improvement today');
    }
  } else {
    if (medCount > 0) {
      parts.push("Let's get back on track with your medications");
    } else {
      parts.push('Add medications to start building your health score');
    }
  }

  // Streak encouragement
  if (streakDays === 0 && medCount > 0) {
    parts.push('Start a streak by taking your meds today');
  } else if (streakDays >= 7) {
    parts.push(`${streakDays}-day streak — keep it up!`);
  }

  // Journal encouragement
  if (journalCount === 0) {
    parts.push('First journal entry this week');
  }

  // AI encouragement
  if (chatCount === 0) {
    parts.push('Try asking Dr. Kynthai a question');
  }

  return parts.slice(0, 2).join('. ') + '.';
}
