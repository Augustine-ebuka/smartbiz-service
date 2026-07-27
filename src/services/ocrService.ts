import { GoogleGenAI, Type, Schema } from '@google/genai';
import * as fs from 'fs';

// Initialize client (automatically uses process.env.GEMINI_API_KEY)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 1. Define the system instruction exactly as you requested
const SYSTEM_INSTRUCTION = `You are a receipt and invoice data extractor. Given a receipt or invoice image, extract:
- amount: the TOTAL amount as a number (no currency symbol)
- date: the transaction date in ISO format yyyy-mm-dd
- vendor: the merchant / vendor / supplier name
- category: one of [Rent, Utilities, Inventory, Marketing, Software, Payroll, Miscellaneous]`;

// 2. Define the JSON Schema matching your target structure and enum categories
const receiptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    amount: { 
      type: Type.NUMBER, 
      description: "The TOTAL amount as a number without currency symbols" 
    },
    date: { 
      type: Type.STRING, 
      description: "The transaction date in ISO format yyyy-mm-dd" 
    },
    vendor: { 
      type: Type.STRING, 
      description: "The merchant / vendor / supplier name" 
    },
    category: {
      type: Type.STRING,
      enum: ["Rent", "Utilities", "Inventory", "Marketing", "Software", "Payroll", "Miscellaneous"],
      description: "The matching business expense category"
    }
  },
  required: ["amount", "date", "vendor", "category"],
};

// Change this function signature to accept Buffer data directly
export async function extractReceiptData(fileBuffer: Buffer, mimeType: string) {
  try {
    // No more fs.readFileSync! Convert the buffer directly to base64
    const base64Image = fileBuffer.toString('base64');

    const response = await ai.models.generateContent({
       model: 'gemini-3.6-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType, // e.g., 'image/jpeg' or 'image/png'
            data: base64Image
          }
        },
        'Extract the data from this document.'
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: receiptSchema,
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
  } catch (error) {
    console.error('Extraction failed:', error);
    throw error;
  }
}

// Execute the function
// extractReceiptData('receipt.jpg');
