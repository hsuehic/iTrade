# TypeORM + Next.js Setup Guide

## Problem

When using TypeORM with Next.js, you may encounter the error:
```
EntityMetadataNotFoundError: No metadata for "_class" was found.
```

This happens because Next.js's webpack bundling can break TypeORM's decorator metadata system.

## Solution

### 1. Install Required Dependencies

```bash
cd apps/web
pnpm add reflect-metadata typeorm
```

### 2. Configure TypeScript

Update `tsconfig.json` to enable decorator support:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    // ... other options
  }
}
```

### 3. Configure Next.js

Update `next.config.ts` to properly handle TypeORM:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // In Next.js 15.5+, use serverExternalPackages
  // For older versions, use experimental.serverComponentsExternalPackages
  serverExternalPackages: ['typeorm', '@itrade/data-manager'],
  
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'typeorm'];
    }
    
    config.resolve.alias = {
      ...config.resolve.alias,
      typeorm: require.resolve('typeorm'),
    };

    return config;
  },
};

export default nextConfig;
```

**Note**: If you're using Next.js 15.4 or earlier, use:
```typescript
experimental: {
  serverComponentsExternalPackages: ['typeorm', '@itrade/data-manager'],
}
```

### 4. Import reflect-metadata

**IMPORTANT**: Always import `reflect-metadata` at the top of files that use TypeORM:

```typescript
// lib/db.ts
import 'reflect-metadata'; // MUST be first!
import { TypeOrmDataManager } from '@itrade/data-manager';
```

### 5. Restart Development Server

After making these changes, restart your Next.js development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart
pnpm dev
```

## Why This Happens

TypeORM uses TypeScript decorators (`@Entity`, `@Column`, etc.) which rely on metadata reflection. Next.js's webpack bundler can strip this metadata during the build process, causing TypeORM to fail to recognize entities.

The solution involves:
1. Ensuring TypeScript emits decorator metadata
2. Telling Next.js to not bundle TypeORM on the server
3. Importing reflect-metadata before any TypeORM code runs

## Verification

After applying these fixes, you should be able to:
1. Query strategies without errors
2. Create/update/delete entities
3. Use all TypeORM features normally

## Common Issues

### Issue: Still getting the error after changes

**Solution**: Make sure you:
1. Stopped and restarted the dev server (not just refresh)
2. Cleared Next.js cache: `rm -rf .next`
3. Reinstalled dependencies: `pnpm install`

### Issue: Error in production build

**Solution**: Ensure `synchronize: false` in TypeORM config and run migrations separately:
```typescript
const dataManager = new TypeOrmDataManager({
  synchronize: false, // Never use true in production
  migrationsRun: true, // Run migrations on startup
});
```

### Issue: Different behavior in dev vs production

**Solution**: Test production build locally:
```bash
pnpm build
pnpm start
```

## References

- [TypeORM Documentation](https://typeorm.io/)
- [Next.js External Packages](https://nextjs.org/docs/app/api-reference/next-config-js/serverComponentsExternalPackages)
- [TypeScript Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html)

