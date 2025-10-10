import type { NextConfig } from 'next';

// 根据环境变量或命令设置不同的输出目录
const isDevelopment = process.env.NODE_ENV === 'development';
const buildMode = process.env.BUILD_MODE; // 可以设置为 'dev', 'prod', 'staging' 等

// 动态配置输出目录
let distDir = '.next'; // 默认目录

if (buildMode === 'dev') {
  distDir = '.next-dev';
} else if (buildMode === 'staging') {
  distDir = '.next-staging';
} else if (buildMode === 'prod') {
  distDir = '.next-prod';
} else if (isDevelopment) {
  distDir = '.next-dev';
}

const nextConfig: NextConfig = {
  // 设置自定义输出目录
  distDir,

  // In Next.js 15.5+, use serverExternalPackages instead of experimental.serverComponentsExternalPackages
  serverExternalPackages: [
    'typeorm',
    '@itrade/data-manager',
    '@itrade/core',
    '@itrade/utils',
    '@itrade/logger',
    '@itrade/exchange-connectors',
  ],

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle TypeORM for server-side
      config.externals = [...(config.externals || []), 'typeorm'];
    }

    // Handle TypeORM metadata properly
    config.resolve.alias = {
      ...config.resolve.alias,
      typeorm: require.resolve('typeorm'),
    };

    return config;
  },
};

export default nextConfig;
