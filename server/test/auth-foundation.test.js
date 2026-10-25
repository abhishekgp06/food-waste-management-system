import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  getJwtSecret
} from '../src/utils/token.js';
import {
  validateRegistration,
  validateLogin,
  validatePasswordComplexity,
  isStrongPassword,
  normalizeEmail,
  ALLOWED_REGISTRATION_ROLES
} from '../src/validators/authValidator.js';
import { ValidationError, UnauthorizedError, AppError } from '../src/utils/errors.js';
import { closePool } from '../src/config/db.js';

describe('Password Hashing & Verification (bcrypt)', () => {
  const plainPassword = 'StrongP@ssw0rd!2026';

  it('should successfully hash a valid plaintext password', async () => {
    const hash = await hashPassword(plainPassword);
    assert.strictEqual(typeof hash, 'string');
    assert.ok(hash.startsWith('$2'), 'Bcrypt hash should start with $2 identifier');
    assert.ok(hash.length >= 59, 'Bcrypt hash should have standard length');
  });

  it('should generate distinct salt hashes for identical passwords', async () => {
    const hash1 = await hashPassword(plainPassword);
    const hash2 = await hashPassword(plainPassword);
    assert.notStrictEqual(hash1, hash2, 'Salts must ensure hashes are unique');
  });

  it('comparePassword should return true for matching password and hash', async () => {
    const hash = await hashPassword(plainPassword);
    const isMatch = await comparePassword(plainPassword, hash);
    assert.strictEqual(isMatch, true);
  });

  it('comparePassword should return false for incorrect password', async () => {
    const hash = await hashPassword(plainPassword);
    const isMatch = await comparePassword('WrongPassword123!', hash);
    assert.strictEqual(isMatch, false);
  });

  it('comparePassword should safely return false on null, undefined, or empty inputs without crashing', async () => {
    const hash = await hashPassword(plainPassword);
    assert.strictEqual(await comparePassword(null, hash), false);
    assert.strictEqual(await comparePassword(undefined, hash), false);
    assert.strictEqual(await comparePassword('', hash), false);
    assert.strictEqual(await comparePassword(plainPassword, null), false);
    assert.strictEqual(await comparePassword(plainPassword, ''), false);
    assert.strictEqual(await comparePassword(plainPassword, 'invalid-non-bcrypt-hash'), false);
  });

  it('hashPassword should reject non-string or empty password with AppError', async () => {
    await assert.rejects(
      async () => await hashPassword(''),
      (err) => err instanceof AppError && err.statusCode === 400
    );
    await assert.rejects(
      async () => await hashPassword(null),
      (err) => err instanceof AppError && err.statusCode === 400
    );
  });

  it('hashPassword should reject passwords exceeding 72 bytes with AppError', async () => {
    const longPassword = 'A'.repeat(73);
    await assert.rejects(
      async () => await hashPassword(longPassword),
      (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('72 bytes')
    );
  });
});

describe('JWT Secret Configuration & Security (getJwtSecret)', () => {
  it('should throw AppError if JWT_SECRET is missing or empty', () => {
    const originalSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      assert.throws(
        () => getJwtSecret(),
        (err) => err instanceof AppError && err.code === 'AUTH_CONFIG_ERROR' && err.statusCode === 500
      );

      process.env.JWT_SECRET = '   ';
      assert.throws(
        () => getJwtSecret(),
        (err) => err instanceof AppError && err.code === 'AUTH_CONFIG_ERROR'
      );
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('should enforce production security constraints for JWT_SECRET', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    try {
      // 1. Weak secret (< 32 characters) in production
      process.env.JWT_SECRET = 'short-weak-key';
      assert.throws(
        () => getJwtSecret(),
        (err) => err instanceof AppError && err.message.includes('at least 32 characters')
      );

      // 2. Insecure template default in production
      process.env.JWT_SECRET = 'your_jwt_secret_key_change_in_production';
      assert.throws(
        () => getJwtSecret(),
        (err) => err instanceof AppError && err.message.includes('Insecure default JWT_SECRET')
      );

      // 3. Strong secret in production should pass
      const strongSecret = 'super-strong-production-jwt-secret-key-32chars!!';
      process.env.JWT_SECRET = strongSecret;
      assert.strictEqual(getJwtSecret(), strongSecret);
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalSecret;
    }
  });
});

describe('JWT Token Generation & Verification (jsonwebtoken)', () => {
  const originalSecret = process.env.JWT_SECRET;

  test.beforeEach?.(() => {
    process.env.JWT_SECRET = 'test-suite-secure-jwt-secret-key-for-auth-unit-tests';
  });

  it('should sign and verify a token with identity claims', () => {
    process.env.JWT_SECRET = 'test-suite-secure-jwt-secret-key-for-auth-unit-tests';
    const payload = {
      sub: '550e8400-e29b-41d4-a716-446655440000',
      role: 'DONOR',
      status: 'ACTIVE'
    };

    const token = generateToken(payload, { expiresIn: '15m' });
    assert.strictEqual(typeof token, 'string');
    assert.strictEqual(token.split('.').length, 3, 'JWT should contain header, payload, and signature');

    const decoded = verifyToken(token);
    assert.strictEqual(decoded.sub, payload.sub);
    assert.strictEqual(decoded.role, payload.role);
    assert.strictEqual(decoded.status, payload.status);
    assert.ok(decoded.exp);
    assert.ok(decoded.iat);
  });

  it('generateToken should defensively strip passwords and password hashes from token payload', () => {
    process.env.JWT_SECRET = 'test-suite-secure-jwt-secret-key-for-auth-unit-tests';
    const dangerousPayload = {
      sub: '11111111-2222-3333-4444-555555555555',
      role: 'NGO',
      status: 'PENDING',
      password: 'PlainPassword123!',
      password_hash: '$2b$10$hashedsecretvalue',
      passwordHash: 'anotherSecretHash'
    };

    const token = generateToken(dangerousPayload);
    const decoded = verifyToken(token);

    assert.strictEqual(decoded.password, undefined);
    assert.strictEqual(decoded.password_hash, undefined);
    assert.strictEqual(decoded.passwordHash, undefined);
  });

  it('verifyToken should reject missing, empty, or non-string tokens with UnauthorizedError', () => {
    assert.throws(() => verifyToken(null), (err) => err instanceof UnauthorizedError);
    assert.throws(() => verifyToken(''), (err) => err instanceof UnauthorizedError);
    assert.throws(() => verifyToken('   '), (err) => err instanceof UnauthorizedError);
  });

  it('verifyToken should reject invalid or tampered tokens with UnauthorizedError', () => {
    process.env.JWT_SECRET = 'test-suite-secure-jwt-secret-key-for-auth-unit-tests';
    const validToken = generateToken({ sub: 'user-1' });
    const tamperedToken = validToken.slice(0, -5) + 'abcde';

    assert.throws(
      () => verifyToken(tamperedToken),
      (err) => err instanceof UnauthorizedError && err.message === 'Invalid authentication token'
    );
  });

  it('verifyToken should reject expired tokens with specific expiration message', async () => {
    process.env.JWT_SECRET = 'test-suite-secure-jwt-secret-key-for-auth-unit-tests';
    // Generate token with immediate 1 millisecond expiration
    const expiredToken = generateToken({ sub: 'user-1' }, { expiresIn: '1ms' });

    // Wait 25ms to guarantee token expiration
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.throws(
      () => verifyToken(expiredToken),
      (err) => err instanceof UnauthorizedError && err.message.includes('expired')
    );
  });

  it('generateToken should strictly enforce HS256 and prevent caller option algorithm overrides', () => {
    process.env.JWT_SECRET = 'test-suite-secure-jwt-secret-key-for-auth-unit-tests';
    const token = generateToken({ sub: 'user-1' }, { algorithm: 'none' });
    const headerJson = Buffer.from(token.split('.')[0], 'base64').toString('utf8');
    const header = JSON.parse(headerJson);
    assert.strictEqual(header.alg, 'HS256', 'Header algorithm must remain locked to HS256');

    const verified = verifyToken(token);
    assert.strictEqual(verified.sub, 'user-1');
  });

  it('generateToken should reject payloads missing sub or id claims with AppError', () => {
    assert.throws(
      () => generateToken({ role: 'DONOR' }),
      (err) => err instanceof AppError && err.code === 'INVALID_TOKEN_PAYLOAD'
    );
    assert.throws(
      () => generateToken({ sub: '   ' }),
      (err) => err instanceof AppError && err.code === 'INVALID_TOKEN_PAYLOAD'
    );
  });

  it('verifyToken should reject tokens missing or having malformed sub identity claim', () => {
    process.env.JWT_SECRET = 'test-suite-secure-jwt-secret-key-for-auth-unit-tests';
    const rawSecret = getJwtSecret();

    // 1. Token forged with role but missing sub claim
    const tokenWithoutSub = jwt.sign({ role: 'DONOR' }, rawSecret, { algorithm: 'HS256' });
    assert.throws(
      () => verifyToken(tokenWithoutSub),
      (err) => err instanceof UnauthorizedError && err.message.includes('missing or malformed identity claim')
    );

    // 2. Token forged with blank whitespace sub
    const tokenWithEmptySub = jwt.sign({ sub: '   ' }, rawSecret, { algorithm: 'HS256' });
    assert.throws(
      () => verifyToken(tokenWithEmptySub),
      (err) => err instanceof UnauthorizedError && err.message.includes('missing or malformed identity claim')
    );
  });

  after(() => {
    process.env.JWT_SECRET = originalSecret;
  });
});

describe('Registration Payload Validation (validateRegistration)', () => {
  const validDonorData = {
    name: 'Abhishek G P',
    email: 'abhishek@nie.ac.in',
    password: 'SecurePassword@2026',
    role: 'DONOR',
    phone: '+91 9876543210',
    location_lat: 12.2843,
    location_lng: 76.6413
  };

  it('should accept valid DONOR registration and return normalized fields', () => {
    const result = validateRegistration(validDonorData);
    assert.strictEqual(result.name, 'Abhishek G P');
    assert.strictEqual(result.email, 'abhishek@nie.ac.in');
    assert.strictEqual(result.role, 'DONOR');
    assert.strictEqual(result.phone, '+91 9876543210');
    assert.strictEqual(result.location_lat, 12.2843);
    assert.strictEqual(result.location_lng, 76.6413);
  });

  it('should accept valid NGO and VOLUNTEER roles', () => {
    const ngo = validateRegistration({ ...validDonorData, role: 'NGO' });
    assert.strictEqual(ngo.role, 'NGO');

    const vol = validateRegistration({ ...validDonorData, role: 'VOLUNTEER' });
    assert.strictEqual(vol.role, 'VOLUNTEER');
  });

  it('should strictly reject public registration attempting role ADMIN (Privilege Escalation Guard)', () => {
    assert.throws(
      () => validateRegistration({ ...validDonorData, role: 'ADMIN' }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        const roleIssue = err.details.find((d) => d.field === 'role');
        assert.ok(roleIssue, 'Must contain field role in error details');
        assert.match(roleIssue.message, /forbidden/i);
        return true;
      }
    );
  });

  it('should reject invalid or unrecognized roles', () => {
    assert.throws(
      () => validateRegistration({ ...validDonorData, role: 'SUPERUSER' }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        const roleIssue = err.details.find((d) => d.field === 'role');
        assert.ok(roleIssue);
        assert.match(roleIssue.message, /DONOR, NGO, VOLUNTEER/);
        return true;
      }
    );
  });

  it('should validate password complexity and return granular details for weak passwords', () => {
    // 1. Too short
    assert.throws(
      () => validateRegistration({ ...validDonorData, password: 'Sh1!' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.message.includes('8 characters'))
    );

    // 2. Missing uppercase
    assert.throws(
      () => validateRegistration({ ...validDonorData, password: 'password123!' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.message.includes('uppercase'))
    );

    // 3. Missing lowercase
    assert.throws(
      () => validateRegistration({ ...validDonorData, password: 'PASSWORD123!' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.message.includes('lowercase'))
    );

    // 4. Missing number
    assert.throws(
      () => validateRegistration({ ...validDonorData, password: 'PasswordSecret!' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.message.includes('number'))
    );

    // 5. Missing special character
    assert.throws(
      () => validateRegistration({ ...validDonorData, password: 'Password1234' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.message.includes('special character'))
    );

    // 6. Multibyte unicode password exceeding 72 UTF-8 bytes (even if character count is well under 72)
    const multibyteLongPassword = 'Password1!@' + '🔒'.repeat(16);
    assert.strictEqual(multibyteLongPassword.length, 43, 'Character length is 43 (well under 72)');
    assert.strictEqual(Buffer.byteLength(multibyteLongPassword, 'utf8'), 75, 'UTF-8 byte length is 75 (exceeds 72 bytes)');
    assert.throws(
      () => validateRegistration({ ...validDonorData, password: multibyteLongPassword }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.message.includes('72 bytes'))
    );

    // 7. ASCII password exceeding 72 bytes
    const asciiLongPassword = 'A'.repeat(70) + 'a1!';
    assert.throws(
      () => validateRegistration({ ...validDonorData, password: asciiLongPassword }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.message.includes('72 bytes'))
    );
  });

  it('should reject invalid email formats', () => {
    assert.throws(
      () => validateRegistration({ ...validDonorData, email: 'notanemail' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.field === 'email')
    );
    assert.throws(
      () => validateRegistration({ ...validDonorData, email: 'missing@domain' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.field === 'email')
    );
  });

  it('should reject out-of-range coordinates', () => {
    assert.throws(
      () => validateRegistration({ ...validDonorData, location_lat: 95.0 }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.field === 'location_lat')
    );
    assert.throws(
      () => validateRegistration({ ...validDonorData, location_lng: -195.0 }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.field === 'location_lng')
    );
  });

  it('should reject non-object body payloads', () => {
    assert.throws(() => validateRegistration(null), (err) => err instanceof ValidationError);
    assert.throws(() => validateRegistration('string payload'), (err) => err instanceof ValidationError);
    assert.throws(() => validateRegistration([]), (err) => err instanceof ValidationError);
  });
});

describe('Login Payload Validation (validateLogin)', () => {
  it('should accept valid login credentials and normalize email', () => {
    const result = validateLogin({
      email: 'Donor.Test@NIE.ac.in',
      password: 'AnyPlainPasswordHere'
    });

    assert.strictEqual(result.email, 'donor.test@nie.ac.in');
    assert.strictEqual(result.password, 'AnyPlainPasswordHere');
  });

  it('should reject missing or malformed email', () => {
    assert.throws(
      () => validateLogin({ email: '', password: 'Password123' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.field === 'email')
    );
    assert.throws(
      () => validateLogin({ email: 'bad-email-format', password: 'Password123' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.field === 'email')
    );
  });

  it('should reject missing password', () => {
    assert.throws(
      () => validateLogin({ email: 'donor@example.com', password: '' }),
      (err) => err instanceof ValidationError && err.details.some((d) => d.field === 'password')
    );
  });

  after(async () => {
    await closePool();
  });
});
