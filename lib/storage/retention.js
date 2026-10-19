// @ts-check

/**
 * How long things are kept (spec section 6).
 *
 * A deleted file sits in the recycle bin for 90 days before the purge job
 * can touch it, and documents are kept for at least eight years, which is
 * what ICAI working-paper and tax-record expectations assume. Both are
 * settings, because the firm may be told otherwise by its own policy.
 */

export const RECYCLE_DAYS = Number(process.env.STORAGE_RECYCLE_DAYS || 90);

export const RETENTION_YEARS = Number(process.env.DOCUMENT_RETAIN_YEARS || 8);
