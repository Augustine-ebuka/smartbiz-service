import { Request, Response, NextFunction } from 'express';
import { createReservedAccount, initializeTransaction, verifyBankAccount, 
  createMerchantSubAccount, deleteMerchantSubAccount, fetchSubAccounts, fetchBanksList, updateMerchantSubAccount } from '../utils/monnifyService';
import type { SplitConfigEntry } from '../utils/monnifyService';
import { User } from '../models/user.model';
import crypto from 'crypto';
import { Transaction } from '../models/transaction.model';
import { Income } from '../models/income.model';
/**
 * POST /reserved-accounts
 * Creates a dedicated virtual account for a customer.
 *
 * Auth is handled inside the service layer (cached Bearer token), so the
 * controller's only job is: extract input, call the service, shape the
 * response. No token fetching, no Monnify request-shape details here.
 */
export const createReservedAccountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const requestPayload = req.body?.request ?? req.body;

    const reservedAccount = await createReservedAccount(requestPayload);

    res.status(200).json({
      success: true,
      data: reservedAccount,
    });
  } catch (error) {
    // Delegate to error middleware rather than hardcoding 400 here —
    // lets you distinguish validation errors (400) from upstream/Monnify
    // failures (502/503) in one place instead of per-controller.
    next(error);
  }
};

/**
 * GET /bank-accounts/verify?accountNumber=...&bankCode=...
 * Resolves an account number + bank code to the account holder's name,
 * so a client can confirm a recipient before proceeding.
 */
export const verifyBankAccountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { accountNumber, bankCode } = req.query;

    if (typeof accountNumber !== 'string' || typeof bankCode !== 'string') {
      res.status(400).json({
        success: false,
        error: 'accountNumber and bankCode are required query parameters',
      });
      return;
    }

    const account = await verifyBankAccount({ accountNumber, bankCode });

    res.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /transactions/initialize
 * Body: { amount, customerName, customerEmail, redirectUrl, paymentDescription?,
 *         paymentReference?, splitConfig? }
 *
 * Initializes a payment and returns a checkoutUrl — redirect the user's
 * browser there to complete payment on Monnify's hosted window. Pass
 * `splitConfig` to route slices of the payment to other sub-accounts
 * (e.g. vendor payouts) automatically at settlement.
 */
export const initializeTransactionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      amount,
      customerName,
      customerEmail,

      redirectUrl,
      paymentDescription,
      paymentReference,
      splitConfig,
      merchantUserId,
      address,
      products

    }: {
      amount?: number;
      customerName?: string;
      customerEmail?: string;
      redirectUrl?: string;
      paymentDescription?: string;
      paymentReference?: string;
      splitConfig?: SplitConfigEntry[];
      merchantUserId?: string;
      address?: string;
      products?: any[];
    } = req.body ?? {};

    if (!amount || !customerName || !customerEmail || !redirectUrl) {
      res.status(400).json({
        success: false,
        error: 'amount, customerName, customerEmail and redirectUrl are required',
      });
      return;
    }
    console.log(req.body, "request body ..............................");
    const transaction = await initializeTransaction({
      amount,
      customerName,
      customerEmail,
      redirectUrl,
      paymentDescription: paymentDescription ?? `Payment from ${customerName}`,
      paymentReference,
      incomeSplitConfig: splitConfig,
    });

    console.log(transaction, "transaction ..............................");

    // create a transaction record in db
    const transactionRecord = await Transaction.create({
      data: transaction,
      amount,
      status: 'pending',
      type: 'purchase',
      trans_ref: transaction.transactionReference,
      payment_reference: transaction.paymentReference,
      user_id: merchantUserId,
      address,
      products,
    });


    console.log(transactionRecord, "transactionRecord ..............................");

    // transaction.checkoutUrl is where the client should redirect the user
    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

 
/**
 * POST /sub-accounts
 * Body: { accountNumber, bankCode, email, defaultSplitPercentage? }
 *
 * Registers a bank account as a Monnify sub-account so it can receive a
 * slice of future payments via `splitConfig` on transaction initialization.
 */
