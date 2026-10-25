import donationService from '../services/donationService.js';
import claimService from '../services/claimService.js';

/**
 * Creates a donation controller instance with injectable donation service.
 *
 * @param {object} [service=donationService]
 * @param {object} [cService=claimService]
 * @returns {object} Controller handlers
 */
export const createDonationController = (service = donationService, cService = claimService) => {
  const getService = (req) => req.donationService || service;
  const getClaimService = (req) => req.claimService || cService;

  /**
   * POST /api/v1/donations
   */
  const create = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const donation = await activeService.createDonation(req.user, req.body);
      return res.status(201).json({
        message: 'Donation created successfully',
        donation
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/donations/:id
   */
  const getById = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const donation = await activeService.getDonationById(req.params.id, req.user);
      return res.status(200).json({
        donation
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/donations
   */
  const list = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const result = await activeService.listDonations(req.query);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/donations/nearby
   */
  const getNearby = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const donations = await activeService.getNearbyDonations(req.query);
      return res.status(200).json({
        count: donations.length,
        donations
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/donations/:id
   */
  const update = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const donation = await activeService.updateDonation(req.params.id, req.user, req.body);
      return res.status(200).json({
        message: 'Donation updated successfully',
        donation
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/donations/:id
   */
  const deleteDonation = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const result = await activeService.deleteDonation(req.params.id, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/donations/:id/claim
   */
  const claim = async (req, res, next) => {
    try {
      const activeClaimService = getClaimService(req);
      const result = await activeClaimService.claimDonation(req.params.id, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/donations/:id/cancel-claim
   */
  const cancelClaim = async (req, res, next) => {
    try {
      const activeClaimService = getClaimService(req);
      const result = await activeClaimService.cancelClaim(req.params.id, req.user, req.body?.reason);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  return {
    create,
    getById,
    list,
    getNearby,
    update,
    deleteDonation,
    claim,
    cancelClaim
  };
};

export const donationController = createDonationController(donationService, claimService);

export default donationController;
