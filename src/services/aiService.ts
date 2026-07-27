import { GoogleGenAI, Type, Schema } from '@google/genai';
import { query } from 'express';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// --- SCHEMA FOR THE PROACTIVE CFO ALERTS SYSTEM ---
const cfoAlertSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    healthScore: { 
      type: Type.NUMBER, 
      description: "Overall business financial health score from 1 to 100 based on runway and margins" 
    },
    criticalAlerts: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING }, 
      description: "Urgent threats (e.g., critical 46-day runway, high rent dependency)" 
    },
    growthOpportunities: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING }, 
      description: "Data-backed wins (e.g., pushing high-yield Office Chairs, upselling VIP clients)" 
    },
    executiveSummary: { 
      type: Type.STRING, 
      description: "A concise 3-sentence summary of the business's current financial standing." 
    }
  },
  required: ["healthScore", "criticalAlerts", "growthOpportunities", "executiveSummary"]
};

// --- SYSTEM INSTRUCTIONS ---
const SYSTEM_CORE_CONTEXT = `You are a world-class Virtual CFO and automated business data analyst. 
You are given a highly detailed JSON report containing Profit & Loss, Cash Flow, Expense reports, Revenue insights, Top Products, Top Customers, and Growth Metrics.
Your job is to analyze this data deeply, find hidden correlations (e.g., comparing product transaction frequency to revenue yield, or tracking runway drops), and provide strategic advice.`;


/**
 * Feature 1: Proactive CFO Audit & Dashboard Alerts
 * Takes the raw dashboard data and returns structured executive insights.
 */
export async function generateCfoAlerts(dashboardData: any) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        { text: `Analyze this current financial payload: ${JSON.stringify(dashboardData)}` }
      ],
      config: {
        systemInstruction: `${SYSTEM_CORE_CONTEXT} Evaluate the data and output a structured diagnostic overview.`,
        responseMimeType: 'application/json',
        responseSchema: cfoAlertSchema
      }
    });

    return JSON.parse(response.text!);
  } catch (error) {
    console.error("CFO Audit Error:", error);
    throw error;
  }
}

/**
 * Feature 2: Chat with Your Business Data (Interactive Queries)
 * Allows users to ask natural language questions about their numbers.
 */
export async function askBusinessChat(dashboardData: any, userQuestion: string, chatHistory: any[] = []) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        // Inject the dashboard data as core memory context
        { text: `CRITICAL CONTEXT (Current Business Financial Payload): ${JSON.stringify(dashboardData)}` },
        // Append previous context if building a multi-turn chat widget
        ...chatHistory,
        // The user's actual live question
        { text: `User Question: ${userQuestion}` }
      ],
      config: {
        systemInstruction: `${SYSTEM_CORE_CONTEXT} Answer the user's question directly, clearly, and concisely using the exact metrics from the dataset. Use clear professional formatting.`,
        // Text mode allows the AI to write conversational, human replies
        responseMimeType: 'text/plain' 
      }
    });

    return response.text;
  } catch (error) {
    console.error("Business Chat Error:", error);
    throw error;
  }
}
