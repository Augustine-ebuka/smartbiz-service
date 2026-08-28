import { Request, Response, NextFunction } from 'express';
import { createReservedAccount, initializeTransaction, verifyBankAccount,
  createMerchantSubAccount, deleteMerchantSubAccount, fetchSubAccounts, fetchBanksList, updateMerchantSubAccount,
  getCheckoutTransactionStatus } from '../utils/monnifyService';
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
import ApiError from '../utils/ApiError';
import notificationService from '../services/notificationService';

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
      merchantUserId,
      isDelivery,
      deliveryFee,
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
      isDelivery?: boolean;
      deliveryFee?: number;
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
    } else if (address && address !== customer.address) {
      // Keep the customer's address current with their latest delivery
      // address rather than leaving it stuck on whatever they entered first.
      customer.address = address;
      await customer.save();
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
      isDelivery:         Boolean(isDelivery),
      deliveryFee:        isDelivery ? deliveryFee : undefined,
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
 * GET /transactions/status/:reference
 * `reference` may be either the paymentReference or transactionReference
 * returned by /transactions/initialize.
 *
 * Public/unauthenticated — the caller here is the anonymous customer's
 * checkout callback page, not a logged-in merchant. Income is only ever
 * created inside handleMonnifyWebhook once Monnify confirms payment, so the
 * frontend must poll this (rather than assuming success from the redirect
 * alone) to know whether that webhook has actually landed yet.
 */
export const getTransactionStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { reference } = req.params;

    if (!reference) {
      res.status(400).json({
        success: false,
        error: 'reference is required',
      });
      return;
    }

    let transaction = await Transaction.findOne({
      $or: [{ payment_reference: reference }, { trans_ref: reference }],
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
      return;
    }

    // The webhook may not have landed yet — unreachable on local dev,
    // delayed, or dropped in production — so ask Monnify directly for the
    // live status rather than leaving the frontend polling a stale
    // 'pending' forever.
    if (transaction.status === 'pending') {
      try {
        const liveStatus = await getCheckoutTransactionStatus(transaction.trans_ref);
        if (liveStatus.paymentStatus === 'PAID') {
          const finalized = await finalizeSuccessfulPayment({
            transactionReference: transaction.trans_ref,
            paymentReference: liveStatus.paymentReference ?? transaction.payment_reference,
            amountPaid: liveStatus.amountPaid,
            customerName: liveStatus.customer?.name,
            customerEmail: liveStatus.customer?.email,
          });
          if (finalized) transaction = finalized;
        }
      } catch (err) {
        console.error('[Transaction Status] Monnify requery failed:', (err as Error).message);
        // fall through and report the last known local status
      }
    }

    // A multi-product sale creates one Income record per product line, each
    // with its own receiptId — there's no single receipt number that covers
    // the whole order. We surface the first one created as *the* receiptId,
    // which is exact for the (overwhelmingly common) single-product case.
    const income = await Income.findOne({ transactionId: transaction._id })
      .sort({ createdAt: 1 })
      .select('receiptId');

    res.status(200).json({
      success: true,
      data: {
        status:                transaction.status,
        amount:                transaction.amount,
        paymentReference:      transaction.payment_reference,
        transactionReference:  transaction.trans_ref,
        receiptId:             income?.receiptId ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /transactions/monnify/:transactionReference
 *
 * Authenticated — returns the full live transaction record straight from
 * Monnify (payment method, fees, settlement amount, paidOn, customer info,
 * etc.), not just the slim { status, amount, references } shape the public
 * poll endpoint exposes for the anonymous checkout page.
 *
 * Scoped to the caller's own business: the local Transaction is looked up
 * first so one business owner can't pull another's Monnify transaction
 * data just by guessing/knowing a reference.
 */
export const getMonnifyTransactionHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { transactionReference } = req.params;
    const ownerId = req.businessOwnerId as string;

    if (!transactionReference) {
      res.status(400).json({
        success: false,
        error: 'transactionReference is required',
      });
      return;
    }

    const transaction = await Transaction.findOne({ trans_ref: transactionReference })
      .select('user_id redemption products');
    if (!transaction || transaction.user_id.toString() !== ownerId) {
      res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
      return;
    }

    const [monnifyData, products] = await Promise.all([
      getCheckoutTransactionStatus(transactionReference),
      resolveTransactionProducts(transaction.products),
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...monnifyData,
        products,
        redemption: serializeRedemption(transaction),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enriches a transaction's raw product lines (only ever { product_id,
 * quantity, price } from the checkout payload) with real names from the
 * catalog, same lookup used to build the sale-notification/receipt emails.
 */
const resolveTransactionProducts = async (products: any[]) => {
  const productIds = (products || []).map((p: any) => p.product_id).filter(Boolean);
  const productDocs = await Product.find({ _id: { $in: productIds } }).select('name');
  const productNameById = new Map(productDocs.map((doc: any) => [doc._id.toString(), doc.name]));

  return (products || []).map((p: any) => ({
    productId: p.product_id,
    name:      p.name ?? productNameById.get(p.product_id?.toString()) ?? 'Product',
    quantity:  p.quantity ?? 1,
    price:     p.price    ?? 0,
  }));
};

/** Shapes a Transaction's `redemption` sub-doc for API responses, or null if unredeemed. */
const serializeRedemption = (transaction: { redemption?: any }) => {
  if (!transaction.redemption) return null;
  return {
    redeemedAt: transaction.redemption.redeemedAt,
    redeemedBy: transaction.redemption.redeemedBy,
    redeemedByName: transaction.redemption.redeemedByName,
    note: transaction.redemption.note ?? null,
  };
};

/**
 * POST /transactions/:reference/redeem
 *
 * Marks a paid transaction as physically redeemed/picked up. `:reference`
 * matches either transactionReference (trans_ref) or paymentReference
 * (payment_reference), since either could be scanned/typed. `redeemedBy`
 * comes from the auth token, never the request body, so this is a real
 * audit trail rather than a client-supplied claim.
 *
 * Idempotency is enforced by an atomic update guarded on
 * `{ redemption: { $exists: false } }` — a second call can't silently
 * overwrite who/when a payment was redeemed, it gets a 409 instead.
 */
export const redeemTransactionHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { reference } = req.params;
    const { note } = req.body ?? {};
    const ownerId = req.businessOwnerId as string;
    const redeemedById = req.userId as string;

    const transaction = await Transaction.findOne({
      $or: [{ trans_ref: reference }, { payment_reference: reference }],
    });

    if (!transaction) {
      next(new ApiError(404, 'Transaction not found.'));
      return;
    }

    if (transaction.user_id.toString() !== ownerId) {
      next(new ApiError(403, 'You do not have permission to redeem this payment.'));
      return;
    }

    if (transaction.redemption) {
      res.status(409).json({
        success: false,
        message: 'This payment has already been redeemed.',
        code: 409,
        data: serializeRedemption(transaction),
      });
      return;
    }

    const redeemer = await User.findById(redeemedById).select('firstName lastName');
    const redeemedByName = redeemer ? `${redeemer.firstName} ${redeemer.lastName}`.trim() : 'Unknown';
    const redeemedAt = new Date();

    // Atomic — only succeeds if no redemption exists yet, closing the race
    // window between the check above and this write.
    const updated = await Transaction.findOneAndUpdate(
      { _id: transaction._id, redemption: { $exists: false } },
      {
        $set: {
          redemption: {
            redeemedBy: redeemedById,
            redeemedByName,
            redeemedAt,
            note: note ?? null,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      // Lost the race — another request redeemed it between our check and write.
      const latest = await Transaction.findById(transaction._id);
      res.status(409).json({
        success: false,
        message: 'This payment has already been redeemed.',
        code: 409,
        data: serializeRedemption(latest ?? {}),
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Payment marked as redeemed.',
      data: {
        reference,
        transactionReference: updated.trans_ref,
        paymentReference: updated.payment_reference,
        ...serializeRedemption(updated),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /transactions/:reference/redemption
 * Cheap existence check for whether a payment has been redeemed yet.
 */
export const getRedemptionHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { reference } = req.params;
    const ownerId = req.businessOwnerId as string;

    const transaction = await Transaction.findOne({
      $or: [{ trans_ref: reference }, { payment_reference: reference }],
    }).select('user_id redemption');

    if (!transaction) {
      next(new ApiError(404, 'Transaction not found.'));
      return;
    }

    if (transaction.user_id.toString() !== ownerId) {
      next(new ApiError(403, 'You do not have permission to view this payment.'));
      return;
    }

    res.status(200).json({
      success: true,
      data: serializeRedemption(transaction),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /transactions/:reference/redeem
 * Lets the business owner undo an accidental redemption mark. Owner-only
 * (enforced via requireOwner on the route) — staff can redeem but not undo.
 */
export const unredeemTransactionHandler = async (
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { reference } = req.params;
    const ownerId = req.businessOwnerId as string;

    const transaction = await Transaction.findOne({
      $or: [{ trans_ref: reference }, { payment_reference: reference }],
    });

    if (!transaction) {
      next(new ApiError(404, 'Transaction not found.'));
      return;
    }

    if (transaction.user_id.toString() !== ownerId) {
      next(new ApiError(403, 'You do not have permission to modify this payment.'));
      return;
    }

    if (!transaction.redemption) {
      next(new ApiError(400, 'This payment has not been redeemed.'));
      return;
    }

    transaction.redemption = undefined;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Redemption removed.',
      data: null,
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

interface FinalizePaymentParams {
  transactionReference: string;
  paymentReference: string;
  amountPaid: number;
  customerName?: string;
  customerEmail?: string;
}

/**
 * Marks a transaction successful and runs the post-payment side effects —
 * income + stock deduction for catalog sales, plan activation for
 * subscriptions, owner/customer emails. Shared by the webhook handler and
 * the status-poll fallback (getTransactionStatusHandler) so both paths run
 * identical logic instead of two copies that can drift apart.
 *
 * Idempotent: returns the transaction as-is if it's already 'successful',
 * since Monnify retries webhook delivery and the poll fallback may also
 * race the webhook.
 */
const finalizeSuccessfulPayment = async ({
  transactionReference,
  paymentReference,
  amountPaid,
  customerName,
  customerEmail,
}: FinalizePaymentParams) => {
  const transaction = await Transaction.findOne({ trans_ref: transactionReference });
  if (!transaction) return null;

  if (transaction.status === 'successful') return transaction;

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

    await notificationService.createIfNotDuplicate({
      userId: transaction.user_id.toString(),
      type: 'new_sale',
      severity: 'info',
      title: '✅ Subscription payment received',
      message: `Your payment of ₦${amountPaid.toLocaleString('en-NG')} was received and your ${transaction.metadata.planId} plan is now active.`,
      resourceType: 'transaction',
      resourceId: transaction._id.toString(),
    }).catch(err => console.error('[Notification] Subscription notification failed:', err));

    return transaction;
  }

  // Create an income record for each product and deduct stock. All rows
  // from this one sale share a single receiptId — set explicitly from the
  // second row on — so a multi-product order reads back as one receipt
  // instead of one per line item.
  const products = transaction.products || [];
  let sharedReceiptId: string | undefined;
  for (const product of products) {
    const income = await Income.create({
      userId: transaction.user_id,
      paymentMethod: 'monnify',
      productId: product.product_id,
      unit: product.quantity,
      amount: product.quantity * product.price,
      customerId: transaction.customer_id,
      transactionId: transaction._id,
      receiptId: sharedReceiptId,
    });
    sharedReceiptId = income.receiptId;
    const { isLowStock, stockAfter } = await inventoryService.deductForSale(
      transaction.user_id.toString(),
      product.product_id.toString(),
      product.quantity,
      income._id,
      transaction.user_id.toString(),
      "Monnify"
    );
    console.log({ isLowStock, stockAfter });
  }

  // Fetch owner details for the emails
  const owner    = await User.findById(transaction.user_id).select('firstName email settings');
  const customer = await Customer.findById(transaction.customer_id).select('name email');

  const businessName  = owner?.settings?.companyProfile?.businessName ?? 'Your Business';
  const businessEmail = owner?.settings?.companyProfile?.contact?.email;
  const businessPhone = owner?.settings?.companyProfile?.contact?.phone;

  // Build product list for email — looks up real names from the catalog
  // rather than falling back to the literal string 'Product'.
  const emailProducts = await resolveTransactionProducts(transaction.products);

  const paidAt = new Date();
  const buyerName = customer?.name ?? customerName ?? 'A customer';

  // In-app notification — created regardless of whether the emails below
  // succeed, so a sale (and whether it needs delivery) is always visible in
  // the dashboard even if Resend silently fails or the mail lands in spam.
  await notificationService.createIfNotDuplicate({
    userId: transaction.user_id.toString(),
    type: 'new_sale',
    severity: 'info',
    title: transaction.isDelivery ? '🚚 New sale — delivery needed' : '💰 New sale',
    message: transaction.isDelivery
      ? `${buyerName} paid ₦${amountPaid.toLocaleString('en-NG')} and requested delivery to: ${transaction.address ?? 'address not provided'}.`
      : `${buyerName} paid ₦${amountPaid.toLocaleString('en-NG')}.`,
    resourceType: 'transaction',
    resourceId: transaction._id.toString(),
  }).catch(err => console.error('[Notification] Sale notification failed:', err));

  // 1 — Notify the business owner
  if (owner?.email) {
    emailService.sendSaleNotification({
      to:               owner.email,
      ownerName:        owner.firstName,
      businessName,
      customerName:     customer?.name ?? customerName ?? 'Customer',
      products:         emailProducts,
      totalAmount:      amountPaid,
      paymentReference,
      paidAt,
      isDelivery:       transaction.isDelivery,
      deliveryFee:      transaction.deliveryFee,
      address:          transaction.address,
    }).catch(err => console.error('[Email] Sale notification failed:', err));
  }

  // 2 — Send receipt to the customer
  const resolvedCustomerEmail = customer?.email ?? customerEmail;
  if (resolvedCustomerEmail) {
    emailService.sendPurchaseReceipt({
      to:               resolvedCustomerEmail,
      customerName:     customer?.name ?? customerName ?? 'Customer',
      businessName,
      businessEmail,
      businessPhone,
      products:         emailProducts,
      totalAmount:      amountPaid,
      paymentReference,
      paidAt,
    }).catch(err => console.error('[Email] Purchase receipt failed:', err));
  }

  console.log(`Payment confirmed for reference: ${paymentReference}, Amount: ${amountPaid}`);

  return transaction;
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
      const { paymentReference, amountPaid, paymentStatus, transactionReference, customerName, customerEmail } = eventData;

      if (paymentStatus === 'PAID') {
        const transaction = await finalizeSuccessfulPayment({
          transactionReference,
          paymentReference,
          amountPaid,
          customerName,
          customerEmail,
        });

        if (!transaction) {
          res.status(404).json({ message: 'Transaction not found' });
          return;
        }
      }
    }

    // Always respond with 200 OK so Monnify knows you received the webhook
    res.status(200).send('Webhook Received');
  } catch (error: any) {
    console.error('Webhook Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
};


