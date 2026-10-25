import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError, UnauthorizedError } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure environment variables are loaded
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const DEFAULT_SALT_ROUNDS = 10;

// Known placeholder secrets from templates that must never be accepted in production
const INSECURE_DEFAULT_SECRETS = Object.freeze([
  'your_jwt_secret_key_change_in_production',
  'your_jwt_secret_key',
  'secret',
  'jwt_secret',
  'changeme',
  'password',
  '123456'
]);

/**
 * Validates and retrieves the JWT signing secret from the environment.
 * Enforces production security constraints (fails securely if secret is missing, too short, or an insecure default).
 *
 * @returns {string} Safe JWT signing secret
 * @throws {AppError} If JWT_SECRET is not configured or fails security checks
 */
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new AppError('JWT_SECRET environment variable is missing or empty', 500, 'AUTH_CONFIG_ERROR');
  }

  const trimmedSecret = secret.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (trimmedSecret.length < 32) {
      throw new AppError('JWT_SECRET must be at least 32 characters long in production environments', 500, 'AUTH_CONFIG_ERROR');
    }
    if (INSECURE_DEFAULT_SECRETS.includes(trimmedSecret.toLowerCase())) {
      throw new AppError('Insecure default JWT_SECRET detected in production environment', 500, 'AUTH_CONFIG_ERROR');
    }
  }

  return trimmedSecret;
};

/**
 * Hashes a plaintext password using bcrypt with standard salt rounds.
 *
 * @param {string} password - Plaintext password to hash
 * @param {number} [saltRounds=10] - Number of bcrypt hashing rounds
 * @returns {Promise<string>} The generated bcrypt password hash
 */
export const hashPassword = async (password, saltRounds = DEFAULT_SALT_ROUNDS) => {
  if (typeof password !== 'string' || password.length === 0) {
    throw new AppError('Password must be a non-empty string for hashing', 400, 'INVALID_PASSWORD_INPUT');
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new AppError('Password must not exceed 72 bytes for hashing', 400, 'INVALID_PASSWORD_INPUT');
  }

  const rounds = Number.isInteger(saltRounds) && saltRounds >= 4 && saltRounds <= 31
    ? saltRounds
    : DEFAULT_SALT_ROUNDS;

  return bcrypt.hash(password, rounds);
};

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 * Safely returns false on invalid, missing, or mismatched inputs without throwing or leaking.
 *
 * @param {string} password - Candidate plaintext password
 * @param {string} hash - Stored bcrypt hash string
 * @returns {Promise<boolean>} True if matching, false otherwise
 */
export const comparePassword = async (password, hash) => {
  if (typeof password !== 'string' || typeof hash !== 'string' || !password || !hash) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
};

/**
 * Signs a JWT token containing authenticated identity claims.
 * Automatically sanitizes payload to prevent leaking passwords or password hashes.
 * Enforces algorithm: 'HS256' which cannot be overridden by caller options.
 *
 * @param {object} payload - Identity claims (must include non-empty sub or id)
 * @param {object} [options={}] - Optional jwt.sign configuration overrides (e.g. expiresIn)
 * @returns {string} Signed JWT token string
 */
export const generateToken = (payload, options = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Token payload must be an object', 500, 'INVALID_TOKEN_PAYLOAD');
  }

  const sub = payload.sub || payload.id;
  if (!sub || typeof sub !== 'string' || sub.trim().length === 0) {
    throw new AppError('Token payload must include a non-empty sub or id identity claim', 500, 'INVALID_TOKEN_PAYLOAD');
  }

  // Defensively strip any sensitive credential fields and normalize subject
  const safePayload = { ...payload, sub: sub.trim() };
  delete safePayload.password;
  delete safePayload.password_hash;
  delete safePayload.passwordHash;

  const secret = getJwtSecret();
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || '1h';

  // Ensure algorithm is strictly locked to HS256 regardless of options supplied
  return jwt.sign(safePayload, secret, {
    expiresIn,
    ...options,
    algorithm: 'HS256'
  });
};

/**
 * Verifies and decodes a JWT token string.
 * Normalizes JWT library errors into standard operational UnauthorizedError instances
 * and verifies that critical identity claims (sub) are present and valid.
 *
 * @param {string} token - The raw JWT token string
 * @returns {object} Decoded JWT payload claims
 * @throws {UnauthorizedError} If the token is missing, expired, tampered with, or missing identity claims
 */
export const verifyToken = (token) => {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new UnauthorizedError('Authentication token required');
  }

  const secret = getJwtSecret();

  let decoded;
  try {
    decoded = jwt.verify(token.trim(), secret, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token has expired. Please log in again.');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Invalid authentication token');
    }
    if (err.name === 'NotBeforeError') {
      throw new UnauthorizedError('Token is not active yet');
    }
    throw new UnauthorizedError('Authentication token verification failed');
  }

  if (!decoded || typeof decoded !== 'object' || typeof decoded.sub !== 'string' || decoded.sub.trim().length === 0) {
    throw new UnauthorizedError('Invalid authentication token: missing or malformed identity claim');
  }

  return decoded;
};

export default {
  getJwtSecret,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken
};
