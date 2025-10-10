#!/usr/bin/env tsx
/**
 * 详细的 Binance API 认证测试工具
 * 逐步测试签名算法和请求细节
 */

import 'reflect-metadata';
import crypto from 'crypto';

import dotenv from 'dotenv';
import axios from 'axios';

// 加载环境变量
dotenv.config();

class DetailedBinanceTest {
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

  async runDetailedTest(): Promise<void> {
    console.log('🔍 详细的 Binance API 认证测试开始...\n');

    // 1. 检查密钥基本信息
    this.checkKeyInfo();

    // 2. 测试服务器时间
    await this.testServerTime();

    // 3. 测试简单的签名请求
    await this.testSimpleSignedRequest();

    // 4. 测试账户信息请求（详细）
    await this.testAccountInfoDetailed();

    console.log('\n🏁 详细测试完成');
  }

  private checkKeyInfo(): void {
    console.log('📋 API 密钥信息检查:');
    console.log(`API Key 长度: ${this.apiKey.length}`);
    console.log(`API Key 前缀: ${this.apiKey.substring(0, 8)}...`);
    console.log(`Secret Key 长度: ${this.secretKey.length}`);
    console.log(`Secret Key 前缀: ${this.secretKey.substring(0, 8)}...`);

    // 检查是否是有效的 Base64 字符
    const validApiKeyPattern = /^[A-Za-z0-9]{64}$/;
    const validSecretKeyPattern = /^[A-Za-z0-9/+=]{64}$/;

    console.log(
      `API Key 格式检查: ${validApiKeyPattern.test(this.apiKey) ? '✅' : '❌'}`
    );
    console.log(
      `Secret Key 格式检查: ${validSecretKeyPattern.test(this.secretKey) ? '✅' : '❌'}`
    );
    console.log('');
  }

  private async testServerTime(): Promise<void> {
    try {
      console.log('⏰ 测试服务器时间同步:');
      const response = await axios.get('https://api.binance.com/api/v3/time');
      const serverTime = response.data.serverTime;
      const localTime = Date.now();
      const diff = Math.abs(serverTime - localTime);

      console.log(`服务器时间: ${new Date(serverTime).toISOString()}`);
      console.log(`本地时间: ${new Date(localTime).toISOString()}`);
      console.log(`时间差: ${diff}ms ${diff < 5000 ? '✅' : '❌'}`);
      console.log('');
    } catch (error: any) {
      console.log('❌ 无法获取服务器时间:', error.message);
      console.log('');
    }
  }

  private async testSimpleSignedRequest(): Promise<void> {
    try {
      console.log('📝 测试签名算法:');

      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      console.log(`时间戳: ${timestamp}`);
      console.log(`查询字符串: ${queryString}`);
      console.log(`生成的签名: ${signature.substring(0, 16)}...`);

      // 验证签名是否为有效的 hex 字符串
      const isValidHex = /^[a-f0-9]{64}$/i.test(signature);
      console.log(`签名格式检查: ${isValidHex ? '✅' : '❌'}`);
      console.log('');
    } catch (error: any) {
      console.log('❌ 签名测试失败:', error.message);
      console.log('');
    }
  }

  private async testAccountInfoDetailed(): Promise<void> {
    try {
      console.log('🏦 详细测试账户信息请求:');

      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const url = 'https://api.binance.com/api/v3/account';
      const params = new URLSearchParams({
        timestamp: timestamp.toString(),
        signature,
      });

      console.log(`请求 URL: ${url}`);
      console.log(
        `请求参数: timestamp=${timestamp}&signature=${signature.substring(0, 16)}...`
      );
      console.log(`请求头 X-MBX-APIKEY: ${this.apiKey.substring(0, 16)}...`);

      const config = {
        params: Object.fromEntries(params),
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      };

      console.log('📡 发送请求...');

      const response = await axios.get(url, config);

      if (response.status === 200) {
        console.log('✅ 请求成功!');
        console.log(
          `账户权限: canTrade=${response.data.canTrade}, canWithdraw=${response.data.canWithdraw}, canDeposit=${response.data.canDeposit}`
        );
        console.log(`余额数量: ${response.data.balances?.length || 0}`);
      }
    } catch (error: any) {
      console.log('❌ 账户信息请求失败');

      if (error.response) {
        console.log(`HTTP 状态: ${error.response.status}`);
        console.log(`错误数据:`, error.response.data);
        console.log(`响应头:`, JSON.stringify(error.response.headers, null, 2));

        // 检查特定错误
        if (error.response.data?.code === -2015) {
          console.log('\n🔍 错误分析 (-2015):');
          console.log('这个错误通常由以下原因引起:');
          console.log('1. API 密钥无效或已过期');
          console.log('2. IP 地址不在白名单中');
          console.log('3. API 权限不足');
          console.log('4. 签名算法错误');
          console.log('5. 时间戳问题');

          console.log('\n💡 建议检查:');
          console.log('- 确认 API 密钥是从主网获取的（不是测试网）');
          console.log('- 确认 API 密钥状态是 "Active"');
          console.log('- 确认没有在复制时引入额外字符');
          console.log('- 尝试重新生成 API 密钥');
        }
      } else {
        console.log('网络错误:', error.message);
      }
      console.log('');
    }
  }
}

// 运行详细测试
async function main() {
  const test = new DetailedBinanceTest();
  await test.runDetailedTest();
}

main().catch((error) => {
  console.error('❌ 测试过程中出错:', error.message);
  process.exit(1);
});
