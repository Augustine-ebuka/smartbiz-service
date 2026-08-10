import { Router } from 'express';
import {
  createVendorHandler,
  deleteVendorHandler,
  getVendorHandler,
  listVendorsHandler,
  updateVendorHandler,
} from '../controllers/vendor.controller';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner } from '../middlewares/businessOwnerMiddleware';
import { checkSubscription } from '../middlewares/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken, resolveBusinessOwner);

router.post('/', checkSubscription('vendors'), createVendorHandler);
router.get('/', listVendorsHandler);
router.get('/:id', getVendorHandler);
router.patch('/:id', updateVendorHandler);
router.delete('/:id', deleteVendorHandler);

export default router;
