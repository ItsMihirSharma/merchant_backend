# Web3Pay Merchant Backend - Complete Implementation Guide

## 🎯 Project Overview

Production-ready Express + TypeScript backend API with:
- Webhook receiver with signature verification
- On-chain transaction verification using ethers.js
- PostgreSQL database with Prisma ORM
- WebSocket server for real-time updates
- Email notifications
- Confirmation monitoring service
- Admin dashboard API

## 📦 Installation Status

✅ **Dependencies Installed**:
- express, cors, helmet, dotenv
- zod (validation)
- ethers@6 (blockchain)
- socket.io (WebSocket)
- jsonwebtoken, bcryptjs (auth)
- nodemailer (email)
- @prisma/client
- TypeScript + dev dependencies

## 📁 Project Structure

```
merchant-backend/
├── src/
│   ├── controllers/
│   │   ├── webhookController.ts    ⏳ TO CREATE
│   │   ├── orderController.ts      ⏳ TO CREATE
│   │   └── adminController.ts      ⏳ TO CREATE
│   ├── services/
│   │   ├── blockchainService.ts    ⏳ TO CREATE
│   │   ├── confirmationMonitor.ts  ⏳ TO CREATE
│   │   ├── emailService.ts         ⏳ TO CREATE
│   │   └── webhookVerifier.ts      ⏳ TO CREATE
│   ├── middleware/
│   │   ├── authMiddleware.ts       ⏳ TO CREATE
│   │   ├── validateWebhook.ts      ⏳ TO CREATE
│   │   └── errorHandler.ts         ⏳ TO CREATE
│   ├── utils/
│   │   ├── providers.ts            ✅ CREATED
│   │   ├── crypto.ts               ✅ CREATED
│   │   └── logger.ts               ⏳ TO CREATE
│   ├── websocket/
│   │   └── socketServer.ts         ⏳ TO CREATE
│   ├── routes/
│   │   ├── webhook.routes.ts       ⏳ TO CREATE
│   │   ├── order.routes.ts         ⏳ TO CREATE
│   │   └── admin.routes.ts         ⏳ TO CREATE
│   ├── types/
│   │   └── index.ts                ✅ CREATED
│   ├── prisma.ts                   ⏳ TO CREATE
│   └── index.ts                    ⏳ TO CREATE
├── prisma/
│   └── schema.prisma               ✅ CREATED
├── package.json                    ✅ CREATED
├── tsconfig.json                   ✅ CREATED
├── .env.example                    ✅ CREATED
└── README.md                       ⏳ TO CREATE
```

## 🔧 Setup Steps

### 1. Install Additional Dependencies

```bash
cd merchant-backend
npm install winston express-rate-limit
```

### 2. Setup Database

```bash
# Create PostgreSQL database
createdb web3pay_merchant

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init
```

### 3. Create Environment File

```bash
cp .env.example .env
# Edit .env with your actual values
```

## 🚀 Quick Start Implementation

### Step 1: Create Prisma Client

**File**: `src/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;
```

### Step 2: Create Blockchain Service

**File**: `src/services/blockchainService.ts`

```typescript
import { ethers } from 'ethers';
import { getProviderForChain, PAYMENT_CONTRACT_ADDRESS, PAYMENT_CONTRACT_ABI } from '../utils/providers';

export async function verifyTransactionOnChain(
  txHash: string,
  expectedAmount: string,
  expectedMerchant: string,
  chain: string
): Promise<boolean> {
  try {
    const provider = getProviderForChain(chain);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt || receipt.status !== 1) {
      return false; // Transaction failed or not found
    }

    // Verify contract address
    if (receipt.to?.toLowerCase() !== PAYMENT_CONTRACT_ADDRESS.toLowerCase()) {
      return false;
    }

    // Parse event logs
    const iface = new ethers.Interface(PAYMENT_CONTRACT_ABI);
    const paymentEvent = receipt.logs
      .map(log => {
        try {
          return iface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          return null;
        }
      })
      .find(log => log?.name === 'PaymentCompleted');

    if (!paymentEvent) {
      return false;
    }

    // Verify parameters
    const { merchant, amount } = paymentEvent.args;

    return (
      merchant.toLowerCase() === expectedMerchant.toLowerCase() &&
      BigInt(amount) >= BigInt(expectedAmount)
    );
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return false;
  }
}

export async function getTransactionConfirmations(
  txHash: string,
  chain: string
): Promise<number> {
  const provider = getProviderForChain(chain);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return 0;

  const currentBlock = await provider.getBlockNumber();
  return currentBlock - receipt.blockNumber;
}
```

### Step 3: Create Webhook Controller

**File**: `src/controllers/webhookController.ts`

