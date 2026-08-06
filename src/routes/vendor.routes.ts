import { Router } from 'express';
import {
  createVendorHandler,
  deleteVendorHandler,
  getVendorHandler,
  listVendorsHandler,
  updateVendorHandler,
} from '../controllers/vendor.controller';

const router = Router();

router.post('/', createVendorHandler);
router.get('/', listVendorsHandler);
router.get('/:id', getVendorHandler);
router.patch('/:id', updateVendorHandler);
router.delete('/:id', deleteVendorHandler);

export default router;
