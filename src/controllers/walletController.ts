import { Request, Response, NextFunction } from 'express';
import { createReservedAccount, initializeTransaction, verifyBankAccount, 
  createMerchantSubAccount, deleteMerchantSubAccount, fetchSubAccounts, fetchBanksList, updateMerchantSubAccount } from '../utils/monnifyService';
import type { SplitConfigEntry } from '../utils/monnifyService';
import { User } from '../models/user.model';
import crypto from 'crypto';
import { Transaction } from '../models/transaction.model';
import { Income } from '../models/income.model';
import { Customer } from '../models/customer.model';
import inventoryService from '../services/inventory.service';
import {Product} from '../models/product.model';
import emailService from '../services/EmailService';
import subscriptionService from '../services/subscriptionService';
import { generateUniqueStoreSlug } from '../utils/slugify';

// Sub-accounts always receive this share of split payments; the main
// account keeps the rest. Fixed server-side — client input is ignored.
const SUB_ACCOUNT_SPLIT_PERCENTAGE = 96;

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
 *         paymentReference?, merchantUserId? }
 *
 * Initializes a payment and returns a checkoutUrl — redirect the user's
 * browser there to complete payment on Monnify's hosted window. If the
 * merchant (merchantUserId) has a Monnify sub-account on file, the split
 * is built server-side from it at SUB_ACCOUNT_SPLIT_PERCENTAGE — this
 * endpoint is public (no auth), so client-supplied split config is never
 * trusted or accepted.
 */
