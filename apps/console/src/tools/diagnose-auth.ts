#!/usr/bin/env tsx
/**
 * Binance API 认证诊断工具
 *
 * 帮助诊断 401 认证错误的具体原因：
 * 1. 时钟同步检查
 * 2. API 密钥有效性验证
 * 3. 权限检查
 * 4. 网络连接测试
 */

import 'reflect-metadata';
import crypto from 'crypto';

import dotenv from 'dotenv';
import axios from 'axios';

// 加载环境变量
dotenv.config();

const BINANCE_MAINNET_URL = 'https://api.binance.com';
const BINANCE_TESTNET_URL = 'https://testnet.binance.vision';

interface DiagnosisResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: Record<string, unknown>;
}

class BinanceAuthDiagnostic {
  private apiKey: string;
  private secretKey: string;
  private results: DiagnosisResult[] = [];

  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.secretKey = process.env.BINANCE_SECRET_KEY || '';
  }

  private addResult(
    test: string,
    status: 'PASS' | 'FAIL' | 'WARN',
    message: string,
    details?: Record<string, unknown>,
  ) {
    this.results.push({ test, status, message, details });

    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${test}: ${message}`);
    if (details) {
      console.log(`   详情: ${JSON.stringify(details, null, 2)}`);
    }
  }

  private signRequest(params: Record<string, string | number>): Record<string, string> {
    const stringParams = Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    );
    const queryString = new URLSearchParams(stringParams).toString();
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(queryString)
      .digest('hex');
    return { ...stringParams, signature };
  }

  async runDiagnosis(): Promise<void> {
    console.log('🔍 开始 Binance API 认证诊断...\n');

    // 1. 检查环境变量
    await this.checkEnvironmentVariables();

    // 2. 检查网络连接
    await this.checkNetworkConnectivity();

    // 3. 检查服务器时间同步
    await this.checkServerTime();

    // 4. 测试 API 密钥有效性
    await this.testApiKeyValidity();

    // 5. 测试账户信息访问权限
    await this.testAccountInfoAccess();

    // 6. 生成报告
    this.generateReport();
  }

  private async checkEnvironmentVariables(): Promise<void> {
    if (!this.apiKey || this.apiKey === 'your_binance_api_key_here') {
      this.addResult('环境变量检查', 'FAIL', 'BINANCE_API_KEY 未设置或使用默认值');
      return;
    }

    if (!this.secretKey || this.secretKey === 'your_binance_secret_key_here') {
      this.addResult('环境变量检查', 'FAIL', 'BINANCE_SECRET_KEY 未设置或使用默认值');
      return;
    }

    if (this.apiKey.length < 50) {
      this.addResult(
        '环境变量检查',
        'WARN',
        'API Key 长度异常，可能不是有效的 Binance API Key',
      );
      return;
    }

    this.addResult('环境变量检查', 'PASS', 'API 密钥环境变量已正确设置');
  }

  private async checkNetworkConnectivity(): Promise<void> {
    try {
      // 测试主网连接
      const mainnetResponse = await axios.get(`${BINANCE_MAINNET_URL}/api/v3/ping`, {
        timeout: 5000,
      });
      if (mainnetResponse.status === 200) {
        this.addResult('网络连接测试', 'PASS', '主网连接正常');
      }

      // 测试测试网连接
      try {
        const testnetResponse = await axios.get(`${BINANCE_TESTNET_URL}/api/v3/ping`, {
          timeout: 5000,
        });
        if (testnetResponse.status === 200) {
          this.addResult('网络连接测试', 'PASS', '测试网连接正常');
        }
      } catch {
        this.addResult('网络连接测试', 'WARN', '测试网连接失败（这通常不影响主网使用）');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addResult('网络连接测试', 'FAIL', '无法连接到 Binance API', {
        error: message,
      });
    }
  }

  private async checkServerTime(): Promise<void> {
    try {
      const response = await axios.get(`${BINANCE_MAINNET_URL}/api/v3/time`);
      const serverTime = response.data.serverTime;
      const localTime = Date.now();
      const timeDiff = Math.abs(serverTime - localTime);

      if (timeDiff > 5000) {
        // 超过5秒
        this.addResult(
          '时间同步检查',
          'FAIL',
          `本地时间与服务器时间相差 ${timeDiff}ms，超过允许范围(5000ms)`,
          {
            serverTime: new Date(serverTime).toISOString(),
            localTime: new Date(localTime).toISOString(),
            difference: timeDiff,
          },
        );
      } else if (timeDiff > 1000) {
        // 超过1秒
        this.addResult('时间同步检查', 'WARN', `本地时间与服务器时间相差 ${timeDiff}ms`, {
          serverTime: new Date(serverTime).toISOString(),
          localTime: new Date(localTime).toISOString(),
          difference: timeDiff,
        });
      } else {
        this.addResult('时间同步检查', 'PASS', `时间同步正常 (相差${timeDiff}ms)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addResult('时间同步检查', 'FAIL', '无法获取服务器时间', {
        error: message,
      });
    }
  }

  private async testApiKeyValidity(): Promise<void> {
    try {
      // 测试 API 密钥格式和基本有效性
      const timestamp = Date.now();
      const params = this.signRequest({ timestamp });

      const response = await axios.get(`${BINANCE_MAINNET_URL}/api/v3/account`, {
        params,
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
        timeout: 10000,
      });

      if (response.status === 200) {
        this.addResult('API密钥有效性', 'PASS', 'API 密钥有效且具有账户访问权限', {
          canTrade: response.data.canTrade,
          canWithdraw: response.data.canWithdraw,
          canDeposit: response.data.canDeposit,
          balanceCount: response.data.balances?.length || 0,
        });
        return;
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.addResult('API密钥有效性', 'FAIL', 'API 密钥认证失败 (401)', {
          errorCode: error.response.data?.code,
          errorMsg: error.response.data?.msg,
          headers: error.response.headers,
        });
      } else if (axios.isAxiosError(error) && error.response?.status === 403) {
        this.addResult('API密钥有效性', 'FAIL', 'API 密钥权限不足 (403)', {
          errorCode: error.response.data?.code,
          errorMsg: error.response.data?.msg,
        });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.addResult('API密钥有效性', 'FAIL', `API 请求失败: ${message}`);
      }
    }
  }

  private async testAccountInfoAccess(): Promise<void> {
    try {
      // 测试不同的 API 端点权限
      const endpoints = [
        { path: '/api/v3/account', name: '账户信息', requiresAuth: true },
        { path: '/api/v3/openOrders', name: '当前订单', requiresAuth: true },
        {
          path: '/api/v3/exchangeInfo',
          name: '交易所信息',
          requiresAuth: false,
        },
      ];

      for (const endpoint of endpoints) {
        try {
          const timestamp = Date.now();
          const config: {
            timeout: number;
            params?: Record<string, string | number>;
            headers?: Record<string, string>;
          } = { timeout: 5000 };

          if (endpoint.requiresAuth) {
            const params = this.signRequest({ timestamp });
            config.params = params;
            config.headers = { 'X-MBX-APIKEY': this.apiKey };
          }

          const response = await axios.get(
            `${BINANCE_MAINNET_URL}${endpoint.path}`,
            config,
          );

          if (response.status === 200) {
            this.addResult(
              `权限测试-${endpoint.name}`,
              'PASS',
              `可以访问 ${endpoint.name}`,
            );
          }
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 401) {
            this.addResult(
              `权限测试-${endpoint.name}`,
              'FAIL',
              `无权限访问 ${endpoint.name}`,
              {
                errorMsg: error.response.data?.msg,
              },
            );
          } else {
            const message = error instanceof Error ? error.message : String(error);
            this.addResult(
              `权限测试-${endpoint.name}`,
              'WARN',
              `访问 ${endpoint.name} 时出错`,
              {
                error: message,
              },
            );
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addResult('权限测试', 'FAIL', '权限测试失败', {
        error: message,
      });
    }
  }

  private generateReport(): void {
    console.log('\n📊 诊断报告总结:');
    console.log('==================');

    const passCount = this.results.filter((r) => r.status === 'PASS').length;
    const failCount = this.results.filter((r) => r.status === 'FAIL').length;
    const warnCount = this.results.filter((r) => r.status === 'WARN').length;

    console.log(`✅ 通过: ${passCount} 项`);
    console.log(`❌ 失败: ${failCount} 项`);
    console.log(`⚠️  警告: ${warnCount} 项`);

    if (failCount === 0) {
      console.log('\n🎉 恭喜！所有测试都通过了，您的 API 配置应该是正确的。');
      console.log('如果仍然遇到 401 错误，可能是临时网络问题或 Binance 服务器问题。');
    } else {
      console.log('\n🔧 需要修复的问题:');
      this.results
        .filter((r) => r.status === 'FAIL')
        .forEach((result) => {
          console.log(`- ${result.test}: ${result.message}`);
        });

      console.log('\n💡 建议解决方案:');

      if (this.results.some((r) => r.test === '环境变量检查' && r.status === 'FAIL')) {
        console.log(
          '1. 检查 .env 文件中的 BINANCE_API_KEY 和 BINANCE_SECRET_KEY 是否正确设置',
        );
        console.log('2. 确保没有多余的空格或换行符');
        console.log('3. 重新生成 API 密钥并替换现有密钥');
      }

      if (this.results.some((r) => r.test.includes('时间同步') && r.status === 'FAIL')) {
        console.log('4. 同步系统时间：');
        console.log('   - Windows: w32tm /resync');
        console.log('   - macOS: sudo sntp -sS time.apple.com');
        console.log('   - Linux: sudo ntpdate -s time.nist.gov');
      }

      if (this.results.some((r) => r.test.includes('权限') && r.status === 'FAIL')) {
        console.log('5. 检查 API 密钥权限设置：');
        console.log('   - 登录 Binance 账户');
        console.log('   - 进入 API 管理页面');
        console.log('   - 确保启用 "Read Info" 权限');
        console.log('   - 如果需要交易，还要启用相应的交易权限');
      }
    }

    console.log('\n📞 如需更多帮助，请提供此诊断报告。');
  }
}

// 运行诊断
async function main() {
  const diagnostic = new BinanceAuthDiagnostic();
  await diagnostic.runDiagnosis();
}

main().catch((error) => {
  console.error('❌ 诊断过程中出错:', error.message);
  process.exit(1);
});
