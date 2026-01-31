import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const isDevelopment = process.env.NODE_ENV === 'development';
const buildMode = process.env.BUILD_MODE;

let distDir = '.next';
let tsconfigPath = './tsconfig.json';

if (buildMode === 'dev' || isDevelopment) {
  distDir = '.next-dev';
  tsconfigPath = './tsconfig.build.json';
} else if (buildMode === 'staging') {
  distDir = '.next-staging';
  tsconfigPath = './tsconfig.build.json';
} else if (buildMode === 'prod') {
  distDir = '.next-prod';
  tsconfigPath = './tsconfig.build.json';
}

const nextConfig: NextConfig = {
  distDir,

  typescript: {
    tsconfigPath,
    // ⛳ dev 时强烈建议
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
    dirs: ['app', 'components', 'hooks', 'lib', 'middlewares'],
  },

  images: {
    remotePatterns: [],
  },

  experimental: {
    serverActions: {
      allowedOrigins: [
        'itrade.ihsueh.com',
        'appleid.apple.com',
        'accounts.google.com',
        'localhost:3000',
        'localhost:3002',
      ],
    },
  },

  // ✅ Turbopack 专属 alias（替代 webpack alias）
  turbopack: {
    resolveAlias: {
      typeorm: 'typeorm',
    },
  },

  /**
   * ✅ 官方方式：Server-only external packages
   * Turbopack & Webpack 都支持
   */
  serverExternalPackages: [
    'typeorm',
    '@itrade/data-manager',
    '@itrade/core',
    '@itrade/utils',
    '@itrade/logger',
    '@itrade/exchange-connectors',
  ],
  allowedDevOrigins: [
    'itrade.ihsueh.com',
    'appleid.apple.com',
    'accounts.google.com',
    'localhost:3000',
    'localhost:3002',
  ],
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