export const createSubAccountHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      accountNumber,
      bankCode,
      email,
      defaultSplitPercentage,
      
    }: {
      accountNumber?: string;
      bankCode?: string;
      email?: string;
      defaultSplitPercentage?: number;
    } = req.body ?? {};
 
    if (!accountNumber || !bankCode || !email) {
      res.status(400).json({
        success: false,
        error: 'accountNumber, bankCode and email are required',
      });
      return;
    }
     const ownerId = req.businessOwnerId as string;
     console.log(ownerId);
 
    const subAccount = await createMerchantSubAccount({
      accountNumber,
      bankCode,
      email,
      defaultSplitPercentage,
    });

    console.log(subAccount);

    // if creation was created add subaccount code to user db
  if (subAccount?.subAccountCode) {
  const businessOwner = await User.findById(ownerId);

    if (businessOwner) {
      // Ensure nested objects exist before assigning
      if (!businessOwner.settings) {
        businessOwner.settings = {};
      }
      if (!businessOwner.settings.companyProfile) {
        businessOwner.settings.companyProfile = {};
      }

      businessOwner.settings.companyProfile.subAccountCode = subAccount.subAccountCode;
      businessOwner.settings.companyProfile.merchantStatus = true;

      // Tell Mongoose the nested object was modified (required for mixed/nested schemas)
      businessOwner.markModified('settings.companyProfile');

      await businessOwner.save();
      // console.log(businessOwner);
    }
  }

    res.status(200).json({
      success: true,
      data: subAccount,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * DELETE /sub-accounts/:subAccountCode
 * Permanently deletes a sub-account. Cannot be undone — make sure no
 * active `splitConfig` still references this subAccountCode first.
 */
export const deleteSubAccountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { subAccountCode } = req.params;
 
    if (!subAccountCode) {
      res.status(400).json({
        success: false,
        error: 'subAccountCode is required',
      });
      return;
    }
 
    await deleteMerchantSubAccount(subAccountCode);
 
    res.status(200).json({
      success: true,
      message: 'Sub-account deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const fetchSubAccountsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const subAccounts = await fetchSubAccounts();
    res.status(200).json({
      success: true,
      data: subAccounts,
    });
  } catch (error) {
    next(error);
  }
};

export const fetchBanksListHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const banksList = await fetchBanksList();
    res.status(200).json({
      success: true,
      data: banksList,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /sub-accounts/:subAccountCode
 * Body: { accountNumber, bankCode, email, defaultSplitPercentage, currencyCode? }
 *
 * Updates an existing sub-account's bank details, email, or split
 * percentage. The subAccountCode comes from the URL here for a cleaner
 * REST shape; the service maps it into the body Monnify expects.
 */
export const updateSubAccountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { subAccountCode } = req.params;
    const {
      accountNumber,
      bankCode,
      email,
      defaultSplitPercentage,
      currencyCode,
    }: {
      accountNumber?: string;
      bankCode?: string;
      email?: string;
      defaultSplitPercentage?: number;
      currencyCode?: string;
    } = req.body ?? {};
 
    if (!subAccountCode || !accountNumber || !bankCode || !email || defaultSplitPercentage === undefined) {
      res.status(400).json({
        success: false,
        error: 'subAccountCode, accountNumber, bankCode, email and defaultSplitPercentage are required',
      });
      return;
    }
 
    const subAccount = await updateMerchantSubAccount({
      subAccountCode,
      accountNumber,
      bankCode,
      email,
      defaultSplitPercentage,
      currencyCode,
    });
 
    res.status(200).json({
      success: true,
      data: subAccount,
    });
  } catch (error) {
    next(error);
  }
};

export const handleMonnifyWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const monnifySignature = req.headers['monnify-signature'];
    const secretKey = process.env.MONNIFY_SECRET_KEY || '';

    // 1. Verify webhook authenticity (Security check)
    // Compute HMAC SHA512 signature using your raw request body and secret key
    const computedSignature = crypto
      .createHmac('sha512', secretKey)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (monnifySignature !== computedSignature) {
      res.status(401).json({ message: 'Invalid transaction signature' });
      return;
    }

    const { eventType, eventData } = req.body;

    // 2. Check for successful transaction event
    if (eventType === 'SUCCESSFUL_TRANSACTION') {
      const { paymentReference, amountPaid, paymentStatus, transactionReference } = eventData;

      if (paymentStatus === 'PAID') {
        /*
          👉 DATABASE LOGIC:
          1. Find the order/cart matching `paymentReference`.
          2. Check if the order is already marked as PAID (to avoid duplicate processing).
          3. Mark order as PAID in MongoDB.
          4. Reduce inventory/stock or trigger order fulfillment.
        */

          const transaction = await Transaction.findOne({ trans_ref: transactionReference });
          if (!transaction) {
            res.status(404).json({ message: 'Transaction not found' });
            return;
          }
          // Update transaction status and payment reference
          transaction.status = 'successful';
          transaction.payment_reference = paymentReference;
          await transaction.save();

          // then creat an income record in db
          // loop through products and create an income record for each product
          const products = transaction.products || [];
          for (const product of products) {
            await Income.create({
              userId: transaction.user_id,
              paymentMethod: 'monnify',
              productId: product.product_id,
              unit: product.quantity,
              amount: product.quantity * product.price,
            });
          }
          await Income.create({
            userId: transaction.user_id,
            amount: amountPaid,
            transactionId: transaction._id,
          });
        console.log(`Payment confirmed for reference: ${paymentReference}, Amount: ${amountPaid}`);
      }
    }

    // Always respond with 200 OK so Monnify knows you received the webhook
    res.status(200).send('Webhook Received');
  } catch (error: any) {
    console.error('Webhook Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
};


