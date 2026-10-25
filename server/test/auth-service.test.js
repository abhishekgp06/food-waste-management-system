import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { register, login, getCurrentUser } from '../src/services/authService.js';
import {
  toSafeUser,
  findUserById,
  createUser,
  findUserByEmail,
  isEmailUniqueViolation,
  KNOWN_EMAIL_UNIQUE_CONSTRAINTS
} from '../src/repositories/userRepository.js';
import { hashPassword, verifyToken } from '../src/utils/token.js';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
} from '../src/utils/errors.js';
import { closePool } from '../src/config/db.js';

describe('User Repository (toSafeUser & Data Access Mapping)', () => {
  it('toSafeUser should strip password_hash and preserve safe attributes', () => {
    const rawRow = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Donor',
      email: 'donor@example.com',
      password_hash: '$2b$10$hashedsecretvalue12345678901234567890123456789012',
      role: 'DONOR',
      status: 'ACTIVE',
      phone: '+91 9999999999',
      location_lat: '12.300000',
      location_lng: '76.650000',
      created_at: new Date(),
      updated_at: new Date()
    };

    const safe = toSafeUser(rawRow);

    assert.strictEqual(safe.id, rawRow.id);
    assert.strictEqual(safe.name, rawRow.name);
    assert.strictEqual(safe.email, rawRow.email);
    assert.strictEqual(safe.role, rawRow.role);
    assert.strictEqual(safe.status, rawRow.status);
    assert.strictEqual(safe.phone, rawRow.phone);
    assert.strictEqual(safe.location_lat, 12.3);
    assert.strictEqual(safe.location_lng, 76.65);
    // CRITICAL: password_hash must never exist on safe user object
    assert.strictEqual(safe.password_hash, undefined);
    assert.strictEqual('password_hash' in safe, false);
  });

  it('toSafeUser should return null for non-object or null input', () => {
    assert.strictEqual(toSafeUser(null), null);
    assert.strictEqual(toSafeUser(undefined), null);
    assert.strictEqual(toSafeUser('invalid'), null);
  });

  it('findUserById should return null safely for invalid or non-UUID strings without database syntax errors', async () => {
    assert.strictEqual(await findUserById(null), null);
    assert.strictEqual(await findUserById('not-a-uuid'), null);
    assert.strictEqual(await findUserById('12345'), null);
    assert.strictEqual(await findUserById(''), null);
  });

  it('findUserByEmail should return null safely for empty or non-string emails', async () => {
    assert.strictEqual(await findUserByEmail(null), null);
    assert.strictEqual(await findUserByEmail(''), null);
    assert.strictEqual(await findUserByEmail('   '), null);
  });

  it('isEmailUniqueViolation should recognize confirmed email unique constraints and indexes', () => {
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'users_email_key' }), true);
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'USERS_EMAIL_KEY' }), true);
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'uq_users_email_lower' }), true);
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'idx_users_email_lower' }), true);
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'users_email_lower_idx' }), true);
  });

  it('isEmailUniqueViolation should reject non-email or unrelated unique constraint errors', () => {
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'users_pkey' }), false);
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'users_phone_key' }), false);
    assert.strictEqual(isEmailUniqueViolation({ code: '23505', constraint: 'unrelated_unique_idx' }), false);
    assert.strictEqual(isEmailUniqueViolation({ code: '23505' }), false);
    assert.strictEqual(isEmailUniqueViolation({ code: '42P01', constraint: 'users_email_key' }), false);
    assert.strictEqual(isEmailUniqueViolation(null), false);
    assert.strictEqual(isEmailUniqueViolation(undefined), false);
  });

  it('createUser should map users_email_key unique violation (23505) to ConflictError', async () => {
    const mockQueryFn = async () => {
      const dbErr = new Error('duplicate key value violates unique constraint "users_email_key"');
      dbErr.code = '23505';
      dbErr.constraint = 'users_email_key';
      throw dbErr;
    };

    await assert.rejects(
      async () => await createUser({
        name: 'Test',
        email: 'duplicate@example.com',
        passwordHash: 'hash',
        role: 'DONOR',
        status: 'ACTIVE'
      }, mockQueryFn),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.message, 'A user with this email address already exists');
        assert.ok(err.details.some(d => d.field === 'email'));
        return true;
      }
    );
  });

  it('createUser should map future uq_users_email_lower unique violation (23505) to ConflictError', async () => {
    const mockQueryFn = async () => {
      const dbErr = new Error('duplicate key value violates unique constraint "uq_users_email_lower"');
      dbErr.code = '23505';
      dbErr.constraint = 'uq_users_email_lower';
      throw dbErr;
    };

    await assert.rejects(
      async () => await createUser({
        name: 'Test',
        email: 'duplicate@example.com',
        passwordHash: 'hash',
        role: 'DONOR',
        status: 'ACTIVE'
      }, mockQueryFn),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.message, 'A user with this email address already exists');
        assert.ok(err.details.some(d => d.field === 'email'));
        return true;
      }
    );
  });

  it('createUser should rethrow unrelated unique violations (e.g. users_pkey) without converting to ConflictError', async () => {
    const primaryKeyErr = new Error('duplicate key value violates unique constraint "users_pkey"');
    primaryKeyErr.code = '23505';
    primaryKeyErr.constraint = 'users_pkey';

    const mockQueryFn = async () => {
      throw primaryKeyErr;
    };

    await assert.rejects(
      async () => await createUser({
        name: 'Test',
        email: 'test@example.com',
        passwordHash: 'hash',
        role: 'DONOR',
        status: 'ACTIVE'
      }, mockQueryFn),
      (err) => {
        assert.strictEqual(err instanceof ConflictError, false, 'Unrelated unique constraint must not be ConflictError');
        assert.strictEqual(err, primaryKeyErr);
        assert.strictEqual(err.constraint, 'users_pkey');
        return true;
      }
    );
  });
});

