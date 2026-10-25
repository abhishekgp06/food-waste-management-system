import { Router } from 'express';
import authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public registration endpoint
router.post('/register', authController.register);

// Public login endpoint
router.post('/login', authController.login);

// Protected user profile endpoint
router.get('/me', authenticate, authController.getMe);

export default router;
