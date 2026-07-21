import axios, { AxiosInstance, AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { MONNIFY_CONFIG } from '../config/config';

/**
 * Monnify API service.
 *
 * Design notes:
 * - A single axios instance is shared by every call in this file.
 * - Authentication uses a cached Bearer token (Monnify's `/auth/login` handshake),
 *   refreshed automatically ~1 minute before expiry so callers never have to
 *   think about auth. This replaces the previous mix of per-request Basic auth
 *   and repeated login calls scattered across individual functions.
 * - All requests share one error-normalization helper so failures always
 *   surface as a plain `Error` with Monnify's `responseMessage`, if present.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitiatePaymentRequest {
  /** The unique code for the product being purchased */
  productCode: string;
  /** The customer's identifier, e.g. phone number or meter number */
  customerId: string;
  /** Reference obtained from the customer validation endpoint */
  validationReference?: string;
  amount: number;
  emailAddress?: string;
  phoneNumber?: string;
  /** A unique reference for this transaction */
  reference: string;
}

export interface ValidateCustomerRequest {
  productCode: string;
  customerId: string;
}

export interface CreateSubAccountRequest {
  accountNumber: string;
  bankCode: string;
  email: string;
  /** Percentage of routed funds this sub-account receives. Defaults to 100. */
  defaultSplitPercentage?: number;
}

export interface UpdateReservedAccountKycRequest {
  accountReference: string;
  /** Provide either bvn or nin (not both required) */
  bvn?: string;
  nin?: string;
}

export interface VerifyBankAccountRequest {
  accountNumber: string;
  bankCode: string;
}

