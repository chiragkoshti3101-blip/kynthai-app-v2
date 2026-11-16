# Nonpayment route audit — 2026-11-16

## Repairs in this pass

- Prescription GET: `doctorId` alone no longer grants patients/caretakers another doctor's complete patient list. Non-doctor/non-admin callers remain scoped to their own patient ID.
- Generic prescription POST: fail closed and direct callers to `/api/doctors/prescribe`. The generic handler previously accepted arbitrary issuing doctor/patient IDs without the verified clinical workflow's safeguards. Repository caller search found only patient GET use of this endpoint. External clients of generic POST now receive 403; a separately designed patient-upload workflow remains needed if required.
- Prescription invite acceptance: cannot reassign another patient's record; successful acceptance clears the bearer token.
- Video token and actual WebRTC signaling share one authorization helper: active confirmed/rescheduled, non-deleted appointment; patient, assigned verified doctor, or accepted caretaker with an accepted patient relationship. Arbitrary caller-selected rooms and unrelated admin support access are not granted. Token verification rejects missing expiry and trailing token segments.
- Family membership clinical access requires accepted caretaker membership. Family root fallback lookup and SOS alert/contact lookup require accepted membership. Email-less family invitations cannot be accepted by arbitrary accounts.
- Lab result download: `/api/lab/share/[token]` returned a file token, but `/api/upload/[token]` only permitted its uploader. Download now also permits the booking's patient and selected verified doctor with an unexpired grant. Original uploader access remains intact.
- Complaint evidence tokens must have the submitting account's upload prefix.

## Traced callers and persistence compatibility

Patient prescription panel calls GET with patientId; doctor dashboard uses dedicated prescribe workflow. Video component uses `/api/webrtc-signaling` rather than `/api/video-call/token`, so securing token issuance alone was insufficient. Lab share writes resultsSharedWith as doctor profile IDs; download authorization resolves the session user to that same profile ID. Added queries use adapter model methods and supported where/select predicates; no raw SQL, adapter edits, or new transaction primitives were introduced. Existing document list/download and atomic prescribe/SOS repairs were preserved.

## Verification

- New tests: nonpayment-authorization (9), shared-health-file (6), sos-family-access (2).
- Targeted run including existing document-download tests: 19 passed.
- TypeScript noEmit: passed after final edits.
- Full suite before final SOS tests: 290 passed, 1 skipped, 1 failed. Failure is existing api-edge-auth route-count assertion expecting at least 155 modules, while filesystem contains 154; not changed to hide it.
- No deployment, commit, payment edits, real notifications, or external writes performed.

## Critical workflows still unverified / follow-up

- No live HTTP/browser journeys or live database/storage writes were performed. Mock route tests do not prove adapter runtime relation hydration, migrations, encryption round trips, CSRF/session cookies, or real delivery.
- Family creation and invite-on-first-family creation do not create an owner FamilyMember row. SOS POST currently discovers accepted membership rows only, so an owner without such a row cannot trigger SOS, and owner recipients without membership may be omitted. Repair needs an explicit owner SOS representation compatible with required EmergencyAlert.familyMemberId, plus atomic family/owner creation and legacy backfill; not silently synthesized here.
- SOS records duplicate familyHealthAlert per recipient, and delivery success versus attempted-contact UI semantics remain unverified. Real SMS, push, guardian contact, cross-device visibility, and emergency response must not be claimed proven.
- Invite acceptance concurrency, family member limits, guardian verification token authenticity, and the public family invite landing-page routing versus prescription `/api/invite` need end-to-end verification.
- WebRTC signaling uses in-process storage: multi-instance/restart durability and actual media negotiation remain unverified. Restricting calls to confirmed/rescheduled appointments intentionally rejects pending/completed/cancelled records; review lifecycle expectations before release.
- Lab legacy bearer-link fallback remains in share metadata endpoint, whereas file bytes require an explicit selected grant. Legacy shares should be reissued. Grant revocation, multiple bookings referencing the same file, and patient consent revocation deserve dedicated lifecycle tests.
- Complaint admin evidence retrieval and status/reply lifecycle have not been proven. Evidence validation checks account namespace, not storage existence.
- Document explicit sharing, emergency break-glass, upload-on-behalf permissions and provider credential application routes require full live lifecycle checks; existing document-download tests only prove local encrypted bytes and unauthorized storage denial.
