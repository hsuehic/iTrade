import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../models/portfolio.dart';
import '../copy_text.dart';

/// Professional positions list widget with expandable details.
class PositionsList extends StatelessWidget {
  final List<Position> positions;
  final String? selectedExchange;
  final ValueChanged<Position>? onPositionTap;

  const PositionsList({
    super.key,
    required this.positions,
    this.selectedExchange,
    this.onPositionTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    if (positions.isEmpty) {
      return _buildEmptyState(context);
    }

    // Filter by exchange if selected
    final normalizedSelectedExchange = selectedExchange?.toLowerCase();
    final filteredPositions =
        normalizedSelectedExchange != null &&
            normalizedSelectedExchange != 'all'
        ? positions
              .where(
                (p) => p.exchange.toLowerCase() == normalizedSelectedExchange,
              )
              .toList()
        : positions;

    // Calculate total unrealized PnL
    final totalPnl = filteredPositions.fold(
      0.0,
      (sum, p) => sum + p.unrealizedPnl,
    );

    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.05),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.08),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    CopyText('widget.portfolio.positions_list.open_positions', fallback: "Open positions", style: TextStyle(
                        fontSize: 16.sp,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : Colors.black87,
                      ),
                    ),
                    SizedBox(width: 8.w),
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 8.w,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: CopyText(
                        'widget.portfolio.positions_list.positions_count',
                        params: {
                          'count': filteredPositions.length.toString(),
                        },
                        fallback: '{{count}}',
                        style: TextStyle(
                          fontSize: 12.sp,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ),
                  ],
                ),
                // Total PnL badge
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4),
                  decoration: BoxDecoration(
                    color: totalPnl >= 0
                        ? Colors.green.withValues(alpha: 0.1)
                        : Colors.red.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        totalPnl >= 0
                            ? Icons.trending_up_rounded
                            : Icons.trending_down_rounded,
                        size: 14.w,
                        color: totalPnl >= 0
                            ? const Color(0xFF22C55E)
                            : const Color(0xFFEF4444),
                      ),
                      SizedBox(width: 4.w),
                      CopyText(
                        'widget.portfolio.positions_list.total_pnl_amount',
                        params: {
                          'amount':
                              '${totalPnl >= 0 ? '+' : ''}\$${totalPnl.toStringAsFixed(2)}',
                        },
                        fallback: '{{amount}}',
                        style: TextStyle(
                          fontSize: 12.sp,
                          fontWeight: FontWeight.w600,
                          color: totalPnl >= 0
                              ? const Color(0xFF22C55E)
                              : const Color(0xFFEF4444),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Divider
          Divider(
            height: 1,
            color: isDark
                ? Colors.white.withValues(alpha: 0.08)
                : Colors.black.withValues(alpha: 0.05),
          ),

          // Positions list
          ListView.separated(
            padding: EdgeInsets.zero,
            primary: false,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: filteredPositions.length,
            separatorBuilder: (context, index) => Divider(
              height: 1,
              indent: 16.w,
              endIndent: 16.w,
              color: isDark
                  ? Colors.white.withValues(alpha: 0.05)
                  : Colors.black.withValues(alpha: 0.03),
            ),
            itemBuilder: (context, index) {
              return _PositionItem(
                position: filteredPositions[index],
                onTap: () => onPositionTap?.call(filteredPositions[index]),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      padding: EdgeInsets.all(32.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.05),
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.show_chart_rounded,
            size: 48.w,
            color: isDark ? Colors.white30 : Colors.black26,
          ),
          SizedBox(height: 12),
          CopyText('widget.portfolio.positions_list.no_open_positions', fallback: "No open positions", style: TextStyle(
              fontSize: 16.sp,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white60 : Colors.black54,
            ),
          ),
          SizedBox(height: 4),
          CopyText('widget.portfolio.positions_list.your_active_trades_will_appear', fallback: "Your active trades will appear here", style: TextStyle(
              fontSize: 12.sp,
              color: isDark ? Colors.white38 : Colors.black38,
            ),
          ),
        ],
      ),
    );
  }
}

class _PositionItem extends StatelessWidget {
  final Position position;
  final VoidCallback? onTap;

