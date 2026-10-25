import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import app from '../src/app.js';
import {
  calculateHaversineDistance,
  calculateBoundingBox,
  EARTH_RADIUS_KM
} from '../src/utils/geo.js';
import {
  validateCreateDonation,
  validateUpdateDonation,
  validateDonationFilters,
  validateNearbySearch,
  validateUuid
} from '../src/validators/donationValidator.js';
import {
  createDonation,
  findDonationById,
  findDonations,
  findNearbyDonations,
  updateDonation,
  deleteDonation,
  toSafeDonation
} from '../src/repositories/donationRepository.js';
import {
  createDonation as createDonationService,
  getDonationById as getDonationByIdService,
  listDonations as listDonationsService,
  getNearbyDonations as getNearbyDonationsService,
  updateDonation as updateDonationService,
  deleteDonation as deleteDonationService
} from '../src/services/donationService.js';
import { createDonationController } from '../src/controllers/donationController.js';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { generateToken } from '../src/utils/token.js';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError
} from '../src/utils/errors.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import requestId from '../src/middleware/requestId.js';
import { closePool } from '../src/config/db.js';

describe('Haversine Distance & Geographic Calculations (geo.js)', () => {
  it('calculateHaversineDistance should return 0.0 for identical coordinates', () => {
    const dist = calculateHaversineDistance(12.3051, 76.6551, 12.3051, 76.6551);
    assert.strictEqual(dist, 0);
  });

  it('calculateHaversineDistance should compute accurate distance between known points', () => {
    // Distance between Mysuru Palace (12.3051, 76.6551) and NIE Mysuru (12.2840, 76.6410) ~ 2.76 km
    const dist = calculateHaversineDistance(12.3051, 76.6551, 12.2840, 76.6410);
    assert.ok(dist >= 2.5 && dist <= 3.0, `Expected ~2.76 km, got ${dist} km`);
  });

  it('calculateHaversineDistance should safely clamp intermediate values and avoid NaN on boundary coords', () => {
    // North pole to South pole (antipodal points): delta = 180 degrees
    const antipodalDist = calculateHaversineDistance(90, 0, -90, 0);
    assert.strictEqual(Number.isNaN(antipodalDist), false);
    assert.ok(antipodalDist > 20000, 'Half circumference of Earth should be ~20015 km');
  });

  it('calculateBoundingBox should produce a valid enclosing bounding box', () => {
    const lat = 12.30;
    const lng = 76.65;
    const radiusKm = 10;
    const box = calculateBoundingBox(lat, lng, radiusKm);

    assert.ok(box.minLat < lat);
    assert.ok(box.maxLat > lat);
    assert.ok(box.minLng < lng);
    assert.ok(box.maxLng > lng);
    assert.ok(box.minLat >= -90 && box.maxLat <= 90);
    assert.ok(box.minLng >= -180 && box.maxLng <= 180);
  });
});

