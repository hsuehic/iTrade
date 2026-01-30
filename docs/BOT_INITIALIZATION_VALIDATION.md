# Bot Initialization Validation

## Overview

Enhanced the console application to ensure `BotInstance` is only initialized for users who have valid exchange accounts with complete credentials.

## Changes Made

### 1. BotManager Validation (`apps/console/src/BotManager.ts`)

**Before:**
- Created bot instances for any user with an `isActive: true` account
- No validation of credentials (apiKey, secretKey, passphrase)
- Could create bots that would fail during initialization

**After:**
- Validates each account has required credentials before creating bot
- Filters out invalid accounts:
  - Missing `apiKey` or `secretKey`
  - OKX accounts missing `passphrase`
  - Accounts without a valid user ID
- Only creates bots for users with at least one valid account
- Adds try-catch around bot initialization with cleanup on failure

**Validation Logic:**
```typescript
const validAccounts = accounts.filter(acc => {
  // Must have user, apiKey, and secretKey
  if (!acc.user?.id || !acc.apiKey || !acc.secretKey) {
    return false;
  }
  
  // OKX requires passphrase
  if (acc.exchange.toLowerCase() === 'okx' && !acc.passphrase) {
    this.logger.warn(`⚠️  OKX account for user ${acc.user.id} missing passphrase, skipping`);
    return false;
  }
  
  return true;
});
```

**Improved Logging:**
```
📊 Found 3 users with valid exchange accounts (5 total accounts)
🆕 Found new active user: user-123. Starting bot...
✅ Bot successfully started for user user-123
```

**Error Handling:**
- If bot initialization fails, it's caught and logged
- Failed bot is cleaned up (stopped) to prevent resource leaks
- Other bots continue to run normally

### 2. BotInstance Exchange Loading (`apps/console/src/BotInstance.ts`)

**Before:**
- Silently skipped accounts without credentials
- Logged warnings but continued even if no exchanges loaded
- Could result in a bot with zero exchanges

**After:**
- Throws error if no active accounts found
- Tracks success/skip counts during exchange loading
- Throws error if zero exchanges successfully loaded
- Provides detailed error messages with counts

**Enhanced Validation:**
```typescript
// Validate credentials exist
if (!account.apiKey || !account.secretKey) {
  this.logger.warn(`   ⚠️  ${exchangeName} account missing credentials, skipping`);
  skipCount++;
  continue;
}

// OKX-specific validation
if (exchangeName === 'okx' && !passphrase) {
  this.logger.warn(`   ⚠️  OKX account missing passphrase, skipping`);
  skipCount++;
  continue;
}

// Unknown exchange validation
default:
  this.logger.warn(`   ⚠️  Unknown exchange type: ${exchangeName}, skipping`);
  skipCount++;
  continue;
```

**Final Validation:**
```typescript
if (successCount === 0) {
  throw new Error(
    `No valid exchanges loaded for user ${this.userId}. ` +
    `Found ${accounts.length} accounts, ${skipCount} skipped/failed. ` +
    `Please ensure accounts have valid API credentials.`
  );
}
```

**Improved Logging:**
```
   ⚠️  binance account missing credentials, skipping
   ✅ okx connected (User: user-123)
   ❌ Failed to load coinbase for user user-123: Invalid API key
   📊 Loaded 1 exchange(s) for user user-123 (2 skipped)
```

## Benefits

### 1. **Prevents Invalid Bots**
- No more bots created for users without valid credentials
- Saves system resources (memory, CPU, database connections)

### 2. **Better Error Messages**
- Clear indication of why a bot wasn't created
- Detailed counts of successful/failed exchanges
- Helps users understand what's wrong

### 3. **Cleaner Logs**
- Informative status messages
- Easy to identify configuration issues
- Counts help with monitoring

### 4. **Resource Cleanup**
- Failed bot initializations are properly cleaned up
- No orphaned resources or connections

### 5. **Fail-Fast Behavior**
- Errors thrown early in initialization
- Prevents bots from running in invalid states
- Makes debugging easier

## Example Scenarios

### Scenario 1: User with No Credentials
```
User adds account via web UI but forgets to enter API key

Result:
- Account is marked isActive: true
- BotManager filters it out (no apiKey)
- No bot created for this user
- Log: "⚠️ binance account missing credentials, skipping"
```

