# Multi-User Trading Bot Refactoring

## Overview

This document describes the refactoring of the iTrade console application to support multiple users in a single process, with encrypted API credentials stored in the database.

## Architecture Changes

### 1. Single Process Multi-User Support

**Before**: Each user required a separate process managed by PM2
**After**: Single process manages all users with `BotManager` orchestrating multiple `BotInstance` objects

#### Key Components

- **`BotManager`** (`apps/console/src/BotManager.ts`)
  - Orchestrates multiple bot instances
  - Automatically discovers active users from database
  - Refreshes user list every 5 minutes
  - Handles lifecycle management (start/stop)

- **`BotInstance`** (`apps/console/src/BotInstance.ts`)
  - Encapsulates per-user trading logic
  - Manages exchanges, strategies, trackers for one user
  - Loads encrypted credentials from database
  - Independent lifecycle from other users

- **`main.ts`** (`apps/console/src/main.ts`)
  - Simplified entry point
  - Initializes database and BotManager
  - Displays global order statistics across all users

### 2. Encrypted Credentials Storage

#### Database Schema

**Entity**: `AccountInfoEntity` (`packages/data-manager/src/entities/AccountInfo.ts`)

New fields added:
```typescript
@Column({ type: 'text', nullable: true })
apiKey!: string;  // Encrypted

@Column({ type: 'text', nullable: true })
secretKey!: string;  // Encrypted

@Column({ type: 'text', nullable: true })
passphrase?: string;  // Encrypted (for OKX)

@Column({ type: 'boolean', default: true })
isActive!: boolean;  // Enable/disable trading
```

#### Encryption

**Utility**: `CryptoUtils` (`packages/utils/src/CryptoUtils.ts`)

New methods:
- `encrypt(text: string, secretKey: string): string` - AES-256-CBC encryption
- `decrypt(text: string, secretKey: string): string` - AES-256-CBC decryption

**Environment Variable Required**:
```bash
ENCRYPTION_KEY=your_32_character_random_key_here
```

### 3. Web Application - Account Management

#### New Pages & Components

**Page**: `/accounts` (`apps/web/app/(console)/accounts/page.tsx`)
- Server-side rendered account list
- Breadcrumb navigation
- Card-based layout

**Components**:
- `AccountList` (`account-list.tsx`) - Table display with CRUD actions
- `AccountForm` (`account-form.tsx`) - Dialog form for add/edit
  - Exchange selector (Binance, OKX, Coinbase)
  - API Key, Secret Key, Passphrase (for OKX) inputs
  - Active/Inactive toggle
  - Form validation with react-hook-form

#### Server Actions

**File**: `apps/web/app/actions/accounts.ts`

```typescript
export async function getAccounts()
export async function saveAccount(data: AccountDto)
export async function deleteAccount(id: number)
```

#### API Routes

**GET** `/api/accounts` - List user's accounts
**POST** `/api/accounts` - Create/update account
**DELETE** `/api/accounts/[id]` - Delete account

#### Service Layer

**File**: `apps/web/lib/services/account-service.ts`

```typescript
export async function getUserAccounts(userId: string)
export async function upsertAccount(data: AccountDto)
export async function removeAccount(id: number, userId: string)
```

## Migration Guide

### For Existing Deployments

#### 1. Database Migration

Run the following SQL to add new columns:

```sql
ALTER TABLE account_info 
ADD COLUMN api_key TEXT,
ADD COLUMN secret_key TEXT,
ADD COLUMN passphrase TEXT,
ADD COLUMN is_active BOOLEAN DEFAULT true;
```

#### 2. Environment Setup

Add to `.env`:
```bash
# Required for credential encryption
ENCRYPTION_KEY=generate_a_secure_32_char_key_here
```

Generate a secure key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3. Migrate Existing Credentials

Create a migration script to encrypt existing credentials from environment variables:

```typescript
import { CryptoUtils } from '@itrade/utils/CryptoUtils';
import { getDataManager } from '@/lib/data-manager';
import { AccountInfoEntity } from '@itrade/data-manager';

async function migrate() {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(AccountInfoEntity);
  const encryptionKey = process.env.ENCRYPTION_KEY!;

  // For each user, create account records
  const binanceAccount = new AccountInfoEntity();
  binanceAccount.user = { id: 'user-id' } as any;
  binanceAccount.exchange = 'binance';
  binanceAccount.accountId = 'Main Account';
  binanceAccount.apiKey = CryptoUtils.encrypt(process.env.BINANCE_API_KEY!, encryptionKey);
  binanceAccount.secretKey = CryptoUtils.encrypt(process.env.BINANCE_SECRET_KEY!, encryptionKey);
  binanceAccount.isActive = true;
  binanceAccount.updateTime = new Date();
  binanceAccount.canTrade = true;
  binanceAccount.canDeposit = true;
  binanceAccount.canWithdraw = true;

  await repo.save(binanceAccount);
  // Repeat for OKX, Coinbase...
}
```

