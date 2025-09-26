import 'package:flutter/material.dart';
import '../services/okx_data_service.dart';

class OrderBookWidget extends StatelessWidget {
  final OKXOrderBook? orderBook;
  final bool isLoading;
  final double? currentPrice;

  const OrderBookWidget({
    super.key,
    this.orderBook,
    this.isLoading = false,
    this.currentPrice,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(8),
                topRight: Radius.circular(8),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.list_alt, size: 18, color: Colors.grey[700]),
                const SizedBox(width: 8),
                Text(
                  'Order Book',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[800],
                  ),
                ),
                const Spacer(),
                if (isLoading)
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        Colors.grey[600]!,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Order book content
          if (orderBook != null) ...[
            // Column headers
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Price',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: Colors.grey[600],
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'Total',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: Colors.grey[600],
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
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.amber.withValues(alpha: 0.5),
                        ),
                      ),
                      child: Text(
                        '\$${_formatPrice(currentPrice!)}',
                        style: const TextStyle(
                          color: Colors.amber,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Divider(color: Colors.grey[300], thickness: 1),
              ),

            // Bids (buy orders)
            ...orderBook!.bids
                .take(5)
                .map(
                  (bid) => _buildOrderRow(
                    price: bid.price,
                    total: bid.price * bid.size,
                    isAsk: false,
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
                    size: 32,
                    color: Colors.grey[400],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    isLoading ? 'Loading order book...' : 'No data available',
                    style: TextStyle(color: Colors.grey[600], fontSize: 14),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildOrderRow({
    required double price,
    required double total,
    required bool isAsk,
  }) {
    final Color textColor = isAsk ? Colors.red[600]! : Colors.green[600]!;
    final Color backgroundColor = isAsk
        ? Colors.red.withValues(alpha: 0.05)
        : Colors.green.withValues(alpha: 0.05);

    return Container(
      decoration: BoxDecoration(color: backgroundColor),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _formatPrice(price),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: textColor,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          Expanded(
            child: Text(
              _formatTotal(total),
              style: TextStyle(fontSize: 12, color: Colors.grey[700]),
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