describe('Donation Payload & Query Validators (donationValidator.js)', () => {
  const getFutureDate = (hoursAhead) => {
    return new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();
  };

  const validDonationPayload = {
    title: 'Surplus Fresh Sandwiches and Rolls',
    category: 'BAKERY',
    description: 'Freshly prepared assorted vegetarian sandwiches from campus seminar',
    quantity: 25,
    unit: 'packets',
    prepared_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    expires_at: getFutureDate(12),
    pickup_deadline: getFutureDate(6),
    address: 'NIE Golden Jubilee Complex, Manandavadi Road, Mysuru',
    latitude: 12.2840,
    longitude: 76.6410
  };

  it('validateCreateDonation should accept valid payload and return sanitized attributes', () => {
    const result = validateCreateDonation(validDonationPayload);
    assert.strictEqual(result.title, validDonationPayload.title);
    assert.strictEqual(result.category, 'BAKERY');
    assert.strictEqual(result.quantity, 25);
    assert.strictEqual(result.unit, 'packets');
    assert.strictEqual(result.latitude, 12.284);
    assert.strictEqual(result.longitude, 76.641);
  });

  it('validateCreateDonation should reject past expires_at with ValidationError', () => {
    const pastPayload = {
      ...validDonationPayload,
      expires_at: new Date(Date.now() - 3600 * 1000).toISOString()
    };
    assert.throws(
      () => validateCreateDonation(pastPayload),
      (err) => err instanceof ValidationError && err.details.some(d => d.field === 'expires_at')
    );
  });

  it('validateCreateDonation should reject pickup_deadline after expires_at', () => {
    const invalidDatesPayload = {
      ...validDonationPayload,
      expires_at: getFutureDate(4),
      pickup_deadline: getFutureDate(8) // Pickup deadline is AFTER expiry!
    };
    assert.throws(
      () => validateCreateDonation(invalidDatesPayload),
      (err) => err instanceof ValidationError && err.details.some(d => d.field === 'pickup_deadline')
    );
  });

  it('validateCreateDonation should reject negative or non-numeric quantity', () => {
    assert.throws(
      () => validateCreateDonation({ ...validDonationPayload, quantity: -5 }),
      (err) => err instanceof ValidationError && err.details.some(d => d.field === 'quantity')
    );
    assert.throws(
      () => validateCreateDonation({ ...validDonationPayload, quantity: 'not-a-number' }),
      (err) => err instanceof ValidationError && err.details.some(d => d.field === 'quantity')
    );
  });

  it('validateCreateDonation should reject out-of-range coordinates', () => {
    assert.throws(
      () => validateCreateDonation({ ...validDonationPayload, latitude: 120.0 }),
      (err) => err instanceof ValidationError && err.details.some(d => d.field === 'latitude')
    );
    assert.throws(
      () => validateCreateDonation({ ...validDonationPayload, longitude: -200.0 }),
      (err) => err instanceof ValidationError && err.details.some(d => d.field === 'longitude')
    );
  });

  it('validateUpdateDonation should reject empty updates body', () => {
    assert.throws(
      () => validateUpdateDonation({}),
      (err) => err instanceof ValidationError && err.statusCode === 400
    );
  });

  it('validateUpdateDonation should accept valid partial updates', () => {
    const updates = validateUpdateDonation({
      title: 'Updated Sandwich Package Title',
      quantity: 30
    });
    assert.strictEqual(updates.title, 'Updated Sandwich Package Title');
    assert.strictEqual(updates.quantity, 30);
    assert.strictEqual(updates.description, undefined);
  });

  it('validateNearbySearch should accept valid coordinates and radius', () => {
    const params = validateNearbySearch({ lat: '12.30', lng: '76.65', radiusKm: '15' });
    assert.strictEqual(params.lat, 12.3);
    assert.strictEqual(params.lng, 76.65);
    assert.strictEqual(params.radiusKm, 15);
  });

  it('validateNearbySearch should reject missing or invalid coordinates and negative radius', () => {
    assert.throws(() => validateNearbySearch({ lng: '76.65' }), (err) => err instanceof ValidationError);
    assert.throws(() => validateNearbySearch({ lat: '12.30' }), (err) => err instanceof ValidationError);
    assert.throws(() => validateNearbySearch({ lat: '12.30', lng: '76.65', radiusKm: '-5' }), (err) => err instanceof ValidationError);
    assert.throws(() => validateNearbySearch({ lat: '12.30', lng: '76.65', radiusKm: '9999' }), (err) => err instanceof ValidationError);
  });

  it('validateUuid should reject malformed or non-UUID strings', () => {
    assert.throws(() => validateUuid('not-a-uuid'), (err) => err instanceof ValidationError);
    assert.throws(() => validateUuid(null), (err) => err instanceof ValidationError);
  });
});

