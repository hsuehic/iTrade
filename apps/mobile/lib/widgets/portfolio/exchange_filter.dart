import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../design/tokens/color.dart';

/// Exchange filter chips for portfolio screen.
class ExchangeFilter extends StatelessWidget {
  final List<String> exchanges;
  final String selectedExchange;
  final ValueChanged<String> onExchangeSelected;

  const ExchangeFilter({
    super.key,
    required this.exchanges,
    required this.selectedExchange,
    required this.onExchangeSelected,
  });

  // Exchange display names and colors
  static const Map<String, String> _exchangeNames = {
    'all': 'All',
    'binance': 'Binance',
    'okx': 'OKX',
    'coinbase': 'Coinbase',
    'kucoin': 'KuCoin',
    'bybit': 'Bybit',
    'gateio': 'Gate.io',
    'huobi': 'Huobi',
  };

  // Harmonized exchange colors using ColorTokens
  static const Map<String, Color> _exchangeColors = {
    'all': ColorTokens.chartTeal, // Matches brand primary
    'binance': ColorTokens.exchangeBinance,
    'okx': ColorTokens.exchangeOkx, // Softened from pure black
    'coinbase': ColorTokens.exchangeCoinbase,
    'kucoin': ColorTokens.exchangeKucoin,
    'bybit': ColorTokens.exchangeBybit,
    'gateio': ColorTokens.exchangeGateio,
    'huobi': ColorTokens.exchangeHuobi,
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final allExchanges = ['all', ...exchanges];

    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(horizontal: 16.w),
        itemCount: allExchanges.length,
        separatorBuilder: (context, index) => SizedBox(width: 8.w),
        itemBuilder: (context, index) {
          final exchange = allExchanges[index];
          final isSelected = selectedExchange == exchange;
          final color = _exchangeColors[exchange.toLowerCase()] ??
              theme.colorScheme.primary;
          final name = _exchangeNames[exchange.toLowerCase()] ??
              exchange.toUpperCase();

          return GestureDetector(
            onTap: () => onExchangeSelected(exchange),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 0),
              decoration: BoxDecoration(
                color: isSelected ? color.withValues(alpha: 0.15) : Colors.transparent,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: isSelected
                      ? color
                      : isDark
                          ? Colors.white.withValues(alpha: 0.15)
                          : Colors.black.withValues(alpha: 0.1),
                  width: isSelected ? 1.5 : 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (exchange != 'all')
                    Container(
                      width: 8.w,
                      height: 8.w,
                      margin: EdgeInsets.only(right: 6.w),
                      decoration: BoxDecoration(
                        color: color,
                        shape: BoxShape.circle,
                      ),
                    ),
                  Text(
                    name,
                    style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                      color: isSelected
                          ? color
                          : isDark
                              ? Colors.white70
                              : Colors.black54,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
