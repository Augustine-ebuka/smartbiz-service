import { Router } from 'express';
import ClaimController from '../controllers/claim.controller';
import { uploadClaimProof } from '../middlewares/uploadMidleware';

const router = Router();

// Public endpoints for claim page
router.get('/', ClaimController.validateToken);
router.post('/paid', uploadClaimProof, ClaimController.submitClaim);

export default router;
