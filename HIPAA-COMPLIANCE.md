# Kynthai Security Controls — Field-Level Encryption (Internal Reference)

**Status:** TRANSITIONAL ROLLOUT — `installEncryptionMiddleware()` is active through `src/lib/db.ts`, so new ORM writes are encrypted into `*_enc` columns (with keyed lookup hashes where required). Existing rows remain readable through the transitional plaintext fallback until the controlled backfill and read verification are complete. Strict mode (`ENCRYPTION_TRANSITIONAL=false`) is not enabled yet; uploaded documents and prescription images remain encrypted (AES-256-GCM) today.
**Date:** 2026-07-11  
**Officer:** Privacy/Technical Contact = privacy@kynthai.app  
**Scope:** Sensitive health data stored in the PostgreSQL database and file storage.

> **Disclaimer (2026-08-02):** Kynthai is **not** a HIPAA-covered entity or business
> associate and does **not** claim HIPAA compliance. This document describes internal
> security controls (field-level encryption, audit logging) only; references to "PHI"
> below are a security-classification label for sensitive health data, not PHI as
> defined by HIPAA. User-facing privacy copy must not cite HIPAA or claim
> covered-entity status.

---

## 1. Encryption at Rest (AES-256-GCM)

- **Algorithm:** AES-256-GCM (Authenticated Encryption with Associated Data).  
- **Key strength:** 256-bit key (`ENCRYPTION_KEY`, 64 hex chars).  
- **IV:** Random 128-bit IV per encryption operation.  
- **Auth tag:** 128-bit GCM authentication tag prepended to ciphertext for integrity.  
- **Fields encrypted:** See §1.A below.  
- **Implementation:** Active through the transparent Prisma query extension/middleware (`src/lib/prisma-encryption-middleware.ts`); it is running in transitional mode until the controlled backfill is verified.

### 1.A PHI Fields Encrypted

| Model | Plaintext Field | Encrypted Column |
|-------|-----------------|------------------|
| User | name | name_enc |
| User | phone | phone_enc |
| User | dateOfBirth | dateOfBirth_enc |
| User | allergies | allergies_enc |
| User | passwordResetToken | passwordResetToken_enc |
| DoctorProfile | licenseNumber | licenseNumber_enc |
| DoctorProfile | bio | bio_enc |
| DoctorProfile | rejectionReason | rejectionReason_enc |
| DoctorProfile | ssn | ssn_enc |
| DoctorProfile | taxId | taxId_enc |
| DoctorProfile | degreeType | degreeType_enc |
| DoctorProfile | medicalCouncil | medicalCouncil_enc |
| LabProfile | labName | labName_enc |
| LabProfile | licenseNumber | licenseNumber_enc |
| LabProfile | address | address_enc |
| LabProfile | rejectionReason | rejectionReason_enc |
| Appointment | reason | reason_enc |
| Appointment | notes | notes_enc |
| ChronicCondition | name | name_enc |
| ChronicCondition | diagnosedDate | diagnosedDate_enc |
| ChronicCondition | medications | medications_enc |
| ChronicCondition | notes | notes_enc |
| Prescription | imageBase64 | imageBase64_enc |
| Prescription | notes | notes_enc |
| Prescription | medications | medications_enc |
| Prescription | followUpNotes | followUpNotes_enc |
| Medication | name | name_enc |
| Medication | dosage | dosage_enc |
| Medication | instructions | instructions_enc |
| Medication | notes | notes_enc |
| ConsultationNote | content | content_enc |
| HealthJournal | symptoms | symptoms_enc |
| HealthJournal | mood | mood_enc |
| HealthJournal | notes | notes_enc |
| HealthJournal | vitals | vitals_enc |
| ChatMessage | content | content_enc |
| ConsultMessage | content | content_enc |
| MedicineOrder | items | items_enc |
| MedicineOrder | address | address_enc |
| LabBooking | notes | notes_enc |
| LabBooking | resultsNote | resultsNote_enc |
| LabBooking | tests | tests_enc |
| EmergencyAlert | memberName | memberName_enc |
| EmergencyAlert | location | location_enc |
| EmergencyAlert | notes | notes_enc |
| FamilyMember | name | name_enc |
| FamilyMember | relation | relation_enc |
| FamilyMember | conditions | conditions_enc |
| FamilyMember | inviteEmail | inviteEmail_enc |
| FamilyMember | inviteToken | inviteToken_enc |
| FamilyHealthAlert | title | title_enc |
| FamilyHealthAlert | message | message_enc |
| HealthScore | breakdown | breakdown_enc |
| AuditLog | ip | ip_enc |
| NotificationLog | title | title_enc |
| NotificationLog | body | body_enc |
| NotificationLog | recipient | recipient_enc |
| Payment | description | description_enc |
| PrescriptionIntelligence | rawText | rawText_enc |
| PrescriptionIntelligence | imageData | imageData_enc |
| PrescriptionIntelligence | medications | medications_enc |
| PrescriptionIntelligence | schedule | schedule_enc |
| PrescriptionIntelligence | interactions | interactions_enc |
| PrescriptionIntelligence | warnings | warnings_enc |

