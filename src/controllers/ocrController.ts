import {extractReceiptData} from '../services/ocrService';
import multer from 'multer';

export class OCRController {
  // POST /ocr/extract
  // Extracts receipt data from an image
  async extractReceiptData(req: any, res: any, next: any) {
    try {
        console.log(req.file);
      if (!req.file) {
       res.status(400).json({ error: "No image file uploaded." });
       return;
    }
       const result = await extractReceiptData(req.file.buffer, req.file.mimetype);
      console.log(result);
      res.status(200).json({
        success: true,
        message: 'Receipt data extracted successfully.',
        result,
      });
    } catch (error) {
      next(error);
    }
  }
}