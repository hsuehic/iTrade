import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/okx_data_service.dart';

class OrderBookWidget extends StatelessWidget {
  final OKXOrderBook? orderBook;
  final bool isLoading;
  final double? currentPrice;
  final bool compact; // New parameter to hide decorations in tabs

  const OrderBookWidget({
    super.key,
    this.orderBook,
    this.isLoading = false,
    this.currentPrice,
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
                  Icons.list_alt,
                  size: 18.w,
                  color: isDarkMode ? Colors.grey[400] : Colors.grey[700],
                ),
                const SizedBox(width: 8),
                Text(
                  'Order Book',
                  style: TextStyle(
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
        // Order book content
        if (orderBook != null) ...[
            // Column headers
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Price',
                      style: TextStyle(
                        fontSize: 12.sp,
                        fontWeight: FontWeight.w500,
                        color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'Total',
                      style: TextStyle(
                        fontSize: 12.sp,
                        fontWeight: FontWeight.w500,
                        color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),

            // Asks (sell orders) - shown in reverse order
            ...orderBook!.asks.reversed
                .take(5)
                .map(
                  (ask) => _buildOrderRow(
                    price: ask.price,
                    total: ask.price * ask.size,
                    isAsk: true,
                    isDarkMode: isDarkMode,
                  ),
                ),

            // Mid price display
            if (currentPrice != null)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 8.w,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(
                          alpha: isDarkMode ? 0.2 : 0.12,
                        ),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.amber.withValues(alpha: 0.5),
                        ),
                      ),
                      child: Text(
                        '\$${_formatPrice(currentPrice!)}',
                        style: TextStyle(
                          color: Colors.amber[isDarkMode ? 300 : 700],
                          fontWeight: FontWeight.w700,
                          fontSize: 12.sp,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Divider(
                  color: isDarkMode ? Colors.grey[700] : Colors.grey[300],
                  thickness: 1,
                ),
              ),

            // Bids (buy orders)
            ...orderBook!.bids
                .take(5)
                .map(
                  (bid) => _buildOrderRow(
                    price: bid.price,
                    total: bid.price * bid.size,
                    isAsk: false,
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
                  isLoading ? 'Loading order book...' : 'No data available',
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

  Widget _buildOrderRow({
    required double price,
    required double total,
    required bool isAsk,
    required bool isDarkMode,
  }) {
    final Color textColor = isAsk
        ? (isDarkMode ? Colors.red[400]! : Colors.red[600]!)
        : (isDarkMode ? Colors.green[400]! : Colors.green[600]!);
    final Color backgroundColor = isAsk
        ? Colors.red.withValues(alpha: isDarkMode ? 0.1 : 0.05)
        : Colors.green.withValues(alpha: isDarkMode ? 0.1 : 0.05);

    return Container(
      decoration: BoxDecoration(color: backgroundColor),
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _formatPrice(price),
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
                color: textColor,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          Expanded(
            child: Text(
              _formatTotal(total),
              style: TextStyle(
                fontSize: 12.sp,
                color: isDarkMode ? Colors.grey[400] : Colors.grey[700],
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
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

  // _formatSize removed as size column is no longer displayed

  String _formatTotal(double total) {
    if (total >= 1000000) {
      return '${(total / 1000000).toStringAsFixed(1)}M';
    } else if (total >= 1000) {
      return '${(total / 1000).toStringAsFixed(1)}K';
    } else {
      return total.toStringAsFixed(0);
    }
  }
}
