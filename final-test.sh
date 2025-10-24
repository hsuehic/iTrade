#!/bin/bash
cd /Users/xiaowei.xue/Documents/Xiaowei/project/iTrade/apps/console

echo "Starting console app..."
NODE_ENV=development \
TS_NODE_PROJECT=tsconfig.build.json \
TS_NODE_FILES=true \
NODE_OPTIONS="--conditions=source" \
timeout 10s /Users/xiaowei.xue/.nvm/versions/node/v22.18.0/bin/node \
-r ts-node/register \
-r tsconfig-paths/register \
-r reflect-metadata \
src/main.ts 2>&1 | tee /tmp/final-test.log

echo ""
echo "=== LOOKING FOR CALLBACK LOGGERS ==="
grep "🔍" /tmp/final-test.log || echo "❌ NO CALLBACKS FOUND"
echo ""
echo "=== TEST RESULT ==="
if grep -q "🔍 TICKER" /tmp/final-test.log && grep -q "🔍 TRADE" /tmp/final-test.log; then
  echo "✅ PASS: Callback loggers are working!"
else
  echo "❌ FAIL: Callback loggers are NOT showing"
fi

