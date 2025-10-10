#!/usr/bin/env tsx
/**
 * 最基础的 Binance API 测试
 * 尝试不同的端点和方法
 */

import 'reflect-metadata';
import crypto from 'crypto';

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

class BasicAPITest {
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

  async runBasicTests(): Promise<void> {
    console.log('🔍 基础 API 测试开始...\n');

    // 1. 测试公开端点（不需要认证）
    await this.testPublicEndpoint();

    // 2. 测试 API 密钥验证（最简单的认证端点）
    await this.testAPIKeyStatus();

    // 3. 测试账户状态
    await this.testAccountStatus();

    // 4. 尝试不同的请求方式
    await this.testDifferentRequestMethods();

    console.log('\n🏁 基础测试完成');
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

  private async testAPIKeyStatus(): Promise<void> {
    try {
      console.log('🔑 测试 API 密钥状态:');

      // 使用系统状态端点，只需要 API Key，不需要签名
      const response = await axios.get(
        'https://api.binance.com/api/v3/account/status',
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
          timeout: 10000,
        }
      );

      console.log('✅ API 密钥有效');
      console.log('状态:', response.data);
      console.log('');
    } catch (error: any) {
      console.log('❌ API 密钥状态测试失败');
      if (error.response) {
        console.log(`HTTP 状态: ${error.response.status}`);
        console.log('错误:', error.response.data);
      }
      console.log('');
    }
  }

  private async testAccountStatus(): Promise<void> {
    try {
      console.log('👤 测试账户状态（需要签名）:');

      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      // 尝试最简单的账户相关端点
      const response = await axios.get(
        'https://api.binance.com/api/v3/account/status',
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

      console.log('✅ 账户状态获取成功');
      console.log('状态:', response.data);
      console.log('');
    } catch (error: any) {
      console.log('❌ 账户状态测试失败');
      if (error.response) {
        console.log(`HTTP 状态: ${error.response.status}`);
        console.log('错误:', error.response.data);
        console.log('错误代码:', error.response.data?.code);

        // 检查具体错误代码
        if (error.response.data?.code === -2015) {
          console.log('\n🚨 -2015 错误分析:');
          console.log('这个错误在新API密钥上仍然出现，可能的原因:');
          console.log('1. 您的 Binance 账户可能有地区限制');
          console.log('2. 您的账户可能需要完成额外的身份验证');
          console.log('3. API 功能可能在您的账户上被禁用');
          console.log('4. 可能存在账户安全限制');
        }
      }
      console.log('');
    }
  }

  private async testDifferentRequestMethods(): Promise<void> {
    console.log('🔄 尝试不同的请求方式:');

    // 方法 1: 使用 POST 请求
    try {
      console.log('📤 尝试 POST 请求...');
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await axios.post(
        'https://api.binance.com/api/v3/account',
        null,
        {
          params: {
            timestamp,
            signature,
          },
          headers: {
            'X-MBX-APIKEY': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      console.log('✅ POST 请求成功');
      console.log('');
      return;
    } catch (error: any) {
      console.log('❌ POST 请求失败');
      if (error.response?.data?.code) {
        console.log(`错误代码: ${error.response.data.code}`);
      }
    }

    // 方法 2: 使用不同的 User-Agent
    try {
      console.log('🕵️ 尝试不同的 User-Agent...');
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await axios.get(
        'https://api.binance.com/api/v3/account',
        {
          params: {
            timestamp,
            signature,
          },
          headers: {
            'X-MBX-APIKEY': this.apiKey,
            'User-Agent': 'iTrade/1.0.0',
          },
          timeout: 10000,
        }
      );

      console.log('✅ 不同 User-Agent 成功');
      console.log('');
      return;
    } catch (error: any) {
      console.log('❌ 不同 User-Agent 失败');
      if (error.response?.data?.code) {
        console.log(`错误代码: ${error.response.data.code}`);
      }
    }

    console.log('🤷 所有方法都失败了');
    console.log('');
  }
}

// 运行基础测试
async function main() {
  const test = new BasicAPITest();
  await test.runBasicTests();

  console.log('🎯 建议下一步操作:');
  console.log('1. 检查您的 Binance 账户是否有地区限制');
  console.log('2. 确认账户已完成身份验证 (KYC)');
  console.log('3. 检查账户是否有 API 访问限制');
  console.log('4. 联系 Binance 客服确认账户状态');
  console.log('5. 尝试在 Binance 官网直接测试 API 密钥');
}

main().catch((error) => {
  console.error('❌ 测试过程中出错:', error.message);
  process.exit(1);
});
