# KynthAI global provider eligibility policy

Status: owner policy draft for launch operations

This document is a product and operations control. It is not a legal opinion, a license, an accreditation, or a promise that KynthAI is available in every country. Before enabling a jurisdiction, the owner must complete a local review of service availability, privacy obligations, professional-regulation requirements, payments, tax, language, and support coverage.

## Product position

KynthAI accepts provider applications globally in principle, without assuming a United States, Canadian, or any other country-specific credential. A provider is not presented as active or verified merely because an application was submitted. Every application remains `pending` and `verified: false` until an authorized reviewer completes the applicable jurisdiction review.

The same policy applies to doctors, clinics, laboratories, diagnostic centers, and other health-service providers. The required evidence may differ by profession and jurisdiction; the review decision must record what was checked and why it is sufficient.

## Minimum application evidence

Each applicant must provide:

- legal or operating name and contact details;
- professional or business role;
- jurisdiction(s) in which services will be offered;
- the local registration, license, permit, or other credential identifier, when the jurisdiction requires one;
- issuing authority and credential expiry or renewal date, when applicable;
- identity or ownership evidence appropriate to the applicant;
- service categories and operating location(s);
- a privacy, safety, and escalation contact; and
- the provider documents requested by the role-specific application form.

A jurisdiction that does not issue a numbered license is not automatically rejected. The reviewer must request the closest authoritative evidence available and record the basis for approval, deferral, or rejection.

## Review states

- **Pending:** application received; no public provider access or verified badge.
- **Needs information:** a reviewer identified a specific missing, unreadable, expired, or inconsistent item.
- **Approved:** the reviewer recorded the jurisdiction, evidence, reviewer, decision date, and next review/expiry date.
- **Rejected:** the application cannot be activated on the available evidence or conflicts with a product safety or integrity rule.
- **Suspended:** a previously approved provider is temporarily disabled while a credential, complaint, safety event, or jurisdiction change is investigated.

Only an authorized owner/admin workflow may move an application into an active or verified state. There is no automatic approval based on a document upload, self-attestation, email domain, payment, or AI extraction result.

## Review checklist

Before approval, the reviewer should confirm:

1. The applicant identity matches the submitted provider documents.
2. The document type matches the provider role and requested slot.
3. The issuing authority and jurisdiction are identifiable and plausible.
4. The credential is current, or the reviewer has recorded the permitted renewal/grace basis.
5. The service offered matches the provider's documented scope.
6. The applicant has accepted the provider terms and privacy/safety obligations.
7. Any public profile wording is limited to what was actually verified.
8. The decision, evidence references, reviewer, and next review date are recorded.

If a registry or authority lookup is unavailable, the application stays pending rather than being approved by assumption. Do not label a provider as licensed, accredited, certified, or endorsed unless the review record supports that exact wording.

## Jurisdiction enablement gate

The owner should maintain a jurisdiction register outside the provider profile with these fields:

- jurisdiction and launch status (`not reviewed`, `reviewing`, `eligible`, `restricted`, or `paused`);
- services allowed, restricted, or excluded;
- required provider evidence and review cadence;
- data-processing, retention, hosting, and transfer requirements;
- payment, tax, language, and support constraints;
- emergency and clinical escalation limitations; and
- reviewer, decision date, source references, and next review date.

Until the register marks a jurisdiction `eligible`, KynthAI should not market provider availability there or activate a provider for that jurisdiction. A global public message should say that availability depends on local review and service coverage, not that every country is supported.

## Safety and privacy controls

- Provider files belong in the private encrypted medical-documents storage path.
- Upload validation must enforce the applicant user, provider role, document slot, file type, size, and content signature.
- Provider records and documents must be access-controlled by role and logged.
- Expired, revoked, disputed, or materially changed credentials require re-review and may trigger suspension.
- Demo/provider seed records are read-only and must never be used as evidence of real-world licensing.
- Notifications, lock-screen previews, and public provider cards must not expose unnecessary patient or clinical details.

## Explicit non-claims

This policy does not claim HIPAA, GDPR, or any other legal compliance; medical-device authorization; professional licensure; laboratory accreditation; or availability in a specific country. Those are separate questions requiring authoritative, jurisdiction-specific review before the owner makes the corresponding claim.
