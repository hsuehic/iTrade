#!/bin/bash

# Crypto Trading Monorepo Setup Script

set -e

echo "🚀 Setting up Crypto Trading Monorepo..."
echo "========================================"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first:"
    echo "   npm install -g pnpm"
    exit 1
fi

echo "✅ pnpm found: $(pnpm --version)"

# Check Node.js version
NODE_VERSION=$(node --version | cut -c 2-)
REQUIRED_VERSION="18.0.0"

if ! node -e "process.exit(process.versions.node.split('.').map(Number).some((v, i) => v < '${REQUIRED_VERSION}'.split('.')[i] || (v === Number('${REQUIRED_VERSION}'.split('.')[i]) && i === 2)) ? 1 : 0)"; then
    echo "❌ Node.js version ${NODE_VERSION} is below required version ${REQUIRED_VERSION}"
    echo "   Please upgrade Node.js to version ${REQUIRED_VERSION} or higher"
    exit 1
fi

echo "✅ Node.js version: ${NODE_VERSION}"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

# Build all packages
echo ""
echo "🔨 Building all packages..."
pnpm run build

# Run type checking
echo ""
echo "🔍 Running type checks..."
pnpm run type-check

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎉 Your crypto trading monorepo is ready!"
echo ""
echo "Next steps:"
echo "1. Set up environment variables (see README.md)"
echo "2. Run a sample backtest:"
echo "   pnpm --filter @itrade/cli start backtest --interactive"
echo ""
echo "3. Explore the packages:"
echo "   - Core: packages/core"
echo "   - Exchange Connectors: packages/exchange-connectors" 
echo "   - Strategies: packages/strategies"
echo "   - Backtesting: packages/backtesting"
echo "   - CLI: apps/cli"
echo ""
echo "Happy trading! 📈"