describe('Authentication Service - Registration (register)', () => {
  const mockValidRegistration = {
    name: 'College Hostel Mess',
    email: 'hostel.mess@nie.ac.in',
    password: 'SecurePassword123!',
    role: 'DONOR',
    phone: '+91 9876543210',
    location_lat: 12.284,
    location_lng: 76.641
  };

  const createMockRepo = (overrides = {}) => ({
    findUserByEmail: async (email) => null,
    findUserById: async (id) => null,
    createUser: async (userData) => ({
      id: '11111111-1111-1111-1111-111111111111',
      name: userData.name,
      email: userData.email,
      role: userData.role,
      status: userData.status,
      phone: userData.phone,
      location_lat: userData.location_lat,
      location_lng: userData.location_lng,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }),
    toSafeUser,
    ...overrides
  });

  it('should register a DONOR with initial status ACTIVE and return a valid JWT', async () => {
    let capturedCreateData = null;
    const mockRepo = createMockRepo({
      createUser: async (userData) => {
        capturedCreateData = userData;
        return {
          id: 'donor-uuid-1',
          name: userData.name,
          email: userData.email,
          role: userData.role,
          status: userData.status
        };
      }
    });

    const result = await register(mockValidRegistration, mockRepo);

    assert.ok(result.user);
    assert.strictEqual(result.user.role, 'DONOR');
    assert.strictEqual(result.user.status, 'ACTIVE', 'DONOR accounts must activate immediately as ACTIVE');
    assert.strictEqual(capturedCreateData.status, 'ACTIVE');
    assert.ok(capturedCreateData.passwordHash.startsWith('$2'));

    // Check token
    assert.ok(result.token);
    const decoded = verifyToken(result.token);
    assert.strictEqual(decoded.sub, 'donor-uuid-1');
    assert.strictEqual(decoded.role, 'DONOR');
    assert.strictEqual(decoded.status, 'ACTIVE');

    // Confirm password_hash is never exposed
    assert.strictEqual(result.user.password_hash, undefined);
  });

  it('should register an NGO with initial status PENDING', async () => {
    let capturedCreateData = null;
    const mockRepo = createMockRepo({
      createUser: async (userData) => {
        capturedCreateData = userData;
        return {
          id: 'ngo-uuid-1',
          name: userData.name,
          email: userData.email,
          role: userData.role,
          status: userData.status
        };
      }
    });

    const result = await register({ ...mockValidRegistration, role: 'NGO' }, mockRepo);

    assert.strictEqual(result.user.role, 'NGO');
    assert.strictEqual(result.user.status, 'PENDING', 'NGO accounts must default to PENDING status');
    assert.strictEqual(capturedCreateData.status, 'PENDING');
  });

  it('should register a VOLUNTEER with initial status PENDING', async () => {
    let capturedCreateData = null;
    const mockRepo = createMockRepo({
      createUser: async (userData) => {
        capturedCreateData = userData;
        return {
          id: 'vol-uuid-1',
          name: userData.name,
          email: userData.email,
          role: userData.role,
          status: userData.status
        };
      }
    });

    const result = await register({ ...mockValidRegistration, role: 'VOLUNTEER' }, mockRepo);

    assert.strictEqual(result.user.role, 'VOLUNTEER');
    assert.strictEqual(result.user.status, 'PENDING', 'VOLUNTEER accounts must default to PENDING status');
    assert.strictEqual(capturedCreateData.status, 'PENDING');
  });

  it('should strictly reject public registration attempting role ADMIN', async () => {
    const mockRepo = createMockRepo();

    await assert.rejects(
      async () => await register({ ...mockValidRegistration, role: 'ADMIN' }, mockRepo),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.details.some(d => d.field === 'role' && /forbidden/i.test(d.message)));
        return true;
      }
    );
  });

  it('should reject registration when email is already registered (ConflictError)', async () => {
    const mockRepo = createMockRepo({
      findUserByEmail: async (email) => ({
        id: 'existing-uuid',
        email: email.toLowerCase()
      })
    });

    await assert.rejects(
      async () => await register(mockValidRegistration, mockRepo),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.ok(err.details.some(d => d.field === 'email'));
        return true;
      }
    );
  });

  it('should catch database unique constraint race conditions (users_email_key) and propagate ConflictError', async () => {
    const mockRepo = createMockRepo({
      createUser: async () => {
        // Simulates repository mapping users_email_key (23505) to ConflictError
        throw new ConflictError('A user with this email address already exists', [
          { field: 'email', message: 'Email address is already in use' }
        ]);
      }
    });

    await assert.rejects(
      async () => await register(mockValidRegistration, mockRepo),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.message, 'A user with this email address already exists');
        assert.ok(err.details.some(d => d.field === 'email'));
        return true;
      }
    );
  });

  it('should propagate unexpected database errors from createUser without masking as email conflict', async () => {
    const pkeyErr = new Error('duplicate key value violates unique constraint "users_pkey"');
    pkeyErr.code = '23505';
    pkeyErr.constraint = 'users_pkey';

    const mockRepo = createMockRepo({
      createUser: async () => {
        throw pkeyErr;
      }
    });

    await assert.rejects(
      async () => await register(mockValidRegistration, mockRepo),
      (err) => {
        assert.strictEqual(err instanceof ConflictError, false);
        assert.strictEqual(err, pkeyErr);
        assert.strictEqual(err.constraint, 'users_pkey');
        return true;
      }
    );
  });
});

