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
import { createDebtRecord, markDebtRecordAsPaid } from '../services/debtrecordService';
import { DebtRecordModel } from '../models/debtrecord';

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

async function findCustomerByName(userId: string, name?: string) {
  if (!name) return null;
  return Customer.findOne({ userId, name: { $regex: `^${name}$`, $options: 'i' } });
}

async function findOrCreateCustomer(userId: string, name?: string) {
  if (!name) return undefined;
  let customer = await findCustomerByName(userId, name);
  if (!customer) {
    customer = await Customer.create({ userId, name });
  }
  return customer._id;
}

// TODAY / THIS_WEEK / THIS_MONTH boundaries as ISO strings for IncomeService/ExpenseService.getSummary.
// Deliberately duplicated (not imported) from dashboardService's private date helpers.
function getPeriodRange(period?: string): { startDate?: string; endDate?: string } {
  const now = new Date();

  if (period === 'TODAY') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  if (period === 'THIS_WEEK') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }

  if (period === 'THIS_MONTH') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  return {}; // ALL_TIME — no bounds
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

      case 'CHECK_STOCK': {
        if (payload.productName) {
          const product = await findProductByName(userId, payload.productName);
          if (!product) {
            askForMore(`I couldn't find a product called "${payload.productName}" in your inventory.`);
            return;
          }
          const reply = !product.trackStock
            ? `"${product.name}" doesn't have stock tracking enabled, so there's no stock count for it.`
            : `You have ${product.stock} "${product.name}" left${product.stock <= product.lowStockThreshold ? ' — running low!' : '.'}`;
          res.json({
            success: true,
            actionExecuted: actionType,
            reply,
            data: { name: product.name, stock: product.stock, lowStockThreshold: product.lowStockThreshold, trackStock: product.trackStock },
            history: [],
          });
          return;
        }

        const inventory = await inventoryService.getInventory(userId);
        const lowStockCount = inventory.filter((p: any) => p.isLowStock).length;
        const reply = inventory.length === 0
          ? "You don't have any products with stock tracking enabled yet."
          : `You have ${inventory.length} tracked product${inventory.length === 1 ? '' : 's'}${lowStockCount ? `, ${lowStockCount} running low` : ', all healthy'}.`;
        res.json({ success: true, actionExecuted: actionType, reply, data: inventory, history: [] });
        return;
      }

      case 'CHECK_DEBTS': {
        // Query the model directly (userId-scoped) rather than listDebtRecords(),
        // which does not filter by business owner — using it here would leak
        // other businesses' debt records into this endpoint.
        const query: Record<string, any> = { userId, status: 'PENDING' };
        if (payload.debtType) query.type = payload.debtType;

        let customer = null;
        if (payload.customerName) {
          customer = await findCustomerByName(userId, payload.customerName);
          if (!customer) {
            res.json({ reply: `I couldn't find a customer called "${payload.customerName}".`, history: [] });
            return;
          }
          query.customer = customer._id;
        }

        const debts = await DebtRecordModel.find(query).populate('customer', 'name').sort({ createdAt: -1 });
        const theyOweMe = debts.filter((d: any) => d.type === 'THEY_OWE_ME').reduce((sum: number, d: any) => sum + d.amount, 0);
        const iOweThem = debts.filter((d: any) => d.type === 'I_OWE_THEM').reduce((sum: number, d: any) => sum + d.amount, 0);

        let reply: string;
        if (debts.length === 0) {
          reply = customer ? `No outstanding debts with ${customer.name}.` : 'You have no outstanding debts either way — clean slate!';
        } else {
          const parts: string[] = [];
          if (theyOweMe) parts.push(`people owe you ₦${theyOweMe.toLocaleString()}`);
          if (iOweThem) parts.push(`you owe ₦${iOweThem.toLocaleString()}`);
          reply = (customer ? `${customer.name}: ` : '') + parts.join(', ') + '.';
        }

        res.json({ success: true, actionExecuted: actionType, reply, data: debts, history: [] });
        return;
      }

      case 'MARK_DEBT_PAID': {
        if (!payload.customerName) {
          askForMore(replyToUser || 'Whose debt should I mark as paid?');
          return;
        }
        const customer = await findCustomerByName(userId, payload.customerName);
        if (!customer) {
          res.json({ reply: `I couldn't find a customer called "${payload.customerName}".`, history: [] });
          return;
        }

        const query: Record<string, any> = { userId, customer: customer._id, status: 'PENDING' };
        if (payload.debtType) query.type = payload.debtType;
        if (payload.amount) query.amount = payload.amount;

        const matches: any[] = await DebtRecordModel.find(query);
        if (matches.length === 0) {
          res.json({ reply: `I couldn't find an outstanding debt for ${payload.customerName}${payload.amount ? ` of ₦${payload.amount}` : ''}.`, history: [] });
          return;
        }
        if (matches.length > 1) {
          askForMore(`${payload.customerName} has ${matches.length} outstanding debts. Which amount should I mark as paid?`);
          return;
        }

        await markDebtRecordAsPaid(matches[0]._id.toString(), userId);
        res.json({ success: true, actionExecuted: actionType, reply: replyToUser, data: { ...matches[0].toObject(), status: 'PAID' }, history: [] });
        return;
      }

      case 'CHECK_SUMMARY': {
        const { startDate, endDate } = getPeriodRange(payload.period);
        const [incomeSummary, expenseSummary] = await Promise.all([
          IncomeService.getSummary(userId, startDate, endDate),
          ExpenseService.getSummary(userId, startDate, endDate),
        ]);
        const profit = incomeSummary.total - expenseSummary.total;
        const periodLabel: Record<string, string> = { TODAY: 'today', THIS_WEEK: 'this week', THIS_MONTH: 'this month', ALL_TIME: 'overall' };
        const label = periodLabel[payload.period] || 'overall';
        const reply = `${label === 'overall' ? 'Overall' : `So far ${label}`}, you've made ₦${incomeSummary.total.toLocaleString()} and spent ₦${expenseSummary.total.toLocaleString()}, for a profit of ₦${profit.toLocaleString()}.`;
        res.json({
          success: true,
          actionExecuted: actionType,
          reply,
          data: { period: payload.period || 'ALL_TIME', income: incomeSummary.total, expense: expenseSummary.total, profit },
          history: [],
        });
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
