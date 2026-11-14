// src/app/api/emergency/route.ts
// API route for emergency/SOS alert operations
// All endpoints require authentication

import { NextRequest, NextResponse } from 'next/server';
import { createEmergencyAlert, getEmergencyAlerts, resolveEmergencyAlert, getUserFamilyId } from '@/lib/emergency';
import { getAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const alerts = await getEmergencyAlerts(auth.userId);
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('[emergency-api] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch emergency alerts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type = 'medical', tier = 'high', location } = body;

    const { familyId, familyMemberId } = await getUserFamilyId(auth.userId);
    if (!familyId || !familyMemberId) {
      return NextResponse.json(
        { error: 'No family found for user. Emergency alerts require a family context.' },
        { status: 400 }
      );
    }

    const result = await createEmergencyAlert(
      auth.userId,
      familyId,
      familyMemberId,
      type,
      tier,
      location
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ alert: result.alert }, { status: 201 });
  } catch (error) {
    console.error('[emergency-api] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create emergency alert' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { alertId } = await request.json();
    if (!alertId) {
      return NextResponse.json({ error: 'alertId is required' }, { status: 400 });
    }

    const result = await resolveEmergencyAlert(alertId, auth.userId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[emergency-api] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to resolve emergency alert' }, { status: 500 });
  }
}