### Scenario 2: OKX Without Passphrase
```
User adds OKX account but doesn't enter passphrase

Result:
- BotManager filters it out (OKX requires passphrase)
- No bot created
- Log: "⚠️ OKX account for user user-123 missing passphrase, skipping"
```

### Scenario 3: Multiple Accounts, Some Invalid
```
User has 3 accounts:
- Binance: Valid (apiKey + secretKey)
- OKX: Invalid (missing passphrase)
- Coinbase: Valid (apiKey + secretKey)

Result:
- Bot created for user
- Binance exchange loaded ✅
- OKX exchange skipped ⚠️
- Coinbase exchange loaded ✅
- Log: "📊 Loaded 2 exchange(s) for user user-123 (1 skipped)"
```

### Scenario 4: All Accounts Invalid
```
User has 2 accounts, both missing credentials

Result:
- BotManager filters out both accounts
- No bot created for user
- Log: "📊 Found 0 users with valid exchange accounts (0 total accounts)"
```

### Scenario 5: Bot Initialization Fails
```
User has valid account but network error during exchange.connect()

Result:
- Bot creation attempted
- Exchange connection fails
- Error caught and logged
- Bot stopped and cleaned up
- Log: "❌ Failed to initialize bot for user user-123: Network error"
```

## Testing Checklist

- [ ] User with no accounts → No bot created
- [ ] User with account but no apiKey → No bot created
- [ ] User with account but no secretKey → No bot created
- [ ] User with OKX but no passphrase → No bot created
- [ ] User with valid Binance account → Bot created successfully
- [ ] User with valid OKX account (with passphrase) → Bot created successfully
- [ ] User with multiple accounts (some valid, some invalid) → Bot created with valid exchanges only
- [ ] User with all invalid accounts → No bot created
- [ ] Network error during exchange connection → Bot cleaned up properly
- [ ] Invalid encryption key → Error thrown and logged
- [ ] User deactivates all accounts → Bot stopped and removed

## Migration Notes

### For Existing Deployments

1. **Check Existing Accounts:**
   ```sql
   -- Find accounts without credentials
   SELECT user_id, exchange, account_id
   FROM account_info
   WHERE is_active = true
     AND (api_key IS NULL OR secret_key IS NULL);
   
   -- Find OKX accounts without passphrase
   SELECT user_id, exchange, account_id
   FROM account_info
   WHERE is_active = true
     AND exchange = 'okx'
     AND passphrase IS NULL;
   ```

2. **Fix Invalid Accounts:**
   - Users should add credentials via web/mobile UI
   - Or deactivate accounts that won't be used

3. **Monitor Logs:**
   - Look for "📊 Found X users with valid exchange accounts"
   - Check for warnings about missing credentials
   - Verify bots are created for expected users

## Monitoring

### Key Log Messages

**Success:**
```
📊 Found 5 users with valid exchange accounts (8 total accounts)
🆕 Found new active user: user-123. Starting bot...
   ✅ binance connected (User: user-123)
   📊 Loaded 1 exchange(s) for user user-123 (0 skipped)
✅ Bot successfully started for user user-123
```

**Warnings:**
```
⚠️  OKX account for user user-456 missing passphrase, skipping
⚠️  binance account missing credentials, skipping
```

**Errors:**
```
❌ Failed to initialize bot for user user-789: No valid exchanges loaded for user user-789. Found 2 accounts, 2 skipped/failed. Please ensure accounts have valid API credentials.
```

### Metrics to Track

- Number of users with valid accounts
- Number of bots successfully started
- Number of bot initialization failures
- Number of accounts skipped (by reason)
- Number of exchanges loaded per user

## Future Enhancements

1. **Credential Validation:** Test API credentials before saving
2. **Health Checks:** Periodic validation of exchange connections
3. **Auto-Retry:** Retry failed exchange connections with exponential backoff
4. **Notifications:** Alert users when their bot fails to start
5. **Dashboard:** Show bot status per user in web UI
6. **Metrics:** Export Prometheus metrics for monitoring

## Related Documentation

- [Multi-User Refactoring](./MULTI_USER_REFACTORING.md)
- [Mobile Account Management](./MOBILE_ACCOUNT_MANAGEMENT.md)
