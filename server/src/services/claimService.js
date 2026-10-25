import { validateUuid } from '../validators/donationValidator.js';
import { ForbiddenError } from '../utils/errors.js';
import claimRepository from '../repositories/claimRepository.js';

/**
 * Handles business logic for claiming a donation.
 *
 * @param {string} donationId - Donation UUID
 * @param {object} currentUser - Authenticated user from req.user
 * @param {object} [repo=claimRepository] - Injectable repository dependency
 * @returns {Promise<{ message: string, claim: object, donation: object, auditEvent: object }>}
 */
export const claimDonation = async (donationId, currentUser, repo = claimRepository) => {
  if (!currentUser || currentUser.role !== 'NGO' || currentUser.status !== 'ACTIVE') {
    throw new ForbiddenError('Only active NGO accounts may claim donations');
  }

  const validId = validateUuid(donationId, 'donation_id');

  const result = await repo.claimDonationAtomic({
    donationId: validId,
    ngoId: currentUser.id,
    ngoName: currentUser.name
  });

  return {
    message: 'Donation claimed successfully',
    claim: result.claim,
    donation: result.donation,
    auditEvent: result.auditEvent
  };
};

/**
 * Handles business logic for cancelling an active claim.
 *
 * @param {string} donationId - Donation UUID
 * @param {object} currentUser - Authenticated user from req.user
 * @param {string} [reason='Claim cancelled by NGO'] - Reason for cancellation
 * @param {object} [repo=claimRepository] - Injectable repository dependency
 * @returns {Promise<{ message: string, donation: object, claim: object }>}
 */
export const cancelClaim = async (donationId, currentUser, reason, repo = claimRepository) => {
  if (!currentUser || currentUser.status !== 'ACTIVE' || (!['NGO', 'ADMIN'].includes(currentUser.role))) {
    throw new ForbiddenError('Only the claiming NGO or an administrator may cancel a claim');
  }

  const validId = validateUuid(donationId, 'donation_id');

  const result = await repo.cancelClaimAtomic({
    donationId: validId,
    actorId: currentUser.id,
    actorRole: currentUser.role,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'Claim cancelled by NGO'
  });

  return {
    message: 'Donation claim cancelled successfully',
    donation: result.donation,
    claim: result.claim
  };
};

/**
 * Retrieves the audit log of all events for a donation.
 *
 * @param {string} donationId
 * @param {object} currentUser
 * @param {object} [repo=claimRepository]
 * @returns {Promise<object[]>}
 */
export const getDonationAuditTrail = async (donationId, currentUser, repo = claimRepository) => {
  if (!currentUser || currentUser.status !== 'ACTIVE') {
    throw new ForbiddenError('Authentication required to view audit trail');
  }

  const validId = validateUuid(donationId, 'donation_id');
  return await repo.findDonationEvents(validId);
};

export default {
  claimDonation,
  cancelClaim,
  getDonationAuditTrail
};
