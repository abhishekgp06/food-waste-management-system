import { Router } from 'express';
import donationController from '../controllers/donationController.js';
import { authenticate, requireRole, requireStatus } from '../middleware/auth.js';

const router = Router();

// All donation routes require authentication
router.use(authenticate);

// 1. Nearby search: ACTIVE users (MUST be defined before /:id)
router.get('/nearby', requireStatus('ACTIVE'), donationController.getNearby);

// 2. Create donation: ACTIVE DONOR accounts only
router.post('/', requireRole('DONOR'), requireStatus('ACTIVE'), donationController.create);

// 3. Claim donation: ACTIVE NGO accounts only
router.post('/:id/claim', requireRole('NGO'), requireStatus('ACTIVE'), donationController.claim);

// 4. Cancel claim: ACTIVE NGO or ADMIN accounts
router.post('/:id/cancel-claim', requireRole('NGO', 'ADMIN'), requireStatus('ACTIVE'), donationController.cancelClaim);

// 5. List donations: ACTIVE authenticated users with optional filters & pagination
router.get('/', requireStatus('ACTIVE'), donationController.list);

// 6. Retrieve single donation by UUID: ACTIVE authenticated users
router.get('/:id', requireStatus('ACTIVE'), donationController.getById);

// 7. Update donation: ACTIVE DONOR or ADMIN accounts (ownership & lifecycle enforced in service)
router.patch('/:id', requireRole('DONOR', 'ADMIN'), requireStatus('ACTIVE'), donationController.update);

// 8. Delete donation: ACTIVE DONOR or ADMIN accounts (ownership & lifecycle enforced in service)
router.delete('/:id', requireRole('DONOR', 'ADMIN'), requireStatus('ACTIVE'), donationController.deleteDonation);

export default router;
