import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
