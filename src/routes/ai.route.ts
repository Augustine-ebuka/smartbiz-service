import express from 'express';
import { generateCfoAlerts, askBusinessChat } from '../services/aiService';

const router = express.Router();

// Mocking your data payload database fetch or request body
// Replace this with your actual database call in production
const getBusinessPayload = (req: express.Request) => {
  return req.body.financialData; // Expecting the full data object to be sent or pulled
};

// 1. POST Endpoint for Dashboard Proactive CFO Report
router.post('/insights/cfo-report', async (req, res) => {
  try {
    const data = getBusinessPayload(req);
    if (!data) { res.status(400).json({ error: "Missing financialData payload." }); return; }

    const report = await generateCfoAlerts(data);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: "Failed to compile financial insight report." });
  }
});

// 2. POST Endpoint for the Natural Language Interactive Chat Widget
router.post('/insights/chat', async (req, res) => {
  try {
    const { financialData, question } = req.body;
    if (!financialData || !question) { 
       res.status(400).json({ error: "Missing financialData or question string in request body." }); 
       return; 
    }

    const answer = await askBusinessChat(financialData, question);
    res.json({ answer });
  } catch (error) {
    res.status(500).json({ error: "Chat service encountered an error." });
  }
});

export default router;