  const _PositionItem({required this.position, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isProfitable = position.isProfitable;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12),
        child: Row(
          children: [
            // Icon and symbol
            Stack(
              clipBehavior: Clip.none,
              children: [
                Image.network(
                  position.iconUrl,
                  width: 40.w,
                  height: 40.w,
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, loadingProgress) {
                    if (loadingProgress == null) return child;
                    return Container(
                      width: 40.w,
                      height: 40.w,
                      decoration: BoxDecoration(
                        color: isDark
                            ? Colors.white10
                            : Colors.black.withValues(alpha: 0.05),
                        shape: BoxShape.circle,
                      ),
                    );
                  },
                  errorBuilder: (context, error, stackTrace) => Container(
                    width: 40.w,
                    height: 40.w,
                    decoration: BoxDecoration(
                      color: isDark
                          ? Colors.white10
                          : Colors.black.withValues(alpha: 0.05),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.currency_bitcoin,
                      size: 24.w,
                      color: isDark ? Colors.white60 : Colors.black45,
                    ),
                  ),
                ),
                // Side indicator
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: Container(
                    padding: EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      color: position.isLong
                          ? const Color(0xFF22C55E)
                          : const Color(0xFFEF4444),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
                        width: 2,
                      ),
                    ),
                    child: Icon(
                      position.isLong
                          ? Icons.arrow_upward_rounded
                          : Icons.arrow_downward_rounded,
                      size: 8.w,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(width: 12.w),

            // Symbol and details
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          position.displaySymbol,
                          style: TextStyle(
                            fontSize: 14.sp,
                            fontWeight: FontWeight.w600,
                            color: isDark ? Colors.white : Colors.black87,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      SizedBox(width: 6.w),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 6.w,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: position.isLong
                              ? const Color(0xFF22C55E).withValues(alpha: 0.15)
                              : const Color(0xFFEF4444).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: CopyText(
                          position.isLong
                              ? 'widget.portfolio.positions_list.long'
                              : 'widget.portfolio.positions_list.short',
                          fallback: position.isLong ? 'LONG' : 'SHORT',
                          style: TextStyle(
                            fontSize: 9.sp,
                            fontWeight: FontWeight.w700,
                            color: position.isLong
                                ? const Color(0xFF22C55E)
                                : const Color(0xFFEF4444),
                          ),
                        ),
                      ),
                      if (position.leverage > 1) ...[
                        SizedBox(width: 4.w),
                        Container(
                          padding: EdgeInsets.symmetric(
                            horizontal: 4.w,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.orange.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: CopyText(
                            'widget.portfolio.positions_list.leverage',
                            params: {
                              'leverage': position.leverage.toInt().toString(),
                            },
                            fallback: '{{leverage}}x',
                            style: TextStyle(
                              fontSize: 9.sp,
                              fontWeight: FontWeight.w700,
                              color: Colors.orange,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        position.exchange.toUpperCase(),
                        style: TextStyle(
                          fontSize: 10.sp,
                          fontWeight: FontWeight.w500,
                          color: isDark ? Colors.white38 : Colors.black38,
                        ),
                      ),
                      SizedBox(width: 8.w),
                      CopyText(
                        'widget.portfolio.positions_list.quantity',
                        params: {
                          'qty': _formatQuantity(position.quantity),
                        },
                        fallback: 'Qty: {{qty}}',
                        style: TextStyle(
                          fontSize: 10.sp,
                          color: isDark ? Colors.white54 : Colors.black54,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // PnL and values
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Unrealized PnL
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CopyText(
                      'widget.portfolio.positions_list.unrealized_pnl_amount',
                      params: {
                        'amount':
                            '${isProfitable ? '+' : ''}\$${position.unrealizedPnl.toStringAsFixed(2)}',
                      },
                      fallback: '{{amount}}',
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.w700,
                        color: isProfitable
                            ? const Color(0xFF22C55E)
                            : const Color(0xFFEF4444),
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 2),
                // PnL percentage
                CopyText(
                  'widget.portfolio.positions_list.pnl_percentage',
                  params: {
                    'percent':
                        '${isProfitable ? '+' : ''}${position.pnlPercentage.toStringAsFixed(2)}',
                  },
                  fallback: '{{percent}}%',
                  style: TextStyle(
                    fontSize: 11.sp,
                    fontWeight: FontWeight.w500,
                    color: isProfitable
                        ? const Color(0xFF22C55E).withValues(alpha: 0.8)
                        : const Color(0xFFEF4444).withValues(alpha: 0.8),
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                SizedBox(height: 2),
                // Entry vs Mark price
                CopyText(
                  'widget.portfolio.positions_list.price_range',
                  params: {
                    'avg': position.avgPrice.toStringAsFixed(2),
                    'mark': position.markPrice.toStringAsFixed(2),
                  },
                  fallback: '\${{avg}} → \${{mark}}',
                  style: TextStyle(
                    fontSize: 9.sp,
                    color: isDark ? Colors.white38 : Colors.black38,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatQuantity(double quantity) {
    if (quantity >= 1000000) {
      return '${(quantity / 1000000).toStringAsFixed(2)}M';
    } else if (quantity >= 1000) {
      return '${(quantity / 1000).toStringAsFixed(2)}K';
    } else if (quantity >= 1) {
      return quantity.toStringAsFixed(2);
    } else {
      return quantity.toStringAsFixed(6);
    }
  }
}
