import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import app from '../src/app.js';
import {
  claimDonationAtomic,
  cancelClaimAtomic,
  generateHandoverCode,
  toSafeClaim,
  toSafeDonationEvent
} from '../src/repositories/claimRepository.js';
import {
  claimDonation as claimDonationService,
  cancelClaim as cancelClaimService,
  getDonationAuditTrail as getDonationAuditTrailService
} from '../src/services/claimService.js';
import { createDonationController } from '../src/controllers/donationController.js';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { generateToken } from '../src/utils/token.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError
} from '../src/utils/errors.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import requestId from '../src/middleware/requestId.js';
import { closePool } from '../src/config/db.js';

describe('Handover Code & Entity Projections (claimRepository.js)', () => {
  it('generateHandoverCode should return a 6-digit numeric string', () => {
    const code = generateHandoverCode();
    assert.strictEqual(typeof code, 'string');
    assert.strictEqual(code.length, 6);
    assert.match(code, /^[0-9]{6}$/);
  });

  it('toSafeClaim should format dates and strip nulls safely', () => {
    const rawRow = {
      id: '11111111-1111-4111-a111-111111111111',
      donation_id: '22222222-2222-4222-a222-222222222222',
      ngo_id: '33333333-3333-4333-a333-333333333333',
      volunteer_id: null,
      status: 'CLAIMED',
      handover_code: '123456',
      claimed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    };
    const safe = toSafeClaim(rawRow);
    assert.strictEqual(safe.id, rawRow.id);
    assert.strictEqual(safe.status, 'CLAIMED');
    assert.strictEqual(safe.handover_code, '123456');
    assert.strictEqual(typeof safe.claimed_at, 'string');
  });

  it('toSafeDonationEvent should format audit trail safely', () => {
    const rawRow = {
      id: '44444444-4444-4444-a444-444444444444',
      donation_id: '22222222-2222-4222-a222-222222222222',
      actor_id: '33333333-3333-4333-a333-333333333333',
      from_status: 'AVAILABLE',
      to_status: 'CLAIMED',
      reason: 'Claimed by NGO',
      metadata_json: { claim_id: '123' },
      created_at: new Date()
    };
    const safe = toSafeDonationEvent(rawRow);
    assert.strictEqual(safe.from_status, 'AVAILABLE');
    assert.strictEqual(safe.to_status, 'CLAIMED');
  });
});

