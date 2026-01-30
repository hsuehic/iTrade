# Mobile App - Exchange Account Management

## Overview

This document describes the implementation of exchange account management in the Flutter mobile application. Users can now add, edit, and delete their exchange accounts (Binance, OKX, Coinbase) directly from the mobile app.

## Features Implemented

### 1. Account Service (`lib/services/account_service.dart`)

**Purpose**: Handles all API communication for account management

**Methods**:
- `getAccounts()` - Fetch all exchange accounts for the current user
- `saveAccount()` - Create or update an exchange account
- `deleteAccount(int id)` - Delete an exchange account

**Model**:
```dart
class ExchangeAccount {
  final int? id;
  final String exchange;        // 'binance', 'okx', 'coinbase'
  final String accountId;        // User-friendly account name
  final String? apiKey;          // Masked for display
  final bool isActive;           // Enable/disable trading
  final DateTime? updatedTime;
}
```

### 2. Exchange Accounts Screen (`lib/screens/exchange_accounts.dart`)

**Features**:
- ✅ List all user's exchange accounts
- ✅ Beautiful card-based UI with exchange-specific colors
- ✅ Status indicators (Active/Inactive)
- ✅ Masked API key display for security
- ✅ Pull-to-refresh functionality
- ✅ Empty state with call-to-action
- ✅ Edit and delete actions
- ✅ Floating action button to add new accounts

**UI Elements**:
- Exchange icon with color-coded background
- Account name and exchange type
- Active/Inactive status badge
- Masked API key (e.g., `abcd****wxyz`)
- Last updated timestamp (relative time)
- Edit and Delete buttons

### 3. Account Form Screen (`lib/screens/account_form.dart`)

**Features**:
- ✅ Add new exchange account
- ✅ Edit existing account (name and status only)
- ✅ Form validation
- ✅ Exchange selection dropdown (Binance, OKX, Coinbase)
- ✅ Conditional passphrase field for OKX
- ✅ Password visibility toggle
- ✅ Active/Inactive toggle switch
- ✅ Security info card
- ✅ Responsive design (phone & tablet)

**Form Fields**:
1. **Exchange** - Dropdown (Binance, OKX, Coinbase)
2. **Account Name** - Text input (e.g., "Main Account")
3. **API Key** - Text input
4. **Secret Key** - Password input with visibility toggle
5. **Passphrase** - Password input (OKX only)
6. **Active Status** - Switch toggle

**Security Notes**:
- API credentials are encrypted before sending to server
- For existing accounts, credentials cannot be edited (must delete and re-add)
- Info card reminds users about encryption

### 4. Profile Integration

**Changes to `lib/screens/profile.dart`**:
- Added "Exchange Accounts" menu item in Account section
- Positioned between "Email Preferences" and "Delete Account"
- Icon: `Icons.account_balance_wallet_outlined`
- Navigates to `/exchange-accounts` route
- Available in both phone and tablet layouts

### 5. Routing

**Updated `lib/main.dart`**:
```dart
routes: {
  '/exchange-accounts': (_) => const ExchangeAccountsScreen(),
  // ... other routes
}
```

## User Flow

### Adding an Account

1. User opens Profile screen
2. Taps "Exchange Accounts"
3. Sees empty state or list of existing accounts
4. Taps "+" FAB or "Add Account" button
5. Fills in form:
   - Selects exchange
   - Enters account name
   - Enters API key
   - Enters secret key
   - (OKX only) Enters passphrase
   - Toggles active status
6. Taps "Add Account"
7. Account is encrypted and saved to database
8. Returns to account list

### Editing an Account

1. User taps on an account card or Edit button
2. Form opens with existing data
3. User can update:
   - Account name
   - Active status
4. Note: API credentials cannot be edited (security measure)
5. Taps "Update Account"
6. Changes are saved

### Deleting an Account

1. User taps Delete button on account card
2. Confirmation dialog appears
3. User confirms deletion
4. Account is removed from database
5. List refreshes automatically

## API Endpoints Used

### GET `/api/accounts`
- Fetches all accounts for authenticated user
- Returns array of `ExchangeAccount` objects
- API keys are masked in response

### POST `/api/accounts`
- Creates or updates an account
- Request body:
  ```json
  {
    "id": 123,  // Optional, for updates
    "exchange": "binance",
    "accountId": "Main Account",
    "apiKey": "...",
    "secretKey": "...",
    "passphrase": "...",  // Optional, OKX only
    "isActive": true
  }
  ```