### 1.B Transitional Mode & Data Migration

**Transitional mode** is **ENABLED by default** (`ENCRYPTION_TRANSITIONAL=true`).

In transitional mode:
- New writes are encrypted into the `_enc` columns.
- Old plaintext values remain visible via fallback reads.

**Deployment sequence:**
1. Deploy schema migration (`prisma/migrations/20260711015142_add-phi-encryption-fields/migration.sql`).
2. Run data migration: `npx tsx scripts/encrypt-existing-data.ts`
3. Disable transitional mode: set `ENCRYPTION_TRANSITIONAL=false` and restart.
4. Run data cleanup: `ENCRYPTION_TRANSITIONAL=false npx tsx scripts/encrypt-existing-data.ts`

---

## 2. Encryption in Transit

- **TLS 1.2+** enforced via `Strict-Transport-Security` headers (HSTS, preload).
- **CSP** enforced in production proxy middleware (`src/proxy.ts`).
- All API responses have `no-store` cache headers.
- `NEXT_PUBLIC_API_URL` must be `https://` in production.
- No `ws://` unencrypted WebSocket clients in application code.

---

## 3. Secure File Storage

- Upload endpoint (`src/app/api/upload/route.ts`) encrypts files with AES-256-GCM before disk write.
- Files stored in `private-uploads/` (outside `public/`, never served statically).
- File access requires opaque `fileToken` via authenticated API route.
- File permissions: `chmod 0o600` (owner-only).
- Allowed types: PDF, JPEG, PNG only (strict MIME-type allowlist).
- Max size: 5 MB per file.

---

## 4. Data Masking for Logs

- Production logs use masked output (`src/lib/logger.ts` + `src/lib/data-masking.ts`).
- PHI fields masked by key pattern (email, phone, name, notes, etc.).
- Logger level in production: `WARN` (DEBUG/INFO suppressed).
- Custom logs should use `maskArgs()` before passing PHI-suspect data to `console`.  

### 4.A Masking Rules

| Field Type | Example Output |
|------------|---------------|
| SSN / token | `****1234` |
| Name | `J******` |
| Email | `j***@*****.com` |
| Phone | `617****7890` |
| IP | `[REDACTED_IP]` |
| Clinical text | `[REDACTED]` |
| URL | domain only, query stripped |

---

## 5. Key Management

- **Primary key:** `ENCRYPTION_KEY` (64 hex chars).  
- **Dev fallback:** `SHA-256(SESSION_SECRET)` if `ENCRYPTION_KEY` is missing.  
- **Key cache:** Cached in-memory in `src/lib/encryption.ts` (`cachedKey`).  
- **Key rotation:** Use `scripts/rotate-encryption-key.ts`.  
- **Access:** Key loaded only from environment variables; never hardcoded.  

