import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from the project root .env file before any other imports
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });
dotenv.config();
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import route from './routes/index';
import { APP_NAME, APP_PREFIX_PATH, IS_TEST, APP_PORT, APP_FRONTEND, IS_PRODUCTION, MONGODB_URI } from './config/config'
import ApiError from './utils/ApiError';
import { initCronJobs } from './utils/cronjobs';
const app = express();
const PORT = process.env.PORT || APP_PORT;

app.use(helmet());

async function dropLegacyUserOtpTtlIndexes() {
  const usersCollection = mongoose.connection.collection('users');
  const indexes = await usersCollection.indexes();

  const legacyOtpTtlIndexes = indexes.filter((index) => {
    const keys = Object.keys(index.key ?? {});
    return (
      keys.length === 1 &&
      index.key?.otpExpiresAt === 1 &&
      typeof index.expireAfterSeconds === 'number'
    );
  });

  if (!legacyOtpTtlIndexes.length) {
    return;
  }

  for (const index of legacyOtpTtlIndexes) {
    if (!index.name) {
      continue;
    }

    await usersCollection.dropIndex(index.name);
    console.log(`Dropped legacy TTL index on users.${index.name}`);
  }
}

// invoiceNumber used to be globally unique instead of unique-per-business,
// which meant two different users could collide on the same auto-generated
// number (e.g. both users' first invoice computing to "INV-00001"). The
// schema now declares a compound { userId, invoiceNumber } unique index
// instead — this drops the stale global one left over in MongoDB from before,
// since Mongoose never migrates/removes old indexes on its own.
async function dropLegacyGlobalInvoiceNumberIndex() {
  const invoicesCollection = mongoose.connection.collection('invoices');
  const indexes = await invoicesCollection.indexes();

  const legacyIndex = indexes.find((index) => {
    const keys = Object.keys(index.key ?? {});
    return keys.length === 1 && index.key?.invoiceNumber === 1 && index.unique;
  });

  if (!legacyIndex?.name) {
    return;
  }

  await invoicesCollection.dropIndex(legacyIndex.name);
  console.log(`Dropped legacy global-unique index on invoices.${legacyIndex.name}`);
}

// Same issue as invoiceNumber above, but for incomes.receiptId — it used to
// be globally unique, so two different users' second-ever sale (both
// computing to "RCT-00002") collide on the stale global index even though
// the schema now declares a compound { userId, receiptId } unique index.
async function dropLegacyGlobalReceiptIdIndex() {
  const incomesCollection = mongoose.connection.collection('incomes');
  const indexes = await incomesCollection.indexes();

  const legacyIndex = indexes.find((index) => {
    const keys = Object.keys(index.key ?? {});
    return keys.length === 1 && index.key?.receiptId === 1 && index.unique;
  });

  if (!legacyIndex?.name) {
    return;
  }

  await incomesCollection.dropIndex(legacyIndex.name);
  console.log(`Dropped legacy global-unique index on incomes.${legacyIndex.name}`);
}

// receiptId used to be unique per (userId, receiptId) — one row per receipt.
// Multi-product sales now deliberately reuse the same receiptId across every
// product-line row from one sale, so that constraint would reject the 2nd+
// row. The schema now declares that index without `unique` — this drops the
// stale unique one left over in MongoDB from before.
async function dropLegacyReceiptIdUniqueIndex() {
  const incomesCollection = mongoose.connection.collection('incomes');
  const indexes = await incomesCollection.indexes();

  const legacyIndex = indexes.find((index) => {
    const keys = Object.keys(index.key ?? {});
    return keys.length === 2 && index.key?.userId === 1 && index.key?.receiptId === 1 && index.unique;
  });

  if (!legacyIndex?.name) {
    return;
  }

  await incomesCollection.dropIndex(legacyIndex.name);
  console.log(`Dropped legacy unique index on incomes.${legacyIndex.name}`);
}

app.use(express.json());

const webhookBasePaths = [APP_PREFIX_PATH, '/'];

webhookBasePaths.forEach((basePath) => {
  app.use(
    `${basePath.replace(/\/$/, '')}/transactions/paystack-webhook`,
    express.raw({ type: 'application/json' })
  );
  app.use(
    `${basePath.replace(/\/$/, '')}/v1/whatsapp/webhook`,
    express.raw({ type: 'application/json' })
  );
});
const configuredAllowedOrigins = APP_FRONTEND
  ? APP_FRONTEND.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

const isLocalhostOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return isHttp && isLocalhost;
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin: string) => {
  if (configuredAllowedOrigins.includes(origin)) return true;
  if (!IS_PRODUCTION && isLocalhostOrigin(origin)) return true;
  return false;
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin) || origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    console.error(`Blocked by CORS: origin '${origin}' not allowed`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

const routePrefixes = [APP_PREFIX_PATH, APP_PREFIX_PATH === '/' ? null : '/'].filter(Boolean) as string[];
routePrefixes.forEach((prefix) => {
  app.use(prefix, route);
});

app.use((req, res, next) => {
  next(new ApiError(404, 'Route not found.'));
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const statusCode = err?.statusCode || err?.status || 500;
  const message = err?.message || 'Internal server error';
  const data = err?.data ?? null;

  res.status(statusCode).json({
    message,
    code: statusCode,
    data,
  });
});

// Connect to MongoDB
const MongoDB_URI = MONGODB_URI as string | undefined;

async function startServer() {
  if (!MongoDB_URI) {
    console.error('Missing MONGODB_URI. Check your .env file in the project root.');
    process.exit(1);
  }

  try {
    await mongoose.connect(MongoDB_URI, {
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    } as mongoose.ConnectOptions);

    await dropLegacyUserOtpTtlIndexes();
    await dropLegacyGlobalInvoiceNumberIndex();
    await dropLegacyGlobalReceiptIdIndex();
    await dropLegacyReceiptIdUniqueIndex();

    console.log('Connected to MongoDB successfully');

    initCronJobs();

    app.get('/', (req, res) => {
      res.send('Utility Bill Service API');
    });

    app.get(`${APP_PREFIX_PATH}`, (req, res) => {
      res.send('Utility Bill Service API');
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

startServer();
