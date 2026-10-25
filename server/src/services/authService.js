import { validateRegistration, validateLogin } from '../validators/authValidator.js';
import { hashPassword, comparePassword, generateToken } from '../utils/token.js';
import { UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } from '../utils/errors.js';
import userRepository from '../repositories/userRepository.js';

/**
 * Registers a new user.
 * - Enforces input validation (name, email, password complexity, role restrictions).
 * - Enforces anti-privilege-escalation: public registration cannot create ADMIN.
 * - Assigns initial account status: DONOR -> ACTIVE, NGO/VOLUNTEER -> PENDING.
 * - Pre-checks duplicate email and handles unique constraint race conditions.
 * - Hashes password using bcrypt.
 * - Creates database user record.
 * - Issues JWT containing subject identity, role, and initial status.
 * - Returns safe user object and access token (never exposing password_hash).
 *
 * @param {object} registrationData - Raw registration payload
 * @param {object} [repo=userRepository] - Repository dependency (supports injection for testing)
 * @returns {Promise<{ user: object, token: string }>}
 */
export const register = async (registrationData, repo = userRepository) => {
  // 1. Validate payload and whitelist fields (strictly rejects ADMIN role)
  const validated = validateRegistration(registrationData);

  // 2. Pre-check for duplicate email
  const existingUser = await repo.findUserByEmail(validated.email);
  if (existingUser) {
    throw new ConflictError('A user with this email address already exists', [
      { field: 'email', message: 'Email address is already in use' }
    ]);
  }

  // 3. Determine initial account status based on role
  // DONOR accounts activate immediately; NGO and VOLUNTEER require administrator approval
  const status = validated.role === 'DONOR' ? 'ACTIVE' : 'PENDING';

  // 4. Hash password with bcrypt (enforcing 72-byte UTF-8 ceiling)
  const passwordHash = await hashPassword(validated.password);

  // 5. Persist user in database
  const user = await repo.createUser({
    name: validated.name,
    email: validated.email,
    passwordHash,
    role: validated.role,
    status,
    phone: validated.phone,
    location_lat: validated.location_lat,
    location_lng: validated.location_lng
  });

  // 6. Generate access token
  const token = generateToken({
    sub: user.id,
    role: user.role,
    status: user.status
  });

  return {
    user,
    token
  };
};

/**
 * Authenticates user credentials.
 * - Validates login input format.
 * - Retrieves user record by normalized email.
 * - Verifies password safely using bcrypt.
 * - Uses generic error message for unknown email and incorrect password (prevents user enumeration).
 * - Blocks login for SUSPENDED accounts.
 * - Allows login for PENDING accounts so they can view their verification status.
 * - Issues JWT containing current user identity.
 * - Returns safe user object and access token (never exposing password_hash).
 *
 * @param {object} credentials - { email, password }
 * @param {object} [repo=userRepository] - Repository dependency (supports injection for testing)
 * @returns {Promise<{ user: object, token: string }>}
 */
export const login = async (credentials, repo = userRepository) => {
  // 1. Validate input format
  const validated = validateLogin(credentials);

  // 2. Retrieve user by email (internal record includes password_hash)
  const userRecord = await repo.findUserByEmail(validated.email);

  // 3. Safe password comparison (generic error prevents account enumeration)
  if (!userRecord) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isMatch = await comparePassword(validated.password, userRecord.password_hash);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // 4. Block suspended accounts
  if (userRecord.status === 'SUSPENDED') {
    throw new ForbiddenError('Your account has been suspended. Please contact the administrator.');
  }

  // 5. Safe user representation
  const user = repo.toSafeUser(userRecord);

  // 6. Issue access token
  const token = generateToken({
    sub: user.id,
    role: user.role,
    status: user.status
  });

  return {
    user,
    token
  };
};

/**
 * Retrieves the current authenticated user's profile directly from PostgreSQL.
 * Guarantees fresh role and status values from the database, preventing stale JWT claims
 * from preserving revoked permissions or out-of-date statuses.
 *
 * @param {string} userId - User UUID from authenticated token
 * @param {object} [repo=userRepository] - Repository dependency (supports injection for testing)
 * @returns {Promise<object>} Safe user profile object
 */
export const getCurrentUser = async (userId, repo = userRepository) => {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new UnauthorizedError('Authentication required');
  }

  const user = await repo.findUserById(userId.trim());
  if (!user) {
    throw new NotFoundError('User account not found');
  }

  return user;
};

export default {
  register,
  login,
  getCurrentUser
};
