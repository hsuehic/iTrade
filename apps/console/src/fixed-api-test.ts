#!/usr/bin/env tsx
/**
 * 修正版本的 Binance API 测试
 * 使用正确的 API 端点
 */

import 'reflect-metadata';
import crypto from 'crypto';

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

class FixedAPITest {
  private apiKey: string;
  private secretKey: string;

  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.secretKey = process.env.BINANCE_SECRET_KEY || '';
  }

  private createSignature(queryString: string): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(queryString)
      .digest('hex');
  }

  async runFixedTests(): Promise<void> {
    console.log('🔍 修正版本 API 测试开始...\n');

    // 1. 测试公开端点
    await this.testPublicEndpoint();

    // 2. 测试交易所信息（使用 API Key 但不需要签名）
    await this.testExchangeInfo();

    // 3. 测试账户信息（需要签名）
    await this.testAccountInfo();

    console.log('\n🏁 修正版本测试完成');
  }

  private async testPublicEndpoint(): Promise<void> {
    try {
      console.log('🌐 测试公开端点（ping）:');
      const response = await axios.get('https://api.binance.com/api/v3/ping');
      console.log(`✅ 公开端点正常: ${response.status}`);
      console.log('');
    } catch (error: any) {
      console.log('❌ 公开端点失败:', error.message);
      console.log('');
    }
  }

  private async testExchangeInfo(): Promise<void> {
    try {
      console.log('📊 测试交易所信息（使用 API Key，无需签名）:');

      const response = await axios.get(
        'https://api.binance.com/api/v3/exchangeInfo',
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
          params: {
            symbol: 'BTCUSDT',
          },
          timeout: 10000,
        }
      );

      console.log('✅ 交易所信息获取成功');
      console.log(
        `交易对信息: ${response.data.symbols?.[0]?.symbol || 'BTCUSDT'}`
      );
      console.log('');
    } catch (error: any) {
      console.log('❌ 交易所信息测试失败');
      if (error.response) {
        console.log(`HTTP 状态: ${error.response.status}`);
        console.log('错误:', error.response.data);
      } else {
        console.log('网络错误:', error.message);
      }
      console.log('');
    }
  }

  private async testAccountInfo(): Promise<void> {
    try {
      console.log('👤 测试账户信息（需要签名）:');

      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      console.log(`🔐 请求参数: timestamp=${timestamp}`);
      console.log(`🔐 签名: ${signature.substring(0, 16)}...`);

      // 使用正确的账户信息端点
      const response = await axios.get(
        'https://api.binance.com/api/v3/account',
        {
          params: {
            timestamp,
            signature,
          },
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
          timeout: 10000,
        }
      );

      console.log('✅ 🎉 账户信息获取成功！');
      console.log(
        `账户权限: canTrade=${response.data.canTrade}, canWithdraw=${response.data.canWithdraw}, canDeposit=${response.data.canDeposit}`
      );
      console.log(`余额数量: ${response.data.balances?.length || 0}`);

      // 显示非零余额
      const nonZeroBalances =
        response.data.balances?.filter(
          (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
        ) || [];

      if (nonZeroBalances.length > 0) {
        console.log('💰 非零余额:');
        nonZeroBalances.slice(0, 5).forEach((balance: any) => {
          console.log(
            `   ${balance.asset}: ${balance.free} (可用) + ${balance.locked} (锁定)`
          );
        });
        if (nonZeroBalances.length > 5) {
          console.log(`   ... 还有 ${nonZeroBalances.length - 5} 个币种`);
        }
      }

      console.log('\n🎯 账户轮询现在应该可以正常工作了！');
      console.log('');
    } catch (error: any) {
      console.log('❌ 账户信息测试失败');

      if (error.response) {
        console.log(`HTTP 状态: ${error.response.status}`);
        console.log('错误:', error.response.data);
        console.log('错误代码:', error.response.data?.code);

        // 检查具体错误代码
        if (error.response.data?.code === -2015) {
          console.log('\n🚨 -2015 错误分析:');
          console.log('这个错误的可能原因:');
          console.log('1. API 密钥无效或已过期');
          console.log('2. IP 地址不在白名单中');
          console.log('3. API 权限不足');
          console.log('4. 账户有地区限制');
          console.log('5. 账户需要完成身份验证');

          console.log('\n💡 建议操作:');
          console.log('- 检查 Binance 账户状态');
          console.log('- 确认 API 密钥权限设置');
          console.log('- 联系 Binance 客服');
        } else if (error.response.data?.code === -1021) {
          console.log('\n🚨 -1021 时间戳错误:');
          console.log('请同步系统时间');
        } else if (error.response.data?.code === -1022) {
          console.log('\n🚨 -1022 签名错误:');
          console.log('签名验证失败，请检查 Secret Key');
        }
      } else {
        console.log('网络错误:', error.message);
      }
      console.log('');
    }
  }
}

// 运行修正版本测试
async function main() {
  const test = new FixedAPITest();
  await test.runFixedTests();

  console.log('🎯 如果账户信息测试成功：');
  console.log('   运行: pnpm run cron');
  console.log('');
  console.log('🎯 如果仍然失败：');
  console.log('   1. 检查 Binance 账户状态和权限');
  console.log('   2. 确认账户已完成身份验证');
  console.log('   3. 联系 Binance 客服寻求帮助');
}

main().catch((error) => {
  console.error('❌ 测试过程中出错:', error.message);
  process.exit(1);
});
