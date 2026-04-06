import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

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

  // Note: Using Next.js CLI instead of standalone for better monorepo support
  // ...(buildMode === 'prod' && { output: 'standalone' }),

  webpack: (config, { isServer }) => {
    // uuid@9's ESM wrapper.mjs has only named exports (no default export).
    // pkgroll/rollup compiles workspace packages using CJS interop which emits
    //   import require$$N from 'uuid'   (a default import)
    // which fails when webpack resolves uuid to its ESM entry.
    // Alias uuid to its CJS build so webpack wraps it with CJS interop and the
    // synthetic default export makes require$$N.v4() work — on both server & client.
    config.resolve = config.resolve ?? {};
    (config.resolve as Record<string, unknown>).alias = {
      ...(((config.resolve as Record<string, unknown>).alias as Record<string, string>) ??
        {}),
      // uuid v9+ exports map doesn't expose './dist/index.js' as a subpath,
      // so require.resolve('uuid/dist/index.js') throws ERR_PACKAGE_PATH_NOT_EXPORTED.
      // Resolve via the always-exported './package.json' subpath instead, then
      // construct the absolute path to the CJS entry manually.
      uuid: path.resolve(require.resolve('uuid/package.json'), '..', 'dist', 'index.js'),
    };

    if (isServer) {
      // pnpm symlinks resolve before Next.js's serverExternalPackages check runs,
      // so workspace packages lose their bare module name and aren't matched.
      // Add an explicit externals function that matches on the raw request string
      // to prevent webpack parsing their pre-built ESM bundles (which use rollup's
      // CJS interop pattern, including a default import of uuid that uuid@9 removed).
      const prev = (config.externals ?? []) as unknown[];
      config.externals = [
        ...prev,
        (data: { request?: string }, callback: (err?: null, result?: string) => void) => {
          const { request } = data;
          if (typeof request === 'string' && request.startsWith('@itrade/')) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },

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
    // All crypto icons are served locally from /public/crypto-icons/
    // No external image domains required
    remotePatterns: [],
  },

  experimental: {
    serverActions: {
      allowedOrigins: [
        'bot.ihsueh.com',
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
    'bot.ihsueh.com',
    'itrade.ihsueh.com',
    'appleid.apple.com',
    'accounts.google.com',
    'localhost:3000',
    'localhost:3002',
  ],
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
