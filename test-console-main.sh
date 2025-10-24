#!/bin/bash
cd /Users/xiaowei.xue/Documents/Xiaowei/project/iTrade/apps/console
pnpm dev &
PID=$!
sleep 8
kill $PID 2>/dev/null
wait $PID 2>/dev/null

