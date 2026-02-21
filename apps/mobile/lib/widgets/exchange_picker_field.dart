import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../design/tokens/color.dart';

class ExchangePickerField extends StatefulWidget {
  final String selectedExchange;
  final ValueChanged<String> onChanged;
  final bool enabled;
  final String hintText;

  const ExchangePickerField({
    super.key,
    required this.selectedExchange,
    required this.onChanged,
    this.enabled = true,
    this.hintText = 'Select exchange',
  });

  @override
  State<ExchangePickerField> createState() => _ExchangePickerFieldState();
}

class _ExchangePickerFieldState extends State<ExchangePickerField> {
  final GlobalKey _fieldKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final hasSelection = widget.selectedExchange.trim().isNotEmpty;
    return InkWell(
      key: _fieldKey,
      onTap: widget.enabled ? () => _showExchangePicker(context) : null,
      child: InputDecorator(
        decoration: _inputDecoration(
          context,
          hintText: widget.hintText,
          prefix: _buildExchangeLogo(widget.selectedExchange),
          suffix: Icon(Icons.expand_more, color: Colors.grey[500]),
        ),
        child: Text(
          hasSelection ? _getExchangeName(widget.selectedExchange) : widget.hintText,
          style: hasSelection
              ? _inputTextStyle(context)
              : _inputTextStyle(context).copyWith(
                  color: Theme.of(context).hintColor,
                ),
        ),
      ),
    );
  }

  Future<void> _showExchangePicker(BuildContext context) async {
    final renderBox = _fieldKey.currentContext?.findRenderObject() as RenderBox?;
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
                            _buildExchangeLogo(exchange.id),
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
      widget.onChanged(selected);
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
      prefixIcon: prefix == null
          ? null
          : Padding(
              padding: EdgeInsets.symmetric(horizontal: 12.w),
              child: prefix,
            ),
      prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
      suffixIcon: suffix == null
          ? null
          : Padding(
              padding: EdgeInsets.symmetric(horizontal: 8.w),
              child: suffix,
            ),
      suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
      filled: true,
      fillColor: fillColor,
      contentPadding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 14.w),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12.r),
        borderSide: BorderSide(color: borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12.r),
        borderSide: BorderSide(color: borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12.r),
        borderSide: BorderSide(
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
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

  Widget _buildExchangeLogo(String exchange) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
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