describe('Authentication Service - Login (login)', () => {
  const userPassword = 'TestPassword123!';
  let userPasswordHash;

  test.before(async () => {
    userPasswordHash = await hashPassword(userPassword);
  });

  const createMockLoginRepo = (userRecordOverrides = {}) => {
    const mockUserRecord = {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Active Donor',
      email: 'donor@nie.ac.in',
      password_hash: userPasswordHash,
      role: 'DONOR',
      status: 'ACTIVE',
      phone: '+91 9999999999',
      location_lat: 12.28,
      location_lng: 76.64,
      ...userRecordOverrides
    };

    return {
      findUserByEmail: async (email) => {
        if (userRecordOverrides === null) return null;
        return mockUserRecord;
      },
      findUserById: async (id) => toSafeUser(mockUserRecord),
      toSafeUser
    };
  };

  it('should successfully authenticate with valid credentials and return safe user and token', async () => {
    const mockRepo = createMockLoginRepo();

    const result = await login({
      email: 'donor@nie.ac.in',
      password: userPassword
    }, mockRepo);

    assert.ok(result.user);
    assert.strictEqual(result.user.id, '22222222-2222-2222-2222-222222222222');
    assert.strictEqual(result.user.email, 'donor@nie.ac.in');
    assert.strictEqual(result.user.password_hash, undefined, 'password_hash must never be in login response');

    assert.ok(result.token);
    const decoded = verifyToken(result.token);
    assert.strictEqual(decoded.sub, result.user.id);
    assert.strictEqual(decoded.role, 'DONOR');
    assert.strictEqual(decoded.status, 'ACTIVE');
  });

  it('should return identical generic UnauthorizedError when email is not found (anti-user-enumeration)', async () => {
    const mockRepo = createMockLoginRepo(null);

    await assert.rejects(
      async () => await login({
        email: 'unknown-email@nowhere.com',
        password: userPassword
      }, mockRepo),
      (err) => {
        assert.ok(err instanceof UnauthorizedError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.message, 'Invalid email or password');
        return true;
      }
    );
  });

  it('should return identical generic UnauthorizedError when password is incorrect (anti-user-enumeration)', async () => {
    const mockRepo = createMockLoginRepo();

    await assert.rejects(
      async () => await login({
        email: 'donor@nie.ac.in',
        password: 'IncorrectPassword999!'
      }, mockRepo),
      (err) => {
        assert.ok(err instanceof UnauthorizedError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.message, 'Invalid email or password');
        return true;
      }
    );
  });

  it('should allow PENDING users to authenticate so they can check approval status', async () => {
    const mockRepo = createMockLoginRepo({
      id: 'pending-ngo-id',
      role: 'NGO',
      status: 'PENDING'
    });

    const result = await login({
      email: 'ngo@nie.ac.in',
      password: userPassword
    }, mockRepo);

    assert.ok(result.user);
    assert.strictEqual(result.user.status, 'PENDING');
    assert.ok(result.token);
    const decoded = verifyToken(result.token);
    assert.strictEqual(decoded.status, 'PENDING');
  });

  it('should block SUSPENDED accounts from logging in with ForbiddenError', async () => {
    const mockRepo = createMockLoginRepo({
      status: 'SUSPENDED'
    });

    await assert.rejects(
      async () => await login({
        email: 'donor@nie.ac.in',
        password: userPassword
      }, mockRepo),
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.strictEqual(err.statusCode, 403);
        assert.match(err.message, /suspended/i);
        return true;
      }
    );
  });
});

