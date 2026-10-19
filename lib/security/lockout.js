// @ts-check

/**
 * Sign-in lockout (spec section 16): five wrong passwords and the account
 * stops answering for fifteen minutes.
 *
 * Pure on purpose — given a record and a moment it says whether the account
 * is locked and what to write after a failure, and touches no database. It
 * lives here rather than inside the staff login action because the client
 * portal signs in against a different collection (`clientUsers`) with the
 * same rule, and two copies of a lockout drift apart quietly: one of them
 * gets a fix and nobody notices the other did not.
 *
 * The wording of the message is left to the caller. Staff are told to ask a
 * partner; a client has nobody in the firm to ask by name.
 *
 * @typedef {{ failedLogins?: number, lockedUntil?: Date|null }} Lockable
 */

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/**
 * @param {Lockable|null|undefined} record
 * @param {Date} [now]
 */
export function isLocked(record, now = new Date()) {
  return Boolean(record?.lockedUntil && record.lockedUntil > now);
}

/**
 * What to store after a wrong password: the count, and the lock once the
 * count reaches the limit.
 *
 * @param {Lockable|null|undefined} record
 * @param {Date} [now]
 * @returns {{ failedLogins: number, lockedUntil: Date|null }}
 */
export function afterFailure(record, now = new Date()) {
  const failedLogins = (record?.failedLogins ?? 0) + 1;
  return {
    failedLogins,
    lockedUntil:
      failedLogins >= MAX_ATTEMPTS
        ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000)
        : null,
  };
}
