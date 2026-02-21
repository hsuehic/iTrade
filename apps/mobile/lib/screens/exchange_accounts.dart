import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../design/tokens/color.dart';
import '../services/account_service.dart';
import 'account_form.dart';

class ExchangeAccountsScreen extends StatefulWidget {
  const ExchangeAccountsScreen({super.key});

  @override
  State<ExchangeAccountsScreen> createState() => _ExchangeAccountsScreenState();
}

class _ExchangeAccountsScreenState extends State<ExchangeAccountsScreen> {
  final AccountService _accountService = AccountService.instance;
  List<ExchangeAccount> _accounts = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadAccounts();
  }

  Future<void> _loadAccounts() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final accounts = await _accountService.getAccounts();
      if (mounted) {
        setState(() {
          _accounts = accounts;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _deleteAccount(ExchangeAccount account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Account'),
        content: Text('Are you sure you want to delete ${account.accountId}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true && account.id != null) {
      try {
        await _accountService.deleteAccount(account.id!);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Account deleted successfully')),
          );
          _loadAccounts();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to delete account: $e')),
          );
        }
      }
    }
  }

  void _showAccountForm([ExchangeAccount? account]) async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (context) => AccountFormScreen(account: account),
      ),
    );

    if (result == true) {
      _loadAccounts();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Exchange Accounts'),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _buildErrorState(context)
          : _accounts.isEmpty
          ? _buildEmptyState(context)
          : RefreshIndicator(
              onRefresh: _loadAccounts,
              child: ListView.separated(
                padding: EdgeInsets.all(16.w),
                itemCount: _accounts.length + 1,
                separatorBuilder: (context, index) => SizedBox(height: 12.h),
                itemBuilder: (context, index) {
                  if (index == 0) {
                    return _buildHeaderCard(context, isDark);
                  }
                  final account = _accounts[index - 1];
                  return _buildAccountCard(account, isDark);
                },
              ),
            ),
      floatingActionButton: _accounts.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: () => _showAccountForm(),
              icon: const Icon(Icons.add),
              label: const Text('Add Account'),
            )
          : null,
    );
  }

  Widget _buildHeaderCard(BuildContext context, bool isDark) {
    final surface = Theme.of(context).colorScheme.surface;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final gradientColors = isDark
        ? [ColorTokens.gradientStartDark, ColorTokens.gradientEndDark]
        : [ColorTokens.gradientStart, ColorTokens.gradientEnd];

    return Container(
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradientColors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: [
          BoxShadow(
            color: _withAlpha(Colors.black, isDark ? 0.35 : 0.12),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 48.w,
            height: 48.w,
            decoration: BoxDecoration(
              color: _withAlpha(surface, isDark ? 0.3 : 0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.account_balance_wallet_outlined,
              color: onSurface,
              size: 24.sp,
            ),
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connected Exchanges',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 4.h),
                Text(
                  'Manage API keys and permissions safely',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: _withAlpha(Colors.white, 0.85),
                  ),
                ),
              ],
            ),
          ),
          Icon(
            Icons.shield_outlined,
            color: _withAlpha(Colors.white, 0.9),
            size: 22.sp,
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(24.w),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64.sp,
              color: Theme.of(context).colorScheme.error,
            ),
            SizedBox(height: 16.h),
            Text(
              'Something went wrong',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8.h),
            Text(
              _error ?? 'Unknown error',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: Colors.grey),
            ),
            SizedBox(height: 20.h),
            ElevatedButton.icon(
              onPressed: _loadAccounts,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Center(
      child: Padding(
        padding: EdgeInsets.all(24.w),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 72.w,
              height: 72.w,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _withAlpha(Theme.of(context).colorScheme.primary, 0.12),
              ),
              child: Icon(
                Icons.link_outlined,
                size: 36.sp,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            SizedBox(height: 16.w),
            Text(
              'No connected exchanges',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8.w),
            Text(
              'Link your exchange API keys to start trading with iTrade.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: isDark ? Colors.grey[400] : Colors.grey[600],
              ),
            ),
            SizedBox(height: 24.w),
            ElevatedButton.icon(
              onPressed: () => _showAccountForm(),
              icon: const Icon(Icons.add),
              label: const Text('Add Account'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAccountCard(ExchangeAccount account, bool isDark) {
    final exchangeColor = _getExchangeColor(account.exchange, context);
    final surface = Theme.of(context).colorScheme.surface;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final borderColor = isDark
        ? _withAlpha(Colors.white, 0.08)
        : _withAlpha(Colors.black, 0.05);
    final statusColor = account.isActive
        ? ColorTokens.profitGreen
        : Colors.grey;

    return Material(
      color: surface,
      borderRadius: BorderRadius.circular(16.r),
      elevation: isDark ? 1 : 0,
      child: InkWell(
        onTap: () => _showAccountForm(account),
        borderRadius: BorderRadius.circular(16.r),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16.r),
            border: Border.all(color: borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: EdgeInsets.all(16.w),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      _withAlpha(exchangeColor, isDark ? 0.2 : 0.12),
                      _withAlpha(surface, 0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(16.r),
                    topRight: Radius.circular(16.r),
                  ),
                ),
                child: Row(
                  children: [
                    _buildExchangeLogo(
                      exchange: account.exchange,
                      accentColor: exchangeColor,
                      isDark: isDark,
                    ),
                    SizedBox(width: 12.w),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            account.exchange.toUpperCase(),
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          SizedBox(height: 4.h),
                          Text(
                            'Account ID',
                            style: Theme.of(
                              context,
                            ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                          ),
                          Text(
                            _maskKey(account.accountId),
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: _withAlpha(onSurface, 0.7),
                                  fontFamily: 'monospace',
                                ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 12.w,
                        vertical: 6.h,
                      ),
                      decoration: BoxDecoration(
                        color: _withAlpha(statusColor, 0.12),
                        borderRadius: BorderRadius.circular(20.r),
                      ),
                      child: Text(
                        account.isActive ? 'Active' : 'Inactive',
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 12.sp,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.all(16.w),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.vpn_key_outlined,
                          size: 16.sp,
                          color: Colors.grey,
                        ),
                        SizedBox(width: 8.w),
                        Text(
                          'API Key',
                          style: Theme.of(
                            context,
                          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                        ),
                      ],
                    ),
                    SizedBox(height: 6.h),
                    Text(
                      _maskKey(account.apiKey),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontFamily: 'monospace',
                        color: _withAlpha(onSurface, 0.8),
                      ),
                    ),
                    if (account.updatedTime != null) ...[
                      SizedBox(height: 12.h),
                      Row(
                        children: [
                          Icon(Icons.update, size: 16.sp, color: Colors.grey),
                          SizedBox(width: 8.w),
                          Text(
                            'Updated ${_formatDate(account.updatedTime!)}',
                            style: Theme.of(
                              context,
                            ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                          ),
                        ],
                      ),
                    ],
                    SizedBox(height: 16.h),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => _showAccountForm(account),
                          icon: Icon(Icons.edit_outlined, size: 16.sp),
                          label: const Text('Edit'),
                        ),
                        SizedBox(width: 8.w),
                        TextButton.icon(
                          onPressed: () => _deleteAccount(account),
                          icon: Icon(Icons.delete_outline, size: 16.sp),
                          label: const Text('Delete'),
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.red,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getExchangeColor(String exchange, BuildContext context) {
    switch (exchange.toLowerCase()) {
      case 'binance':
        return ColorTokens.exchangeBinance;
      case 'okx':
        return ColorTokens.exchangeOkx;
      case 'coinbase':
        return ColorTokens.exchangeCoinbase;
      default:
        return Theme.of(context).colorScheme.primary;
    }
  }

  String? _getExchangeLogoAsset(String exchange) {
    switch (exchange.toLowerCase()) {
      case 'binance':
        return 'assets/icons/exchanges/binance.png';
      case 'coinbase':
        return 'assets/icons/exchanges/coinbase.png';
      case 'okx':
        return 'assets/icons/exchanges/okx.png';
      default:
        return null;
    }
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays > 7) {
      return '${date.day}/${date.month}/${date.year}';
    } else if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }

  Color _withAlpha(Color color, double opacity) {
    final clamped = opacity.clamp(0.0, 1.0);
    return color.withValues(alpha: clamped);
  }

  Widget _buildExchangeLogo({
    required String exchange,
    required Color accentColor,
    required bool isDark,
  }) {
    final asset = _getExchangeLogoAsset(exchange);
    final background = _withAlpha(accentColor, isDark ? 0.18 : 0.12);
    final borderColor = _withAlpha(accentColor, isDark ? 0.35 : 0.2);

    return Container(
      width: 44.w,
      height: 44.w,
      decoration: BoxDecoration(
        color: background,
        shape: BoxShape.circle,
        border: Border.all(color: borderColor),
      ),
      child: ClipOval(
        child: asset == null
            ? Icon(Icons.account_balance, color: accentColor, size: 22.sp)
            : Padding(
                padding: EdgeInsets.all(8.w),
                child: Image.asset(
                  asset,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) {
                    return Icon(
                      Icons.account_balance,
                      color: accentColor,
                      size: 22.sp,
                    );
                  },
                ),
              ),
      ),
    );
  }

  String _maskKey(String? key) {
    if (key == null || key.trim().isEmpty) {
      return 'Not set';
    }
    final normalized = key.replaceAll(RegExp(r'\s+'), '');
    if (normalized.length <= 6) {
      return '${normalized.substring(0, 2)}****';
    }
    final head = normalized.substring(0, 4);
    final tail = normalized.substring(normalized.length - 4);
    return '$head****$tail';
  }
}
