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



router.get("/v1", (req, res) => {
  res.send("Welcome smart biz to Version 1 API");
});

export default router;