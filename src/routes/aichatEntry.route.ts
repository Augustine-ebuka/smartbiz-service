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
import subscriptionService from '../services/subscriptionService';

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

// Held server-side-shaped, client-echoed state for the "new customer?" confirmation.
// Deliberately NOT resolved via the LLM — a yes/no answer that controls whether we
// write a new Customer record needs a deterministic read, not a guess.
interface PendingIncomeCustomerConfirmation {
  type: 'CREATE_CUSTOMER';
  context: 'income';
  customerName: string;
  income: {
    amount: number;
    productName?: string;
    category?: string;
    quantity?: number;
    paymentMethod?: string;
  };
}

interface PendingDebtCustomerConfirmation {
  type: 'CREATE_CUSTOMER';
  context: 'debt';
  customerName: string;
  debt: {
    amount: number;
    debtType: 'THEY_OWE_ME' | 'I_OWE_THEM';
    dueDate?: string;
    description?: string;
  };
}

type PendingCustomerConfirmation = PendingIncomeCustomerConfirmation | PendingDebtCustomerConfirmation;

const YES_RE = /^\s*(y|yes|yeah|yep|yup|sure|ok(ay)?|please|go\s*ahead|create|add)\b/i;
const NO_RE = /^\s*(n|no|nope|nah|don'?t|do\s*not|skip|cancel|never\s*mind)\b/i;

async function recordIncome(
  userId: string,
  income: PendingIncomeCustomerConfirmation['income'],
  customerId?: string,
  fallbackNote?: string
) {
  const product = await findProductByName(userId, income.productName || income.category);
  return IncomeService.create(userId, {
    productId: product?._id?.toString(),
    customerId,
    unit: income.quantity ?? 1,
    amount: income.amount,
    paymentMethod: income.paymentMethod && income.paymentMethod !== 'Unknown' ? (income.paymentMethod as any) : undefined,
    note: fallbackNote ?? (!product && income.category ? income.category : undefined),
  });
}

async function recordDebt(userId: string, debt: PendingDebtCustomerConfirmation['debt'], customerId: string) {
  return createDebtRecord({
    userId,
    type: debt.debtType,
    amount: debt.amount,
    customer: customerId,
    dueDate: debt.dueDate ? new Date(debt.dueDate) : undefined,
    description: debt.description,
  });
}

// TODAY / THIS_WEEK / THIS_MONTH / a specific date boundaries as ISO strings for
// IncomeService/ExpenseService.getSummary. Deliberately duplicated (not imported)
// from dashboardService's private date helpers.
function getPeriodRange(period?: string, date?: string): { startDate?: string; endDate?: string } {
  // An explicit calendar date (e.g. "yesterday", "July 20") always wins over a
  // relative period — the AI is told not to set both, but if it does, a specific
  // day is the more precise signal.
  if (date) {
    const [year, month, day] = date.split('-').map(Number);
    if (year && month && day) {
      const start = new Date(Date.UTC(year, month - 1, day));
      const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
  }

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

// Natural-language lead-in for a CHECK_SUMMARY / CHECK_TOP_PRODUCTS reply, e.g.
// "On 20 July 2026, ..." / "So far this week, ..." / "Overall, ...".
function summaryLeadIn(period?: string, date?: string): string {
  if (date) {
    const [year, month, day] = date.split('-').map(Number);
    if (year && month && day) {
      const formatted = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      return `On ${formatted},`;
    }
  }
  if (!period || period === 'ALL_TIME') return 'Overall,';
  const labels: Record<string, string> = { TODAY: 'today', THIS_WEEK: 'this week', THIS_MONTH: 'this month' };
  return `So far ${labels[period] || 'overall'},`;
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

    // 0. If we're mid-way through a "create this customer?" confirmation, resolve
    // the yes/no answer ourselves and finish the transaction — skip the AI entirely
    // so a misread reply can never accidentally create/skip a customer.
    const pending = req.body.pendingConfirmation as PendingCustomerConfirmation | undefined;
    if (pending?.type === 'CREATE_CUSTOMER') {
      const isYes = YES_RE.test(message);
      const isNo = NO_RE.test(message);

      if (!isYes && !isNo) {
        const reply = `Sorry, just to confirm — should I add "${pending.customerName}" as a new customer? (yes/no)`;
        const history: ConversationTurn[] = [...incomingHistory, { role: 'user', text: message }, { role: 'model', text: reply }];
        res.json({ reply, history, pendingConfirmation: pending });
        return;
      }

      if (pending.context === 'income') {
        if (isYes) {
          const customer = await Customer.create({ userId, name: pending.customerName });
          const income = await recordIncome(userId, pending.income, customer._id.toString());
          res.json({
            success: true,
            actionExecuted: 'ADD_INCOME',
            reply: `Got it — added "${pending.customerName}" as a new customer and logged the sale.`,
            data: income,
            history: [],
          });
          return;
        }

        const income = await recordIncome(userId, pending.income, undefined, `Customer: ${pending.customerName}`);
        res.json({
          success: true,
          actionExecuted: 'ADD_INCOME',
          reply: `No problem — logged the sale without creating a customer profile.`,
          data: income,
          history: [],
        });
        return;
      }

      // context === 'debt' — a debt record MUST reference a customer, so declining
      // to create one can't fall through to "record it anyway" like income does.
      if (isYes) {
        const customer = await Customer.create({ userId, name: pending.customerName });
        const debt = await recordDebt(userId, pending.debt, customer._id.toString());
        res.json({
          success: true,
          actionExecuted: 'ADD_DEBT',
          reply: `Got it — added "${pending.customerName}" as a new customer and logged the debt.`,
          data: debt,
          history: [],
        });
        return;
      }

      const reply = `A debt has to be linked to a customer, so I can't log it without one. Want to give a different name, or should I cancel this entry?`;
      const history: ConversationTurn[] = [...incomingHistory, { role: 'user', text: message }, { role: 'model', text: reply }];
      res.json({ reply, history });
      return;
    }

    // 1. Enforce the plan's daily AI quota — counted per actual Gemini call, so
    // the deterministic pendingConfirmation resume above (which never touches
    // the AI) doesn't burn a query.
    try {
      await subscriptionService.checkAndIncrementAiUsage(userId);
    } catch (limitError: any) {
      res.status(403).json({ success: false, message: limitError.message, upgradeRequired: true });
      return;
    }

    // 2. Pass the user text + conversation so far through Gemini
    const aiResult = await parseConversationalEntry(message, incomingHistory);
    const { actionType, payload, replyToUser } = aiResult;

    // 3. Route the output payload to the real database services
    switch (actionType) {
      case 'ADD_INCOME': {
        // No explicit amount stated — if the product is known and priced, derive
        // it from price × quantity instead of asking. Only do this when the AI
        // left amount blank (i.e. the user never stated one); never override an
        // amount the user actually said (covers discounts/negotiated prices).
        let amount = payload.amount;
        const priceLookupProduct = !amount ? await findProductByName(userId, payload.productName || payload.category) : null;
        if (!amount && priceLookupProduct) {
          amount = priceLookupProduct.price * (payload.quantity ?? 1);
        }

        if (!amount) {
          askForMore(replyToUser || 'How much was the sale for?');
          return;
        }
        if (!payload.customerName) {
          askForMore(replyToUser || 'Who is this sale for? What is the customer\'s name?');
          return;
        }

        const existingCustomer = await findCustomerByName(userId, payload.customerName);
        if (!existingCustomer) {
          const pendingConfirmation: PendingCustomerConfirmation = {
            type: 'CREATE_CUSTOMER',
            context: 'income',
            customerName: payload.customerName,
            income: {
              amount,
              productName: payload.productName,
              category: payload.category,
              quantity: payload.quantity,
              paymentMethod: payload.paymentMethod,
            },
          };
          const reply = `I don't have a customer named "${payload.customerName}" yet — want me to add them as a new customer? (yes/no)`;
          const history: ConversationTurn[] = [...incomingHistory, { role: 'user', text: message }, { role: 'model', text: reply }];
          res.json({ reply, history, pendingConfirmation });
          return;
        }

        const income = await recordIncome(userId, {
          amount,
          productName: payload.productName,
          category: payload.category,
          quantity: payload.quantity,
          paymentMethod: payload.paymentMethod,
        }, existingCustomer._id.toString());
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

        const existingCustomer = await findCustomerByName(userId, payload.customerName);
        if (!existingCustomer) {
          const pendingConfirmation: PendingCustomerConfirmation = {
            type: 'CREATE_CUSTOMER',
            context: 'debt',
            customerName: payload.customerName,
            debt: {
              amount: payload.amount,
              debtType: payload.debtType,
              dueDate: payload.dueDate,
              description: payload.description,
            },
          };
          const reply = `I don't have a customer named "${payload.customerName}" yet — want me to add them as a new customer? (yes/no)`;
          const history: ConversationTurn[] = [...incomingHistory, { role: 'user', text: message }, { role: 'model', text: reply }];
          res.json({ reply, history, pendingConfirmation });
          return;
        }

        const debt = await recordDebt(userId, {
          amount: payload.amount,
          debtType: payload.debtType,
          dueDate: payload.dueDate,
          description: payload.description,
        }, existingCustomer._id.toString());
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
        const { startDate, endDate } = getPeriodRange(payload.period, payload.date);
        const [incomeSummary, expenseSummary] = await Promise.all([
          IncomeService.getSummary(userId, startDate, endDate),
          ExpenseService.getSummary(userId, startDate, endDate),
        ]);
        const profit = incomeSummary.total - expenseSummary.total;
        const leadIn = summaryLeadIn(payload.period, payload.date);
        const reply = `${leadIn} you made ₦${incomeSummary.total.toLocaleString()} and spent ₦${expenseSummary.total.toLocaleString()}, for a profit of ₦${profit.toLocaleString()}.`;
        res.json({
          success: true,
          actionExecuted: actionType,
          reply,
          data: { period: payload.date ? undefined : (payload.period || 'ALL_TIME'), date: payload.date, income: incomeSummary.total, expense: expenseSummary.total, profit },
          history: [],
        });
        return;
      }

      case 'CHECK_TOP_PRODUCTS': {
        const { startDate, endDate } = getPeriodRange(payload.period, payload.date);
        const { byProduct } = await IncomeService.getSummary(userId, startDate, endDate);
        const ranked = byProduct.filter((p: any) => p.total > 0); // already sorted desc by total
        const leadIn = summaryLeadIn(payload.period, payload.date);
        const isWorst = payload.rank === 'WORST';

        if (ranked.length === 0) {
          res.json({
            success: true,
            actionExecuted: actionType,
            reply: `No sales recorded for that period to rank products by.`,
            data: [],
            history: [],
          });
          return;
        }

        const picked = isWorst ? ranked[ranked.length - 1] : ranked[0];
        const label = isWorst ? 'worst-performing' : 'best-selling';
        const reply = `${leadIn} your ${label} product is "${picked.productName}" — ₦${picked.total.toLocaleString()} from ${picked.unitsSold} unit${picked.unitsSold === 1 ? '' : 's'} sold.`;
        res.json({ success: true, actionExecuted: actionType, reply, data: ranked.slice(0, 5), history: [] });
        return;
      }

      case 'CHECK_TOP_CUSTOMERS': {
        const { startDate, endDate } = getPeriodRange(payload.period, payload.date);
        const { byCustomer } = await IncomeService.getSummary(userId, startDate, endDate);
        const ranked = byCustomer.filter((c: any) => c.total > 0 && c.customerName !== 'Walk-in / No customer'); // already sorted desc by total
        const leadIn = summaryLeadIn(payload.period, payload.date);
        const isWorst = payload.rank === 'WORST';

        if (ranked.length === 0) {
          res.json({
            success: true,
            actionExecuted: actionType,
            reply: `No customer-attributed sales recorded for that period to rank by.`,
            data: [],
            history: [],
          });
          return;
        }

        const picked = isWorst ? ranked[ranked.length - 1] : ranked[0];
        const label = isWorst ? 'lowest-spending' : 'top-spending';
        const reply = `${leadIn} your ${label} customer is "${picked.customerName}" — ₦${picked.total.toLocaleString()} across ${picked.count} purchase${picked.count === 1 ? '' : 's'}.`;
        res.json({ success: true, actionExecuted: actionType, reply, data: ranked.slice(0, 5), history: [] });
        return;
      }

      case 'CHECK_PAYMENT_METHODS': {
        const { startDate, endDate } = getPeriodRange(payload.period, payload.date);
        const { byPaymentMethod } = await IncomeService.getSummary(userId, startDate, endDate);
        const leadIn = summaryLeadIn(payload.period, payload.date);

        if (payload.paymentMethod && payload.paymentMethod !== 'Unknown') {
          const match = byPaymentMethod.find((m: any) => m._id?.toLowerCase() === payload.paymentMethod.toLowerCase());
          const reply = match
            ? `${leadIn} ${match.count} sale${match.count === 1 ? '' : 's'} were paid via ${payload.paymentMethod}, totaling ₦${match.total.toLocaleString()}.`
            : `${leadIn} no sales were paid via ${payload.paymentMethod}.`;
          res.json({ success: true, actionExecuted: actionType, reply, data: match || { _id: payload.paymentMethod, total: 0, count: 0 }, history: [] });
          return;
        }

        if (byPaymentMethod.length === 0) {
          res.json({ success: true, actionExecuted: actionType, reply: `No sales recorded for that period.`, data: [], history: [] });
          return;
        }

        const breakdown = byPaymentMethod.map((m: any) => `${m._id || 'Unspecified'}: ${m.count} (₦${m.total.toLocaleString()})`).join(', ');
        const reply = `${leadIn} here's the breakdown — ${breakdown}.`;
        res.json({ success: true, actionExecuted: actionType, reply, data: byPaymentMethod, history: [] });
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
