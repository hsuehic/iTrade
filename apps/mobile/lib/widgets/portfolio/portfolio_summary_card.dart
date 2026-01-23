import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../models/portfolio.dart';
import '../../design/tokens/color.dart';

/// A professional portfolio summary card showing total value, PnL, and key metrics.
/// Data updates automatically via PortfolioService streams - no manual refresh needed.
class PortfolioSummaryCard extends StatefulWidget {
  final PortfolioData portfolio;
  final PnLData pnl;

  const PortfolioSummaryCard({
    super.key,
    required this.portfolio,
    required this.pnl,
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
    final totalPnl = widget.pnl.totalPnl;
    final pnlPercentage = totalValue > 0 ? (totalPnl / totalValue) * 100 : 0;
    final isProfitable = totalPnl >= 0;

    return FadeTransition(
      opacity: _fadeAnimation,
      child: Container(
        margin: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDark
                ? [
                    ColorTokens.gradientStartDark,
                    ColorTokens.gradientEndDark,
                  ]
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
                      Text(
                        'Total Balance',
                        style: TextStyle(
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
                                  : '${isProfitable ? '+' : ''}${pnlPercentage.toStringAsFixed(2)}%',
                              style: TextStyle(
                                fontSize: 12.sp,
                                fontWeight: FontWeight.w600,
                                color: isProfitable
                                    ? const Color(0xFF4ADE80)
                                    : const Color(0xFFF87171),
                                fontFeatures: const [
                                  FontFeature.tabularFigures()
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
                            : '${isProfitable ? '+' : ''}\$${_formatNumber(totalPnl.abs())}',
                        style: TextStyle(
                          fontSize: 13.sp,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.7),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 20),

                  // Metrics row
                  Row(
                    children: [
                      _buildMetricItem(
                        context,
                        'Assets',
                        widget.portfolio.summary.uniqueAssets.toString(),
                        Icons.account_balance_wallet_outlined,
                      ),
                      _buildDivider(),
                      _buildMetricItem(
                        context,
                        'Exchanges',
                        widget.portfolio.summary.exchanges.length.toString(),
                        Icons.sync_alt_rounded,
                      ),
                      _buildDivider(),
                      _buildMetricItem(
                        context,
                        'Orders',
                        widget.pnl.filledOrders.toString(),
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
    String label,
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
              Text(
                label,
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
