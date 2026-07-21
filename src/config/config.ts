import ApiError from "../utils/ApiError";
import * as process from "process";

export const ENVIRONMENT = process.env.APP_ENV || "development";
export const IS_PRODUCTION = ENVIRONMENT === "production";
export const IS_TEST = ENVIRONMENT === "test";
export const APP_URL = process.env.APP_URL;
export const APP_FRONTEND = process.env.APP_FRONTEND;
export const APP_PORT = Number(process.env.APP_PORT) || 5030;
export const APP_PREFIX_PATH = process.env.APP_PREFIX_PATH || "/";
export const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URI;
export const JWT_SECRET = process.env.JWT_SECRET || "thT9x1TP9y2022Serv1ceis";
export const JWT_EXPIRE = process.env.JWT_EXPIRE || "1d";
export const SUB_ACCOUNT_AMOUNT = process.env.SUB_ACCOUNT_AMOUNT || 2000;

// export const BCC_EMAILS = ["sunday.odoh@taxtech.com.ng"];

export const DB = {
  USER: process.env.DB_USER,
  PASSWORD: process.env.DB_USER_PWD,
  HOST: process.env.DB_HOST,
  NAME: process.env.DB_NAME,
  PORT: Number(process.env.DB_PORT) || 27017,
};

export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
};

export const PAYSTACK_CONFIG = {
  host: process.env.PAYSTACK_API_URL,
  key: process.env.PAYSTACK_API_KEY,
};

export const MONNIFY_CONFIG = {
  host: process.env.MONNIFY_API_URL || "https://sandbox.monnify.com/api/v1",
  apiKey: process.env.MONNIFY_API_KEY,
  secretKey: process.env.MONNIFY_SECRET_KEY,
  config: process.env.MONNIFY_CONFIG || 1019252431,
};




export const DB_URI = process.env.DB_URI;
export const APP_NAME = process.env.APP_NAME;



export const breakPoint = () => {
  throw new ApiError(200, "break point");
};




