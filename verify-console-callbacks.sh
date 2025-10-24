#!/bin/bash
echo "🧪 Starting Console App Verification..."
echo "➡️  Looking for push data callback loggers (🔍 TICKER, 🔍 TRADE, etc.)"
echo ""

cd /Users/xiaowei.xue/Documents/Xiaowei/project/iTrade/apps/console

NODE_ENV=development \
TS_NODE_PROJECT=tsconfig.build.json \
TS_NODE_FILES=true \
NODE_OPTIONS="--conditions=source" \
/Users/xiaowei.xue/.nvm/versions/node/v22.18.0/bin/node \
-r ts-node/register \
-r tsconfig-paths/register \
-r reflect-metadata \
src/main.ts 2>&1 &

PID=$!
echo "📡 Console app started (PID: $PID)"
echo "⏳ Waiting for data..."
echo ""

# Wait and capture output
sleep 8

# Kill the process
kill $PID 2>/dev/null
wait $PID 2>/dev/null

echo ""
echo "✅ Test complete!"