describe('Authentication Service - Get Current User (getCurrentUser)', () => {
  it('should fetch the latest role and status directly from PostgreSQL rather than trusting stale JWT claims', async () => {
    // Simulate user who was promoted from PENDING to ACTIVE in database after JWT was issued
    const mockRepo = {
      findUserById: async (id) => ({
        id: 'promoted-user-id',
        name: 'Verified NGO Partner',
        email: 'partner@ngo.org',
        role: 'NGO',
        status: 'ACTIVE', // Database has fresh ACTIVE status
        created_at: new Date(),
        updated_at: new Date()
      })
    };

    const user = await getCurrentUser('promoted-user-id', mockRepo);

    assert.strictEqual(user.id, 'promoted-user-id');
    assert.strictEqual(user.status, 'ACTIVE');
    assert.strictEqual(user.password_hash, undefined);
  });

  it('should throw NotFoundError if user ID does not exist in database', async () => {
    const mockRepo = {
      findUserById: async (id) => null
    };

    await assert.rejects(
      async () => await getCurrentUser('33333333-3333-3333-3333-333333333333', mockRepo),
      (err) => err instanceof NotFoundError && err.statusCode === 404
    );
  });

  it('should throw UnauthorizedError if user ID parameter is missing or empty', async () => {
    await assert.rejects(
      async () => await getCurrentUser(null),
      (err) => err instanceof UnauthorizedError
    );
    await assert.rejects(
      async () => await getCurrentUser('   '),
      (err) => err instanceof UnauthorizedError
    );
  });
});

describe('Security & Sensitive Data Leakage Prevention', () => {
  it('should never expose password or password_hash in register, login, or getCurrentUser responses', async () => {
    const mockRepo = {
      findUserByEmail: async (email) => ({
        id: 'leak-check-id',
        name: 'Security Test User',
        email: 'leak@example.com',
        password_hash: '$2b$10$supersecretinternalhashvalue',
        role: 'DONOR',
        status: 'ACTIVE'
      }),
      findUserById: async (id) => toSafeUser({
        id: 'leak-check-id',
        name: 'Security Test User',
        email: 'leak@example.com',
        password_hash: '$2b$10$supersecretinternalhashvalue',
        role: 'DONOR',
        status: 'ACTIVE'
      }),
      createUser: async (data) => toSafeUser({
        id: 'new-id',
        ...data,
        password_hash: data.passwordHash
      }),
      toSafeUser
    };

    const validPassword = 'SecurePassword123!';
    const regResult = await register({
      name: 'Donor User',
      email: 'newuser@nie.ac.in',
      password: validPassword,
      role: 'DONOR'
    }, { ...mockRepo, findUserByEmail: async () => null });

    const rawRegJson = JSON.stringify(regResult);
    assert.strictEqual(rawRegJson.includes('password_hash'), false);
    assert.strictEqual(rawRegJson.includes(validPassword), false);

    const loginResult = await login({
      email: 'leak@example.com',
      password: validPassword
    }, {
      ...mockRepo,
      findUserByEmail: async () => ({
        id: 'leak-check-id',
        email: 'leak@example.com',
        password_hash: await hashPassword(validPassword),
        role: 'DONOR',
        status: 'ACTIVE'
      })
    });

    const rawLoginJson = JSON.stringify(loginResult);
    assert.strictEqual(rawLoginJson.includes('password_hash'), false);
    assert.strictEqual(rawLoginJson.includes(validPassword), false);

    const currentProfile = await getCurrentUser('leak-check-id', mockRepo);
    const rawProfileJson = JSON.stringify(currentProfile);
    assert.strictEqual(rawProfileJson.includes('password_hash'), false);
  });

  after(async () => {
    await closePool();
  });
});
