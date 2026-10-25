import { verifyToken } from '../utils/token.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import userRepository from '../repositories/userRepository.js';

/**
 * Creates an authentication middleware with injectable user repository.
 *
 * @param {object} [repo=userRepository] - Repository for user data access
 * @returns {import('express').RequestHandler}
 */
export const createAuthMiddleware = (repo = userRepository) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization;

      if (!authHeader || typeof authHeader !== 'string') {
        throw new UnauthorizedError('Authentication token required');
      }

      const parts = authHeader.trim().split(/\s+/);
      if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1].trim()) {
        throw new UnauthorizedError('Invalid authorization header format. Expected Bearer <token>');
      }

      const token = parts[1].trim();

      // Verify token (verifies signature, HS256 algorithm, expiration, and non-empty sub)
      const decoded = verifyToken(token);

      // Resolve user repository (support per-request repo injection or default)
      const activeRepo = req.repo || repo;

      // Always load the current user state directly from PostgreSQL using the verified sub
      // Never trust stale role or status claims from the JWT payload
      const user = await activeRepo.findUserById(decoded.sub);

      if (!user) {
        throw new UnauthorizedError('User account not found or deactivated');
      }

      // Suspended accounts are rejected
      if (user.status === 'SUSPENDED') {
        throw new ForbiddenError('Your account has been suspended. Please contact the administrator.');
      }

      // Attach fresh, safe database-backed user object (guaranteed to not have password_hash)
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Default authentication middleware using singleton userRepository.
 */
export const authenticate = createAuthMiddleware(userRepository);

/**
 * Role-based access control guard.
 * Verifies that the authenticated user's current database-backed role is among the permitted roles.
 *
 * @param {...string|string[]} allowedRoles - List of permitted role names
 * @returns {import('express').RequestHandler}
 */
export const requireRole = (...allowedRoles) => {
  const roles = allowedRoles.flat().map((r) => String(r).trim().toUpperCase());

  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Access denied. Requires one of roles: ${roles.join(', ')}`));
    }

    next();
  };
};

/**
 * Account status-based access control guard.
 * Verifies that the authenticated user's current database-backed status is among the permitted statuses.
 *
 * @param {...string|string[]} allowedStatuses - List of permitted status names (e.g. 'ACTIVE')
 * @returns {import('express').RequestHandler}
 */
export const requireStatus = (...allowedStatuses) => {
  const statuses = allowedStatuses.flat().map((s) => String(s).trim().toUpperCase());

  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!statuses.includes(req.user.status)) {
      return next(new ForbiddenError(`Access denied. Account status must be one of: ${statuses.join(', ')}`));
    }

    next();
  };
};

export default {
  authenticate,
  createAuthMiddleware,
  requireRole,
  requireStatus
};
