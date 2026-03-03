import 'package:dio/dio.dart';

import '../models/market_ticker.dart';

class BinanceDataService {
  static const String _spotBaseUrl = 'https://api.binance.com';
  static const String _futuresBaseUrl = 'https://fapi.binance.com';
  static const Duration _cacheTtl = Duration(seconds: 30);

  final Dio _spotDio = Dio(
    BaseOptions(
      baseUrl: _spotBaseUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    ),
  );
  final Dio _futuresDio = Dio(
    BaseOptions(
      baseUrl: _futuresBaseUrl,
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

    final dio = isSwap ? _futuresDio : _spotDio;
    final path = isSwap ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr';
    final response = await dio.get<List<dynamic>>(path);
    final data = response.data;
    if (data is! List) return [];

    final items = data
        .whereType<Map<String, dynamic>>()
        .map(_parseTicker)
        .where((ticker) => ticker.symbol.endsWith('USDT'))
        .toList()
      ..sort((a, b) {
        final aVol = a.volume24h ?? 0;
        final bVol = b.volume24h ?? 0;
        return bVol.compareTo(aVol);
      });

    final limited = items.take(200).toList();
    _cache[key] = _CacheEntry(
      items: limited,
      expiresAt: DateTime.now().add(_cacheTtl),
    );
    return limited;
  }

  MarketTicker _parseTicker(Map<String, dynamic> json) {
    final symbol = json['symbol'] as String? ?? '';
    final last = _parseDouble(json['lastPrice']);
    final open = _parseDouble(json['openPrice']);
    final volume = _parseDouble(json['quoteVolume']);
    final changePercent = _parseDouble(json['priceChangePercent']);
    return MarketTicker(
      symbol: symbol,
      last: last,
      open24h: open,
      changePercent: changePercent,
      volume24h: volume,
      exchange: 'Binance',
    );
  }

  double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }
}

class _CacheEntry {
  final List<MarketTicker> items;
  final DateTime expiresAt;

  const _CacheEntry({required this.items, required this.expiresAt});
}
