import { describe, expect, it } from 'vitest'
import {
  computeVerificationLevel,
  meetsVerificationLevel,
  verificationRank,
} from '../patient-verify'

const base = {
  emailVerified: false,
  phoneVerified: false,
  identityConfirmed: false,
  idDocumentUploaded: false,
  idDocumentVerified: false,
}

describe('computeVerificationLevel', () => {
  it('orders the document states above the flags', () => {
    expect(computeVerificationLevel(base)).toBe('unverified')
    expect(computeVerificationLevel({ ...base, emailVerified: true })).toBe('email_verified')
    expect(computeVerificationLevel({ ...base, emailVerified: true, phoneVerified: true, identityConfirmed: true })).toBe('identity_confirmed')
    expect(computeVerificationLevel({ ...base, emailVerified: true, idDocumentUploaded: true })).toBe('pending_review')
    expect(computeVerificationLevel({ ...base, idDocumentVerified: true })).toBe('id_verified')
  })

  it('never reports phone confirmation without the affidavit as identity_confirmed', () => {
    expect(computeVerificationLevel({ ...base, phoneVerified: true })).toBe('unverified')
  })

  it('reports a rejected review as rejected rather than unverified', () => {
    expect(computeVerificationLevel({ ...base, emailVerified: true, idDocumentUploaded: true, rejected: true })).toBe('rejected')
  })
})

describe('meetsVerificationLevel', () => {
  it('accepts rungs at or above the requirement', () => {
    expect(meetsVerificationLevel('email_verified', 'email_verified')).toBe(true)
    expect(meetsVerificationLevel('id_verified', 'email_verified')).toBe(true)
    expect(meetsVerificationLevel('pending_review', 'identity_confirmed')).toBe(true)
    expect(meetsVerificationLevel('identity_confirmed', 'id_verified')).toBe(false)
  })

  it('treats a missing or unknown level as unverified', () => {
    expect(meetsVerificationLevel(null, 'email_verified')).toBe(false)
    expect(meetsVerificationLevel(undefined, 'email_verified')).toBe(false)
    expect(meetsVerificationLevel('not-a-level', 'email_verified')).toBe(false)
  })

  it('puts rejected below unverified so a denied review cannot be mistaken for a gap', () => {
    expect(verificationRank('rejected')).toBeLessThan(verificationRank('unverified'))
    expect(meetsVerificationLevel('rejected', 'unverified')).toBe(false)
  })
})