```typescript
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { verifyWebhookSignature } from '../utils/crypto';
import { verifyTransactionOnChain } from '../services/blockchainService';
import type { WebhookPayload } from '../types';

const webhookSchema = z.object({
  eventType: z.enum(['payment.pending', 'payment.confirmed', 'payment.failed']),
  orderId: z.string(),
  transactionHash: z.string(),
  amount: z.string(),
  token: z.string(),
  chain: z.string(),
  blockNumber: z.number(),
  confirmations: z.number(),
  merchantAddress: z.string(),
  customerAddress: z.string(),
  timestamp: z.number(),
  metadata: z.record(z.any()).optional()
});

export async function handleWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify signature
    const isValid = verifyWebhookSignature(
      payload,
      signature,
      process.env.WEBHOOK_SECRET!
    );

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Validate timestamp (reject if older than 5 minutes)
    const now = Date.now();
    if (Math.abs(now - req.body.timestamp) > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'Timestamp too old' });
    }

    // Validate payload
    const data: WebhookPayload = webhookSchema.parse(req.body);

    // Check idempotency
    const existingLog = await prisma.webhookLog.findFirst({
      where: {
        orderId: data.orderId,
        transactionHash: data.transactionHash,
        processed: true
      }
    });

    if (existingLog) {
      return res.status(200).json({ message: 'Already processed' });
    }

    // Log webhook
    const webhookLog = await prisma.webhookLog.create({
      data: {
        orderId: data.orderId,
        eventType: data.eventType,
        payload: data as any,
        signature,
        verified: true,
        processed: false
      }
    });

    // Verify transaction on-chain
    const order = await prisma.order.findUnique({
      where: { orderId: data.orderId }
    });

    if (!order) {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { error: 'Order not found' }
      });
      return res.status(404).json({ error: 'Order not found' });
    }

    const isVerified = await verifyTransactionOnChain(
      data.transactionHash,
      order.totalAmount.toString(),
      data.merchantAddress,
      data.chain
    );

    if (!isVerified) {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { error: 'Transaction verification failed' }
      });
      return res.status(400).json({ error: 'Transaction verification failed' });
    }

    // Update order
    await prisma.order.update({
      where: { orderId: data.orderId },
      data: {
        status: data.eventType === 'payment.confirmed' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_PENDING',
        transactionHash: data.transactionHash,
        blockNumber: data.blockNumber,
        confirmations: data.confirmations,
        chain: data.chain,
        merchantAddress: data.merchantAddress,
        customerAddress: data.customerAddress,
        confirmedAt: data.eventType === 'payment.confirmed' ? new Date() : undefined
      }
    });

    // Mark as processed
    await prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: { processed: true }
    });

    // TODO: Send email notification
    // TODO: Emit WebSocket event
    // TODO: Start confirmation monitoring

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Step 4: Create Main Server

**File**: `src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { handleWebhook } from './controllers/webhookController';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5174',
  credentials: true
}));
app.use(express.json());

// Routes
app.post('/api/webhooks/payment-confirmation', handleWebhook);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/api/webhooks/payment-confirmation`);
});
```

## 🧪 Testing

### Test Webhook Endpoint

```bash
curl -X POST http://localhost:3000/api/webhooks/payment-confirmation \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-signature: YOUR_SIGNATURE" \\
  -d '{
    "eventType": "payment.confirmed",
    "orderId": "ORD-20231223-12345",
    "transactionHash": "0xabc...",
    "amount": "1000000000000000000",
    "token": "ETH",
    "chain": "ethereum",
    "blockNumber": 12345678,
    "confirmations": 12,
    "merchantAddress": "0x...",
    "customerAddress": "0x...",
    "timestamp": 1703289600000
  }'
```

## 📝 Next Steps

1. **Create remaining controllers** (order, admin)
2. **Implement email service** with NodeMailer
3. **Add WebSocket server** for real-time updates
4. **Create confirmation monitoring** background job
5. **Add authentication middleware** for admin routes
6. **Implement rate limiting**
7. **Add comprehensive error handling**
8. **Write API documentation**
9. **Create test suite**
10. **Deploy to production**

## 🔐 Security Checklist

- [x] Webhook signature verification
- [x] Timestamp validation
- [x] On-chain transaction verification
- [x] Idempotency checks
- [ ] Rate limiting
- [ ] JWT authentication
- [ ] Input validation with Zod
- [ ] SQL injection prevention (Prisma)
- [ ] XSS prevention (Helmet)
- [ ] CORS configuration
- [ ] HTTPS in production

## 📚 Resources

- [Express.js Docs](https://expressjs.com/)
- [Prisma Docs](https://www.prisma.io/docs)
- [ethers.js Docs](https://docs.ethers.org/v6/)
- [Socket.IO Docs](https://socket.io/docs/)

---

**Status**: Core infrastructure created ✅  
**Next**: Implement remaining services and controllers
