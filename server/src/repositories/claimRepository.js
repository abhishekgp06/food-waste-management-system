import { randomInt } from 'node:crypto';
import { getClient, query } from '../config/db.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError
} from '../utils/errors.js';
import { toSafeDonation } from './donationRepository.js';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a cryptographically secure 6-digit numeric handover code.
 *
 * @returns {string} 6-digit handover code
 */
export const generateHandoverCode = () => {
  return String(randomInt(100000, 999999));
};

/**
 * Converts a raw database claim row into a safe, API-facing object.
 *
 * @param {object} row
 * @returns {object|null}
 */
export const toSafeClaim = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }

  return {
    id: row.id,
    donation_id: row.donation_id,
    ngo_id: row.ngo_id,
    volunteer_id: row.volunteer_id ?? null,
    status: row.status,
    handover_code: row.handover_code ?? null,
    claimed_at: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
    assigned_at: row.assigned_at ? new Date(row.assigned_at).toISOString() : null,
    picked_up_at: row.picked_up_at ? new Date(row.picked_up_at).toISOString() : null,
    delivered_at: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    failure_reason: row.failure_reason ?? null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  };
};

/**
 * Converts a raw database donation_event row into a safe audit object.
 *
 * @param {object} row
 * @returns {object|null}
 */
export const toSafeDonationEvent = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }

  return {
    id: row.id,
    donation_id: row.donation_id,
    actor_id: row.actor_id ?? null,
    from_status: row.from_status ?? null,
    to_status: row.to_status,
    reason: row.reason ?? null,
    metadata_json: row.metadata_json ?? null,
    created_at: new Date(row.created_at).toISOString()
  };
};

/**
 * Atomically claims a donation in a single database transaction.
 * 1. Checks pre-conditions (existence, donor ownership check, expiry check).
 * 2. Conditionally updates donation to CLAIMED status atomically.
 * 3. Inserts claim record with secure handover code.
 * 4. Inserts audit trail record into donation_events.
 * 5. Commits transaction or rolls back on any error.
 *
 * @param {object} params
 * @param {string} params.donationId
 * @param {string} params.ngoId
 * @param {string} [params.ngoName]
 * @param {string} [params.handoverCode]
 * @param {Function} [clientFactory=getClient]
 * @returns {Promise<{ donation: object, claim: object, auditEvent: object }>}
 */
export const claimDonationAtomic = async ({
  donationId,
  ngoId,
  ngoName = 'NGO Partner',
  handoverCode = generateHandoverCode()
}, clientFactory = getClient) => {
  if (typeof donationId !== 'string' || !UUID_REGEX.test(donationId.trim())) {
    throw new NotFoundError('Donation not found');
  }

  const client = await clientFactory();

  try {
    await client.query('BEGIN');

    // 1. Inspect existing donation record
    const checkRes = await client.query(
      `SELECT id, donor_id, status, expires_at, pickup_deadline
       FROM donations
       WHERE id = $1`,
      [donationId.trim()]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Donation not found');
    }

    const existing = checkRes.rows[0];

    // Ownership check: Donors cannot claim their own donation
    if (existing.donor_id === ngoId) {
      await client.query('ROLLBACK');
      throw new ForbiddenError('Donors cannot claim their own donations');
    }

    // Expiry check
    const now = new Date();
    if (new Date(existing.expires_at) <= now || new Date(existing.pickup_deadline) <= now) {
      await client.query('ROLLBACK');
      throw new ConflictError('This donation has expired and can no longer be claimed');
    }

    // 2. Atomic conditional update to claim donation
    const updateRes = await client.query(
      `UPDATE donations
       SET status = 'CLAIMED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND status = 'AVAILABLE'
         AND expires_at > CURRENT_TIMESTAMP
         AND pickup_deadline > CURRENT_TIMESTAMP
       RETURNING id, donor_id, title, category, description, quantity, unit,
                 prepared_at, expires_at, pickup_deadline, address,
                 latitude, longitude, image_s3_key, status, created_at, updated_at`,
      [donationId.trim()]
    );

    // If rowCount === 0, another concurrent transaction claimed it first or state changed
    if (updateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ConflictError('This donation is no longer available for claiming');
    }

    const updatedDonation = toSafeDonation(updateRes.rows[0]);

    // 3. Insert claim record
    const claimRes = await client.query(
      `INSERT INTO claims (donation_id, ngo_id, status, handover_code, claimed_at)
       VALUES ($1, $2, 'CLAIMED', $3, CURRENT_TIMESTAMP)
       RETURNING id, donation_id, ngo_id, volunteer_id, status, handover_code,
                 claimed_at, assigned_at, picked_up_at, delivered_at, failure_reason,
                 created_at, updated_at`,
      [donationId.trim(), ngoId, handoverCode]
    );

    const safeClaim = toSafeClaim(claimRes.rows[0]);

    // 4. Record audit event in donation_events table
    const auditMetadata = {
      claim_id: safeClaim.id,
      ngo_id: ngoId,
      ngo_name: ngoName,
      claimed_at: safeClaim.claimed_at
    };

    const auditRes = await client.query(
      `INSERT INTO donation_events (donation_id, actor_id, from_status, to_status, reason, metadata_json)
       VALUES ($1, $2, 'AVAILABLE', 'CLAIMED', $3, $4)
       RETURNING id, donation_id, actor_id, from_status, to_status, reason, metadata_json, created_at`,
      [
        donationId.trim(),
        ngoId,
        'Donation claimed by NGO',
        JSON.stringify(auditMetadata)
      ]
    );

    const safeAudit = toSafeDonationEvent(auditRes.rows[0]);

    // 5. Commit transaction atomically
    await client.query('COMMIT');

    return {
      donation: updatedDonation,
      claim: safeClaim,
      auditEvent: safeAudit
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure if connection was lost
    }

    // PostgreSQL partial unique index uq_active_claim_per_donation violation
    if (err.code === '23505') {
      throw new ConflictError('This donation is already claimed by another organization', [
        { field: 'donation_id', message: 'An active claim already exists for this donation' }
      ]);
    }

    throw err;
  } finally {
    client.release();
  }
};

