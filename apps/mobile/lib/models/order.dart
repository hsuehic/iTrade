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
    // Helper to parse number that might be string or number
    double _parseDouble(dynamic value) {
      if (value == null) return 0.0;
      if (value is num) return value.toDouble();
      if (value is String) return double.parse(value);
      return 0.0;
    }

    double? _parseDoubleOrNull(dynamic value) {
      if (value == null) return null;
      if (value is num) return value.toDouble();
      if (value is String) return double.tryParse(value);
      return null;
    }

    return Order(
      id: json['id'] as String,
      clientOrderId: json['clientOrderId'] as String?,
      symbol: json['symbol'] as String,
      side: json['side'] as String,
      type: json['type'] as String,
      quantity: _parseDouble(json['quantity']),
      price: _parseDoubleOrNull(json['price']),
      stopPrice: _parseDoubleOrNull(json['stopPrice']),
      status: json['status'] as String,
      timeInForce: json['timeInForce'] as String?,
      timestamp: DateTime.parse(json['timestamp'] as String),
      executedQuantity: _parseDouble(json['executedQuantity']),
      cummulativeQuoteQuantity: _parseDoubleOrNull(json['cummulativeQuoteQuantity']),
      updateTime: json['updateTime'] != null
          ? DateTime.parse(json['updateTime'] as String)
          : null,
      exchange: json['exchange'] as String?,
      realizedPnl: _parseDoubleOrNull(json['realizedPnl']),
      unrealizedPnl: _parseDoubleOrNull(json['unrealizedPnl']),
      averagePrice: _parseDoubleOrNull(json['averagePrice']),
      commission: _parseDoubleOrNull(json['commission']),
      commissionAsset: json['commissionAsset'] as String?,
    );
  }

  bool get isFilled => status == 'FILLED';
  bool get isPartiallyFilled => status == 'PARTIALLY_FILLED';
  bool get isCanceled => status == 'CANCELED' || status == 'CANCELLED';
  bool get isNew => status == 'NEW';
  bool get isBuy => side == 'BUY';
  bool get isSell => side == 'SELL';

  /// Extract base currency from symbol (e.g., BTC/USDT -> BTC, WLD-USDT-SWAP -> WLD)
  String get baseCurrency {
    if (symbol.contains('/')) {
      return symbol.split('/')[0];
    }
    // For symbols like WLD-USDT-SWAP, extract base currency
    if (symbol.contains('-')) {
      return symbol.split('-')[0];
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
  
  /// Check if this is a perpetual/swap contract
  bool get isPerpetual {
    return symbol.contains('SWAP') || 
           symbol.contains(':USDT') || 
           symbol.contains('PERP');
  }
  
  /// Get a display-friendly symbol with contract type indicator
  String get displaySymbol {
    final base = baseCurrency;
    if (isPerpetual) {
      return '$base PERP';
    }
    return base;
  }
}

