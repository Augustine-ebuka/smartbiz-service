import axios from 'axios';
import { breakPoint, MONNIFY_CONFIG } from '../config/config';

/**
 * Interface for initiating a Monnify vending/payment transaction.
 */
export interface InitiatePaymentRequest {
  /** The unique code for the product being purchased (required) */
  productCode: string;
  /** The customer's identifier, e.g., phone number or meter number (required) */
  customerId: string;
  /** A reference obtained from the customer validation endpoint (optional) */
  validationReference?: string;
  /** The amount for the transaction (required) */
  amount: number;
  /** The customer's email address for notifications (optional) */
  emailAddress?: string;
  /** The customer's phone number (optional) */
  phoneNumber?: string;
  /** A unique reference for this transaction (required) */
  reference: string;
}

// Create a Monnify axios instance
const monnifyAxios = axios.create({
  baseURL: MONNIFY_CONFIG.host,
});

// Interceptor to add Basic Auth header to every request
monnifyAxios.interceptors.request.use(
  (config) => {
    const authString = `${MONNIFY_CONFIG.apiKey}:${MONNIFY_CONFIG.secretKey}`;
    const encodedAuthString = Buffer.from(authString).toString('base64');
    config.headers.Authorization = `Basic ${encodedAuthString}`;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Authenticates with Monnify and retrieves an access token.
 * This can be used for endpoints that require Bearer token authentication.
 * @returns {Promise<string>} The access token.
 */
export const getAccessToken = async (): Promise<string> => {
  try {
    const authString = `${MONNIFY_CONFIG.apiKey}:${MONNIFY_CONFIG.secretKey}`;
    console.log(authString)
    breakPoint()
    const encodedAuthString = Buffer.from(authString).toString('base64');
    
    const response = await axios.post(`${MONNIFY_CONFIG.host}/auth/login`, {}, {
      headers: {
        Authorization: `Basic ${encodedAuthString}`,
      },
    });

    if (response.data.requestSuccessful && response.data.responseBody) {
      return response.data.responseBody.accessToken;
    }
    throw new Error(response.data.responseMessage || 'Failed to get access token');
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.responseMessage || error.message);
    }
    throw error;
  }
};

/**
 * Fetches all biller categories from Monnify.
 * @returns {Promise<any>} The biller categories data.
 */
export const getBillerCategories = async () => {
  try {
    const response = await monnifyAxios.get('/vas/bills-payment/biller-categories');
    return response?.data?.responseBody || [];
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.responseMessage || error.message);
    }
    throw error;
  }
};

/**
 * Retrieves a paginated list of products available for a specific biller by passing their biller code.
 * @returns {Promise<any>} The biller categories data.
 */

export const getBillerProducts = async (billerCode: string) => {
  try {
    console.log(billerCode)
    const response = await monnifyAxios.get(`/vas/bills-payment/billers?category_code=${billerCode}`);
    console.log(response.data.responseBody)
    return response?.data?.responseBody || [];
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.responseMessage || error.message);
    }
    throw error;
  }
};

export const getBillerProductDetails = async (billerCode: string, categoryCode: string) => {
  try {
    console.log(billerCode,"billerCode is this")
    console.log(categoryCode,"categoryCode")
    const response = await monnifyAxios.get(`/vas/bills-payment/biller-products?biller_code=${billerCode}&category_code=${categoryCode}`);
    console.log(response.data.responseBody)
    return response?.data?.responseBody || {};

  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.responseMessage || error.message);
    }
    throw error;
  }
};

// get biller code 
export const getBillerCode = async (categoryCode: string) => {
  try {
    const response = await monnifyAxios.get(`/vas/bills-payment/billers?category_code=${categoryCode}`);
    console.log(response.data.responseBody)
    return response?.data?.responseBody || [];
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.responseMessage || error.message);
    }
    throw error;
  }
};


/**
 * Initiates a payment or vending transaction for a specific product, such as airtime top-up or a utility bill payment.
 * @param {InitiatePaymentRequest} paymentRequest - The transaction details.
 * @returns {Promise<any>} The response data from Monnify.
 */
export const initiatePayment = async (paymentRequest: InitiatePaymentRequest) => {
  try {
    const response = await monnifyAxios.post('/vas/bills-payment/vend', paymentRequest);
    console.log(response,"response")
 
    return response?.data?.responseBody || {};
  } catch (error: any) {
    console.log(error.response?.data, "error.data")
    throw new Error(error?.response?.data?.responseMessage || error.message);
  }
};

// Validate customer details
export const validateCustomer = async ({productCode, customerId}: {productCode: string, customerId: string}) => {
  try {
    const response = await monnifyAxios.post('/vas/bills-payment/validate-customer', { productCode, customerId });
    console.log(response.data.responseBody)
    return response?.data?.responseBody || {};
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.log(error)
      throw new Error(error.response?.data?.responseMessage || error.message);
    }
    throw error;
  }

};

  export const getTransactionStatus = async (transactionReference: string) => {
// Checks and retrieves the final status of a previously initiated transaction using its unique reference
    try {
      const response = await monnifyAxios.get(`/vas/bills-payment/requery?reference=${transactionReference}`);
      return response?.data?.responseBody || {};
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
      
        throw new Error(error.response?.data?.responseMessage || error.message);
      }
      throw error;
    }
  };