describe('Donation Service Business Logic & Lifecycle Rules (donationService.js)', () => {
  const donorId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const donationId = '33333333-3333-3333-3333-333333333333';

  const mockActiveDonor = { id: donorId, role: 'DONOR', status: 'ACTIVE' };
  const mockPendingDonor = { id: donorId, role: 'DONOR', status: 'PENDING' };
  const mockActiveNgo = { id: otherUserId, role: 'NGO', status: 'ACTIVE' };

  const getFutureDate = (hoursAhead) => new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();

  const mockValidPayload = {
    title: 'Surplus Cooked Meals',
    category: 'COOKED_MEALS',
    quantity: 50,
    unit: 'plates',
    expires_at: getFutureDate(10),
    pickup_deadline: getFutureDate(4),
    address: 'Campus Hostel Mess, Mysuru',
    latitude: 12.284,
    longitude: 76.641
  };

  const createMockDonation = (overrides = {}) => ({
    id: donationId,
    donor_id: donorId,
    title: mockValidPayload.title,
    category: mockValidPayload.category,
    quantity: mockValidPayload.quantity,
    unit: mockValidPayload.unit,
    expires_at: mockValidPayload.expires_at,
    pickup_deadline: mockValidPayload.pickup_deadline,
    address: mockValidPayload.address,
    latitude: mockValidPayload.latitude,
    longitude: mockValidPayload.longitude,
    status: 'AVAILABLE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  });

  it('createDonation should strictly forbid non-DONOR or non-ACTIVE accounts', async () => {
    await assert.rejects(
      async () => await createDonationService(mockPendingDonor, mockValidPayload),
      (err) => err instanceof ForbiddenError && err.statusCode === 403
    );
    await assert.rejects(
      async () => await createDonationService(mockActiveNgo, mockValidPayload),
      (err) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  it('createDonation should derive donor_id from authenticated user and ignore any body donor_id', async () => {
    let capturedData = null;
    const mockRepo = {
      createDonation: async (data) => {
        capturedData = data;
        return { id: donationId, ...data };
      }
    };

    // Client maliciously attempts to supply a different donor_id in body
    const maliciousPayload = { ...mockValidPayload, donor_id: 'malicious-spoofed-id' };
    const result = await createDonationService(mockActiveDonor, maliciousPayload, mockRepo);

    assert.strictEqual(capturedData.donor_id, donorId, 'donor_id must be derived from req.user.id');
    assert.strictEqual(result.donor_id, donorId);
  });

  it('updateDonation should forbid non-owners from modifying a donation', async () => {
    const mockRepo = {
      findDonationById: async () => createMockDonation()
    };

    await assert.rejects(
      async () => await updateDonationService(donationId, { id: otherUserId, role: 'DONOR' }, { title: 'Hacked' }, mockRepo),
      (err) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  it('updateDonation should reject updates when status is no longer AVAILABLE (lifecycle rule)', async () => {
    const mockRepo = {
      findDonationById: async () => createMockDonation({ status: 'CLAIMED' })
    };

    await assert.rejects(
      async () => await updateDonationService(donationId, mockActiveDonor, { title: 'Change' }, mockRepo),
      (err) => err instanceof BadRequestError && err.statusCode === 400 && /AVAILABLE/i.test(err.message)
    );
  });

  it('deleteDonation should forbid non-owners from deleting a donation', async () => {
    const mockRepo = {
      findDonationById: async () => createMockDonation()
    };

    await assert.rejects(
      async () => await deleteDonationService(donationId, { id: otherUserId, role: 'DONOR' }, mockRepo),
      (err) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  it('deleteDonation should reject deletion when status is no longer AVAILABLE (lifecycle rule)', async () => {
    const mockRepo = {
      findDonationById: async () => createMockDonation({ status: 'IN_TRANSIT' })
    };

    await assert.rejects(
      async () => await deleteDonationService(donationId, mockActiveDonor, mockRepo),
      (err) => err instanceof BadRequestError && err.statusCode === 400
    );
  });

  it('deleteDonation should successfully delete an unreserved AVAILABLE donation by owner', async () => {
    let deletedId = null;
    const mockRepo = {
      findDonationById: async () => createMockDonation({ status: 'AVAILABLE' }),
      deleteDonation: async (id) => {
        deletedId = id;
        return true;
      }
    };

    const res = await deleteDonationService(donationId, mockActiveDonor, mockRepo);
    assert.strictEqual(deletedId, donationId);
    assert.strictEqual(res.message, 'Donation deleted successfully');
  });
});

describe('Donation API Endpoints (Integration & Express Routing)', () => {
  const donorId = '44444444-4444-4444-4444-444444444444';
  const otherDonorId = '55555555-5555-5555-5555-555555555555';
  const ngoId = '66666666-6666-6666-6666-666666666666';
  const donationId = '77777777-7777-7777-7777-777777777777';

  const activeDonorUser = { id: donorId, name: 'Active Donor', role: 'DONOR', status: 'ACTIVE' };
  const otherDonorUser = { id: otherDonorId, name: 'Other Donor', role: 'DONOR', status: 'ACTIVE' };
  const pendingDonorUser = { id: donorId, name: 'Pending Donor', role: 'DONOR', status: 'PENDING' };
  const suspendedDonorUser = { id: donorId, name: 'Suspended Donor', role: 'DONOR', status: 'SUSPENDED' };
  const activeNgoUser = { id: ngoId, name: 'Active NGO', role: 'NGO', status: 'ACTIVE' };

  const donorToken = generateToken({ sub: donorId, role: 'DONOR', status: 'ACTIVE' });
  const otherDonorToken = generateToken({ sub: otherDonorId, role: 'DONOR', status: 'ACTIVE' });
  const pendingDonorToken = generateToken({ sub: donorId, role: 'DONOR', status: 'PENDING' });
  const suspendedDonorToken = generateToken({ sub: donorId, role: 'DONOR', status: 'SUSPENDED' });
  const ngoToken = generateToken({ sub: ngoId, role: 'NGO', status: 'ACTIVE' });

  const getFutureDate = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

  const sampleDonation = {
    id: donationId,
    donor_id: donorId,
    donor_name: 'Active Donor',
    title: 'Surplus Fresh Rice & Curry',
    category: 'COOKED_MEALS',
    description: 'Hot vegetarian food',
    quantity: 40,
    unit: 'plates',
    prepared_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    expires_at: getFutureDate(8),
    pickup_deadline: getFutureDate(4),
    address: 'Mysuru City Center',
    latitude: 12.3051,
    longitude: 76.6551,
    status: 'AVAILABLE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const setupMockDonationServer = (serviceOverrides = {}, repoOverrides = {}) => {
    const testApp = express();
    testApp.use(requestId);
    testApp.use(express.json());

    const mockRepo = {
      findUserById: async (id) => {
        if (id === donorId) return activeDonorUser;
        if (id === otherDonorId) return otherDonorUser;
        if (id === ngoId) return activeNgoUser;
        return null;
      },
      ...repoOverrides
    };

    const mockService = {
      createDonation: async (user, data) => ({ id: donationId, donor_id: user.id, ...data, status: 'AVAILABLE' }),
      getDonationById: async (id, user) => sampleDonation,
      listDonations: async (query) => ({ donations: [sampleDonation], pagination: { total: 1, page: 1, limit: 10, totalPages: 1 } }),
      getNearbyDonations: async (query) => [{ ...sampleDonation, distance_km: 2.76 }],
      updateDonation: async (id, user, data) => ({ ...sampleDonation, ...data }),
      deleteDonation: async (id, user) => ({ message: 'Donation deleted successfully' }),
      ...serviceOverrides
    };

    const authMw = createAuthMiddleware(mockRepo);
    const controller = createDonationController(mockService);

    // Mount exactly as donationRoutes.js mounts
    const router = express.Router();
    router.use(authMw);
    router.get('/nearby', (req, res, next) => req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied')), controller.getNearby);
    router.post('/', (req, res, next) => req.user.role === 'DONOR' && req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied')), controller.create);
    router.get('/', controller.list);
    router.get('/:id', controller.getById);
    router.patch('/:id', (req, res, next) => req.user.role === 'DONOR' && req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied')), controller.update);
    router.delete('/:id', (req, res, next) => req.user.role === 'DONOR' && req.user.status === 'ACTIVE' ? next() : next(new ForbiddenError('Access denied')), controller.deleteDonation);

    testApp.use('/api/v1/donations', router);
    testApp.use(errorHandler);
    return testApp;
  };

  describe('POST /api/v1/donations (Create)', () => {
    it('should reject unauthenticated request with 401', async () => {
      const server = setupMockDonationServer();
      const res = await request(server).post('/api/v1/donations').send(sampleDonation);
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    });

    it('should reject non-DONOR role (e.g. NGO) with 403 Forbidden', async () => {
      const server = setupMockDonationServer();
      const res = await request(server)
        .post('/api/v1/donations')
        .set('Authorization', `Bearer ${ngoToken}`)
        .send(sampleDonation);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });

    it('should reject PENDING account status with 403 Forbidden', async () => {
      const server = setupMockDonationServer({}, {
        findUserById: async () => pendingDonorUser
      });
      const res = await request(server)
        .post('/api/v1/donations')
        .set('Authorization', `Bearer ${pendingDonorToken}`)
        .send(sampleDonation);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });

    it('should successfully create a donation for ACTIVE DONOR and return 201 Created', async () => {
      const server = setupMockDonationServer();
      const res = await request(server)
        .post('/api/v1/donations')
        .set('Authorization', `Bearer ${donorToken}`)
        .send(sampleDonation);

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.message, 'Donation created successfully');
      assert.ok(res.body.donation);
      assert.strictEqual(res.body.donation.donor_id, donorId);
      assert.strictEqual(res.body.donation.status, 'AVAILABLE');
    });
  });

  describe('GET /api/v1/donations/nearby (Haversine Proximity Search)', () => {
    it('should reject unauthenticated request with 401', async () => {
      const server = setupMockDonationServer();
      const res = await request(server).get('/api/v1/donations/nearby?lat=12.30&lng=76.65');
      assert.strictEqual(res.status, 401);
    });

    it('should successfully return nearby donations sorted by distance', async () => {
      const server = setupMockDonationServer();
      const res = await request(server)
        .get('/api/v1/donations/nearby?lat=12.284&lng=76.641&radiusKm=10')
        .set('Authorization', `Bearer ${ngoToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.count, 1);
      assert.ok(Array.isArray(res.body.donations));
      assert.strictEqual(res.body.donations[0].id, donationId);
      assert.strictEqual(typeof res.body.donations[0].distance_km, 'number');
    });

    it('should return 400 when coordinates or radius are invalid', async () => {
      const server = setupMockDonationServer({
        getNearbyDonations: async () => {
          throw new ValidationError('Invalid proximity search parameters', [
            { field: 'lat', message: 'Latitude must be a valid number between -90.0 and 90.0' }
          ]);
        }
      });

      const res = await request(server)
        .get('/api/v1/donations/nearby?lat=999&lng=76.65')
        .set('Authorization', `Bearer ${ngoToken}`);

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/donations/:id (Retrieve Single)', () => {
    it('should return 200 with donation details', async () => {
      const server = setupMockDonationServer();
      const res = await request(server)
        .get(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${donorToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.donation);
      assert.strictEqual(res.body.donation.id, donationId);
    });

    it('should return 404 when donation is not found', async () => {
      const server = setupMockDonationServer({
        getDonationById: async () => {
          throw new NotFoundError('Donation not found');
        }
      });

      const res = await request(server)
        .get(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${donorToken}`);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('GET /api/v1/donations (List)', () => {
    it('should return 200 with paginated donations', async () => {
      const server = setupMockDonationServer();
      const res = await request(server)
        .get('/api/v1/donations?page=1&limit=10')
        .set('Authorization', `Bearer ${donorToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.donations));
      assert.ok(res.body.pagination);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 10);
    });
  });

  describe('PATCH /api/v1/donations/:id (Update)', () => {
    it('should allow owner to update AVAILABLE donation', async () => {
      const server = setupMockDonationServer();
      const res = await request(server)
        .patch(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${donorToken}`)
        .send({ title: 'Updated Rice & Curry Title' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Donation updated successfully');
      assert.strictEqual(res.body.donation.title, 'Updated Rice & Curry Title');
    });

    it('should return 403 Forbidden when non-owner attempts update', async () => {
      const server = setupMockDonationServer({
        updateDonation: async () => {
          throw new ForbiddenError('You are not authorized to modify this donation');
        }
      });

      const res = await request(server)
        .patch(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${otherDonorToken}`)
        .send({ title: 'Unauthorized update' });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });

    it('should return 400 Bad Request when updating a non-AVAILABLE donation', async () => {
      const server = setupMockDonationServer({
        updateDonation: async () => {
          throw new BadRequestError('Donation cannot be updated once it is no longer in AVAILABLE status');
        }
      });

      const res = await request(server)
        .patch(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${donorToken}`)
        .send({ title: 'Late update' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'BAD_REQUEST');
    });
  });

  describe('DELETE /api/v1/donations/:id (Delete)', () => {
    it('should allow owner to delete AVAILABLE donation', async () => {
      const server = setupMockDonationServer();
      const res = await request(server)
        .delete(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${donorToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Donation deleted successfully');
    });

    it('should return 403 Forbidden when non-owner attempts delete', async () => {
      const server = setupMockDonationServer({
        deleteDonation: async () => {
          throw new ForbiddenError('You are not authorized to delete this donation');
        }
      });

      const res = await request(server)
        .delete(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${otherDonorToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });

    it('should return 400 Bad Request when deleting a claimed/processed donation', async () => {
      const server = setupMockDonationServer({
        deleteDonation: async () => {
          throw new BadRequestError('Donation cannot be deleted once it has been claimed or processed');
        }
      });

      const res = await request(server)
        .delete(`/api/v1/donations/${donationId}`)
        .set('Authorization', `Bearer ${donorToken}`);

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'BAD_REQUEST');
    });
  });

  after(async () => {
    await closePool();
  });
});