/**
 * Atomically cancels a claim in a single database transaction.
 * 1. Checks that an active claim exists in CLAIMED status.
 * 2. Checks authorization (claiming NGO or ADMIN).
 * 3. Updates claim to CANCELLED.
 * 4. Reverts donation status to AVAILABLE.
 * 5. Inserts audit event into donation_events.
 * 6. Commits transaction.
 *
 * @param {object} params
 * @param {string} params.donationId
 * @param {string} params.actorId
 * @param {string} params.actorRole
 * @param {string} [params.reason='Claim cancelled by NGO']
 * @param {Function} [clientFactory=getClient]
 * @returns {Promise<{ donation: object, claim: object, auditEvent: object }>}
 */
export const cancelClaimAtomic = async ({
  donationId,
  actorId,
  actorRole,
  reason = 'Claim cancelled by NGO'
}, clientFactory = getClient) => {
  if (typeof donationId !== 'string' || !UUID_REGEX.test(donationId.trim())) {
    throw new NotFoundError('Donation not found');
  }

  const client = await clientFactory();

  try {
    await client.query('BEGIN');

    // 1. Locate active claim in CLAIMED status
    const claimRes = await client.query(
      `SELECT id, donation_id, ngo_id, volunteer_id, status, handover_code,
              claimed_at, assigned_at, picked_up_at, delivered_at, failure_reason,
              created_at, updated_at
       FROM claims
       WHERE donation_id = $1 AND status = 'CLAIMED'
       LIMIT 1
       FOR UPDATE`,
      [donationId.trim()]
    );

    if (claimRes.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ConflictError('No active claim found in CLAIMED status to cancel');
    }

    const activeClaim = claimRes.rows[0];

    // Authorization check: only the claiming NGO or an ADMIN may cancel
    if (activeClaim.ngo_id !== actorId && actorRole !== 'ADMIN') {
      await client.query('ROLLBACK');
      throw new ForbiddenError('You are not authorized to cancel this claim');
    }

    // 2. Update claim status to CANCELLED
    const updateClaimRes = await client.query(
      `UPDATE claims
       SET status = 'CANCELLED', failure_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, donation_id, ngo_id, volunteer_id, status, handover_code,
                 claimed_at, assigned_at, picked_up_at, delivered_at, failure_reason,
                 created_at, updated_at`,
      [activeClaim.id, reason]
    );

    const safeClaim = toSafeClaim(updateClaimRes.rows[0]);

    // 3. Revert donation status to AVAILABLE
    const updateDonationRes = await client.query(
      `UPDATE donations
       SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'CLAIMED'
       RETURNING id, donor_id, title, category, description, quantity, unit,
                 prepared_at, expires_at, pickup_deadline, address,
                 latitude, longitude, image_s3_key, status, created_at, updated_at`,
      [donationId.trim()]
    );

    const safeDonation = toSafeDonation(updateDonationRes.rows[0]);

    // 4. Record audit event in donation_events table
    const auditMetadata = {
      claim_id: safeClaim.id,
      cancelled_by: actorId,
      cancelled_at: new Date().toISOString()
    };

    const auditRes = await client.query(
      `INSERT INTO donation_events (donation_id, actor_id, from_status, to_status, reason, metadata_json)
       VALUES ($1, $2, 'CLAIMED', 'AVAILABLE', $3, $4)
       RETURNING id, donation_id, actor_id, from_status, to_status, reason, metadata_json, created_at`,
      [
        donationId.trim(),
        actorId,
        reason,
        JSON.stringify(auditMetadata)
      ]
    );

    const safeAudit = toSafeDonationEvent(auditRes.rows[0]);

    // 5. Commit transaction
    await client.query('COMMIT');

    return {
      donation: safeDonation,
      claim: safeClaim,
      auditEvent: safeAudit
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore
    }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Retrieves the audit trail for a donation.
 *
 * @param {string} donationId
 * @param {Function} [queryFn=query]
 * @returns {Promise<object[]>} Array of audit event objects
 */
export const findDonationEvents = async (donationId, queryFn = query) => {
  if (typeof donationId !== 'string' || !UUID_REGEX.test(donationId.trim())) {
    return [];
  }

  const sql = `
    SELECT id, donation_id, actor_id, from_status, to_status, reason, metadata_json, created_at
    FROM donation_events
    WHERE donation_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await queryFn(sql, [donationId.trim()]);
  return result.rows.map(toSafeDonationEvent);
};

export default {
  generateHandoverCode,
  toSafeClaim,
  toSafeDonationEvent,
  claimDonationAtomic,
  cancelClaimAtomic,
  findDonationEvents
};
