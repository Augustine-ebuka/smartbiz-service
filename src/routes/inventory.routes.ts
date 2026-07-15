import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';
import InventoryController from '../controllers/inventory.controller';

const router = Router();

router.use(authenticateToken, resolveBusinessOwner);

// GET    /api/inventory                          → full inventory overview
// GET    /api/inventory/low-stock                → products at/below threshold
// PATCH  /api/inventory/:productId/settings      → enable tracking, set stock/threshold
// POST   /api/inventory/:productId/adjust        → manual stock movement
// GET    /api/inventory/:productId/history       → paginated stock history

router.get   ('/',                          InventoryController.getInventory);
router.get   ('/low-stock',                 InventoryController.getLowStock);
router.patch ('/:productId/settings',       InventoryController.updateSettings);
router.post  ('/:productId/adjust',         InventoryController.adjustStock);
router.get   ('/:productId/history',        InventoryController.getHistory);

export default router;
