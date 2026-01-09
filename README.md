# Web3Pay Merchant Backend API

Production-ready Express + TypeScript backend for Web3Pay merchant integration with webhook receiver, blockchain verification, and real-time updates.

## 🚀 Features

- ✅ **Webhook Receiver** with HMAC signature verification
- ✅ **On-Chain Transaction Verification** using ethers.js
- ✅ **PostgreSQL Database** with Prisma ORM
- ✅ **WebSocket Server** for real-time order updates
- ✅ **Email Notifications** via NodeMailer
- ✅ **Confirmation Monitoring** background service
- ✅ **Admin Dashboard API** with JWT authentication
- ✅ **Order Management** with pagination and filtering
- ✅ **Multi-Chain Support** (Ethereum, Polygon, Arbitrum, Base)

## 📦 Installation

```bash
cd merchant-backend

# Install dependencies
npm install

# Install additional packages
npm install winston express-rate-limit

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## 🗄️ Database Setup

```bash
# Create PostgreSQL database
createdb web3pay_merchant

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio
npx prisma studio
```

## 🔧 Configuration

Edit `.env` file with your settings:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/web3pay_merchant"

# Security
JWT_SECRET=your-super-secret-key
WEBHOOK_SECRET=whsec_your_webhook_secret

# RPC Endpoints (use your Alchemy/Infura keys)
ETHEREUM_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
POLYGON_RPC=https://polygon-mumbai.g.alchemy.com/v2/YOUR_KEY

# Email (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Merchant
MERCHANT_WALLET=0xYourMerchantAddress
```

## 🏃 Running the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## 📡 API Endpoints

### Webhook

**POST** `/api/webhooks/payment-confirmation`

Receives payment notifications from listener nodes.

**Headers:**
- `x-webhook-signature`: HMAC-SHA256 signature

**Body:**
```json
{
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
}
```

### Orders

**POST** `/api/orders` - Create new order

**GET** `/api/orders` - List orders (with pagination)
- Query params: `page`, `limit`, `status`, `search`

**GET** `/api/orders/:orderId` - Get order details

**PATCH** `/api/orders/:orderId/status` - Update order status

**POST** `/api/orders/:orderId/fulfill` - Mark order as fulfilled

### Admin (Protected)

**POST** `/api/admin/login` - Admin login
```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

**GET** `/api/admin/stats` - Dashboard statistics
- Requires: `Authorization: Bearer <token>`

**GET** `/api/admin/config` - Get merchant configuration

**PUT** `/api/admin/config` - Update configuration

### Health Check

**GET** `/health` - Server health status

## 🔌 WebSocket Events

Connect to `ws://localhost:3000`

**Client → Server:**
```javascript
socket.emit('join-order', 'ORD-20231223-12345');
```

**Server → Client:**
```javascript
// Payment received
socket.on('payment-received', (data) => {
  console.log('Payment received:', data);
});

// Confirmation update
socket.on('confirmation-update', (data) => {
  console.log('Confirmations:', data.confirmations);
});

// Payment confirmed
socket.on('payment-confirmed', (data) => {
  console.log('Payment confirmed!', data);
});

// Order status update
socket.on('order-status-update', (data) => {
  console.log('Order updated:', data);
});
```

## 🧪 Testing

### Test Webhook Endpoint

```bash
# Generate signature
PAYLOAD='{"eventType":"payment.confirmed","orderId":"ORD-20231223-12345","transactionHash":"0xabc","amount":"1000000000000000000","token":"ETH","chain":"ethereum","blockNumber":12345678,"confirmations":12,"merchantAddress":"0x123","customerAddress":"0x456","timestamp":1703289600000}'

SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "whsec_your_webhook_secret" | cut -d' ' -f2)

# Send webhook
curl -X POST http://localhost:3000/api/webhooks/payment-confirmation \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Test Order Creation

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-20231223-12345",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001"
    },
    "items": [
      {
        "id": "prod_001",
        "name": "Product 1",
        "price": 99.99,
        "quantity": 1
      }
    ],
    "totalAmount": 99.99
  }'
```

## 🔐 Security Features

- ✅ HMAC-SHA256 webhook signature verification
- ✅ Timestamp validation (5-minute window)
- ✅ On-chain transaction verification
- ✅ Idempotency checks
- ✅ JWT authentication for admin routes
- ✅ Input validation with Zod
- ✅ SQL injection prevention (Prisma)
- ✅ XSS prevention (Helmet)
- ✅ CORS configuration
- ✅ Rate limiting ready

## 📊 Database Schema

```prisma
model Order {
  id              String      @id @default(cuid())
  orderId         String      @unique
  customerName    String
  customerEmail   String
  status          OrderStatus
  transactionHash String?     @unique
  confirmations   Int         @default(0)
  // ... more fields
}

enum OrderStatus {
  PENDING
  PAYMENT_PENDING
  PAYMENT_CONFIRMED
  FULFILLED
  FAILED
  CANCELLED
}
```

## 🔄 Confirmation Monitoring

The backend automatically monitors pending transactions:

1. Webhook received → Start monitoring
2. Check confirmations every 30 seconds
3. Update database and emit WebSocket events
4. When confirmations ≥ 12 → Mark as confirmed
5. Send confirmation email
6. Stop monitoring

## 📧 Email Notifications

Emails are sent for:
- Payment received (pending)
- Payment confirmed (12+ confirmations)
- Order fulfilled (shipped)

Configure SMTP settings in `.env` to enable.

## 🚀 Deployment

### Using PM2

```bash
npm install -g pm2

# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name web3pay-backend

# Monitor
pm2 logs web3pay-backend

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `WEBHOOK_SECRET` | Webhook HMAC secret | Yes |
| `ETHEREUM_RPC` | Ethereum RPC endpoint | Yes |
| `PAYMENT_CONTRACT_ADDRESS` | Payment contract address | Yes |
| `SMTP_HOST` | Email SMTP host | Yes |
| `SMTP_USER` | Email username | Yes |
| `SMTP_PASS` | Email password | Yes |

## 🐛 Troubleshooting

### Database Connection Error

```bash
# Check PostgreSQL is running
pg_isready

# Verify DATABASE_URL in .env
echo $DATABASE_URL
```

### Webhook Signature Verification Fails

- Ensure `WEBHOOK_SECRET` matches listener node configuration
- Check timestamp is within 5-minute window
- Verify payload is exactly as sent (no modifications)

### Email Not Sending

- Check SMTP credentials
- For Gmail, use App Password (not regular password)
- Verify firewall allows outbound SMTP

## 📚 API Documentation

Full API documentation available at:
- Postman Collection: `./postman_collection.json`
- OpenAPI Spec: `./openapi.yaml`

## 🤝 Contributing

This is a demo project for Web3Pay merchant integration.

## 📄 License

MIT

---

Built with ❤️ using Express + TypeScript + Prisma + ethers.js
