/**
 * Data Retention & Purge Policy
 *
 * Soft-deleted records are retained for a bounded window to support:
 *  - Operational recovery (accidental deletes)
 *  - Compliance review (applicable privacy / Health Data Protection audit trails)
 *
 * PURGE BOUNDARIES (see compliance review):
 *  - Standard soft-delete retention: 30 days
 *  - Audit logs: 365 days (security / legal hold)
 *
 * SAFE PURGE RULES:
 *  1. Purge must be triggered explicitly by an admin via POST /api/admin/retention.
 *  2. A confirmation token is required in the request body.
 *  3. Default mode is dry-run (no records are deleted).
 *  4. No automatic/cron purge is configured without explicit human action.
 */

export const SOFT_DELETE_RETENTION_DAYS = 30
/**
 * Audit log retention period in days.
 * Health Data Protection §164.316(b)(2)(i) requires 6-year retention for all audit logs.
 * Set to 2190 days (6 years) to meet federal healthcare regulations.
 */
export const AUDIT_LOG_RETENTION_DAYS = 2190

export interface PurgeResult {
  model: string
  wouldDelete: number
  deleted?: number
}

export function getSoftDeleteCutoff(): Date {
  const d = new Date()
  d.setDate(d.getDate() - SOFT_DELETE_RETENTION_DAYS)
  return d
}

export function getAuditLogCutoff(): Date {
  const d = new Date()
  d.setDate(d.getDate() - AUDIT_LOG_RETENTION_DAYS)
  return d
}
