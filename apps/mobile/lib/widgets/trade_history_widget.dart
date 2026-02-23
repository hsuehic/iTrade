import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';
import '../services/okx_data_service.dart';
import 'copy_text.dart';

class TradeHistoryWidget extends StatelessWidget {
  final List<OKXTrade> trades;
  final bool isLoading;
  final bool compact; // New parameter to hide decorations in tabs

  const TradeHistoryWidget({
    super.key,
    required this.trades,
    this.isLoading = false,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    // Compact mode for use in tabs (no container decoration/header)
    if (compact) {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(12),
        physics: const AlwaysScrollableScrollPhysics(),
        child: _buildContent(isDarkMode),
      );
    }

    // Full mode with container and header
    return Container(
      decoration: BoxDecoration(
        color: isDarkMode ? Colors.grey[850] : Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isDarkMode ? Colors.grey[700]! : Colors.grey[300]!,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDarkMode ? 0.3 : 0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: EdgeInsets.all(12.w),
            decoration: BoxDecoration(
              color: isDarkMode ? Colors.grey[800] : Colors.grey[50],
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(8),
                topRight: Radius.circular(8),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.history,
                  size: 18.w,
                  color: isDarkMode ? Colors.grey[400] : Colors.grey[700],
                ),
                const SizedBox(width: 8),
                CopyText('widget.trade_history_widget.recent_trades', fallback: "Recent trades", style: TextStyle(
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w600,
                    color: isDarkMode ? Colors.grey[300] : Colors.grey[800],
                  ),
                ),
                const Spacer(),
                if (isLoading)
                  SizedBox(
                    width: 16.w,
                    height: 16.w,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        isDarkMode ? Colors.grey[400]! : Colors.grey[600]!,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          _buildContent(isDarkMode),
        ],
      ),
    );
  }

  Widget _buildContent(bool isDarkMode) {
    return Column(
      children: [
        // Trade history content
        if (trades.isNotEmpty) ...[
          // Column headers
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  flex: 2,
                  child: CopyText('widget.trade_history_widget.time', fallback: "Time", style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w500,
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                    ),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: CopyText('widget.order_book_widget.price', fallback: "Price", style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w500,
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                    ),
                    textAlign: TextAlign.right,
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: CopyText('widget.trade_history_widget.amount', fallback: "Amount", style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w500,
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                    ),
                    textAlign: TextAlign.right,
                  ),
                ),
              ],
            ),
          ),

          // Trade list (limited to 20 most recent)
          ...trades.take(20).map(
                (trade) => _buildTradeRow(
                  trade: trade,
                  isDarkMode: isDarkMode,
                ),
              ),
        ] else ...[
          // Loading or no data state
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Icon(
                  Icons.hourglass_empty,
                  size: 32.w,
                  color: isDarkMode ? Colors.grey[600] : Colors.grey[400],
                ),
                const SizedBox(height: 8),
                Text(
                  isLoading ? 'Loading trades...' : 'No trades available',
                  style: TextStyle(
                    color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                    fontSize: 14.sp,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildTradeRow({
    required OKXTrade trade,
    required bool isDarkMode,
  }) {
    final isBuy = trade.side == 'buy';
    final Color textColor = isBuy
        ? (isDarkMode ? Colors.green[400]! : Colors.green[600]!)
        : (isDarkMode ? Colors.red[400]! : Colors.red[600]!);
    final Color backgroundColor = isBuy
        ? Colors.green.withValues(alpha: isDarkMode ? 0.05 : 0.03)
        : Colors.red.withValues(alpha: isDarkMode ? 0.05 : 0.03);

    return Container(
      decoration: BoxDecoration(color: backgroundColor),
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 6),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(
              _formatTime(trade.timestamp),
              style: TextStyle(
                fontSize: 11.sp,
                color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              _formatPrice(trade.price),
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
                color: textColor,
              ),
              textAlign: TextAlign.right,
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              _formatSize(trade.size),
              style: TextStyle(
                fontSize: 11.sp,
                color: isDarkMode ? Colors.grey[400] : Colors.grey[700],
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    return DateFormat('HH:mm:ss').format(time);
  }

  String _formatPrice(double price) {
    if (price >= 1000) {
      return price.toStringAsFixed(1);
    } else if (price >= 1) {
      return price.toStringAsFixed(2);
    } else {
      return price.toStringAsFixed(4);
    }
  }

  String _formatSize(double size) {
    if (size >= 1000) {
      return '${(size / 1000).toStringAsFixed(2)}K';
    } else if (size >= 1) {
      return size.toStringAsFixed(2);
    } else {
      return size.toStringAsFixed(4);
    }
  }
}