### DELETE `/api/accounts/:id`
- Deletes an account by ID
- Returns success/failure status

## Design Highlights

### Color Coding
- **Binance**: Gold (#F3BA2F)
- **OKX**: Black (#000000)
- **Coinbase**: Blue (#0052FF)

### Status Indicators
- **Active**: Green badge
- **Inactive**: Grey badge

### Responsive Design
- Phone: Single column list
- Tablet: Optimized card layout
- Adaptive spacing using ScreenUtil

### Empty States
- Friendly icon and message
- Clear call-to-action button
- Encourages user to add first account

## Security Features

1. **Encryption**: All API credentials encrypted before storage
2. **Masked Display**: API keys shown as `abcd****wxyz`
3. **No Edit Credentials**: Existing credentials cannot be viewed or edited
4. **HTTPS Only**: All API calls over secure connection
5. **Authentication Required**: All endpoints require valid session

## Testing Checklist

- [ ] Add Binance account
- [ ] Add OKX account (with passphrase)
- [ ] Add Coinbase account
- [ ] Edit account name
- [ ] Toggle active/inactive status
- [ ] Delete account
- [ ] Pull to refresh
- [ ] Empty state display
- [ ] Error handling (network errors)
- [ ] Form validation
- [ ] Tablet layout
- [ ] Dark mode support

## Known Limitations

1. **No Credential Edit**: Users must delete and re-add to change API keys
2. **No Bulk Operations**: Can only manage one account at a time
3. **No Export/Import**: Cannot backup or restore account configurations

## Future Enhancements

1. **Account Verification**: Test API credentials before saving
2. **Balance Display**: Show account balance on card
3. **Trading Stats**: Display trading activity per account
4. **Account Groups**: Organize accounts by strategy or purpose
5. **Biometric Auth**: Require biometric confirmation for sensitive operations
6. **Credential Rotation**: Support for rotating API keys
7. **Multi-Exchange View**: Aggregate view across all exchanges

## Files Created/Modified

### New Files
- `lib/services/account_service.dart` - Account API service
- `lib/screens/exchange_accounts.dart` - Account list screen
- `lib/screens/account_form.dart` - Add/edit account form

### Modified Files
- `lib/screens/profile.dart` - Added Exchange Accounts menu item
- `lib/main.dart` - Added route and import

## Dependencies

No new dependencies required. Uses existing:
- `flutter_screenutil` - Responsive sizing
- `http` (via ApiClient) - API communication
- Material Design components

## Screenshots

### Account List (Empty State)
```
┌─────────────────────────┐
│  Exchange Accounts      │
├─────────────────────────┤
│                         │
│    🏦                   │
│    No accounts yet      │
│    Add an exchange      │
│    account to start     │
│    trading              │
│                         │
│   [+ Add Account]       │
│                         │
└─────────────────────────┘
```

### Account List (With Accounts)
```
┌─────────────────────────┐
│  Exchange Accounts      │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ 🟡 BINANCE  [Active]│ │
│ │ Main Account        │ │
│ │ 🔑 abcd****wxyz     │ │
│ │ 🕐 2h ago           │ │
│ │     [Edit] [Delete] │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ ⚫ OKX      [Active]│ │
│ │ Trading Bot         │ │
│ │ 🔑 efgh****1234     │ │
│ │ 🕐 1d ago           │ │
│ │     [Edit] [Delete] │ │
│ └─────────────────────┘ │
└─────────────────────────┘
         [+]
```

### Add Account Form
```
┌─────────────────────────┐
│  Add Account            │
├─────────────────────────┤
│ ℹ️ Your API credentials │
│   will be encrypted...  │
│                         │
│ Exchange                │
│ [Binance ▼]            │
│                         │
│ Account Name            │
│ [Main Account______]    │
│                         │
│ API Key                 │
│ [________________]      │
│                         │
│ Secret Key              │
│ [****************] 👁   │
│                         │
│ ┌─────────────────────┐ │
│ │ ✓ Active Status     │ │
│ │ Enable trading  [●] │ │
│ └─────────────────────┘ │
│                         │
│   [Add Account]         │
└─────────────────────────┘
```

## Support

For issues or questions:
1. Check API endpoint connectivity
2. Verify authentication token is valid
3. Check server logs for encryption errors
4. Ensure `ENCRYPTION_KEY` is set on server
