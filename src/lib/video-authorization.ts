import { db } from '@/lib/db'
import {
  computeVerificationLevel,
  meetsVerificationLevel,
  type VerificationLevel,
} from '@/lib/patient-verify'

/**
 * Minimum identity level for the patient to open a live video consultation.
 *
 * `email_verified` is deliberately the first rung to be enforced: it is the
 * highest level a patient can actually reach in the product today (the phone /
 * ID steps in `patient-identity-confirmation.tsx` are not mounted anywhere), so
 * requiring `identity_confirmed` here would lock every patient out of their own
 * consult. Raise this constant once that dialog has a route in the app.
 */
export const VIDEO_JOIN_MIN_LEVEL: VerificationLevel = 'email_verified'

export type JoinDenial = 'not_participant' | 'identity_required'

/** The identity evidence `requireAuth` now carries on every request. */
export type IdentityFlags = {
  emailVerified?: string | Date | null
  phoneVerified?: boolean
  identityConfirmed?: boolean
  idDocumentUploaded?: boolean
  idDocumentVerified?: boolean
  verificationRejectedReason?: string | null
}

/** Level straight from the session object — no IO. */
export function patientIdentityLevelFromUser(user: IdentityFlags): VerificationLevel {
  return computeVerificationLevel({
    emailVerified: Boolean(user.emailVerified),
    phoneVerified: Boolean(user.phoneVerified),
    identityConfirmed: Boolean(user.identityConfirmed),
    idDocumentUploaded: Boolean(user.idDocumentUploaded),
    idDocumentVerified: Boolean(user.idDocumentVerified),
    rejected: Boolean(user.verificationRejectedReason),
  })
}

/**
 * Flags are always present on a `requireAuth` user (possibly null/false), so
 * the row read is only a fallback for callers that pass a bare `{ id, role }`.
 */
async function resolveIdentityLevel(user: IdentityFlags & { id: string }): Promise<VerificationLevel> {
  const carriesFlags =
    'emailVerified' in user ||
    'phoneVerified' in user ||
    'idDocumentUploaded' in user ||
    'identityConfirmed' in user
  return carriesFlags ? patientIdentityLevelFromUser(user) : patientIdentityLevel(user.id)
}

export type JoinAuthorization = {
  allowed: boolean
  /** Caller is the patient on this appointment (not the doctor or a caretaker). */
  isPatient: boolean
  reason?: JoinDenial
  currentLevel?: VerificationLevel
  requiredLevel?: VerificationLevel
}

/**
 * Current patient identity level, computed from the stored flags.
 *
 * This reads the row rather than trusting the session user: `requireAuth`
 * builds its user object with the verification flags hardcoded to false, so
 * anything derived from `user.phoneVerified` would always read `unverified`.
 */
export async function patientIdentityLevel(userId: string): Promise<VerificationLevel> {
  const profile = await db.user.findUnique({
    where: { id: userId },
    select: {
      emailVerified: true,
      phoneVerified: true,
      identityConfirmed: true,
      idDocumentUploaded: true,
      idDocumentVerified: true,
      verificationRejectedReason: true,
    },
  })
  if (!profile) return 'unverified'
  return patientIdentityLevelFromUser(profile)
}

/**
 * Participant check only — no identity lookup. Used by the read/poll side of
 * signaling, which runs every few hundred milliseconds during a call.
 */
async function participantAuthorization(
  user: { id: string; role: string },
  appointmentId: string
): Promise<{ participant: boolean; isPatient: boolean }> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, doctorId: true, status: true, deletedAt: true },
  })
  if (
    !appointment ||
    appointment.deletedAt ||
    !['confirmed', 'rescheduled'].includes(appointment.status)
  ) {
    return { participant: false, isPatient: false }
  }

  if (appointment.patientId === user.id) return { participant: true, isPatient: true }

  if (user.role === 'doctor') {
    const doctor = await db.doctorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, verified: true },
    })
    return { participant: Boolean(doctor?.verified && doctor.id === appointment.doctorId), isPatient: false }
  }

  // Family access is an explicit accepted caretaker relationship, not mere
  // membership (or a pending invite) in the patient's family.
  const memberships = await db.familyMember.findMany({
    where: { userId: user.id, role: 'caretaker', inviteStatus: 'accepted' },
    select: { familyId: true },
  })
  if (!memberships.length) return { participant: false, isPatient: false }
  const participant = Boolean(
    await db.familyMember.findFirst({
      where: {
        familyId: { in: memberships.map((m) => m.familyId) },
        userId: appointment.patientId,
        inviteStatus: 'accepted',
      },
      select: { id: true },
    })
  )
  return { participant, isPatient: false }
}

export async function isAppointmentParticipant(
  user: { id: string; role: string },
  appointmentId: string
): Promise<boolean> {
  return (await participantAuthorization(user, appointmentId)).participant
}

/**
 * Full join decision for an appointment, with the reason a caller was refused.
 * Used by token issuance and the signaling write path, so the two ways into a
 * consult cannot disagree. A caretaker joins on their own identity, so the
 * patient's level does not apply to them.
 */
export async function joinAuthorization(
  user: { id: string; role: string } & IdentityFlags,
  appointmentId: string
): Promise<JoinAuthorization> {
  const { participant, isPatient } = await participantAuthorization(user, appointmentId)
  if (!participant) return { allowed: false, isPatient, reason: 'not_participant' }
  if (!isPatient) return { allowed: true, isPatient: false }

  const currentLevel = await resolveIdentityLevel(user)
  if (!meetsVerificationLevel(currentLevel, VIDEO_JOIN_MIN_LEVEL)) {
    return {
      allowed: false,
      isPatient: true,
      reason: 'identity_required',
      currentLevel,
      requiredLevel: VIDEO_JOIN_MIN_LEVEL,
    }
  }
  return { allowed: true, isPatient: true, currentLevel, requiredLevel: VIDEO_JOIN_MIN_LEVEL }
}

/** Boolean form, kept for callers that only need yes/no. */
export async function canJoinAppointment(
  user: { id: string; role: string } & IdentityFlags,
  appointmentId: string
): Promise<boolean> {
  return (await joinAuthorization(user, appointmentId)).allowed
}

/**
 * HTTP shape for a refusal, so every entry point answers identically and the
 * client can tell "not your appointment" from "verify first".
 */
export function joinDenialResponse(join: JoinAuthorization): {
  message: string
  status: number
  code: string
  details?: Record<string, unknown>
} | null {
  if (join.allowed) return null
  if (join.reason === 'identity_required') {
    return {
      message: 'Verify your identity before joining this video consultation.',
      status: 403,
      code: 'IDENTITY_VERIFICATION_REQUIRED',
      details: {
        currentLevel: join.currentLevel,
        requiredLevel: join.requiredLevel,
        verifyUrl: '/verify-email',
      },
    }
  }
  return {
    message: 'Forbidden — not an authorized appointment participant',
    status: 403,
    code: 'FORBIDDEN',
  }
}