export const initializeTransactionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // const merchantUserId = req.userId as string;  // ← from JWT, never from body

    const {
      amount,
      customerName,
      customerEmail,
      customerPhone,
      redirectUrl,
      paymentDescription,
      address,
      products,
      merchantUserId
    }: {
      amount?: number;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      redirectUrl?: string;
      paymentDescription?: string;
      address?: string;
      products?: any[];
      merchantUserId?: string;
    } = req.body ?? {};

    if (!amount || !customerName || !customerEmail || !redirectUrl) {
      res.status(400).json({
        success: false,
        error: 'amount, customerName, customerEmail and redirectUrl are required',
      });
      return;
    }

    // Always generate server-side — never trust client-supplied references
    const paymentReference = `PF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Build the split from the merchant's own subAccountCode on file — never
    // from client input — so the service fee can't be tampered with.
    let incomeSplitConfig: SplitConfigEntry[] | undefined;
    if (merchantUserId) {
      const merchant = await User.findById(merchantUserId).select('settings.companyProfile.subAccountCode');
      const subAccountCode = merchant?.settings?.companyProfile?.subAccountCode;
      if (subAccountCode) {
        incomeSplitConfig = [{ subAccountCode, feePercentage: SUB_ACCOUNT_SPLIT_PERCENTAGE }];
      }
    }

    const transaction = await initializeTransaction({
      amount,
      customerName,
      customerEmail,
      redirectUrl,
      paymentDescription: paymentDescription ?? `Payment from ${customerName}`,
      paymentReference,
      incomeSplitConfig,
    });

    // Find or create customer — always reassign so _id is always available
    console.log(merchantUserId, "merchantUserId ..............................");
    let customer = await Customer.findOne({ email: customerEmail, userId: merchantUserId });
    if (!customer) {
      customer = await Customer.create({
        userId: merchantUserId,   // scope customer to this business owner
        name:   customerName,
        email:  customerEmail,
        phone:  customerPhone,
        address,
      });
    }

    // Map fields explicitly — don't dump the entire Monnify response into `data`
    const transactionRecord = await Transaction.create({
      amount,
      status:            'pending',
      type:              'purchase',
      trans_ref:          transaction.transactionReference,
      payment_reference:  transaction.paymentReference,
      checkout_url:       transaction.checkoutUrl,
      user_id:            merchantUserId,
      customer_id:        customer._id,
      address,
      products:           products ?? [],
    });

    res.status(200).json({
      success: true,
      data: {
        checkoutUrl:          transaction.checkoutUrl,
        transactionReference: transaction.transactionReference,
        paymentReference:     transaction.paymentReference,
        transactionId:        transactionRecord._id,
      },
    });
  } catch (error) {
    next(error);
  }
};

 
/**
 * POST /sub-accounts
 * Body: { accountNumber, bankCode, email }
 *
 * Registers a bank account as a Monnify sub-account so it can receive a
 * slice of future payments via `splitConfig` on transaction initialization.
 * The split percentage is fixed server-side (SUB_ACCOUNT_SPLIT_PERCENTAGE)
 * and not accepted from the client.
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
    }: {
      accountNumber?: string;
      bankCode?: string;
      email?: string;
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
      defaultSplitPercentage: SUB_ACCOUNT_SPLIT_PERCENTAGE,
    });

    console.log(subAccount);

    // if creation was created add subaccount code to user db
  let storeSlug: string | undefined;
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

      // Give every new merchant a memorable /store/<slug> URL up front —
      // they can still customize it later via the store-slug endpoint.
      if (!businessOwner.settings.companyProfile.storeSlug) {
        const nameSource = businessOwner.settings.companyProfile.businessName || `${businessOwner.firstName}'s Business`;
        businessOwner.settings.companyProfile.storeSlug = await generateUniqueStoreSlug(nameSource, ownerId);
      }
      storeSlug = businessOwner.settings.companyProfile.storeSlug;

      // Tell Mongoose the nested object was modified (required for mixed/nested schemas)
      businessOwner.markModified('settings.companyProfile');

      await businessOwner.save();
      // console.log(businessOwner);
    }
  }

    res.status(200).json({
      success: true,
      data: { ...subAccount, storeSlug },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * DELETE /sub-accounts/:subAccountCode
 * Permanently deletes a sub-account. Cannot be undone — make sure no
 * active `splitConfig` still references this subAccountCode first.
 *
 * Scoped to the caller's own subAccountCode (stored on their user doc) so
 * one business can't delete another business's Monnify sub-account.
 */
export const deleteSubAccountHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { subAccountCode } = req.params;
    const ownerId = req.businessOwnerId as string;

    if (!subAccountCode) {
      res.status(400).json({
        success: false,
        error: 'subAccountCode is required',
      });
      return;
    }

    const businessOwner = await User.findById(ownerId);
    if (!businessOwner || businessOwner.settings?.companyProfile?.subAccountCode !== subAccountCode) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this sub-account',
      });
      return;
    }

    await deleteMerchantSubAccount(subAccountCode);

    businessOwner.settings!.companyProfile!.subAccountCode = undefined;
    businessOwner.settings!.companyProfile!.merchantStatus = false;
    businessOwner.markModified('settings.companyProfile');
    await businessOwner.save();

    res.status(200).json({
      success: true,
      message: 'Sub-account deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /sub-accounts
 * Returns only the caller's own sub-account (looked up by the
 * subAccountCode stored on their user doc), not every merchant's
 * sub-accounts on the Monnify account.
 */
export const fetchSubAccountsHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = req.businessOwnerId as string;
    const businessOwner = await User.findById(ownerId).select('settings.companyProfile.subAccountCode');
    const ownSubAccountCode = businessOwner?.settings?.companyProfile?.subAccountCode;

    if (!ownSubAccountCode) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const subAccounts = await fetchSubAccounts();
    const list = Array.isArray(subAccounts) ? subAccounts : [];
    const ownSubAccount = list.filter(
      (account: any) => account?.subAccountCode === ownSubAccountCode,
    );

    res.status(200).json({
      success: true,
      data: ownSubAccount,
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
 * Body: { accountNumber, bankCode, email, currencyCode? }
 *
 * Updates an existing sub-account's bank details or email. The split
 * percentage is fixed server-side (SUB_ACCOUNT_SPLIT_PERCENTAGE) and not
 * accepted from the client. The subAccountCode comes from the URL here for
 * a cleaner REST shape; the service maps it into the body Monnify expects.
 *
 * Scoped to the caller's own subAccountCode (stored on their user doc) so
 * one business can't update another business's Monnify sub-account.
 */
export const updateSubAccountHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { subAccountCode } = req.params;
    const ownerId = req.businessOwnerId as string;
    const {
      accountNumber,
      bankCode,
      email,
      currencyCode,
    }: {
      accountNumber?: string;
      bankCode?: string;
      email?: string;
      currencyCode?: string;
    } = req.body ?? {};

    if (!subAccountCode || !accountNumber || !bankCode || !email) {
      res.status(400).json({
        success: false,
        error: 'subAccountCode, accountNumber, bankCode and email are required',
      });
      return;
    }

    const businessOwner = await User.findById(ownerId).select('settings.companyProfile.subAccountCode');
    if (businessOwner?.settings?.companyProfile?.subAccountCode !== subAccountCode) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to update this sub-account',
      });
      return;
    }

    const subAccount = await updateMerchantSubAccount({
      subAccountCode,
      accountNumber,
      bankCode,
      email,
      defaultSplitPercentage: SUB_ACCOUNT_SPLIT_PERCENTAGE,
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

          // Subscription upgrades aren't catalog sales — activate the plan and
          // skip the income/stock/email flow below, which assumes real products.
          if (transaction.purpose === 'subscription' && transaction.metadata?.planId) {
            await subscriptionService.activatePlan(
              transaction.user_id.toString(),
              transaction.metadata.planId,
              transactionReference
            );
            console.log(`[Subscription] Activated ${transaction.metadata.planId} for user ${transaction.user_id}`);
            res.status(200).send('Webhook Received');
            return;
          }

          // then creat an income record in db
          // loop through products and create an income record for each product
          const products = transaction.products || [];
          for (const product of products) {
            const income = await Income.create({
              userId: transaction.user_id,
              paymentMethod: 'monnify',
              productId: product.product_id,
              unit: product.quantity,
              amount: product.quantity * product.price,
              customerId: transaction.customer_id,
            });
             const { isLowStock, stockAfter } = await inventoryService.deductForSale(
                    transaction.user_id.toString(),
                    product.product_id.toString(),
                    product.quantity,
                    income._id,
                    transaction.user_id.toString(),
                    "Monnify"
                  );
                  console.log({isLowStock, stockAfter});
          }
          // After your for loop that creates income records — add this:

        // Fetch owner details for the emails
        const owner    = await User.findById(transaction.user_id).select('firstName email settings');
        const customer = await Customer.findById(transaction.customer_id).select('name email');

        const businessName  = owner?.settings?.companyProfile?.businessName ?? 'Your Business';
        const businessEmail = owner?.settings?.companyProfile?.contact?.email;
        const businessPhone = owner?.settings?.companyProfile?.contact?.phone;

        // Build product list for email (from transaction.products)
        const emailProducts = transaction.products.map((p: any) => ({
          name:     p.name     ?? 'Product',
          quantity: p.quantity ?? 1,
          price:    p.price    ?? 0,
        }));

        const paidAt = new Date();

        // 1 — Notify the business owner
        if (owner?.email) {
          emailService.sendSaleNotification({
            to:               owner.email,
            ownerName:        owner.firstName,
            businessName,
            customerName:     customer?.name ?? eventData.customerName,
            products:         emailProducts,
            totalAmount:      amountPaid,
            paymentReference: paymentReference,
            paidAt,
          }).catch(err => console.error('[Email] Sale notification failed:', err));
        }

        // 2 — Send receipt to the customer
        const customerEmail = customer?.email ?? eventData.customerEmail;
        if (customerEmail) {
          emailService.sendPurchaseReceipt({
            to:               customerEmail,
            customerName:     customer?.name ?? eventData.customerName,
            businessName,
            businessEmail,
            businessPhone,
            products:         emailProducts,
            totalAmount:      amountPaid,
            paymentReference: paymentReference,
            paidAt,
          }).catch(err => console.error('[Email] Purchase receipt failed:', err));
        }


        console.log(`Payment confirmed for reference: ${paymentReference}, Amount: ${amountPaid}`);
      }

      // After your for loop that creates income records — add this:

    }

    // Always respond with 200 OK so Monnify knows you received the webhook
    res.status(200).send('Webhook Received');
  } catch (error: any) {
    console.error('Webhook Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
};


