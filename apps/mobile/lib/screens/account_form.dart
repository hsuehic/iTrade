import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../design/tokens/color.dart';
import '../services/account_service.dart';

class AccountFormScreen extends StatefulWidget {
  final ExchangeAccount? account;

  const AccountFormScreen({super.key, this.account});

  @override
  State<AccountFormScreen> createState() => _AccountFormScreenState();
}

class _AccountFormScreenState extends State<AccountFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final GlobalKey _exchangeFieldKey = GlobalKey();
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
          content: Text(
            'To update API credentials, please delete and re-add the account',
          ),
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
        passphrase: _selectedExchange == 'okx'
            ? _passphraseController.text.trim()
            : null,
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
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
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
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: EdgeInsets.fromLTRB(16.w, 16.w, 16.w, 24.w),
            children: [
              _buildHeaderBanner(context, isEditing),
              SizedBox(height: 20.w),
              _buildSectionTitle(context, 'Exchange'),
              SizedBox(height: 8.w),
              _buildExchangeField(context, isDark, isEditing),
              SizedBox(height: 20.w),
              _buildSectionTitle(context, 'Account Details'),
              SizedBox(height: 8.w),
              _buildTextField(
                context,
                controller: _accountIdController,
                hintText: 'e.g., Main Account',
                prefix: _buildFieldIcon(Icons.account_circle_outlined),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Please enter an account name';
                  }
                  return null;
                },
              ),
              SizedBox(height: 20.w),
              _buildSectionTitle(context, 'Credentials'),
              SizedBox(height: 8.w),
              _buildTextField(
                context,
                controller: _apiKeyController,
                hintText: isEditing
                    ? 'Leave empty to keep current'
                    : 'Enter API Key',
                prefix: _buildFieldIcon(Icons.vpn_key_outlined),
                validator: (value) {
                  if (!isEditing && (value == null || value.trim().isEmpty)) {
                    return 'Please enter API Key';
                  }
                  return null;
                },
              ),
              SizedBox(height: 12.w),
              _buildTextField(
                context,
                controller: _secretKeyController,
                hintText: isEditing
                    ? 'Leave empty to keep current'
                    : 'Enter Secret Key',
                prefix: _buildFieldIcon(Icons.lock_outline),
                obscureText: _obscureSecret,
                suffix: IconButton(
                  icon: Icon(
                    _obscureSecret
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                  onPressed: () =>
                      setState(() => _obscureSecret = !_obscureSecret),
                ),
                validator: (value) {
                  if (!isEditing && (value == null || value.trim().isEmpty)) {
                    return 'Please enter Secret Key';
                  }
                  return null;
                },
              ),
              if (_selectedExchange == 'okx') ...[
                SizedBox(height: 12.w),
                _buildTextField(
                  context,
                  controller: _passphraseController,
                  hintText: isEditing
                      ? 'Leave empty to keep current'
                      : 'Enter Passphrase',
                  prefix: _buildFieldIcon(Icons.password_outlined),
                  obscureText: _obscurePassphrase,
                  suffix: IconButton(
                    icon: Icon(
                      _obscurePassphrase
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                    onPressed: () => setState(
                      () => _obscurePassphrase = !_obscurePassphrase,
                    ),
                  ),
                  validator: (value) {
                    if (!isEditing && (value == null || value.trim().isEmpty)) {
                      return 'Passphrase is required for OKX';
                    }
                    return null;
                  },
                ),
              ],
              SizedBox(height: 20.w),
              _buildSectionTitle(context, 'Account Status'),
              SizedBox(height: 8.w),
              _buildSectionCard(
                context,
                child: Row(
                  children: [
                    Container(
                      width: 44.w,
                      height: 44.w,
                      decoration: BoxDecoration(
                        color: _withAlpha(
                          _isActive ? ColorTokens.profitGreen : Colors.grey,
                          0.12,
                        ),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        _isActive ? Icons.check_circle : Icons.cancel,
                        color: _isActive
                            ? ColorTokens.profitGreen
                            : Colors.grey,
                      ),
                    ),
                    SizedBox(width: 12.w),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Active Status',
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w600),
                          ),
                          SizedBox(height: 3.w),
                          Text(
                            'Enable or disable trading for this account',
                            style: Theme.of(
                              context,
                            ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: _isActive,
                      onChanged: (value) => setState(() => _isActive = value),
                    ),
                  ],
                ),
              ),
              SizedBox(height: 20.w),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _saving ? null : _saveAccount,
                  style: ElevatedButton.styleFrom(
                    padding: EdgeInsets.symmetric(vertical: 16.w),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14.r),
                    ),
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    foregroundColor: Theme.of(context).colorScheme.onPrimary,
                    elevation: 0,
                  ),
                  child: _saving
                      ? SizedBox(
                          height: 20.w,
                          width: 20.w,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Theme.of(context).colorScheme.onPrimary,
                          ),
                        )
                      : Text(
                          isEditing ? 'Update Account' : 'Add Account',
                          style: TextStyle(
                            fontSize: 16.sp,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeaderBanner(BuildContext context, bool isEditing) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
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
            width: 44.w,
            height: 44.w,
            decoration: BoxDecoration(
              color: _withAlpha(Colors.white, 0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.lock_outline, color: Colors.white, size: 22.sp),
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isEditing ? 'Update exchange account' : 'Connect an exchange',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 4.w),
                Text(
                  'Your API credentials are encrypted and stored securely.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: _withAlpha(Colors.white, 0.85),
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.shield_outlined, color: _withAlpha(Colors.white, 0.9)),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(BuildContext context, String title) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w600,
        height: 1.4,
        letterSpacing: 0.3,
      ),
    );
  }

  Widget _buildSectionCard(BuildContext context, {required Widget child}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderColor = isDark
        ? _withAlpha(Colors.white, 0.08)
        : _withAlpha(Colors.black, 0.05);

    return Container(
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: borderColor),
      ),
      child: child,
    );
  }

  Widget _buildExchangeField(
    BuildContext context,
    bool isDark,
    bool isEditing,
  ) {
    return InkWell(
      key: _exchangeFieldKey,
      onTap: isEditing ? null : () => _showExchangePicker(context, isDark),
      child: InputDecorator(
        decoration: _inputDecoration(
          context,
          hintText: 'Select exchange',
          prefix: _buildExchangeLogo(_selectedExchange, isDark),
          suffix: Icon(Icons.expand_more, color: Colors.grey[500]),
        ),
        child: Text(
          _getExchangeName(_selectedExchange),
          style: _inputTextStyle(context),
        ),
      ),
    );
  }

  Widget _buildTextField(
    BuildContext context, {
    required TextEditingController controller,
    required String hintText,
    required Widget prefix,
    bool obscureText = false,
    Widget? suffix,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: obscureText,
      style: _inputTextStyle(context),
      textAlignVertical: TextAlignVertical.center,
      decoration: _inputDecoration(
        context,
        hintText: hintText,
        prefix: prefix,
        suffix: suffix,
      ),
      validator: validator,
    );
  }

  Future<void> _showExchangePicker(BuildContext context, bool isDark) async {
    final renderBox =
        _exchangeFieldKey.currentContext?.findRenderObject() as RenderBox?;
    final fieldWidth = renderBox?.size.width ?? 300.w;
    final selected = await showDialog<String>(
      context: context,
      builder: (context) {
        final surface = Theme.of(context).colorScheme.surface;
        final screenWidth = MediaQuery.of(context).size.width;
        final inset = (screenWidth - fieldWidth) / 2;
        final insetPadding = EdgeInsets.symmetric(
          horizontal: inset > 16 ? inset : 16.w,
        );
        return Dialog(
          insetPadding: insetPadding,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14.r),
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints.tightFor(width: fieldWidth),
            child: Container(
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(14.r),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: 16.w,
                      vertical: 12.w,
                    ),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Select exchange',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  Divider(height: 1, color: Colors.grey.withValues(alpha: 0.2)),
                  ..._exchangeOptions.map(
                    (exchange) => InkWell(
                      onTap: () => Navigator.pop(context, exchange.id),
                      child: Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 16.w,
                          vertical: 10.w,
                        ),
                        child: Row(
                          children: [
                            _buildExchangeLogo(exchange.id, isDark),
                            SizedBox(width: 12.w),
                            Text(
                              exchange.name,
                              style: _inputTextStyle(context),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );

    if (selected != null && mounted) {
      setState(() => _selectedExchange = selected);
    }
  }

  InputDecoration _inputDecoration(
    BuildContext context, {
    required String hintText,
    Widget? prefix,
    Widget? suffix,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderColor = isDark
        ? _withAlpha(Colors.white, 0.12)
        : _withAlpha(Colors.black, 0.08);
    final fillColor = isDark
        ? _withAlpha(Colors.white, 0.04)
        : _withAlpha(Colors.black, 0.02);

    return InputDecoration(
      hintText: hintText,
      hintStyle: TextStyle(color: Colors.grey[500]),
      prefixIcon: prefix == null
          ? null
          : Padding(
              padding: EdgeInsets.only(left: 12.w, right: 8.w),
              child: prefix,
            ),
      prefixIconConstraints: BoxConstraints(minWidth: 36.w, minHeight: 36.w),
      suffixIcon: suffix,
      suffixIconConstraints: BoxConstraints(minWidth: 36.w, minHeight: 36.w),
      filled: true,
      fillColor: fillColor,
      contentPadding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.w),
      isDense: true,
      constraints: BoxConstraints(minHeight: 52.w),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12.r),
        borderSide: BorderSide(color: borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12.r),
        borderSide: BorderSide(
          color: Theme.of(context).colorScheme.primary,
          width: 1.2,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12.r),
        borderSide: BorderSide(color: Theme.of(context).colorScheme.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12.r),
        borderSide: BorderSide(color: Theme.of(context).colorScheme.error),
      ),
    );
  }

  Widget _buildFieldIcon(IconData icon) {
    return Container(
      width: 24.w,
      height: 24.w,
      decoration: BoxDecoration(
        color: _withAlpha(ColorTokens.brandPrimary, 0.12),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: 12.sp, color: ColorTokens.brandPrimary),
    );
  }

  TextStyle _inputTextStyle(BuildContext context) {
    return Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w600,
          color: Theme.of(context).colorScheme.onSurface,
        ) ??
        TextStyle(
          fontWeight: FontWeight.w600,
          color: Theme.of(context).colorScheme.onSurface,
        );
  }

  List<_ExchangeOption> get _exchangeOptions => const [
    _ExchangeOption(id: 'binance', name: 'Binance'),
    _ExchangeOption(id: 'okx', name: 'OKX'),
    _ExchangeOption(id: 'coinbase', name: 'Coinbase'),
  ];

  String _getExchangeName(String id) {
    for (final option in _exchangeOptions) {
      if (option.id == id) return option.name;
    }
    return id;
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

  Widget _buildExchangeLogo(String exchange, bool isDark) {
    final asset = _getExchangeLogoAsset(exchange);
    final accentColor = _getExchangeColor(exchange);

    return Container(
      width: 36.w,
      height: 36.w,
      decoration: BoxDecoration(
        color: _withAlpha(accentColor, isDark ? 0.16 : 0.12),
        shape: BoxShape.circle,
        border: Border.all(color: _withAlpha(accentColor, 0.25)),
      ),
      child: ClipOval(
        child: asset == null
            ? Icon(Icons.account_balance, color: accentColor, size: 18.sp)
            : Padding(
                padding: EdgeInsets.all(7.w),
                child: Image.asset(
                  asset,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) {
                    return Icon(
                      Icons.account_balance,
                      color: accentColor,
                      size: 18.sp,
                    );
                  },
                ),
              ),
      ),
    );
  }

  Color _getExchangeColor(String exchange) {
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

  Color _withAlpha(Color color, double opacity) {
    final clamped = opacity.clamp(0.0, 1.0);
    return color.withValues(alpha: clamped);
  }
}

class _ExchangeOption {
  final String id;
  final String name;

  const _ExchangeOption({required this.id, required this.name});
}
