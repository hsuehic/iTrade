#!/bin/bash
# Test Coinbase WebSocket using coinbase-api library

cd "$(dirname "$0")"

# Load environment variables
export $(grep -v '^#' ../../apps/console/.env | xargs)

# Run the test
npx tsx src/coinbase-adv/test-coinbase-api.ts
