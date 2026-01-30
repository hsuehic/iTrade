import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/account_service.dart';

class AccountFormScreen extends StatefulWidget {
  final ExchangeAccount? account;

  const AccountFormScreen({super.key, this.account});

  @override
  State<AccountFormScreen> createState() => _AccountFormScreenState();
}

class _AccountFormScreenState extends State<AccountFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _accountIdController = TextEditingController();
  final _apiKeyController = TextEditingController();
  final _secretKeyController = TextEditingController();
  final _passphraseController = TextEditingController();
  
  String _selectedExchange = 'binance';
  bool _isActive = true;
  bool _saving = false;
  bool _obscureSecret = true;
  bool _obscurePassphrase = true;

  @override
  void initState() {
    super.initState();
    if (widget.account != null) {
      _selectedExchange = widget.account!.exchange;
      _accountIdController.text = widget.account!.accountId;
      _isActive = widget.account!.isActive;
      // Note: API keys are not editable for security reasons
      // Users must delete and re-add to change credentials
    }
  }

  @override
  void dispose() {
    _accountIdController.dispose();
    _apiKeyController.dispose();
    _secretKeyController.dispose();
    _passphraseController.dispose();
    super.dispose();
  }

  Future<void> _saveAccount() async {
    if (!_formKey.currentState!.validate()) return;

    // For existing accounts, only allow updating accountId and isActive
    if (widget.account != null && _apiKeyController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('To update API credentials, please delete and re-add the account'),
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final success = await AccountService.instance.saveAccount(
        id: widget.account?.id,
        exchange: _selectedExchange,
        accountId: _accountIdController.text.trim(),
        apiKey: _apiKeyController.text.trim(),
        secretKey: _secretKeyController.text.trim(),
        passphrase: _selectedExchange == 'okx' ? _passphraseController.text.trim() : null,
        isActive: _isActive,
      );

      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Account saved successfully')),
        );
        Navigator.pop(context, true);
      } else {
        throw Exception('Failed to save account');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isEditing = widget.account != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEditing ? 'Edit Account' : 'Add Account'),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.all(16.w),
          children: [
            // Info Card
            Card(
              color: Colors.blue.withOpacity(0.1),
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12.r),
                side: BorderSide(color: Colors.blue.withOpacity(0.3)),
              ),
              child: Padding(
                padding: EdgeInsets.all(16.w),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: Colors.blue),
                    SizedBox(width: 12.w),
                    Expanded(
                      child: Text(
                        'Your API credentials will be encrypted and stored securely.',
                        style: TextStyle(fontSize: 13.sp, color: Colors.blue.shade700),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(height: 24.h),

            // Exchange Selection
            Text(
              'Exchange',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            SizedBox(height: 8.h),
            DropdownButtonFormField<String>(
              value: _selectedExchange,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.currency_exchange),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12.r),
                ),
                filled: true,
                fillColor: isDark ? Colors.grey[850] : Colors.grey[100],
              ),
              items: const [
                DropdownMenuItem(value: 'binance', child: Text('Binance')),
                DropdownMenuItem(value: 'okx', child: Text('OKX')),
                DropdownMenuItem(value: 'coinbase', child: Text('Coinbase')),
              ],
              onChanged: isEditing
                  ? null
                  : (value) {
                      setState(() => _selectedExchange = value!);
                    },
            ),
            SizedBox(height: 20.h),

            // Account Name
            Text(
              'Account Name',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            SizedBox(height: 8.h),
            TextFormField(
              controller: _accountIdController,
              decoration: InputDecoration(
                hintText: 'e.g., Main Account',
                prefixIcon: const Icon(Icons.account_circle_outlined),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12.r),
                ),
                filled: true,
                fillColor: isDark ? Colors.grey[850] : Colors.grey[100],
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Please enter an account name';
                }
                return null;
              },
            ),
            SizedBox(height: 20.h),

            // API Key
            Text(
              'API Key',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            SizedBox(height: 8.h),
            TextFormField(
              controller: _apiKeyController,
              decoration: InputDecoration(
                hintText: isEditing ? 'Leave empty to keep current' : 'Enter API Key',
                prefixIcon: const Icon(Icons.vpn_key_outlined),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12.r),
                ),
                filled: true,
                fillColor: isDark ? Colors.grey[850] : Colors.grey[100],
              ),
              validator: (value) {
                if (!isEditing && (value == null || value.trim().isEmpty)) {
                  return 'Please enter API Key';
                }
                return null;
              },
            ),
            SizedBox(height: 20.h),

            // Secret Key
            Text(
              'Secret Key',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            SizedBox(height: 8.h),
            TextFormField(
              controller: _secretKeyController,
              obscureText: _obscureSecret,
              decoration: InputDecoration(
                hintText: isEditing ? 'Leave empty to keep current' : 'Enter Secret Key',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  icon: Icon(_obscureSecret ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscureSecret = !_obscureSecret),
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12.r),
                ),
                filled: true,
                fillColor: isDark ? Colors.grey[850] : Colors.grey[100],
              ),
              validator: (value) {
                if (!isEditing && (value == null || value.trim().isEmpty)) {
                  return 'Please enter Secret Key';
                }
                return null;
              },
            ),
            SizedBox(height: 20.h),

            // Passphrase (OKX only)
            if (_selectedExchange == 'okx') ...[
              Text(
                'Passphrase',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              SizedBox(height: 8.h),
              TextFormField(
                controller: _passphraseController,
                obscureText: _obscurePassphrase,
                decoration: InputDecoration(
                  hintText: isEditing ? 'Leave empty to keep current' : 'Enter Passphrase',
                  prefixIcon: const Icon(Icons.password_outlined),
                  suffixIcon: IconButton(
                    icon: Icon(_obscurePassphrase ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscurePassphrase = !_obscurePassphrase),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  filled: true,
                  fillColor: isDark ? Colors.grey[850] : Colors.grey[100],
                ),
                validator: (value) {
                  if (!isEditing && (value == null || value.trim().isEmpty)) {
                    return 'Passphrase is required for OKX';
                  }
                  return null;
                },
              ),
              SizedBox(height: 20.h),
            ],

            // Active Status
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12.r),
                side: BorderSide(color: isDark ? Colors.grey[800]! : Colors.grey[300]!),
              ),
              child: SwitchListTile(
                title: const Text('Active Status'),
                subtitle: const Text('Enable or disable trading for this account'),
                value: _isActive,
                onChanged: (value) => setState(() => _isActive = value),
                secondary: Icon(
                  _isActive ? Icons.check_circle : Icons.cancel,
                  color: _isActive ? Colors.green : Colors.grey,
                ),
              ),
            ),
            SizedBox(height: 32.h),

            // Save Button
            ElevatedButton(
              onPressed: _saving ? null : _saveAccount,
              style: ElevatedButton.styleFrom(
                padding: EdgeInsets.symmetric(vertical: 16.h),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12.r),
                ),
              ),
              child: _saving
                  ? SizedBox(
                      height: 20.h,
                      width: 20.w,
                      child: const CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      isEditing ? 'Update Account' : 'Add Account',
                      style: TextStyle(fontSize: 16.sp, fontWeight: FontWeight.w600),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
