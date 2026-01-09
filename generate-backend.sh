#!/bin/bash

# Web3Pay Merchant Backend - Complete File Generator
# This script creates all backend components

echo "🚀 Generating Web3Pay Merchant Backend..."
echo ""

# Create directory structure
mkdir -p src/{controllers,services,middleware,utils,websocket,routes,types}

# ============ UTILS ============

# Logger
cat > src/utils/logger.ts << 'EOF'
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  ]
});

export default logger;
EOF

echo "✅ Created logger utility"

# Blockchain Providers
cat > src/utils/providers.ts << 'EOF'
import { ethers } from 'ethers';

export const RPC_PROVIDERS = {
  ethereum: new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC),
  polygon: new ethers.JsonRpcProvider(process.env.POLYGON_RPC),
  arbitrum: new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC),
  base: new ethers.JsonRpcProvider(process.env.BASE_RPC)
};

export function getProviderForChain(chain: string): ethers.JsonRpcProvider {
  const provider = RPC_PROVIDERS[chain.toLowerCase() as keyof typeof RPC_PROVIDERS];
  if (!provider) {
    throw new Error(\`Unsupported chain: \${chain}\`);
  }
  return provider;
}

export const PAYMENT_CONTRACT_ADDRESS = process.env.PAYMENT_CONTRACT_ADDRESS!;
export const PAYMENT_CONTRACT_ABI = JSON.parse(process.env.PAYMENT_CONTRACT_ABI || '[]');
EOF

echo "✅ Created blockchain providers"

# Crypto utilities
cat > src/utils/crypto.ts << 'EOF'
import crypto from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

export function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return hmac.update(payload).digest('hex');
}
EOF

echo "✅ Created crypto utilities"

echo ""
echo "📝 Core utilities created!"
echo "Run 'npm install winston' to complete setup"
EOF

chmod +x generate-backend.sh
./generate-backend.sh
