import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
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
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 64, color: Colors.red),
                      SizedBox(height: 16),
                      Text('Error: $_error'),
                      SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadAccounts,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _accounts.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.account_balance_wallet_outlined,
                            size: 64,
                            color: Colors.grey,
                          ),
                          SizedBox(height: 16),
                          Text(
                            'No accounts yet',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Add an exchange account to start trading',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: Colors.grey,
                                ),
                          ),
                          SizedBox(height: 24),
                          ElevatedButton.icon(
                            onPressed: () => _showAccountForm(),
                            icon: const Icon(Icons.add),
                            label: const Text('Add Account'),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadAccounts,
                      child: ListView.builder(
                        padding: EdgeInsets.all(16.w),
                        itemCount: _accounts.length,
                        itemBuilder: (context, index) {
                          final account = _accounts[index];
                          return _buildAccountCard(account, isDark);
                        },
                      ),
                    ),
      floatingActionButton: _accounts.isNotEmpty
          ? FloatingActionButton(
              onPressed: () => _showAccountForm(),
              child: const Icon(Icons.add),
            )
          : null,
    );
  }

  Widget _buildAccountCard(ExchangeAccount account, bool isDark) {
    final exchangeColor = _getExchangeColor(account.exchange);
    final exchangeIcon = _getExchangeIcon(account.exchange);

    return Card(
      margin: EdgeInsets.only(bottom: 12.h),
      elevation: isDark ? 2 : 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12.r),
      ),
      child: InkWell(
        onTap: () => _showAccountForm(account),
        borderRadius: BorderRadius.circular(12.r),
        child: Padding(
          padding: EdgeInsets.all(16.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: EdgeInsets.all(8.w),
                    decoration: BoxDecoration(
                      color: exchangeColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8.r),
                    ),
                    child: Icon(
                      exchangeIcon,
                      color: exchangeColor,
                      size: 24.sp,
                    ),
                  ),
                  SizedBox(width: 12.w),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          account.exchange.toUpperCase(),
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        SizedBox(height: 4.h),
                        Text(
                          account.accountId,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Colors.grey,
                              ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 6.h),
                    decoration: BoxDecoration(
                      color: account.isActive ? Colors.green.withOpacity(0.1) : Colors.grey.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20.r),
                    ),
                    child: Text(
                      account.isActive ? 'Active' : 'Inactive',
                      style: TextStyle(
                        color: account.isActive ? Colors.green : Colors.grey,
                        fontSize: 12.sp,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 12.h),
              Divider(height: 1),
              SizedBox(height: 12.h),
              Row(
                children: [
                  Icon(Icons.vpn_key_outlined, size: 16.sp, color: Colors.grey),
                  SizedBox(width: 8.w),
                  Expanded(
                    child: Text(
                      account.apiKey ?? '****',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            fontFamily: 'monospace',
                            color: Colors.grey,
                          ),
                    ),
                  ),
                ],
              ),
              if (account.updatedTime != null) ...[
                SizedBox(height: 8.h),
                Row(
                  children: [
                    Icon(Icons.update, size: 16.sp, color: Colors.grey),
                    SizedBox(width: 8.w),
                    Text(
                      'Updated ${_formatDate(account.updatedTime!)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey,
                          ),
                    ),
                  ],
                ),
              ],
              SizedBox(height: 12.h),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: () => _showAccountForm(account),
                    icon: Icon(Icons.edit_outlined, size: 16.sp),
                    label: const Text('Edit'),
                  ),
                  SizedBox(width: 8.w),
                  TextButton.icon(
                    onPressed: () => _deleteAccount(account),
                    icon: Icon(Icons.delete_outline, size: 16.sp),
                    label: const Text('Delete'),
                    style: TextButton.styleFrom(foregroundColor: Colors.red),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getExchangeColor(String exchange) {
    switch (exchange.toLowerCase()) {
      case 'binance':
        return const Color(0xFFF3BA2F);
      case 'okx':
        return const Color(0xFF000000);
      case 'coinbase':
        return const Color(0xFF0052FF);
      default:
        return Colors.blue;
    }
  }

  IconData _getExchangeIcon(String exchange) {
    switch (exchange.toLowerCase()) {
      case 'binance':
      case 'okx':
      case 'coinbase':
        return Icons.currency_exchange;
      default:
        return Icons.account_balance;
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
}