export interface VerifyBankAccountResponse {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

/**
 * Routes a portion of a single payment to another sub-account
 * (e.g. a vendor, partner, or commission recipient) at settlement time.
 * Provide either feePercentage/splitAmount depending on how you want that
 * slice calculated — Monnify supports both on the same entry.
 */
export interface SplitConfigEntry {
  /** The sub-account this slice of the payment goes to (see createMerchantSubAccount) */
  subAccountCode: string;
  /** Percentage of the transaction amount routed to this sub-account */
  feePercentage?: number;
  /** Fixed amount routed to this sub-account, as an alternative to feePercentage */
  splitAmount?: number;
  /** Whether this sub-account absorbs Monnify's transaction fee for its slice */
  feeBearer?: boolean;
}

export interface InitializeTransactionRequest {
  amount: number;
  customerName: string;
  customerEmail: string;
  paymentDescription: string;
  redirectUrl: string;
  /** Unique reference for this transaction. Auto-generated if omitted. */
  paymentReference?: string;
  currencyCode?: string;
  paymentMethods?: string[];
  /** Splits this payment across one or more sub-accounts at settlement */
  incomeSplitConfig?: SplitConfigEntry[];
}

export interface InitializeTransactionResponse {
  transactionReference: string;
  paymentReference: string;
  /** URL to redirect the user to Monnify's hosted payment page */
  checkoutUrl: string;
  enabledPaymentMethod: string[];
}

interface MonnifyEnvelope<T> {
  requestSuccessful: boolean;
  responseMessage: string;
  responseBody: T;
}

interface LoginResponseBody {
  accessToken: string;
  expiresIn: number; // seconds
}

export interface UpdateSubAccountRequest {
  subAccountCode: string;
  accountNumber: string;
  bankCode: string;
  email: string;
  defaultSplitPercentage: number;
  currencyCode?: string;
}
// ---------------------------------------------------------------------------
// Auth: cached token, refreshed transparently
// ---------------------------------------------------------------------------

const TOKEN_REFRESH_BUFFER_MS = 60_000; // refresh 1 minute before expiry

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const basicAuthHeader = (): string => {
  const credentials = `${MONNIFY_CONFIG.apiKey}:${MONNIFY_CONFIG.secretKey}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
};

const login = async (): Promise<LoginResponseBody> => {
  const response = await axios.post<MonnifyEnvelope<LoginResponseBody>>(
    `${MONNIFY_CONFIG.host}/auth/login`,
    {},
    { headers: { Authorization: basicAuthHeader() } },
  );

  if (!response.data.requestSuccessful || !response.data.responseBody?.accessToken) {
    throw new Error(response.data.responseMessage || 'Failed to authenticate with Monnify');
  }

  return response.data.responseBody;
};

/**
 * Returns a valid access token, reusing the cached one if it hasn't expired.
 */
const getAccessToken = async (): Promise<string> => {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const { accessToken, expiresIn } = await login();
  cachedToken = accessToken;
  tokenExpiresAt = Date.now() + expiresIn * 1000 - TOKEN_REFRESH_BUFFER_MS;

  return cachedToken;
};

// ---------------------------------------------------------------------------
// Shared HTTP client
// ---------------------------------------------------------------------------

// MONNIFY_CONFIG.host already includes the version segment, e.g.
// "https://sandbox.monnify.com/api/v1" — do NOT add /api/v1 again in paths below.
// v2Base is derived the same way for the one endpoint (reserved accounts)
// that lives under /api/v2 instead of /api/v1.
const v2Base = MONNIFY_CONFIG.host.replace(/\/v1$/, '/v2');

const client: AxiosInstance = axios.create({ baseURL: MONNIFY_CONFIG.host });

client.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Normalizes Monnify/axios errors into a plain Error with a useful message.
 */
const toError = (error: unknown, fallbackMessage: string): Error => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<MonnifyEnvelope<unknown>>;
    return new Error(axiosError.response?.data?.responseMessage || axiosError.message);
  }
  return error instanceof Error ? error : new Error(fallbackMessage);
};

/**
 * Executes a Monnify request and unwraps `responseBody`, with consistent
 * error handling. `fallback` is returned only when the caller wants an
 * empty-collection default (e.g. `[]`) instead of a thrown error.
 */
const request = async <T>(
  fn: () => Promise<{ data: MonnifyEnvelope<T> }>,
  errorMessage: string,
): Promise<T> => {
  try {
    const response = await fn();
    return response.data.responseBody;
  } catch (error) {
    throw toError(error, errorMessage);
  }
};

// ---------------------------------------------------------------------------
// Billers & products
// ---------------------------------------------------------------------------

export const getBillerCategories = () =>
  request(
    () => client.get('/vas/bills-payment/biller-categories'),
    'Failed to fetch biller categories',
  );

/** Lists billers for a category (e.g. electricity, airtime, cable TV). */
export const getBillersByCategory = (categoryCode: string) =>
  request(
    () => client.get(`/vas/bills-payment/billers?category_code=${categoryCode}`),
    'Failed to fetch billers for category',
  );

export const getBillerProductDetails = (billerCode: string, categoryCode: string) =>
  request(
    () =>
      client.get(
        `/vas/bills-payment/biller-products?biller_code=${billerCode}&category_code=${categoryCode}`,
      ),
    'Failed to fetch biller product details',
  );

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const validateCustomer = ({ productCode, customerId }: ValidateCustomerRequest) =>
  request(
    () => client.post('/vas/bills-payment/validate-customer', { productCode, customerId }),
    'Failed to validate customer',
  );

export const initiatePayment = (paymentRequest: InitiatePaymentRequest) =>
  request(
    () => client.post('/vas/bills-payment/vend', paymentRequest),
    'Failed to initiate payment',
  );

/** Checks the final status of a previously initiated transaction. */
export const getTransactionStatus = (transactionReference: string) =>
  request(
    () => client.get(`/vas/bills-payment/requery?reference=${transactionReference}`),
    'Failed to fetch transaction status',
  );

// ---------------------------------------------------------------------------
// Reserved accounts, sub-accounts & KYC
// ---------------------------------------------------------------------------

/** Creates a dedicated virtual account for a customer. `payload` follows Monnify's reserved-account schema. */
export const createReservedAccount = (payload: Record<string, unknown>) =>
  request(
    () => client.post('/bank-transfer/reserved-accounts', payload, { baseURL: v2Base }),
    'Failed to create reserved account',
  );

export const updateReservedAccountKyc = ({
  accountReference,
  bvn,
  nin,
}: UpdateReservedAccountKycRequest) => {
  if (!bvn && !nin) {
    return Promise.reject(new Error('Either BVN or NIN must be provided to update KYC settings'));
  }

  return request(
    () =>
      client.put(`/bank-transfer/reserved-accounts/${accountReference}/kyc-info`, {
        ...(bvn && { bvn }),
        ...(nin && { nin }),
      }),
    'Failed to update reserved account KYC',
  );
};

export const createMerchantSubAccount = ({
  accountNumber,
  bankCode,
  email,
  defaultSplitPercentage = 100,
}: CreateSubAccountRequest) =>
  request(
    () =>
      client.post('/sub-accounts', [
        { currencyCode: 'NGN', accountNumber, bankCode, email, defaultSplitPercentage },
      ]),
    'Failed to create sub-account',
  ).then((subAccounts) => (Array.isArray(subAccounts) ? subAccounts[0] ?? null : null));

/**
 * Updates an existing sub-account's bank details, email, currency, or
 * split percentage. `subAccountCode` identifies which sub-account to
 * update and is sent in the body, not the URL — that's how Monnify's API
 * expects it for this endpoint specifically.
 */
export const updateMerchantSubAccount = ({
  subAccountCode,
  accountNumber,
  bankCode,
  email,
  defaultSplitPercentage,
  currencyCode = 'NGN',
}: UpdateSubAccountRequest) =>
  request(
    () =>
      client.put('/sub-accounts', {
        subAccountCode,
        currencyCode,
        accountNumber,
        bankCode,
        email,
        defaultSplitPercentage,
      }),
    'Failed to update sub-account',
  ).then((subAccounts) => (Array.isArray(subAccounts) ? subAccounts[0] ?? null : null));


/**
 * Permanently deletes a sub-account. This cannot be undone — any
 * `splitConfig` entries referencing this `subAccountCode` will start
 * failing once it's gone, so make sure nothing still points to it.
 */
export const deleteMerchantSubAccount = (subAccountCode: string) =>
  request<void>(
    () => client.delete(`/sub-accounts/${subAccountCode}`),
    'Failed to delete sub-account',
  );


  // fetch sub-accounts
export const fetchSubAccounts = () =>
  request(() => client.get('/sub-accounts'), 'Failed to fetch sub-accounts');

export const fetchBanksList = () =>
  request(() => client.get('/banks'), 'Failed to fetch banks list');

/**
 * Resolves an account number + bank code to the account holder's name
 * (Monnify's "Name Enquiry" endpoint). Use this to let a user confirm a
 * recipient's account before you save it or send money to it.
 */
export const verifyBankAccount = ({ accountNumber, bankCode }: VerifyBankAccountRequest) =>
  request<VerifyBankAccountResponse>(
    () =>
      client.get(
        `/disbursements/account/validate?accountNumber=${accountNumber}&bankCode=${bankCode}`,
      ),
    'Failed to verify bank account number',
  );

/**
 * Initializes a payment and returns a `checkoutUrl` — redirect the user
 * there to complete payment on Monnify's hosted page. Pass
 * `incomeSplitConfig` to automatically route slices of the payment to
 * other sub-accounts (see `SplitConfigEntry`).
 */
export const initializeTransaction = ({
  amount,
  customerName,
  customerEmail,
  paymentDescription,
  redirectUrl,
  paymentReference = randomUUID(),
  currencyCode = 'NGN',
  paymentMethods = ['CARD', 'ACCOUNT_TRANSFER'],
  incomeSplitConfig,
}: InitializeTransactionRequest) =>
  request<InitializeTransactionResponse>(
    () =>
      client.post('/merchant/transactions/init-transaction', {
        amount,
        customerName,
        customerEmail,
        paymentDescription,
        paymentReference,
        currencyCode,
        contractCode: MONNIFY_CONFIG.config,
        redirectUrl,
        paymentMethods,
        ...(incomeSplitConfig && incomeSplitConfig.length > 0 && { incomeSplitConfig }),
      }),
    'Failed to initialize transaction',
  );

  