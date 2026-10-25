import authService from '../services/authService.js';

/**
 * Creates an auth controller instance with injectable auth service.
 *
 * @param {object} [service=authService] - Service providing registration, login, and user profile operations
 * @returns {object} Controller handlers
 */
export const createAuthController = (service = authService) => {
  const getService = (req) => req.authService || service;

  /**
   * Public registration endpoint.
   * POST /api/v1/auth/register
   */
  const register = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const result = await activeService.register(req.body);

      return res.status(201).json({
        message: 'User registered successfully',
        user: result.user,
        token: result.token
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public login endpoint.
   * POST /api/v1/auth/login
   */
  const login = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const result = await activeService.login(req.body);

      return res.status(200).json({
        message: 'Authentication successful',
        user: result.user,
        token: result.token
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Authenticated user profile endpoint.
   * GET /api/v1/auth/me or GET /api/v1/me
   */
  const getMe = async (req, res, next) => {
    try {
      const activeService = getService(req);
      const user = await activeService.getCurrentUser(req.user.id);

      return res.status(200).json({
        user
      });
    } catch (err) {
      next(err);
    }
  };

  return {
    register,
    login,
    getMe
  };
};

export const authController = createAuthController(authService);

export default authController;
