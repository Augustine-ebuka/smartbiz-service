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
    },
    stockHistory: { 
      type: Type.ARRAY, 
      items: { type: Type.OBJECT }, 
      description: "Detailed stock history or inventory data for the business, including date, quantity,product name, and price." 
    }
  },
  required: ["healthScore", "criticalAlerts", "growthOpportunities", "executiveSummary", "stockHistory"]
};

// --- SYSTEM INSTRUCTIONS ---
const SYSTEM_CORE_CONTEXT = `You are a world-class Virtual CFO and automated business data analyst. 
You are given a highly detailed JSON report containing Profit & Loss, Cash Flow, Expense reports, Revenue insights, Top Products, Top Customers, and Growth Metrics.
Your job is to analyze this data deeply, find hidden correlations (e.g., comparing product transaction frequency to revenue yield, or tracking runway drops), and provide strategic advice. 
Include stock history data in your analysis.`
;


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
// --- STRICT STRUCTURED SCHEMA FOR DATABASE WRITES ---
const transactionActionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    actionType: {
      type: Type.STRING,
      enum: ["ADD_INCOME", "ADD_EXPENSE", "UPDATE_STOCK", "ADD_DEBT", "UNKNOWN"],
      description: "The matching business database operation type."
    },
    payload: {
      type: Type.OBJECT,
      properties: {
        // Shared fields for Income & Expense
        amount: { type: Type.NUMBER, description: "Numeric amount without currency symbols." },
        category: { type: Type.STRING, description: "e.g., Rent, Utilities, Software, Inventory, Marketing, or product name for revenue." },
        paymentMethod: { type: Type.STRING, enum: ["Cash", "Bank Transfer", "Card", "Unknown"], description: "Defaults to Unknown if not specified." },

        // Field for Expenses only
        vendor: { type: Type.STRING, description: "The supplier, shop, or person the expense was paid to, if mentioned (e.g. 'paid Shoprite for supplies')." },

        // Field for Income & Debt — who the transaction is with
        customerName: { type: Type.STRING, description: "Name of the customer, for attributing an income sale or a debt record to a person." },

        // Fields for Stock / Inventory adjustments
        productName: { type: Type.STRING, description: "Name of the item being tracked." },
        quantity: { type: Type.NUMBER, description: "The count of items sold, added, or removed." },
        operation: { type: Type.STRING, enum: ["INCREASE", "DECREASE"], description: "Whether items are entering or leaving stock." },

        // Fields for Debt records only
        debtType: { type: Type.STRING, enum: ["THEY_OWE_ME", "I_OWE_THEM"], description: "THEY_OWE_ME if a customer owes the business (e.g. a credit sale, unpaid balance). I_OWE_THEM if the business owes the customer/supplier money." },
        dueDate: { type: Type.STRING, description: "ISO date (YYYY-MM-DD) the debt is due, only if the user mentions a deadline." },
        description: { type: Type.STRING, description: "Free-text note describing the debt, if extra detail is given." }
      }
    },
    replyToUser: {
      type: Type.STRING,
      description: "A friendly, conversational confirmation message back to the business owner in a warm tone confirming what was parsed."
    }
  },
  required: ["actionType", "payload", "replyToUser"]
};

// --- SYSTEM CORE CONTEXT ---
const ENTRY_SYSTEM_INSTRUCTION = `You are the core voice-to-text and chat-to-database parser for a smart business account app.
Your task is to listen to the business owner's chat log and accurately translate it into a structured database instruction object.

This is a multi-turn conversation. Earlier turns may already contain a partial transaction (e.g. a product name mentioned first, with the amount supplied later, or vice versa). Always read the FULL conversation history, not just the latest message, and merge everything the user has said so far into ONE complete action object. A later message that only supplies a missing detail (e.g. just a number, or "the product is X") still belongs to the transaction started earlier in the conversation — treat it as a continuation, not a new unrelated statement.

CRITICAL RULES:
1. If the user mentions selling items and receiving payment now, output ADD_INCOME and fill in amount, category, and paymentMethod. Also infer the STOCK adjustment if applicable. If a customer's name is mentioned, fill in customerName.
2. If the user mentions buying supplies or paying bills, output ADD_EXPENSE and fill in amount, category, and paymentMethod. If they name who they paid or bought from (a shop, supplier, or person), also fill in vendor.
3. If the user specifically updates inventory levels (e.g. 'added 10 bags to stock'), output UPDATE_STOCK, set quantity, and set operation to INCREASE.
4. If the user mentions a sale made "on credit"/"on account"/"will pay later", or otherwise says someone owes them money, or that they owe someone else money, output ADD_DEBT instead of ADD_INCOME or ADD_EXPENSE — no cash has actually changed hands yet. Fill in amount, customerName, and debtType (THEY_OWE_ME if the customer owes the business, I_OWE_THEM if the business owes the customer/supplier). Fill in dueDate and description only if mentioned.
5. Only output UNKNOWN if, after considering the whole conversation, there is still no transaction of any kind in progress. If a transaction is in progress but a field (amount, product, customer, quantity) is still missing, output the correct actionType anyway with the fields you do have, and ask for the missing one in replyToUser — do NOT output UNKNOWN just because one field is missing.`;

export interface ConversationTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * Parses user text inputs into structured transactional objects.
 * `history` carries prior turns of the SAME in-progress transaction so a reply
 * like "1000" or "the product is Buns" can be merged with what came before.
 */
export async function parseConversationalEntry(userMessage: string, history: ConversationTurn[] = []) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        ...history.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] })),
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      config: {
        systemInstruction: ENTRY_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: transactionActionSchema
      }
    });

    return JSON.parse(response.text!);
  } catch (error) {
    console.error("Chat parsing failed:", error);
    throw error;
  }
}

