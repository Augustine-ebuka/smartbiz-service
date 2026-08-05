import authRoute from './auth.route';
import express from "express";
const router = express.Router();

import walletRoute from './wallet.route';
import transactionRoute from './transaction.route';
// import billRoute from './bills.route';
import competitorRoute from './competitors.route';
import whatsappRoute from './whatsapp.route';
import catalogRoute from './catalog.route';
import recordRoute from './record.route';
import dashboardRoute from './dashboard.route';
import reportRoute from './report.route';
import saleskeeperRoute from './saleskeeper.router';
import uploadRoutes from './upload.route';
import inventoryRoute from './inventory.routes';
import activityLog from './activityLog.route'
import debtRecordRoute from './debtrecord.route';
import bulkUploadRoute from './bulkupload.route';
import ocrRoute from './ocr.route';
import aiRoute from './ai.route';
import aiChatEntryRoute from './aichatEntry.route';
import subscriptionRoute from './subscription.route';
import adminRoute from './admin.route';
import supportRoute from './support.routes';
import invoiceRoutes from './invoice.routes';

router.use("/v1/auth", authRoute);
router.use("/v1/wallet", walletRoute);
router.use("/v1/transactions", transactionRoute);
// router.use("/v1/bills", billRoute);
router.use("/v1/competitors", competitorRoute);
router.use("/v1/whatsapp", whatsappRoute);
router.use("/v1/catalog", catalogRoute);
router.use("/v1/records", recordRoute);
router.use("/v1/dashboard", dashboardRoute);
router.use("/v1/reports", reportRoute);
router.use("/v1/saleskeepers", saleskeeperRoute);
router.use("/v1/upload", uploadRoutes);
router.use("/v1/inventory", inventoryRoute);
router.use("/v1/activity-log", activityLog);
router.use("/v1/debt-records", debtRecordRoute);
router.use("/v1/bulk-upload", bulkUploadRoute);
router.use("/v1/ocr", ocrRoute);
router.use("/v1/ai", aiRoute);
router.use("/v1/ai", aiChatEntryRoute);
router.use("/v1/subscription", subscriptionRoute);
router.use("/v1/admin", adminRoute);
router.use("/v1/support", supportRoute);
router.use("/v1/invoices", invoiceRoutes);


router.get("/v1", (req, res) => {
  res.send("Welcome smart biz to Version 1 API");
});

export default router;