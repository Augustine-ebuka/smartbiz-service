import express from 'express';
import multer from 'multer';
// import { extractReceiptData } from '../services/ocrService';
import {extractReceiptData} from '../services/ocrService';
const router = express.Router();
const upload = multer(); // Keeps the file in memory buffer instead of saving to disk

// POST endpoint at /api/extract
// Use upload.any() to bypass strict key naming constraints
router.post('/extract', upload.any(), async (req, res) => {
  try {
      console.log(req.files);
  console.log(req.body);
    // Since upload.any() populates req.files as an array, grab the first file
    const files = req.files as Express.Multer.File[];
    const uploadedFile = files && files[0];

    if (!uploadedFile) {
       res.status(400).json({ error: "No image file uploaded." });
       return;
    }

    // Pass the buffer data to your service
    const result = await extractReceiptData(uploadedFile.buffer, uploadedFile.mimetype);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Processing failed" });
  }
});


export default router;
