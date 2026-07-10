import { receiveWhatsappWebhook, verifyWhatsappWebhook, sendWhatsappMessage } from "../controllers/whatsappController";
import express from "express";
const router = express.Router();

router.get("/webhook", verifyWhatsappWebhook);
router.post("/webhook", receiveWhatsappWebhook);
router.post("/messages", sendWhatsappMessage);

export default router;
