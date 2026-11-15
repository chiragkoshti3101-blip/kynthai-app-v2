// src/app/api/emergency/route.ts
// Legacy SOS endpoint (non-auth, backward compatible)
// POST /api/emergency - Trigger SOS
// GET /api/emergency - Check emergency status
import { NextResponse } from 'next/server';
import { triggerSOS, checkEmergencyStatus } from '@/lib/emergency';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, type = 'sos', location } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const result = await triggerSOS(userId, type, location);

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        alertId: result.alertId,
        notifiedDoctors: result.notifiedDoctors,
        summary: result.summary,
        message: 'Emergency alert sent to family members' 
      });
    }

    return NextResponse.json({ error: result.error }, { status: 500 });
  } catch (error) {
    console.error('Emergency endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const status = await checkEmergencyStatus(userId);
    return NextResponse.json(status);
  } catch (error) {
    console.error('Emergency GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
