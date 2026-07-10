import { Router } from "express";
import {
  createFeeConfig,
  getAllFeeConfigs,
  getFeeConfigById,
  updateFeeConfig,
  deleteFeeConfig,
} from "../controllers/competitorsController";

const router = Router();

/**
 * @route   POST /api/fee-config
 * @desc    Create a new fee config
 */
router.post("/", createFeeConfig);

/**
 * @route   GET /api/fee-config
 * @desc    Get all fee configs
 */
router.get("/", getAllFeeConfigs);

/**
 * @route   GET /api/fee-config/:id
 * @desc    Get single fee config
 */
router.get("/:id", getFeeConfigById as any);

/**
 * @route   PUT /api/fee-config/:id
 * @desc    Update fee config
 */
router.put("/:id", updateFeeConfig as any);

/**
 * @route   DELETE /api/fee-config/:id
 * @desc    Delete fee config
 */
router.delete("/:id", deleteFeeConfig as any);

// create a whatsapp webhook
// router.get("/:id", createWhatsappWebhook);

// // verify whatsapp webhook
// router.post("/:id/verify", verifyWhatsappWebhook);

// // receive whatsapp webhook
// router.post("/:id/receive", receiveWhatsappWebhook);

export default router;