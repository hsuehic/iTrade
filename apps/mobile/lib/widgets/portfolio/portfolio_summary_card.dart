import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../models/portfolio.dart';
import '../../design/tokens/color.dart';
import '../copy_text.dart';
import '../../services/copy_service.dart';

/// A professional portfolio summary card showing total value, PnL, and key metrics.
/// Data updates automatically via PortfolioService streams - no manual refresh needed.
class PortfolioSummaryCard extends StatefulWidget {
  final PortfolioData portfolio;
  final PnLData pnl;
  final double balanceChangePercent;
  final double balanceChangeValue;
  final int orderCount;
  final String selectedBalancePeriod;
  final ValueChanged<String> onBalancePeriodSelected;

  const PortfolioSummaryCard({
    super.key,
    required this.portfolio,
    required this.pnl,
    required this.balanceChangePercent,
    required this.balanceChangeValue,
    required this.orderCount,
    required this.selectedBalancePeriod,
    required this.onBalancePeriodSelected,
  });

  @override
  State<PortfolioSummaryCard> createState() => _PortfolioSummaryCardState();
}

class _PortfolioSummaryCardState extends State<PortfolioSummaryCard>
    with SingleTickerProviderStateMixin {
  bool _isBalanceHidden = false;
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _fadeAnimation = CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeInOut,
    );
    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final totalValue = widget.portfolio.summary.totalValue;
    final balanceChangePercent = widget.balanceChangePercent;
    final balanceChangeValue = widget.balanceChangeValue;
    final isProfitable = balanceChangeValue >= 0;
    final orderCount = widget.orderCount;
    final changePercentage = balanceChangePercent.isFinite
        ? balanceChangePercent
        : 0;
    final periodOptions = const [
      _BalancePeriodOption(id: '1h', label: '1H'),
      _BalancePeriodOption(id: '1d', label: '1D'),
      _BalancePeriodOption(id: '1w', label: '1W'),
      _BalancePeriodOption(id: '1m', label: '1M'),
    ];

    return FadeTransition(
      opacity: _fadeAnimation,
      child: Container(
        margin: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDark
                ? [ColorTokens.gradientStartDark, ColorTokens.gradientEndDark]
                : [
                    ColorTokens.gradientStart, // Teal
                    ColorTokens.gradientEnd, // Deep Ocean
                  ],
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: (isDark ? Colors.black : ColorTokens.gradientEnd)
                  .withValues(alpha: 0.3),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: Container(
              padding: EdgeInsets.all(20.w),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Colors.white.withValues(alpha: isDark ? 0.05 : 0.2),
                    Colors.white.withValues(alpha: isDark ? 0.02 : 0.1),
                  ],
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: Colors.white.withValues(alpha: isDark ? 0.1 : 0.3),
                  width: 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header row
                  Row(
                    children: [
                      CopyText('widget.portfolio.portfolio_summary_card.total_balance', fallback: "Total balance", style: TextStyle(
                          fontSize: 14.sp,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.8),
                        ),
                      ),
                      SizedBox(width: 8.w),
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _isBalanceHidden = !_isBalanceHidden;
                          });
                        },
                        child: Icon(
                          _isBalanceHidden
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          size: 18.w,
                          color: Colors.white.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 8),

                  // Total value
                  TweenAnimationBuilder<double>(
                    duration: const Duration(milliseconds: 800),
                    curve: Curves.easeOutCubic,
                    tween: Tween(begin: 0, end: totalValue),
                    builder: (context, value, _) => Text(
                      _isBalanceHidden
                          ? '••••••••'
                          : '\$${_formatNumber(value)}',
                      style: TextStyle(
                        fontSize: 36.sp,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: -1,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  SizedBox(height: 4),

                  // PnL row
                  Row(
                    children: [
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 8.w,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: (isProfitable ? Colors.green : Colors.red)
                              .withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              isProfitable
                                  ? Icons.trending_up_rounded
                                  : Icons.trending_down_rounded,
                              size: 14.w,
                              color: isProfitable
                                  ? const Color(0xFF4ADE80)
                                  : const Color(0xFFF87171),
                            ),
                            SizedBox(width: 4.w),
                            Text(
                              _isBalanceHidden
                                  ? '••••%'
                                  : '${isProfitable ? '+' : ''}${changePercentage.toStringAsFixed(2)}%',
                              style: TextStyle(
                                fontSize: 12.sp,
                                fontWeight: FontWeight.w600,
                                color: isProfitable
                                    ? const Color(0xFF4ADE80)
                                    : const Color(0xFFF87171),
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(width: 8.w),
                      Text(
                        _isBalanceHidden
                            ? '••••'
                            : '${isProfitable ? '+' : ''}\$${_formatNumber(balanceChangeValue.abs())}',
                        style: TextStyle(
                          fontSize: 13.sp,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.7),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      const Spacer(),
                      _buildBalancePeriodMenu(
                        context,
                        periodOptions,
                        widget.selectedBalancePeriod,
                        widget.onBalancePeriodSelected,
                      ),
                    ],
                  ),
                  SizedBox(height: 20),

                  // Metrics row
                  Row(
                    children: [
                      _buildMetricItem(
                        context,
                        'widget.portfolio.portfolio_summary_card.assets',
                        'Assets',
                        widget.portfolio.filteredUniqueAssetCount.toString(),
                        Icons.account_balance_wallet_outlined,
                      ),
                      _buildDivider(),
                      _buildMetricItem(
                        context,
                        'widget.portfolio.portfolio_summary_card.exchanges',
                        'Exchanges',
                        widget.portfolio.summary.exchanges.length.toString(),
                        Icons.sync_alt_rounded,
                      ),
                      _buildDivider(),
                      _buildMetricItem(
                        context,
                        'widget.portfolio.portfolio_summary_card.orders',
                        'Orders',
                        orderCount.toString(),
                        Icons.receipt_long_outlined,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMetricItem(
    BuildContext context,
    String labelKey,
    String labelFallback,
    String value,
    IconData icon,
  ) {
    return Expanded(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: EdgeInsets.all(8.w),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              icon,
              size: 18.w,
              color: Colors.white.withValues(alpha: 0.8),
            ),
          ),
          SizedBox(width: 8.w),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 16.sp,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              CopyText(
                labelKey,
                fallback: labelFallback,
                style: TextStyle(
                  fontSize: 10.sp,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return Container(
      width: 1,
      height: 40,
      color: Colors.white.withValues(alpha: 0.2),
    );
  }

  Widget _buildBalancePeriodMenu(
    BuildContext context,
    List<_BalancePeriodOption> options,
    String selectedPeriod,
    ValueChanged<String> onSelected,
  ) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final copy = CopyService.instance;
    final selectedOption = options.firstWhere(
      (option) => option.id == selectedPeriod,
      orElse: () => options.first,
    );

    return PopupMenuButton<String>(
      tooltip: copy.t(
        'widget.portfolio.portfolio_summary_card.balance_period',
        fallback: 'Balance change period',
      ),
      onSelected: onSelected,
      color: isDark ? const Color(0xFF1A2231) : const Color(0xFFF7F9FB),
      elevation: 3,
      offset: Offset(0, 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      constraints: BoxConstraints(minWidth: 72.w, maxWidth: 96.w),
      itemBuilder: (context) {
        return options
            .map(
              (option) => PopupMenuItem<String>(
                value: option.id,
                height: 34,
                child: Row(
                  children: [
                    Icon(
                      Icons.circle,
                      size: 6.w,
                      color: option.id == selectedPeriod
                          ? ColorTokens.chartTeal
                          : Colors.transparent,
                    ),
                    SizedBox(width: 8.w),
                    Text(
                      option.label,
                      style: TextStyle(
                        fontSize: 12.sp,
                        fontWeight: option.id == selectedPeriod
                            ? FontWeight.w700
                            : FontWeight.w500,
                        color: isDark ? Colors.white : Colors.black87,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
              ),
            )
            .toList();
      },
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            selectedOption.label,
            style: TextStyle(
              fontSize: 11.sp,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.7),
              letterSpacing: 0.4,
            ),
          ),
          SizedBox(width: 4.w),
          Icon(
            Icons.expand_more,
            size: 14.w,
            color: Colors.white.withValues(alpha: 0.55),
          ),
        ],
      ),
    );
  }

  String _formatNumber(double value) {
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(2)}M';
    } else if (value >= 1000) {
      return '${(value / 1000).toStringAsFixed(2)}K';
    } else {
      return value.toStringAsFixed(2);
    }
  }
}

class _BalancePeriodOption {
  final String id;
  final String label;

  const _BalancePeriodOption({required this.id, required this.label});
}
