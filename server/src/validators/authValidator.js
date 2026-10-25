import { ValidationError } from '../utils/errors.js';

export const ALLOWED_REGISTRATION_ROLES = Object.freeze(['DONOR', 'NGO', 'VOLUNTEER']);
export const ALL_ROLES = Object.freeze(['DONOR', 'NGO', 'VOLUNTEER', 'ADMIN']);

// Standard RFC-5322 compatible email pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// E.164 or common international phone pattern (7-20 chars)
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

/**
 * Validates password complexity against system security policy:
 * - Minimum 8 characters, maximum 128 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one digit (0-9)
 * - At least one special character
 *
 * @param {string} password
 * @returns {string[]} Array of violation messages, empty if valid
 */
export const validatePasswordComplexity = (password) => {
  const issues = [];
  if (typeof password !== 'string' || password.length < 8) {
    issues.push('Password must be at least 8 characters long');
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    issues.push('Password must not exceed 72 bytes');
  }

  if (typeof password === 'string') {
    if (!/[A-Z]/.test(password)) {
      issues.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      issues.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      issues.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
      issues.push('Password must contain at least one special character');
    }
  }

  return issues;
};

/**
 * Checks whether a password meets all complexity rules.
 * @param {string} password
 * @returns {boolean}
 */
export const isStrongPassword = (password) => {
  return validatePasswordComplexity(password).length === 0;
};

/**
 * Normalizes an email address by trimming whitespace and converting to lowercase.
 * @param {string} email
 * @returns {string}
 */
export const normalizeEmail = (email) => {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};

/**
 * Validates public user registration input payload.
 * Enforces role restrictions, preventing unauthorized privilege escalation (e.g. registering as ADMIN).
 *
 * @param {object} data - Registration input
 * @throws {ValidationError} If one or more fields are invalid
 * @returns {object} Normalized and sanitized registration attributes
 */
export const validateRegistration = (data) => {
  const details = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ValidationError('Registration payload must be a JSON object', [
      { field: 'body', message: 'Request body must be a valid JSON object' }
    ]);
  }

  const { name, email, password, role, phone, location_lat, location_lng } = data;

  // 1. Name validation
  if (typeof name !== 'string' || name.trim().length === 0) {
    details.push({ field: 'name', message: 'Name is required' });
  } else if (name.trim().length < 2 || name.trim().length > 255) {
    details.push({ field: 'name', message: 'Name must be between 2 and 255 characters' });
  }

  // 2. Email validation
  if (typeof email !== 'string' || email.trim().length === 0) {
    details.push({ field: 'email', message: 'Email is required' });
  } else {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 255) {
      details.push({ field: 'email', message: 'Email must not exceed 255 characters' });
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      details.push({ field: 'email', message: 'Invalid email address format' });
    }
  }

  // 3. Password complexity validation
  if (typeof password !== 'string' || password.length === 0) {
    details.push({ field: 'password', message: 'Password is required' });
  } else {
    const passwordIssues = validatePasswordComplexity(password);
    for (const issue of passwordIssues) {
      details.push({ field: 'password', message: issue });
    }
  }

  // 4. Role validation & Anti-Privilege Escalation
  if (typeof role !== 'string' || role.trim().length === 0) {
    details.push({ field: 'role', message: 'Role is required (DONOR, NGO, or VOLUNTEER)' });
  } else {
    const normalizedRole = role.trim().toUpperCase();
    if (normalizedRole === 'ADMIN') {
      // Explicit anti-privilege-escalation safeguard
      details.push({ field: 'role', message: 'Registration for role ADMIN is forbidden' });
    } else if (!ALLOWED_REGISTRATION_ROLES.includes(normalizedRole)) {
      details.push({ field: 'role', message: 'Role must be one of: DONOR, NGO, VOLUNTEER' });
    }
  }

  // 5. Optional Phone validation
  if (phone !== undefined && phone !== null && phone !== '') {
    if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
      details.push({ field: 'phone', message: 'Invalid phone number format' });
    }
  }

  // 6. Optional Geographic coordinates validation
  if (location_lat !== undefined && location_lat !== null && location_lat !== '') {
    const lat = Number(location_lat);
    if (Number.isNaN(lat) || lat < -90.0 || lat > 90.0) {
      details.push({ field: 'location_lat', message: 'Latitude must be a valid number between -90.0 and 90.0' });
    }
  }

  if (location_lng !== undefined && location_lng !== null && location_lng !== '') {
    const lng = Number(location_lng);
    if (Number.isNaN(lng) || lng < -180.0 || lng > 180.0) {
      details.push({ field: 'location_lng', message: 'Longitude must be a valid number between -180.0 and 180.0' });
    }
  }

  if (details.length > 0) {
    throw new ValidationError('Registration validation failed', details);
  }

  return {
    name: name.trim(),
    email: normalizeEmail(email),
    password,
    role: role.trim().toUpperCase(),
    phone: phone && typeof phone === 'string' && phone.trim().length > 0 ? phone.trim() : null,
    location_lat: location_lat !== undefined && location_lat !== null && location_lat !== '' ? Number(location_lat) : null,
    location_lng: location_lng !== undefined && location_lng !== null && location_lng !== '' ? Number(location_lng) : null
  };
};

/**
 * Validates login input credentials payload.
 *
 * @param {object} data - Login input
 * @throws {ValidationError} If email or password is missing or malformed
 * @returns {object} Normalized email and password
 */
export const validateLogin = (data) => {
  const details = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ValidationError('Login payload must be a JSON object', [
      { field: 'body', message: 'Request body must be a valid JSON object' }
    ]);
  }

  const { email, password } = data;

  if (typeof email !== 'string' || email.trim().length === 0) {
    details.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(email.trim())) {
    details.push({ field: 'email', message: 'Invalid email address format' });
  }

  if (typeof password !== 'string' || password.length === 0) {
    details.push({ field: 'password', message: 'Password is required' });
  }

  if (details.length > 0) {
    throw new ValidationError('Login validation failed', details);
  }

  return {
    email: normalizeEmail(email),
    password
  };
};

export default {
  ALLOWED_REGISTRATION_ROLES,
  ALL_ROLES,
  validatePasswordComplexity,
  isStrongPassword,
  normalizeEmail,
  validateRegistration,
  validateLogin
};