### 4. Update Console App

**Old way** (PM2 with multiple processes):
```bash
pm2 start ecosystem.config.js
```

**New way** (single process):
```bash
cd apps/console
npm run build
npm run start
```

The app will automatically:
1. Connect to database
2. Load all active users
3. Create a BotInstance for each user
4. Start trading for all users
5. Refresh user list every 5 minutes

## Usage

### Web Application

1. Navigate to `/accounts` in the web app
2. Click "Add Account"
3. Select exchange (Binance/OKX/Coinbase)
4. Enter API credentials
5. Toggle active status
6. Save

The console app will automatically detect the new account within 5 minutes.

### Console Application

Start the app:
```bash
cd apps/console
npm run dev
```

Monitor logs:
```bash
# Shows activity for all users
tail -f logs/console.log
```

Stop gracefully:
```bash
# Press Ctrl+C
```

## Security Considerations

1. **Encryption Key**: Store `ENCRYPTION_KEY` securely (e.g., AWS Secrets Manager, HashiCorp Vault)
2. **Database Access**: Ensure PostgreSQL uses SSL in production
3. **API Keys**: Never log decrypted keys
4. **Web App**: All account operations require authentication
5. **Masked Display**: API keys are masked in UI (e.g., `abc****xyz`)

## Benefits

### Before (PM2 Multi-Process)
- ❌ Complex PM2 configuration
- ❌ High memory usage (N processes)
- ❌ Difficult to manage credentials
- ❌ Manual process restart for new users

### After (Single Process)
- ✅ Simple deployment (one process)
- ✅ Lower memory footprint
- ✅ Centralized credential management
- ✅ Automatic user discovery
- ✅ Web UI for account management
- ✅ Encrypted storage

## Troubleshooting

### Bot not starting for a user

Check:
1. Account is marked as `isActive = true`
2. Credentials are correctly encrypted
3. Exchange API keys have correct permissions
4. Check console logs for specific errors

### Encryption errors

```
Error: Invalid encrypted text format
```

Solution: Ensure `ENCRYPTION_KEY` matches the key used to encrypt

### Database connection issues

```
Error: ENCRYPTION_KEY environment variable is required
```

Solution: Add `ENCRYPTION_KEY` to `.env` file

## Future Enhancements

1. **Mobile App Integration**: Add account management to Flutter app
2. **Audit Logging**: Track all credential changes
3. **Key Rotation**: Support for rotating encryption keys
4. **Multi-Region**: Support for different exchange regions
5. **Backup/Restore**: Export/import encrypted credentials

## Files Changed

### Console App
- `apps/console/src/main.ts` - Refactored for multi-user
- `apps/console/src/BotManager.ts` - New orchestrator
- `apps/console/src/BotInstance.ts` - New per-user bot
- `apps/console/src/tools/generate-pm2.ts` - Legacy PM2 generator (optional)

### Data Manager
- `packages/data-manager/src/entities/AccountInfo.ts` - Added credential fields

### Utils
- `packages/utils/src/CryptoUtils.ts` - Added encrypt/decrypt methods

### Web App
- `apps/web/app/(console)/accounts/page.tsx` - Account management page
- `apps/web/app/(console)/accounts/account-list.tsx` - List component
- `apps/web/app/(console)/accounts/account-form.tsx` - Form component
- `apps/web/app/actions/accounts.ts` - Server actions
- `apps/web/app/api/accounts/route.ts` - API endpoints
- `apps/web/app/api/accounts/[id]/route.ts` - Delete endpoint
- `apps/web/lib/services/account-service.ts` - Business logic

## Testing

### Unit Tests
```bash
cd apps/console
npm run test:unit
```

### Integration Tests
```bash
cd apps/console
npm run test:integration
```

### Manual Testing
1. Add account via web UI
2. Verify encryption in database
3. Check console app picks up new user
4. Verify trading works
5. Deactivate account
6. Verify bot stops for that user

## Support

For issues or questions:
1. Check logs: `apps/console/logs/`
2. Review database: `SELECT * FROM account_info WHERE user_id = 'your-id'`
3. Verify environment variables are set correctly
