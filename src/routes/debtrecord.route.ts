import { Router } from 'express';
import {
  createDebtRecordHandler,
  deleteDebtRecordHandler,
  getDebtRecordHandler,
  listDebtRecordsHandler,
  updateDebtRecordHandler,
  markAsPaidHandler,
} from '../controllers/debtrecordController';
import { authenticateToken } from '../middlewares/authMiddleware';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';
const router = Router();

router.use(authenticateToken);
router.use(resolveBusinessOwner);

router.post('/', createDebtRecordHandler);
router.get('/', listDebtRecordsHandler);
router.get('/:id', getDebtRecordHandler);
router.patch('/:id', updateDebtRecordHandler);
router.delete('/:id', deleteDebtRecordHandler);
router.post('/:id/markAsPaid', markAsPaidHandler);

export default router;