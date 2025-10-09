/// Order model representing trading orders
class Order {
  final String id;
  final String? clientOrderId;
  final String symbol;
  final String side; // 'BUY' or 'SELL'
  final String type; // 'MARKET', 'LIMIT', etc.
  final double quantity;
  final double? price;
  final double? stopPrice;
  final String status; // 'NEW', 'FILLED', 'PARTIALLY_FILLED', 'CANCELED', etc.
  final String? timeInForce;
  final DateTime timestamp;
  final double executedQuantity;
  final double? cummulativeQuoteQuantity;
  final DateTime? updateTime;
  final String? exchange;
  final double? realizedPnl;
  final double? unrealizedPnl;
  final double? averagePrice;
  final double? commission;
  final String? commissionAsset;

  Order({
    required this.id,
    this.clientOrderId,
    required this.symbol,
    required this.side,
    required this.type,
    required this.quantity,
    this.price,
    this.stopPrice,
    required this.status,
    this.timeInForce,
    required this.timestamp,
    required this.executedQuantity,
    this.cummulativeQuoteQuantity,
    this.updateTime,
    this.exchange,
    this.realizedPnl,
    this.unrealizedPnl,
    this.averagePrice,
    this.commission,
    this.commissionAsset,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'] as String,
      clientOrderId: json['clientOrderId'] as String?,
      symbol: json['symbol'] as String,
      side: json['side'] as String,
      type: json['type'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      price: json['price'] != null ? (json['price'] as num).toDouble() : null,
      stopPrice: json['stopPrice'] != null
          ? (json['stopPrice'] as num).toDouble()
          : null,
      status: json['status'] as String,
      timeInForce: json['timeInForce'] as String?,
      timestamp: DateTime.parse(json['timestamp'] as String),
      executedQuantity: (json['executedQuantity'] as num).toDouble(),
      cummulativeQuoteQuantity: json['cummulativeQuoteQuantity'] != null
          ? (json['cummulativeQuoteQuantity'] as num).toDouble()
          : null,
      updateTime: json['updateTime'] != null
          ? DateTime.parse(json['updateTime'] as String)
          : null,
      exchange: json['exchange'] as String?,
      realizedPnl: json['realizedPnl'] != null
          ? (json['realizedPnl'] as num).toDouble()
          : null,
      unrealizedPnl: json['unrealizedPnl'] != null
          ? (json['unrealizedPnl'] as num).toDouble()
          : null,
      averagePrice: json['averagePrice'] != null
          ? (json['averagePrice'] as num).toDouble()
          : null,
      commission: json['commission'] != null
          ? (json['commission'] as num).toDouble()
          : null,
      commissionAsset: json['commissionAsset'] as String?,
    );
  }

  bool get isFilled => status == 'FILLED';
  bool get isPartiallyFilled => status == 'PARTIALLY_FILLED';
  bool get isCanceled => status == 'CANCELED' || status == 'CANCELLED';
  bool get isNew => status == 'NEW';
  bool get isBuy => side == 'BUY';
  bool get isSell => side == 'SELL';

  /// Extract base currency from symbol (e.g., BTC/USDT -> BTC)
  String get baseCurrency {
    if (symbol.contains('/')) {
      return symbol.split('/')[0];
    }
    // Handle symbols without separator (e.g., BTCUSDT -> BTC)
    // Common quote currencies
    const quoteCurrencies = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB'];
    for (final quote in quoteCurrencies) {
      if (symbol.endsWith(quote) && symbol.length > quote.length) {
        return symbol.substring(0, symbol.length - quote.length);
      }
    }
    return symbol;
  }
}