describe('Atomic Claiming & Audit Logging Transaction Logic (claimRepository.js)', () => {
  const donationId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const donorId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  const ngoId = 'nnnnnnnn-nnnn-4nnn-annn-nnnnnnnnnnnn';
  const competingNgoId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

  const futureExpiry = new Date(Date.now() + 10 * 3600 * 1000).toISOString();
  const futureDeadline = new Date(Date.now() + 5 * 3600 * 1000).toISOString();

  const createMockDbClient = (overrides = {}) => {
    const calls = [];
    let isReleased = false;

    const client = {
      query: async (sql, params = []) => {
        calls.push({ sql: sql.trim(), params });
        if (overrides.queryHandler) {
          return await overrides.queryHandler(sql, params, calls);
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {
        isReleased = true;
      },
      getCalls: () => calls,
      isReleased: () => isReleased
    };

    return client;
  };

  it('should successfully claim donation and create audit event in a single transaction', async () => {
    const mockClient = createMockDbClient({
      queryHandler: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        // 1. SELECT donation check
        if (sql.includes('SELECT id, donor_id, status, expires_at')) {
          return {
            rows: [{
              id: donationId,
              donor_id: donorId,
              status: 'AVAILABLE',
              expires_at: futureExpiry,
              pickup_deadline: futureDeadline
            }],
            rowCount: 1
          };
        }
        // 2. UPDATE donation
        if (sql.includes('UPDATE donations')) {
          return {
            rows: [{
              id: donationId,
              donor_id: donorId,
              title: 'Fresh Rice',
              category: 'COOKED_MEALS',
              quantity: 20,
              unit: 'plates',
              expires_at: futureExpiry,
              pickup_deadline: futureDeadline,
              address: 'City Center',
              status: 'CLAIMED',
              created_at: new Date(),
              updated_at: new Date()
            }],
            rowCount: 1
          };
        }
        // 3. INSERT claim
        if (sql.includes('INSERT INTO claims')) {
          return {
            rows: [{
              id: 'claim-1',
              donation_id: donationId,
              ngo_id: ngoId,
              status: 'CLAIMED',
              handover_code: '654321',
              claimed_at: new Date(),
              created_at: new Date(),
              updated_at: new Date()
            }],
            rowCount: 1
          };
        }
        // 4. INSERT donation_events
        if (sql.includes('INSERT INTO donation_events')) {
          return {
            rows: [{
              id: 'audit-1',
              donation_id: donationId,
              actor_id: ngoId,
              from_status: 'AVAILABLE',
              to_status: 'CLAIMED',
              reason: 'Donation claimed by NGO',
              metadata_json: '{}',
              created_at: new Date()
            }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      }
    });

    const result = await claimDonationAtomic(
      { donationId, ngoId, ngoName: 'Asha Foundation' },
      async () => mockClient
    );

    assert.ok(result.donation);
    assert.strictEqual(result.donation.status, 'CLAIMED');
    assert.ok(result.claim);
    assert.strictEqual(result.claim.status, 'CLAIMED');
    assert.ok(result.auditEvent);
    assert.strictEqual(result.auditEvent.to_status, 'CLAIMED');

    // Confirm transaction workflow: BEGIN -> query steps -> COMMIT
    const sqlCalls = mockClient.getCalls().map(c => c.sql);
    assert.strictEqual(sqlCalls[0], 'BEGIN');
    assert.strictEqual(sqlCalls[sqlCalls.length - 1], 'COMMIT');
    assert.strictEqual(mockClient.isReleased(), true, 'Database client must be released');
  });

  it('should prevent donor from claiming their own donation and roll back', async () => {
    const mockClient = createMockDbClient({
      queryHandler: async (sql) => {
        if (sql.includes('SELECT id, donor_id, status')) {
          // donor_id matches ngoId
          return {
            rows: [{
              id: donationId,
              donor_id: donorId,
              status: 'AVAILABLE',
              expires_at: futureExpiry,
              pickup_deadline: futureDeadline
            }],
            rowCount: 1
          };
        }
        return { rows: [] };
      }
    });

    await assert.rejects(
      async () => await claimDonationAtomic({ donationId, ngoId: donorId }, async () => mockClient),
      (err) => err instanceof ForbiddenError && /own donation/i.test(err.message)
    );

    const sqlCalls = mockClient.getCalls().map(c => c.sql);
    assert.ok(sqlCalls.includes('ROLLBACK'));
    assert.strictEqual(mockClient.isReleased(), true);
  });

  it('should reject expired donations and roll back', async () => {
    const mockClient = createMockDbClient({
      queryHandler: async (sql) => {
        if (sql.includes('SELECT id, donor_id, status')) {
          return {
            rows: [{
              id: donationId,
              donor_id: donorId,
              status: 'AVAILABLE',
              expires_at: new Date(Date.now() - 3600 * 1000).toISOString(), // Expired 1 hour ago
              pickup_deadline: new Date(Date.now() - 7200 * 1000).toISOString()
            }],
            rowCount: 1
          };
        }
        return { rows: [] };
      }
    });

    await assert.rejects(
      async () => await claimDonationAtomic({ donationId, ngoId }, async () => mockClient),
      (err) => err instanceof ConflictError && /expired/i.test(err.message)
    );

    assert.ok(mockClient.getCalls().map(c => c.sql).includes('ROLLBACK'));
    assert.strictEqual(mockClient.isReleased(), true);
  });

  it('should return 409 Conflict when concurrent race condition occurs (update rowCount is 0)', async () => {
    // Simulates second transaction arriving slightly behind winner:
    // Pre-check sees AVAILABLE, but conditional UPDATE returns rowCount: 0 because winner already committed CLAIMED
    const mockClient = createMockDbClient({
      queryHandler: async (sql) => {
        if (sql.includes('SELECT id, donor_id, status')) {
          return {
            rows: [{
              id: donationId,
              donor_id: donorId,
              status: 'AVAILABLE',
              expires_at: futureExpiry,
              pickup_deadline: futureDeadline
            }],
            rowCount: 1
          };
        }
        if (sql.includes('UPDATE donations')) {
          // Winner changed it to CLAIMED, so conditional WHERE status = 'AVAILABLE' returns 0 rows!
          return { rows: [], rowCount: 0 };
        }
        return { rows: [] };
      }
    });

    await assert.rejects(
      async () => await claimDonationAtomic({ donationId, ngoId: competingNgoId }, async () => mockClient),
      (err) => err instanceof ConflictError && /no longer available/i.test(err.message)
    );

    assert.ok(mockClient.getCalls().map(c => c.sql).includes('ROLLBACK'));
    assert.strictEqual(mockClient.isReleased(), true);
  });

  it('should rollback transaction if audit logging fails', async () => {
    const mockClient = createMockDbClient({
      queryHandler: async (sql) => {
        if (sql.includes('SELECT id, donor_id, status')) {
          return {
            rows: [{ id: donationId, donor_id: donorId, status: 'AVAILABLE', expires_at: futureExpiry, pickup_deadline: futureDeadline }],
            rowCount: 1
          };
        }
        if (sql.includes('UPDATE donations')) {
          return {
            rows: [{
              id: donationId,
              donor_id: donorId,
              title: 'Meals',
              category: 'COOKED_MEALS',
              quantity: 10,
              unit: 'KG',
              status: 'CLAIMED',
              expires_at: futureExpiry,
              pickup_deadline: futureDeadline,
              address: '123 Main St',
              created_at: new Date(),
              updated_at: new Date()
            }],
            rowCount: 1
          };
        }
        if (sql.includes('INSERT INTO claims')) {
          return {
            rows: [{ id: 'claim-1', donation_id: donationId, ngo_id: ngoId, status: 'CLAIMED', claimed_at: new Date(), created_at: new Date(), updated_at: new Date() }],
            rowCount: 1
          };
        }
        if (sql.includes('INSERT INTO donation_events')) {
          // Audit log write failure (e.g. disk full, constraint issue)
          throw new Error('Audit table write failed');
        }
        return { rows: [] };
      }
    });

    await assert.rejects(
      async () => await claimDonationAtomic({ donationId, ngoId }, async () => mockClient),
      (err) => err.message === 'Audit table write failed'
    );

    const calls = mockClient.getCalls().map(c => c.sql);
    assert.ok(calls.includes('ROLLBACK'), 'Transaction must roll back when audit logging fails');
    assert.strictEqual(mockClient.isReleased(), true);
  });

  it('cancelClaimAtomic should cancel active claim and restore donation status to AVAILABLE in transaction', async () => {
    const mockClient = createMockDbClient({
      queryHandler: async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM claims') && sql.includes('WHERE donation_id = $1 AND status = \'CLAIMED\'')) {
          return {
            rows: [{
              id: 'claim-1',
              donation_id: donationId,
              ngo_id: ngoId,
              status: 'CLAIMED',
              created_at: new Date(),
              updated_at: new Date()
            }],
            rowCount: 1
          };
        }
        if (sql.includes('UPDATE claims')) {
          return {
            rows: [{ id: 'claim-1', donation_id: donationId, ngo_id: ngoId, status: 'CANCELLED', created_at: new Date(), updated_at: new Date() }],
            rowCount: 1
          };
        }
        if (sql.includes('UPDATE donations')) {
          return {
            rows: [{
              id: donationId,
              donor_id: donorId,
              title: 'Rice',
              category: 'COOKED_MEALS',
              quantity: 10,
              unit: 'KG',
              status: 'AVAILABLE',
              expires_at: futureExpiry,
              pickup_deadline: futureDeadline,
              address: '123 Main St',
              created_at: new Date(),
              updated_at: new Date()
            }],
            rowCount: 1
          };
        }
        if (sql.includes('INSERT INTO donation_events')) {
          return {
            rows: [{ id: 'audit-2', donation_id: donationId, actor_id: ngoId, from_status: 'CLAIMED', to_status: 'AVAILABLE', created_at: new Date() }],
            rowCount: 1
          };
        }
        return { rows: [] };
      }
    });

    const result = await cancelClaimAtomic(
      { donationId, actorId: ngoId, actorRole: 'NGO', reason: 'Volunteer unavailable' },
      async () => mockClient
    );

    assert.strictEqual(result.donation.status, 'AVAILABLE');
    assert.strictEqual(result.claim.status, 'CANCELLED');
    assert.strictEqual(result.auditEvent.to_status, 'AVAILABLE');

    const sqlCalls = mockClient.getCalls().map(c => c.sql);
    assert.strictEqual(sqlCalls[0], 'BEGIN');
    assert.strictEqual(sqlCalls[sqlCalls.length - 1], 'COMMIT');
    assert.strictEqual(mockClient.isReleased(), true);
  });
});

describe('Claim Service Layer Authorization & Validation (claimService.js)', () => {
  const donationId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const ngoId = '11111111-1111-4111-a111-111111111111';

  it('claimDonation should reject non-NGO roles with 403 Forbidden', async () => {
    const donorUser = { id: 'donor-1', role: 'DONOR', status: 'ACTIVE' };
    const volunteerUser = { id: 'vol-1', role: 'VOLUNTEER', status: 'ACTIVE' };

    await assert.rejects(
      async () => await claimDonationService(donationId, donorUser),
      (err) => err instanceof ForbiddenError && /only active ngo/i.test(err.message)
    );
    await assert.rejects(
      async () => await claimDonationService(donationId, volunteerUser),
      (err) => err instanceof ForbiddenError && /only active ngo/i.test(err.message)
    );
  });

  it('claimDonation should reject PENDING and SUSPENDED NGO accounts with 403 Forbidden', async () => {
    const pendingNgo = { id: ngoId, role: 'NGO', status: 'PENDING' };
    const suspendedNgo = { id: ngoId, role: 'NGO', status: 'SUSPENDED' };

    await assert.rejects(
      async () => await claimDonationService(donationId, pendingNgo),
      (err) => err instanceof ForbiddenError
    );
    await assert.rejects(
      async () => await claimDonationService(donationId, suspendedNgo),
      (err) => err instanceof ForbiddenError
    );
  });

  it('cancelClaim should forbid non-claiming users and non-admins with 403', async () => {
    const otherNgo = { id: 'other-ngo-id', role: 'NGO', status: 'ACTIVE' };
    const mockRepo = {
      cancelClaimAtomic: async ({ actorId, actorRole }) => {
        if (actorId !== ngoId && actorRole !== 'ADMIN') {
          throw new ForbiddenError('You are not authorized to cancel this claim');
        }
        return { donation: {}, claim: {} };
      }
    };

    await assert.rejects(
      async () => await cancelClaimService(donationId, otherNgo, 'Reason', mockRepo),
      (err) => err instanceof ForbiddenError
    );
  });
});

describe('Donation Claim & Cancel-Claim API Endpoints (Express Integration)', () => {
  const donorId = '11111111-1111-4111-a111-111111111111';
  const ngoId = '22222222-2222-4222-a222-222222222222';
  const otherNgoId = '33333333-3333-4333-a333-333333333333';
  const volunteerId = '44444444-4444-4444-a444-444444444444';
  const adminId = '55555555-5555-4555-a555-555555555555';
  const donationId = '66666666-6666-4666-a666-666666666666';

  const activeDonor = { id: donorId, name: 'Donor', role: 'DONOR', status: 'ACTIVE' };
  const activeNgo = { id: ngoId, name: 'NGO Partner', role: 'NGO', status: 'ACTIVE' };
  const otherNgo = { id: otherNgoId, name: 'Other NGO', role: 'NGO', status: 'ACTIVE' };
  const activeVolunteer = { id: volunteerId, name: 'Volunteer', role: 'VOLUNTEER', status: 'ACTIVE' };
  const activeAdmin = { id: adminId, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' };
  const pendingNgo = { id: ngoId, name: 'Pending NGO', role: 'NGO', status: 'PENDING' };

  const donorToken = generateToken({ sub: donorId, role: 'DONOR', status: 'ACTIVE' });
  const ngoToken = generateToken({ sub: ngoId, role: 'NGO', status: 'ACTIVE' });
  const otherNgoToken = generateToken({ sub: otherNgoId, role: 'NGO', status: 'ACTIVE' });
  const volunteerToken = generateToken({ sub: volunteerId, role: 'VOLUNTEER', status: 'ACTIVE' });
  const adminToken = generateToken({ sub: adminId, role: 'ADMIN', status: 'ACTIVE' });
  const pendingNgoToken = generateToken({ sub: ngoId, role: 'NGO', status: 'PENDING' });

  const setupClaimServer = (claimServiceOverrides = {}, repoOverrides = {}) => {
    const testApp = express();
    testApp.use(requestId);
    testApp.use(express.json());

    const mockUserRepo = {
      findUserById: async (id) => {
        if (id === donorId) return activeDonor;
        if (id === ngoId) return activeNgo;
        if (id === otherNgoId) return otherNgo;
        if (id === volunteerId) return activeVolunteer;
        if (id === adminId) return activeAdmin;
        return null;
      },
      ...repoOverrides
    };

    const mockClaimService = {
      claimDonation: async (dId, user) => ({
        message: 'Donation claimed successfully',
        claim: { id: 'claim-123', donation_id: dId, ngo_id: user.id, status: 'CLAIMED', handover_code: '888999' },
        donation: { id: dId, status: 'CLAIMED' },
        auditEvent: { to_status: 'CLAIMED' }
      }),
      cancelClaim: async (dId, user, reason) => ({
        message: 'Donation claim cancelled successfully',
        donation: { id: dId, status: 'AVAILABLE' },
        claim: { id: 'claim-123', status: 'CANCELLED' }
      }),
      ...claimServiceOverrides
    };

    const authMw = createAuthMiddleware(mockUserRepo);
    const controller = createDonationController({}, mockClaimService);

    // Routes exactly as donationRoutes.js mounts them
    const router = express.Router();
    router.use(authMw);
    router.post('/:id/claim', (req, res, next) => (req.user.role === 'NGO' && req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied'))), controller.claim);
    router.post('/:id/cancel-claim', (req, res, next) => (['NGO', 'ADMIN'].includes(req.user.role) && req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied'))), controller.cancelClaim);
    router.get('/', (req, res, next) => req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied')), (req, res) => res.json({ donations: [] }));
    router.get('/:id', (req, res, next) => req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied')), (req, res) => res.json({ donation: { id: req.params.id } }));

    testApp.use('/api/v1/donations', router);
    testApp.use(errorHandler);
    return testApp;
  };

  describe('POST /api/v1/donations/:id/claim', () => {
    it('should reject unauthenticated claim request with 401', async () => {
      const server = setupClaimServer();
      const res = await request(server).post(`/api/v1/donations/${donationId}/claim`);
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    });

    it('should reject non-NGO role (e.g. DONOR or VOLUNTEER) with 403 Forbidden', async () => {
      const server = setupClaimServer();
      const res1 = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${donorToken}`);
      assert.strictEqual(res1.status, 403);

      const res2 = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${volunteerToken}`);
      assert.strictEqual(res2.status, 403);
    });

    it('should reject PENDING NGO account with 403 Forbidden', async () => {
      const server = setupClaimServer({}, {
        findUserById: async () => pendingNgo
      });
      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${pendingNgoToken}`);
      assert.strictEqual(res.status, 403);
    });

    it('should successfully claim donation for ACTIVE NGO returning 200 with claim and handover code', async () => {
      const server = setupClaimServer();
      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${ngoToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Donation claimed successfully');
      assert.ok(res.body.claim);
      assert.strictEqual(res.body.claim.status, 'CLAIMED');
      assert.strictEqual(res.body.claim.handover_code, '888999');
      assert.strictEqual(res.body.donation.status, 'CLAIMED');
      assert.ok(res.headers['x-request-id']);
    });

    it('should return 409 Conflict when donation is already claimed by competing transaction', async () => {
      const server = setupClaimServer({
        claimDonation: async () => {
          throw new ConflictError('This donation is no longer available for claiming');
        }
      });

      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${otherNgoToken}`);

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'CONFLICT');
      assert.match(res.body.error.message, /no longer available/i);
    });

    it('should return 409 Conflict when donation has expired', async () => {
      const server = setupClaimServer({
        claimDonation: async () => {
          throw new ConflictError('This donation has expired and can no longer be claimed');
        }
      });

      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${ngoToken}`);

      assert.strictEqual(res.status, 409);
      assert.match(res.body.error.message, /expired/i);
    });

    it('should return 403 Forbidden if donor attempts to claim their own donation', async () => {
      const server = setupClaimServer({
        claimDonation: async () => {
          throw new ForbiddenError('Donors cannot claim their own donations');
        }
      });

      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${ngoToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
      assert.match(res.body.error.message, /own donations/i);
    });

    it('should return 404 Not Found when donation UUID does not exist', async () => {
      const server = setupClaimServer({
        claimDonation: async () => {
          throw new NotFoundError('Donation not found');
        }
      });

      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/claim`)
        .set('Authorization', `Bearer ${ngoToken}`);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('POST /api/v1/donations/:id/cancel-claim', () => {
    it('should allow claiming NGO to cancel their claim', async () => {
      const server = setupClaimServer();
      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/cancel-claim`)
        .set('Authorization', `Bearer ${ngoToken}`)
        .send({ reason: 'Transport vehicle breakdown' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Donation claim cancelled successfully');
      assert.strictEqual(res.body.donation.status, 'AVAILABLE');
      assert.strictEqual(res.body.claim.status, 'CANCELLED');
    });

    it('should allow ADMIN to cancel claim', async () => {
      const server = setupClaimServer();
      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/cancel-claim`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Admin intervention' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Donation claim cancelled successfully');
    });

    it('should return 403 when non-claiming NGO attempts to cancel', async () => {
      const server = setupClaimServer({
        cancelClaim: async () => {
          throw new ForbiddenError('You are not authorized to cancel this claim');
        }
      });

      const res = await request(server)
        .post(`/api/v1/donations/${donationId}/cancel-claim`)
        .set('Authorization', `Bearer ${otherNgoToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });

  describe('Authorization Policy: Pending Users Blocked from Operational Endpoints', () => {
    it('GET /api/v1/donations should block PENDING users with 403 Forbidden', async () => {
      const server = setupClaimServer({}, {
        findUserById: async () => pendingNgo
      });
      const res = await request(server)
        .get('/api/v1/donations')
        .set('Authorization', `Bearer ${pendingNgoToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });

    it('GET /api/v1/donations/:id should block PENDING users with 403 Forbidden', async () => {
      const server = setupClaimServer({}, {
        findUserById: async () => pendingNgo
      });
      const res = await request(server)
        .get(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${pendingNgoToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });

  after(async () => {
    await closePool();
  });
});
