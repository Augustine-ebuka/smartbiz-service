import {getBillerCategories, getBillerProducts, initiatePayment, InitiatePaymentRequest, getBillerProductDetails, validateCustomer, getTransactionStatus, getBillerCode} from '../utils/monnifyService';
class BillService {
   
    async getBillerCategories() {
        return await getBillerCategories();
    }
    async getBillerProducts(categoryCode: string) {
        return await getBillerProducts(categoryCode);
    }
    async initiatePayment(paymentRequest: InitiatePaymentRequest) {
        return await initiatePayment(paymentRequest);
    }

    async getBillerProductDetails(billerCode: string, categoryCode: string) {
        return await getBillerProductDetails(billerCode, categoryCode);
    }

    // Validate customer details
    async validateCustomer({productCode, customerId}: {productCode: string, customerId: string}) {
        return await validateCustomer({productCode, customerId});
    }
    // Get transaction status
    async getTransactionStatus(transactionReference: string) {
        return await getTransactionStatus(transactionReference);
    }

    // Get biller code
    async getBillerCode(categoryCode: string) {
        return await getBillerCode(categoryCode);
    }
}


export default new BillService();
