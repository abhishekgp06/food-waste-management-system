import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import {
  authenticate,
  createAuthMiddleware,
  requireRole,
  requireStatus
} from '../src/middleware/auth.js';
import { createAuthController } from '../src/controllers/authController.js';
import { generateToken, getJwtSecret, hashPassword } from '../src/utils/token.js';
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError
} from '../src/utils/errors.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import requestId from '../src/middleware/requestId.js';
import { closePool } from '../src/config/db.js';

describe('Authentication Middleware (authenticate)', () => {
  const secret = getJwtSecret();
  const validUserId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestUser = (overrides = {}) => ({
    id: validUserId,
    name: 'Active Test User',
    email: 'user@example.com',
    role: 'DONOR',
    status: 'ACTIVE',
    phone: null,
    location_lat: null,
    location_lng: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  });

  const setupTestApp = (mockRepo) => {
    const testApp = express();
    testApp.use(requestId);
    testApp.use(express.json());
    const authMw = createAuthMiddleware(mockRepo);

    testApp.get('/test/protected', authMw, (req, res) => {
      res.status(200).json({ user: req.user });
    });

    testApp.get('/test/donor-only', authMw, requireRole('DONOR'), (req, res) => {
      res.status(200).json({ status: 'allowed' });
    });

    testApp.get('/test/active-only', authMw, requireStatus('ACTIVE'), (req, res) => {
      res.status(200).json({ status: 'allowed' });
    });

    testApp.use(errorHandler);
    return testApp;
  };

  it('should accept a valid Bearer token and attach the fresh database user to req.user', async () => {
    const mockUser = createTestUser();
    const mockRepo = {
      findUserById: async (id) => (id === validUserId ? mockUser : null)
    };
    const testApp = setupTestApp(mockRepo);
    const token = generateToken({ sub: validUserId, role: 'DONOR', status: 'ACTIVE' });

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.id, validUserId);
    assert.strictEqual(res.body.user.email, 'user@example.com');
    assert.strictEqual(res.body.user.password_hash, undefined);
  });

  it('should reject requests missing the Authorization header with 401', async () => {
    const testApp = setupTestApp({ findUserById: async () => createTestUser() });

    const res = await request(testApp)
      .get('/test/protected');

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    assert.match(res.body.error.message, /authentication token required/i);
  });

  it('should reject malformed Authorization headers with 401', async () => {
    const testApp = setupTestApp({ findUserById: async () => createTestUser() });

    // Missing "Bearer" prefix
    const res1 = await request(testApp)
      .get('/test/protected')
      .set('Authorization', 'Basic abc123xyz');
    assert.strictEqual(res1.status, 401);
    assert.match(res1.body.error.message, /invalid authorization header format/i);

    // Empty Bearer token
    const res2 = await request(testApp)
      .get('/test/protected')
      .set('Authorization', 'Bearer ');
    assert.strictEqual(res2.status, 401);
    assert.match(res2.body.error.message, /invalid authorization header format/i);
  });

  it('should reject expired JWT tokens with 401 and an explicit expiration message', async () => {
    const testApp = setupTestApp({ findUserById: async () => createTestUser() });
    const expiredToken = jwt.sign({ sub: validUserId }, secret, {
      algorithm: 'HS256',
      expiresIn: '-10s'
    });

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    assert.match(res.body.error.message, /expired/i);
  });

  it('should reject tampered or improperly signed tokens with 401', async () => {
    const testApp = setupTestApp({ findUserById: async () => createTestUser() });
    const wrongSecretToken = jwt.sign({ sub: validUserId }, 'different-secret-key-1234567890', {
      algorithm: 'HS256'
    });

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${wrongSecretToken}`);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    assert.match(res.body.error.message, /invalid authentication token/i);
  });

  it('should reject tokens where the user was deleted from PostgreSQL with 401', async () => {
    const mockRepo = {
      findUserById: async () => null // Simulates deleted user
    };
    const testApp = setupTestApp(mockRepo);
    const token = generateToken({ sub: validUserId });

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    assert.match(res.body.error.message, /not found or deactivated/i);
  });

  it('should reject SUSPENDED accounts with 403 Forbidden', async () => {
    const suspendedUser = createTestUser({ status: 'SUSPENDED' });
    const mockRepo = {
      findUserById: async () => suspendedUser
    };
    const testApp = setupTestApp(mockRepo);
    // Even if JWT falsely claims ACTIVE status, database status SUSPENDED takes precedence
    const token = generateToken({ sub: validUserId, status: 'ACTIVE' });

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    assert.match(res.body.error.message, /suspended/i);
  });

  it('should allow PENDING users to authenticate so they can check approval status', async () => {
    const pendingUser = createTestUser({ role: 'NGO', status: 'PENDING' });
    const mockRepo = {
      findUserById: async () => pendingUser
    };
    const testApp = setupTestApp(mockRepo);
    const token = generateToken({ sub: validUserId, role: 'NGO', status: 'PENDING' });

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.status, 'PENDING');
  });

  it('should prioritize live database role over stale JWT role claims', async () => {
    // JWT claims ADMIN, but database shows user was demoted to DONOR
    const freshDbUser = createTestUser({ role: 'DONOR' });
    const mockRepo = {
      findUserById: async () => freshDbUser
    };
    const testApp = setupTestApp(mockRepo);
    const staleAdminToken = generateToken({ sub: validUserId, role: 'ADMIN' });

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${staleAdminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.role, 'DONOR', 'req.user.role must match database, not stale token claim');
  });
});

describe('Authorization Guards (requireRole & requireStatus)', () => {
  const createMockReq = (user = null) => ({
    user
  });

  it('requireRole should allow users with a matching role', () => {
    const guard = requireRole('ADMIN', 'DONOR');
    const req = createMockReq({ id: '1', role: 'DONOR' });
    let nextCalled = false;
    let nextErr = null;

    guard(req, {}, (err) => {
      nextCalled = true;
      nextErr = err;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(nextErr, undefined);
  });

  it('requireRole should reject users with an unpermitted role with 403 ForbiddenError', () => {
    const guard = requireRole('ADMIN');
    const req = createMockReq({ id: '1', role: 'DONOR' });
    let capturedErr = null;

    guard(req, {}, (err) => {
      capturedErr = err;
    });

    assert.ok(capturedErr instanceof ForbiddenError);
    assert.strictEqual(capturedErr.statusCode, 403);
    assert.match(capturedErr.message, /requires one of roles/i);
  });

  it('requireRole should reject unauthenticated requests (missing req.user) with 401 UnauthorizedError', () => {
    const guard = requireRole('DONOR');
    const req = createMockReq(null);
    let capturedErr = null;

    guard(req, {}, (err) => {
      capturedErr = err;
    });

    assert.ok(capturedErr instanceof UnauthorizedError);
    assert.strictEqual(capturedErr.statusCode, 401);
  });

  it('requireStatus should allow users with a matching status', () => {
    const guard = requireStatus('ACTIVE');
    const req = createMockReq({ id: '1', status: 'ACTIVE' });
    let nextCalled = false;
    let nextErr = null;

    guard(req, {}, (err) => {
      nextCalled = true;
      nextErr = err;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(nextErr, undefined);
  });

  it('requireStatus should reject PENDING users from ACTIVE-only operations with 403 ForbiddenError', () => {
    const guard = requireStatus('ACTIVE');
    const req = createMockReq({ id: '1', status: 'PENDING' });
    let capturedErr = null;

    guard(req, {}, (err) => {
      capturedErr = err;
    });

    assert.ok(capturedErr instanceof ForbiddenError);
    assert.strictEqual(capturedErr.statusCode, 403);
    assert.match(capturedErr.message, /account status must be one of: active/i);
  });

  it('requireStatus should reject unauthenticated requests with 401 UnauthorizedError', () => {
    const guard = requireStatus('ACTIVE');
    const req = createMockReq(null);
    let capturedErr = null;

    guard(req, {}, (err) => {
      capturedErr = err;
    });

    assert.ok(capturedErr instanceof UnauthorizedError);
    assert.strictEqual(capturedErr.statusCode, 401);
  });
});

describe('Authentication API Endpoints (Controller & Route Integration)', () => {
  const mockDonorUser = {
    id: '660e8400-e29b-41d4-a716-446655440000',
    name: 'Mysuru City Bakery',
    email: 'bakery@mysuru.org',
    role: 'DONOR',
    status: 'ACTIVE',
    phone: '+91 9123456789',
    location_lat: 12.31,
    location_lng: 76.65,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const mockPendingNgoUser = {
    id: '770e8400-e29b-41d4-a716-446655440000',
    name: 'Asha Food Foundation',
    email: 'asha@foundation.org',
    role: 'NGO',
    status: 'PENDING',
    phone: '+91 9988776655',
    location_lat: 12.30,
    location_lng: 76.64,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const createMockAuthService = (overrides = {}) => ({
    register: async (data) => ({
      user: mockDonorUser,
      token: generateToken({ sub: mockDonorUser.id, role: mockDonorUser.role, status: mockDonorUser.status })
    }),
    login: async (credentials) => ({
      user: mockDonorUser,
      token: generateToken({ sub: mockDonorUser.id, role: mockDonorUser.role, status: mockDonorUser.status })
    }),
    getCurrentUser: async (userId) => mockDonorUser,
    ...overrides
  });

  const setupMockedServer = (serviceOverrides = {}, repoOverrides = {}) => {
    const testApp = express();
    testApp.use(requestId);
    testApp.use(express.json());

    const mockService = createMockAuthService(serviceOverrides);
    const mockRepo = {
      findUserById: async (id) => {
        if (id === mockDonorUser.id) return mockDonorUser;
        if (id === mockPendingNgoUser.id) return mockPendingNgoUser;
        return null;
      },
      ...repoOverrides
    };

    const controller = createAuthController(mockService);
    const authMw = createAuthMiddleware(mockRepo);

    // Mount exactly as app.js mounts them
    testApp.post('/api/v1/auth/register', controller.register);
    testApp.post('/api/v1/auth/login', controller.login);
    testApp.get('/api/v1/auth/me', authMw, controller.getMe);
    testApp.get('/api/v1/me', authMw, controller.getMe);

    testApp.use(errorHandler);
    return testApp;
  };

  describe('POST /api/v1/auth/register', () => {
    it('should register a user, returning 201 Created with safe user and access token', async () => {
      const server = setupMockedServer();

      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Mysuru City Bakery',
          email: 'bakery@mysuru.org',
          password: 'Password123!@#',
          role: 'DONOR'
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.message, 'User registered successfully');
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.id, mockDonorUser.id);
      assert.strictEqual(res.body.user.role, 'DONOR');
      assert.strictEqual(res.body.user.status, 'ACTIVE');
      assert.ok(res.body.token);

      // CRITICAL: password_hash must never be leaked
      assert.strictEqual(res.body.user.password_hash, undefined);
      assert.strictEqual(JSON.stringify(res.body).includes('password_hash'), false);
    });

    it('should return 400 Bad Request with details when payload fails validation', async () => {
      const server = setupMockedServer({
        register: async () => {
          throw new ValidationError('Registration validation failed', [
            { field: 'email', message: 'Invalid email address format' },
            { field: 'password', message: 'Password must contain at least one special character' }
          ]);
        }
      });

      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test',
          email: 'not-an-email',
          password: 'weak'
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
      assert.strictEqual(res.body.error.message, 'Registration validation failed');
      assert.ok(Array.isArray(res.body.error.details));
      assert.strictEqual(res.body.error.details.length, 2);
      assert.ok(res.headers['x-request-id']);
      assert.strictEqual(res.body.error.requestId, res.headers['x-request-id']);
    });

    it('should return 409 Conflict when user email already exists', async () => {
      const server = setupMockedServer({
        register: async () => {
          throw new ConflictError('A user with this email address already exists', [
            { field: 'email', message: 'Email address is already in use' }
          ]);
        }
      });

      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Duplicate Donor',
          email: 'bakery@mysuru.org',
          password: 'Password123!@#',
          role: 'DONOR'
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'CONFLICT');
      assert.strictEqual(res.body.error.message, 'A user with this email address already exists');
      assert.ok(res.body.error.details.some(d => d.field === 'email'));
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should authenticate user, returning 200 OK with safe user and access token', async () => {
      const server = setupMockedServer();

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'bakery@mysuru.org',
          password: 'Password123!@#'
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Authentication successful');
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.email, 'bakery@mysuru.org');
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.password_hash, undefined);
      assert.strictEqual(JSON.stringify(res.body).includes('password_hash'), false);
    });

    it('should return 401 Unauthorized with generic message on invalid credentials (anti-user-enumeration)', async () => {
      const server = setupMockedServer({
        login: async () => {
          throw new UnauthorizedError('Invalid email or password');
        }
      });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'bakery@mysuru.org',
          password: 'WrongPassword999!'
        });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
      assert.strictEqual(res.body.error.message, 'Invalid email or password');
    });

    it('should return 403 Forbidden when account is SUSPENDED', async () => {
      const server = setupMockedServer({
        login: async () => {
          throw new ForbiddenError('Your account has been suspended. Please contact the administrator.');
        }
      });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'suspended@mysuru.org',
          password: 'Password123!@#'
        });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
      assert.match(res.body.error.message, /suspended/i);
    });
  });

  describe('GET /api/v1/auth/me and GET /api/v1/me', () => {
    it('should return current user profile on GET /api/v1/auth/me', async () => {
      const server = setupMockedServer();
      const token = generateToken({ sub: mockDonorUser.id, role: 'DONOR', status: 'ACTIVE' });

      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.id, mockDonorUser.id);
      assert.strictEqual(res.body.user.email, 'bakery@mysuru.org');
      assert.strictEqual(res.body.user.role, 'DONOR');
      assert.strictEqual(res.body.user.status, 'ACTIVE');
      assert.strictEqual(res.body.user.password_hash, undefined);
    });

    it('should return current user profile on GET /api/v1/me alias', async () => {
      const server = setupMockedServer();
      const token = generateToken({ sub: mockDonorUser.id, role: 'DONOR', status: 'ACTIVE' });

      const res = await request(server)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.id, mockDonorUser.id);
    });

    it('should allow PENDING user to access /me to view verification status', async () => {
      const server = setupMockedServer({
        getCurrentUser: async () => mockPendingNgoUser
      });
      const token = generateToken({ sub: mockPendingNgoUser.id, role: 'NGO', status: 'PENDING' });

      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.id, mockPendingNgoUser.id);
      assert.strictEqual(res.body.user.role, 'NGO');
      assert.strictEqual(res.body.user.status, 'PENDING');
    });

    it('should reject unauthenticated requests to /me with 401 Unauthorized', async () => {
      const server = setupMockedServer();

      const res = await request(server)
        .get('/api/v1/auth/me');

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
      assert.match(res.body.error.message, /authentication token required/i);
    });
  });

  describe('Regression: Existing Endpoints in Main Express App', () => {
    it('GET /health should return 200 with service metadata', async () => {
      const res = await request(app).get('/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'UP');
      assert.ok(res.headers['x-request-id']);
    });

    it('GET /api/v1 root placeholder should remain functional', async () => {
      const res = await request(app).get('/api/v1');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'Foundation Ready');
    });

    it('Non-existent route should return centralized 404 error envelope', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error.code, 'NOT_FOUND');
      assert.ok(res.body.error.requestId);
    });
  });

  after(async () => {
    await closePool();
  });
});
