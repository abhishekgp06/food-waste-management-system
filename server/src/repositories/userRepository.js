import { query } from '../config/db.js';
import { ConflictError } from '../utils/errors.js';
import { normalizeEmail } from '../validators/authValidator.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Known unique constraint and index names for user email addresses in PostgreSQL.
 * - users_email_key: Default unique constraint created by PostgreSQL for `email ... UNIQUE` on table `users`.
 * - uq_users_email_lower: Target unique functional index for case-insensitive emails (`LOWER(email)`).
 * - idx_users_email_lower / users_email_lower_idx: Alternative naming patterns.
 */
export const KNOWN_EMAIL_UNIQUE_CONSTRAINTS = Object.freeze(new Set([
  'users_email_key',
  'uq_users_email_lower',
  'idx_users_email_lower',
  'users_email_lower_idx'
]));

/**
 * Determines whether a database error corresponds specifically to an email unique constraint violation.
 * Avoids mislabeling primary-key collisions (users_pkey) or unrelated unique constraints as email conflicts.
 *
 * @param {object} err - Error object from pg query
 * @returns {boolean} True if error is a confirmed email unique constraint violation
 */
export const isEmailUniqueViolation = (err) => {
  if (!err || typeof err !== 'object' || err.code !== '23505') {
    return false;
  }
  const constraint = typeof err.constraint === 'string' ? err.constraint.trim().toLowerCase() : '';
  return KNOWN_EMAIL_UNIQUE_CONSTRAINTS.has(constraint);
};

/**
 * Converts a raw database user row into a safe, API-facing user object.
 * Explicitly guarantees password_hash is never exposed.
 *
 * @param {object} row - Database user row
 * @returns {object|null} Sanitized user object or null
 */
export const toSafeUser = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    phone: row.phone ?? null,
    location_lat: row.location_lat !== null && row.location_lat !== undefined ? Number(row.location_lat) : null,
    location_lng: row.location_lng !== null && row.location_lng !== undefined ? Number(row.location_lng) : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

/**
 * Finds a user by email (case-insensitive) including password_hash for authentication verification.
 * For internal use only (by authService to compare passwords).
 *
 * @param {string} email - Raw or normalized email
 * @returns {Promise<object|null>} Full user row with password_hash, or null if not found
 */
export const findUserByEmail = async (email) => {
  if (typeof email !== 'string' || email.trim().length === 0) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);

  const sql = `
    SELECT id, name, email, password_hash, role, status, phone, location_lat, location_lng, created_at, updated_at
    FROM users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1;
  `;

  const result = await query(sql, [normalizedEmail]);
  return result.rows[0] || null;
};

/**
 * Finds a safe user by primary key ID.
 * Excludes password_hash from the query and returned object.
 *
 * @param {string} id - User UUID
 * @returns {Promise<object|null>} Safe user object or null if not found
 */
export const findUserById = async (id) => {
  if (typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    return null;
  }

  const sql = `
    SELECT id, name, email, role, status, phone, location_lat, location_lng, created_at, updated_at
    FROM users
    WHERE id = $1
    LIMIT 1;
  `;

  const result = await query(sql, [id.trim()]);
  return toSafeUser(result.rows[0]);
};

/**
 * Creates a new user record with validated fields and a hashed password.
 * Returns the newly created user as a safe user object (excluding password_hash).
 *
 * @param {object} userData
 * @param {string} userData.name
 * @param {string} userData.email
 * @param {string} userData.passwordHash
 * @param {string} userData.role
 * @param {string} userData.status
 * @param {string|null} [userData.phone=null]
 * @param {number|null} [userData.location_lat=null]
 * @param {number|null} [userData.location_lng=null]
 * @param {Function} [queryFn=query] - Optional query executor (supports dependency injection for testing)
 * @returns {Promise<object>} Safe user object
 */
export const createUser = async ({
  name,
  email,
  passwordHash,
  role,
  status,
  phone = null,
  location_lat = null,
  location_lng = null
}, queryFn = query) => {
  const normalizedEmail = normalizeEmail(email);

  const sql = `
    INSERT INTO users (name, email, password_hash, role, status, phone, location_lat, location_lng)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, name, email, role, status, phone, location_lat, location_lng, created_at, updated_at;
  `;

  const params = [
    name.trim(),
    normalizedEmail,
    passwordHash,
    role,
    status,
    phone || null,
    location_lat !== null && location_lat !== undefined ? Number(location_lat) : null,
    location_lng !== null && location_lng !== undefined ? Number(location_lng) : null
  ];

  try {
    const result = await queryFn(sql, params);
    return toSafeUser(result.rows[0]);
  } catch (err) {
    // Only map to ConflictError if the 23505 error is confirmed to be an email constraint violation
    if (isEmailUniqueViolation(err)) {
      throw new ConflictError('A user with this email address already exists', [
        { field: 'email', message: 'Email address is already in use' }
      ]);
    }
    // Rethrow all other errors (including non-email unique violations like users_pkey) unchanged
    throw err;
  }
};

export default {
  toSafeUser,
  findUserByEmail,
  findUserById,
  createUser,
  isEmailUniqueViolation,
  KNOWN_EMAIL_UNIQUE_CONSTRAINTS
};
