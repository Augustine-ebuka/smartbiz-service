# blaix-data-service

## Overview

TypeScript + Express API service with MongoDB (Mongoose). Provides authentication, wallet/transactions, and a bills payment module powered by Monnify VAS endpoints.

## Commands

- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Start (after build): `npm run start`

## Environment Variables

Loaded via `dotenv` in [server.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/server.ts).

- App
  - `APP_ENV`
  - `APP_PORT`
  - `APP_PREFIX_PATH`
  - `APP_FRONTEND`
- MongoDB
  - `MONGODB_URI` (used by the server)
- JWT
  - `JWT_SECRET`
  - `JWT_EXPIRE`
- Paystack
  - `PAYSTACK_API_URL`
  - `PAYSTACK_API_KEY`
  - `PAYSTACK_SECRET_KEY`
- Monnify
  - `MONNIFY_API_URL` (default: `https://sandbox.monnify.com/api/v1`)
  - `MONNIFY_API_KEY`
  - `MONNIFY_SECRET_KEY`

See `.env.example` for a template.

## Project Structure

- `src/server.ts`: Express app bootstrap, middleware wiring, Mongo connection
- `src/routes/*`: Route modules
- `src/controllers/*`: Request handlers
- `src/services/*`: Business logic
- `src/utils/*`: External integrations/utilities (Monnify integration currently lives here)
- `src/middlewares/*`: Auth + webhook middleware
- `src/models/*`: Mongoose models

## API Routes

Main router is in [routes/index.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/routes/index.ts).

- Auth: `/v1/auth/*`
- Wallet: `/v1/wallet/*`
- Transactions: `/v1/transactions/*`
- Bills (Monnify): `/v1/bills/*` via [bills.route.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/routes/bills.route.ts)

## Monnify (Bills)

Monnify integration is in [monnifyService.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/utils/monnifyService.ts) and used through [billService.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/services/billService.ts) + [billController.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/controllers/billController.ts).

Endpoints exposed under `/v1/bills`:

- `GET /biller-categories`
- `GET /biller-products/:category_code`
- `GET /biller-product-details?biller_code=...&category_code=...`
- `POST /validate-customer`
- `POST /initiate-payment`
- `GET /transaction-status?transactionReference=...`

### Initiate Payment Body (TypeScript)

Request body typing is defined as `InitiatePaymentRequest` in [monnifyService.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/utils/monnifyService.ts).

Required fields:

- `productCode: string`
- `customerId: string`
- `amount: number`
- `reference: string`

Optional fields:

- `validationReference?: string`
- `emailAddress?: string`
- `phoneNumber?: string`

## Authentication Middleware

Protected routes use `authenticateToken` from [authMiddleware.ts](file:///c:/Users/USER/Desktop/blaix-data-service/src/middlewares/authMiddleware.ts). It expects:

- `Authorization: Bearer <token>`

On success it attaches `req.userId`.

## API Response Shape

Responses are not fully standardized across all controllers. Common patterns currently in use:

- Success responses often include `success: true` or `status: "success"`, plus a `message` and `data`.
- Error responses in some places return `{ error: string }`.

When editing or adding endpoints, match the style used by the nearest controller/module unless the project is explicitly being standardized.

