import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/security';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 5, 60000);
  if (limited) return limited;
  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  const out: any = {};

  const doctorUser = await db.user.findUnique({ where: { email: 'doctor@kynthai.app' }, select: { id: true } });
  const patient = await db.user.findUnique({ where: { email: 'patient@kynthai.app' }, select: { id: true } });
  if (!doctorUser || !patient) return jsonOk({ rx: 'no users found' });
  const profile = await db.doctorProfile.findUnique({ where: { userId: doctorUser.id }, select: { id: true } });
  if (!profile) return jsonOk({ rx: 'no doctor profile' });

  try {
    const rx = await db.prescription.create({
      data: {
        doctorId: profile.id,
        patientId: patient.id,
        notes: 'test rx',
        medications: JSON.stringify([{id:'m1',name:'Amoxicillin',dosage:'500mg',times:['08:00'],frequency:'Daily',instructions:'x'}]),
        inviteToken: 'testtoken123',
        inviteStatus: 'sent',
        inviteExpiresAt: new Date(),
      },
    });
    out.rx = 'OK id=' + rx.id;
    await db.prescription.delete({ where: { id: rx.id } });
  } catch(e:any) {
    out.rx = 'FAIL: ' + e?.message?.slice(0,200);
  }

  return jsonOk(out);
}