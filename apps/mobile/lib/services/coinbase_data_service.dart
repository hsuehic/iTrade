import 'package:dio/dio.dart';

import '../models/market_ticker.dart';

class CoinbaseDataService {
  static const String _baseUrl = 'https://api.coinbase.com';
  static const Duration _cacheTtl = Duration(seconds: 30);
  static const int _maxProducts = 80;
  static const int _batchSize = 10;

  final Dio _dio = Dio(
    BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    ),
  );
  final Map<String, _CacheEntry> _cache = {};

  Future<List<MarketTicker>> getTickers({required bool isSwap}) async {
    final key = isSwap ? 'swap' : 'spot';
    final cached = _cache[key];
    if (cached != null && DateTime.now().isBefore(cached.expiresAt)) {
      return cached.items;
    }

    final products = await _fetchProducts();
    final filtered = products.where((product) {
      if (product.status.toLowerCase() != 'online') return false;
      if (product.tradingDisabled == true) return false;
      if (isSwap) {
        return _isPerpProduct(product);
      }
      if (_isPerpProduct(product)) return false;
      final quote = product.quoteCurrency.toUpperCase();
      return quote == 'USDC' || quote == 'USDT';
    }).toList();

    final selected = filtered.take(_maxProducts).toList();
    if (selected.isEmpty) {
      return [];
    }

    final stats = await _fetchTickers(selected.map((e) => e.productId).toList());
    stats.sort((a, b) {
      final aVol = a.volume24h ?? 0;
      final bVol = b.volume24h ?? 0;
      return bVol.compareTo(aVol);
    });

    _cache[key] = _CacheEntry(
      items: stats,
      expiresAt: DateTime.now().add(_cacheTtl),
    );
    return stats;
  }

  Future<List<_CoinbaseProduct>> _fetchProducts() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/v3/brokerage/products',
      queryParameters: {
        'limit': _maxProducts.toString(),
      },
    );
    final data = response.data;
    if (data == null) return [];
    final raw = data['products'];
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(_CoinbaseProduct.fromJson)
        .where((product) => product.productId.isNotEmpty)
        .toList();
  }

  Future<List<MarketTicker>> _fetchTickers(List<String> productIds) async {
    final result = <MarketTicker>[];
    for (var i = 0; i < productIds.length; i += _batchSize) {
      final batch = productIds.skip(i).take(_batchSize).toList();
      final responses = await Future.wait(
        batch.map(
          (id) => _dio.get<Map<String, dynamic>>(
            '/api/v3/brokerage/products/$id/ticker',
          ),
        ),
      );
      for (var j = 0; j < responses.length; j += 1) {
        final data = responses[j].data;
        if (data == null) continue;
        final productId = batch[j];
        result.add(_parseTicker(productId, data));
      }
    }
    return result;
  }

  MarketTicker _parseTicker(String productId, Map<String, dynamic> json) {
    final last = _parseDouble(json['price'] ?? json['last'] ?? json['trade_price']);
    final volume = _parseDouble(
      json['volume_24h'] ?? json['volume'] ?? json['volume24h'],
    );
    final changePercent = _parseDouble(
      json['price_percent_change_24h'] ??
          json['pricePercentChange24h'] ??
          json['change24h'],
    );
    return MarketTicker(
      symbol: productId,
      last: last,
      changePercent: changePercent,
      volume24h: volume,
      exchange: 'Coinbase',
    );
  }

  bool _isPerpProduct(_CoinbaseProduct product) {
    final type = product.productType.toUpperCase();
    if (type.contains('PERP') || type.contains('FUTURE') || type.contains('SWAP')) {
      return true;
    }
    final id = product.productId.toUpperCase();
    return id.contains('PERP') || id.contains('FUTURE');
  }

  double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }
}

class _CoinbaseProduct {
  final String productId;
  final String baseCurrency;
  final String quoteCurrency;
  final String status;
  final bool? tradingDisabled;
  final String productType;

  const _CoinbaseProduct({
    required this.productId,
    required this.baseCurrency,
    required this.quoteCurrency,
    required this.status,
    this.tradingDisabled,
    required this.productType,
  });

  factory _CoinbaseProduct.fromJson(Map<String, dynamic> json) {
    return _CoinbaseProduct(
      productId: json['product_id'] as String? ?? json['id'] as String? ?? '',
      baseCurrency: json['base_currency_id'] as String? ??
          json['base_currency'] as String? ??
          '',
      quoteCurrency: json['quote_currency_id'] as String? ??
          json['quote_currency'] as String? ??
          '',
      status: json['status'] as String? ?? '',
      tradingDisabled: json['trading_disabled'] as bool?,
      productType: json['product_type'] as String? ?? '',
    );
  }
}

class _CacheEntry {
  final List<MarketTicker> items;
  final DateTime expiresAt;

  const _CacheEntry({required this.items, required this.expiresAt});
}
