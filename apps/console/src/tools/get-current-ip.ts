#!/usr/bin/env tsx
/**
 * 获取当前公网 IP 地址工具
 */

import axios from 'axios';

async function getCurrentIP() {
  try {
    console.log('🔍 正在获取当前公网 IP 地址...\n');

    // 使用多个服务来获取 IP，以防某个服务不可用
    const ipServices = [
      { name: 'ipify', url: 'https://api.ipify.org?format=json' },
      { name: 'ipinfo', url: 'https://ipinfo.io/json' },
      { name: 'ip-api', url: 'http://ip-api.com/json' },
    ];

    for (const service of ipServices) {
      try {
        console.log(`📡 尝试 ${service.name}...`);
        const response = await axios.get(service.url, { timeout: 5000 });

        let ip = '';
        if (service.name === 'ipify') {
          ip = response.data.ip;
        } else if (service.name === 'ipinfo') {
          ip = response.data.ip;
        } else if (service.name === 'ip-api') {
          ip = response.data.query;
        }

        if (ip) {
          console.log(`✅ 当前公网 IP: ${ip}`);
          console.log(`📋 请将此 IP 添加到 Binance API 白名单中`);

          if (service.name === 'ipinfo' && response.data.city) {
            console.log(
              `📍 位置信息: ${response.data.city}, ${response.data.region}, ${response.data.country}`,
            );
          }

          console.log('\n🔧 添加步骤:');
          console.log('1. 访问 https://www.binance.com/cn/my/settings/api-management');
          console.log('2. 找到您的 API 密钥');
          console.log('3. 在 "IP access restrictions" 部分');
          console.log(`4. 添加 IP: ${ip}`);
          console.log('5. 点击 "Confirm" 保存');
          console.log('\n⚠️  或者临时选择 "Unrestricted" 进行测试');
          return;
        }
      } catch (error) {
        console.log(`❌ ${service.name} 失败`);
      }
    }

    console.log('❌ 无法获取 IP 地址，请手动查询');
    console.log('💡 您可以访问 https://whatismyipaddress.com/ 查看您的 IP');
  } catch (error: any) {
    console.error('❌ 获取 IP 时出错:', error.message);
  }
}

getCurrentIP();
