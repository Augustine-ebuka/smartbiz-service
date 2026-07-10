import crypto from "crypto";
// @ts-ignore
import axios from 'axios';
import { PAYSTACK_CONFIG } from '../config/config';
import { Transaction } from '../models/transaction.model';
import { Wallet } from '../models/wallet.model';
// initialize paystack axios instance
const paystackAxios = axios.create({
  baseURL: PAYSTACK_CONFIG.host,    
  headers: {
    'Authorization': `Bearer ${PAYSTACK_CONFIG.key}`,
    'Content-Type': 'application/json',
  },
});

// create a paystack transaction
export const createTransaction = async (data: any) => {
  try {
    const response = await paystackAxios.post('/transaction/initialize', data);
    return response.data;
  } catch (error) {
    throw error;
  }
};


export async function paystackWebhook(req: any, res: any) {

const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(req.body)
    .digest("hex");

if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Invalid signature");
}

const event = JSON.parse(req.body);

if (event.event === "charge.success") {

    const reference = event.data.reference;

    const transaction = await Transaction.findOne({ trans_ref: reference });

    if (!transaction) return res.sendStatus(200);

    if (transaction.status === "successful") return res.sendStatus(200);

    const verify = await verifyTransaction(reference);

    if (verify.data.status !== "success") return res.sendStatus(200);

    const amount = verify.data.amount / 100;

    await Wallet.updateOne(
    { user_id: transaction.user_id },
    { $inc: { balance: amount } }
    );

    transaction.status = "successful";
    await transaction.save();
}

res.sendStatus(200);
}
export const verifyTransaction = async (reference: string) => {
  try {
    const response = await paystackAxios.get(`/transaction/verify/${reference}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const transferFunds = async (data: any) => {
  try {
    const response = await paystackAxios.post('/transfer', data);
    return response.data;
  } catch (error) {
    throw error;
  }
};

