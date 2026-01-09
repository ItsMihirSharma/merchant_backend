#!/bin/bash

echo "🚀 Setting up Web3Pay Merchant Backend..."
echo ""

# Install additional dependencies
echo "📦 Installing additional dependencies..."
npm install winston express-rate-limit

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env
  echo "⚠️  Please edit .env with your configuration"
else
  echo "✅ .env file already exists"
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env with your configuration"
echo "2. Create PostgreSQL database: createdb web3pay_merchant"
echo "3. Run migrations: npx prisma migrate dev --name init"
echo "4. Start server: npm run dev"
echo ""
