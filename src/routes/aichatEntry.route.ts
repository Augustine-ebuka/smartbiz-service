import express from 'express';
import { parseConversationalEntry, ConversationTurn } from '../services/aiService';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner } from '../middlewares/businessOwnerMiddleware';
import { Product } from '../models/product.model';
import { ExpenseCategory } from '../models/expenseCategory.model';
import { Customer } from '../models/customer.model';
import IncomeService from '../services/incomeService';
import ExpenseService from '../services/expensesService';
import inventoryService from '../services/inventory.service';
import { createDebtRecord } from '../services/debtrecordService';

const router = express.Router();

router.use(authenticateToken, resolveBusinessOwner);

async function findProductByName(userId: string, name?: string) {
  if (!name) return null;
  return Product.findOne({ userId, name: { $regex: `^${name}$`, $options: 'i' } });
}

async function findOrCreateExpenseCategory(userId: string, name?: string) {
  if (!name) return undefined;
  let category = await ExpenseCategory.findOne({
    $or: [{ userId, name: { $regex: `^${name}$`, $options: 'i' } }, { system: true, name: { $regex: `^${name}$`, $options: 'i' } }],
  });
  if (!category) {
    category = await ExpenseCategory.create({ userId, name });
  }
  return category._id;
}

async function findOrCreateCustomer(userId: string, name?: string) {
  if (!name) return undefined;
  let customer = await Customer.findOne({ userId, name: { $regex: `^${name}$`, $options: 'i' } });
  if (!customer) {
    customer = await Customer.create({ userId, name });
  }
  return customer._id;
}

router.post('/chat/entry', async (req, res) => {
  try {
    const userId = (req as any).businessOwnerId as string;
    const { message } = req.body;
    // Prior turns of this SAME in-progress transaction, echoed back by the client.
    // Cap it so a runaway thread can't blow up the prompt.
    const incomingHistory: ConversationTurn[] = Array.isArray(req.body.history) ? req.body.history.slice(-20) : [];
    if (!message) {
      res.status(400).json({ error: 'Message field is missing.' });
      return;
    }

    // Reply with a clarifying question, keeping the conversation alive so the
    // next message can be merged with what's already been said.
    const askForMore = (reply: string) => {
      const history: ConversationTurn[] = [
        ...incomingHistory,
        { role: 'user', text: message },
        { role: 'model', text: reply },
      ];
      res.json({ reply, history });
    };

    // 1. Pass the user text + conversation so far through Gemini
    const aiResult = await parseConversationalEntry(message, incomingHistory);
    const { actionType, payload, replyToUser } = aiResult;

    // 2. Route the output payload to the real database services
    switch (actionType) {
      case 'ADD_INCOME': {
        if (!payload.amount) {
          askForMore(replyToUser || 'How much was the sale for?');
          return;
        }
        const product = await findProductByName(userId, payload.productName || payload.category);
        const customerId = await findOrCreateCustomer(userId, payload.customerName);
        const income = await IncomeService.create(userId, {
          productId: product?._id?.toString(),
          customerId: customerId?.toString(),
          unit: payload.quantity ?? 1,
          amount: payload.amount,
          paymentMethod: payload.paymentMethod && payload.paymentMethod !== 'Unknown' ? payload.paymentMethod : undefined,
          note: !product && payload.category ? payload.category : undefined,
        });
        res.json({ success: true, actionExecuted: actionType, reply: replyToUser, data: income, history: [] });
        return;
      }

      case 'ADD_EXPENSE': {
        if (!payload.amount) {
          askForMore(replyToUser || 'How much was that expense?');
          return;
        }
        const categoryId = await findOrCreateExpenseCategory(userId, payload.category);
        const expense = await ExpenseService.create(userId, {
          amount: payload.amount,
          categoryId: categoryId?.toString(),
          vendor: payload.vendor,
          note: payload.paymentMethod && payload.paymentMethod !== 'Unknown' ? `Paid via ${payload.paymentMethod}` : undefined,
        });
        res.json({ success: true, actionExecuted: actionType, reply: replyToUser, data: expense, history: [] });
        return;
      }

      case 'UPDATE_STOCK': {
        if (!payload.quantity) {
          askForMore(replyToUser || 'How many units should I adjust the stock by?');
          return;
        }
        const product = await findProductByName(userId, payload.productName);
        if (!product) {
          askForMore(`I couldn't find a product called "${payload.productName}". Could you confirm the exact product name?`);
          return;
        }
        const { product: updatedProduct, isLowStock } = await inventoryService.adjustStock(userId, product._id.toString(), {
          quantity: payload.quantity,
          movementType: payload.operation === 'INCREASE' ? 'restock' : 'adjustment',
        });
        res.json({ success: true, actionExecuted: actionType, reply: replyToUser, data: updatedProduct, isLowStock, history: [] });
        return;
      }

      case 'ADD_DEBT': {
        if (!payload.amount || !payload.customerName || !payload.debtType) {
          askForMore(replyToUser || "Who is this debt with, how much is it, and do they owe you or do you owe them?");
          return;
        }
        const customerId = await findOrCreateCustomer(userId, payload.customerName);
        const debt = await createDebtRecord({
          userId,
          type: payload.debtType,
          amount: payload.amount,
          customer: customerId!.toString(),
          dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
          description: payload.description,
        });
        res.json({ success: true, actionExecuted: actionType, reply: replyToUser, data: debt, history: [] });
        return;
      }

      case 'UNKNOWN':
      default:
        askForMore(replyToUser || "I didn't quite catch that transaction detail. Could you provide the specific amount or product?");
        return;
    }
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to process chat transactional input.' });
  }
});

export default router;
