import {
  validateCreateDonation,
  validateUpdateDonation,
  validateDonationFilters,
  validateNearbySearch,
  validateUuid
} from '../validators/donationValidator.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ValidationError
} from '../utils/errors.js';
import donationRepository from '../repositories/donationRepository.js';

/**
 * Creates a new food donation listing.
 *
 * @param {object} currentUser - Authenticated user object from req.user
 * @param {object} payload - Raw request body
 * @param {object} [repo=donationRepository] - Repository dependency
 * @returns {Promise<object>} Created donation
 */
export const createDonation = async (currentUser, payload, repo = donationRepository) => {
  if (!currentUser || currentUser.role !== 'DONOR' || currentUser.status !== 'ACTIVE') {
    throw new ForbiddenError('Only active DONOR accounts may create donation listings');
  }

  // Validate payload
  const validated = validateCreateDonation(payload);

  // Derive ownership strictly from authenticated user identity
  const donation = await repo.createDonation({
    ...validated,
    donor_id: currentUser.id
  });

  return donation;
};

/**
 * Retrieves a single donation by ID.
 *
 * @param {string} id - Donation UUID
 * @param {object} currentUser - Authenticated user
 * @param {object} [repo=donationRepository] - Repository dependency
 * @returns {Promise<object>} Donation object
 */
export const getDonationById = async (id, currentUser, repo = donationRepository) => {
  const validId = validateUuid(id, 'donation_id');
  const donation = await repo.findDonationById(validId);

  if (!donation) {
    throw new NotFoundError('Donation not found');
  }

  return donation;
};

/**
 * Lists donations with optional filters and pagination.
 *
 * @param {object} query - Express query params
 * @param {object} [repo=donationRepository] - Repository dependency
 * @returns {Promise<{ donations: object[], pagination: object }>}
 */
export const listDonations = async (query = {}, repo = donationRepository) => {
  const filters = validateDonationFilters(query);
  return await repo.findDonations(filters);
};

/**
 * Finds available donations within a given geographic radius using Haversine formula.
 *
 * @param {object} query - { lat, lng, radiusKm, limit }
 * @param {object} [repo=donationRepository] - Repository dependency
 * @returns {Promise<object[]>} Nearby available donations
 */
export const getNearbyDonations = async (query = {}, repo = donationRepository) => {
  const searchParams = validateNearbySearch(query);
  return await repo.findNearbyDonations(searchParams);
};

/**
 * Updates permitted fields on an existing donation.
 * Enforces ownership and lifecycle rules (can only update while in AVAILABLE status).
 *
 * @param {string} id - Donation UUID
 * @param {object} currentUser - Authenticated user
 * @param {object} payload - Raw update fields
 * @param {object} [repo=donationRepository] - Repository dependency
 * @returns {Promise<object>} Updated donation
 */
export const updateDonation = async (id, currentUser, payload, repo = donationRepository) => {
  const validId = validateUuid(id, 'donation_id');

  const existing = await repo.findDonationById(validId);
  if (!existing) {
    throw new NotFoundError('Donation not found');
  }

  // Ownership check
  if (existing.donor_id !== currentUser.id && currentUser.role !== 'ADMIN') {
    throw new ForbiddenError('You are not authorized to modify this donation');
  }

  // Lifecycle check: only AVAILABLE donations can be updated
  if (existing.status !== 'AVAILABLE') {
    throw new BadRequestError('Donation cannot be updated once it is no longer in AVAILABLE status');
  }

  const updates = validateUpdateDonation(payload);

  // Cross-field date check against existing values
  const effectiveExpiry = updates.expires_at ? new Date(updates.expires_at) : new Date(existing.expires_at);
  const effectiveDeadline = updates.pickup_deadline ? new Date(updates.pickup_deadline) : new Date(existing.pickup_deadline);

  if (effectiveDeadline.getTime() > effectiveExpiry.getTime()) {
    throw new ValidationError('Pickup deadline must not be later than expiration date', [
      { field: 'pickup_deadline', message: 'Pickup deadline must not be later than expiration date' }
    ]);
  }

  const updated = await repo.updateDonation(validId, updates);
  return updated;
};

/**
 * Deletes a donation listing if permitted by lifecycle rules.
 *
 * @param {string} id - Donation UUID
 * @param {object} currentUser - Authenticated user
 * @param {object} [repo=donationRepository] - Repository dependency
 * @returns {Promise<{ message: string }>}
 */
export const deleteDonation = async (id, currentUser, repo = donationRepository) => {
  const validId = validateUuid(id, 'donation_id');

  const existing = await repo.findDonationById(validId);
  if (!existing) {
    throw new NotFoundError('Donation not found');
  }

  // Ownership check
  if (existing.donor_id !== currentUser.id && currentUser.role !== 'ADMIN') {
    throw new ForbiddenError('You are not authorized to delete this donation');
  }

  // Lifecycle check: only AVAILABLE donations can be cancelled/deleted
  if (existing.status !== 'AVAILABLE') {
    throw new BadRequestError('Donation cannot be deleted once it has been claimed or processed');
  }

  await repo.deleteDonation(validId);
  return { message: 'Donation deleted successfully' };
};

export default {
  createDonation,
  getDonationById,
  listDonations,
  getNearbyDonations,
  updateDonation,
  deleteDonation
};
