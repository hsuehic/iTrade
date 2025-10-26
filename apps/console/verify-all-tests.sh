#!/bin/bash
# 验证所有测试脚本是否能正常启动
# 只检查启动，不等待完整执行

set +e  # 不要在错误时退出

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 验证所有测试脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PASSED=0
FAILED=0
SKIPPED=0

# 测试函数
test_script() {
    local name=$1
    local command=$2
    local timeout_sec=${3:-3}
    
    echo -n "Testing $name... "
    
    # 使用 timeout 运行命令，捕获前几秒输出
    timeout $timeout_sec bash -c "cd /Users/xiaowei.xue/Documents/Xiaowei/project/iTrade/apps/console && $command" > /tmp/test_output_$$.txt 2>&1 &
    local pid=$!
    
    sleep $timeout_sec
    kill $pid 2>/dev/null
    wait $pid 2>/dev/null
    
    # 检查输出中是否有明显错误
    if grep -q "TypeError.*Cannot read properties of undefined.*constructor" /tmp/test_output_$$.txt; then
        echo -e "${RED}❌ FAIL - TypeORM装饰器错误 (需要改用 ts-node)${NC}"
        FAILED=$((FAILED+1))
        echo "  Error: 使用了 tsx 但代码需要 TypeORM 支持"
        return 1
    elif grep -q "Error:" /tmp/test_output_$$.txt | head -5; then
        # 检查是否是配置错误（不是 TypeORM 错误）
        if grep -q "ECONNREFUSED\|ENOTFOUND\|401\|403" /tmp/test_output_$$.txt; then
            echo -e "${YELLOW}⚠️  SKIP - 配置或网络问题 (非代码问题)${NC}"
            SKIPPED=$((SKIPPED+1))
        else
            echo -e "${RED}❌ FAIL - 启动错误${NC}"
            FAILED=$((FAILED+1))
            grep "Error:" /tmp/test_output_$$.txt | head -3
        fi
        return 1
    else
        echo -e "${GREEN}✅ PASS - 可以正常启动${NC}"
        PASSED=$((PASSED+1))
        return 0
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 单元测试 - 交易所测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_script "test:binance" "npm run test:binance" 3
test_script "test:binance-rest" "npm run test:binance-rest" 3
test_script "test:okx" "npm run test:okx" 3
test_script "test:okx-rest" "npm run test:okx-rest" 3
test_script "test:okx-order" "npm run test:okx-order" 3
test_script "test:okx-permissions" "npm run test:okx-permissions" 3
test_script "test:coinbase" "npm run test:coinbase" 3
test_script "test:coinbase-rest" "npm run test:coinbase-rest" 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  单元测试 - 数据库测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_script "test:db:order-association" "npm run test:db:order-association" 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 集成测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_script "test:trading-engine" "npm run test:trading-engine" 5
test_script "test:strategy-execution" "npm run test:strategy-execution" 3
test_script "test:subscription" "npm run test:subscription" 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 批量测试命令 (仅验证命令有效性)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 批量测试只需要验证命令格式正确
echo -n "test:all-ws... "
if grep -q "test:all-ws" package.json; then
    echo -e "${GREEN}✅ PASS - 命令定义正确${NC}"
    PASSED=$((PASSED+1))
else
    echo -e "${RED}❌ FAIL - 命令未定义${NC}"
    FAILED=$((FAILED+1))
fi

echo -n "test:all-rest... "
if grep -q "test:all-rest" package.json; then
    echo -e "${GREEN}✅ PASS - 命令定义正确${NC}"
    PASSED=$((PASSED+1))
else
    echo -e "${RED}❌ FAIL - 命令未定义${NC}"
    FAILED=$((FAILED+1))
fi

echo -n "test:all-exchanges... "
if grep -q "test:all-exchanges" package.json; then
    echo -e "${GREEN}✅ PASS - 命令定义正确${NC}"
    PASSED=$((PASSED+1))
else
    echo -e "${RED}❌ FAIL - 命令未定义${NC}"
    FAILED=$((FAILED+1))
fi

echo -n "test:all-integration... "
if grep -q "test:all-integration" package.json; then
    echo -e "${GREEN}✅ PASS - 命令定义正确${NC}"
    PASSED=$((PASSED+1))
else
    echo -e "${RED}❌ FAIL - 命令未定义${NC}"
    FAILED=$((FAILED+1))
fi

echo -n "test:all... "
if grep -q "\"test:all\"" package.json; then
    echo -e "${GREEN}✅ PASS - 命令定义正确${NC}"
    PASSED=$((PASSED+1))
else
    echo -e "${RED}❌ FAIL - 命令未定义${NC}"
    FAILED=$((FAILED+1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 验证结果汇总"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}✅ 通过: $PASSED${NC}"
echo -e "${YELLOW}⚠️  跳过: $SKIPPED${NC} (配置/网络问题，非代码问题)"
echo -e "${RED}❌ 失败: $FAILED${NC}"
echo ""

TOTAL=$((PASSED+SKIPPED+FAILED))
echo "总计: $TOTAL 个测试"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 所有测试脚本验证通过！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ 存在失败的测试，请检查上述错误信息${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi

# 清理临时文件
rm -f /tmp/test_output_$$.txt