### 5.A Key Rotation Procedure

1. Generate new key: `openssl rand -hex 32`
2. Export as `NEW_ENCRYPTION_KEY`.
3. Restart app (to clear old key cache).
4. Run: `npx tsx scripts/rotate-encryption-key.ts`
5. Deploy `.env` with updated `ENCRYPTION_KEY`.
6. Restart app again.

---

## 6. Database Security

- Prisma client bounds all queries (SQL injection prevention).
- No `$queryRaw` with user input.
- All connection strings must use SSL in production (PostgreSQL `sslmode=require`).
- Database backups must be encrypted at rest (PostgreSQL native encryption or disk-level).

### 6.A Backup Encryption

> **Production Checklist:**
> - [ ] PostgreSQL backup storage (S3, volume) uses server-side encryption.
> - [ ] Backup files are encrypted before leaving the database host.
> - [ ] Restore procedure tested and documented.

---

## 7. Audit & Monitoring

- All mutations logged to `auditLog` with userId, action, timestamp.
- LinkedIn error tracking (Sentry) configured in `.env.production`.
- Rate limiting applied to all API routes.
- Account lockout on failed logins (5 attempts / 15 min).

---

## 8. Incident Response

1. Identify affected data scope.
2. Rotate encryption keys (`scripts/rotate-encryption-key.ts`).
3. Notify privacy officer: `privacy@kynthai.app`.
4. Document breach in internal runbook.
5. Notify affected users per HITECH breach notification rules.

---

## 9. Files & Scripts

| Path | Purpose |
|------|---------|
| `src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt primitives |
| `src/lib/prisma-encryption-middleware.ts` | Transparent DB encryption/decryption |
| `src/lib/data-masking.ts` | PHI masking for logs |
| `src/lib/logger.ts` | Masked production logger |
| `src/app/api/upload/route.ts` | Encrypted file uploads |
| `scripts/encrypt-existing-data.ts` | Backfill encrypted columns |
| `scripts/rotate-encryption-key.ts` | Key rotation utility |
| `prisma/migrations/.../migration.sql` | Schema migration for encrypted columns |
| `HIPAA-COMPLIANCE.md` | This document |

---

## 10. Verification Checklist

- [x] All PHI fields have encrypted counterparts in Prisma schema.
- [x] Prisma middleware encrypts writes and decrypts reads.
- [x] Transitional mode enabled (`ENCRYPTION_TRANSITIONAL=true`).
- [x] Data migration script available and tested.
- [x] Logger masks PHI in production.
- [x] File uploads encrypted before storage.
- [x] TLS 1.2+ and HSTS enforced in production.
- [x] No unencrypted WebSocket clients in application code.
- [x] `ENCRYPTION_KEY` documented in `.env.production` template.
- [x] Key rotation script created.
- [ ] Schema migration executed against production database.
- [ ] Existing data backfilled with encryption.
- [ ] Transitional mode disabled after verification.
- [ ] Database backups encrypted.
- [ ] Clinical/pathology access logs reviewed for PHI exposure.
- [ ] Penetration test completed.

---

### B12 Advisory — Pre-Deployment Production Checklist (not code blockers)

The six items above are **pre-deployment operations tasks** that must be completed
before the production database is live. They are not code blockers — the application
code, middleware, and infrastructure are ready. Operators must complete these in order:

1. Run `prisma migrate deploy` against production → marks "Schema migration executed."
2. Run `npm run db:seed` or equivalent backfill script → marks "Data backfilled."
3. After verification, set `ENCRYPTION_TRANSITIONAL=false` → marks "Transitional mode off."
4. Confirm PostgreSQL `ssl_mode=require` and test backup encryption → marks "Backups encrypted."
5. Review access logs for PHI exposure incidents → marks "Access log reviewed."
6. Complete and document a third-party penetration test → marks "Penetration test completed."

All six must be verified and the checklist updated before production launch Go/No-Go.
