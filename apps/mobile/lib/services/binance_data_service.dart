import 'package:dio/dio.dart';

import '../models/market_ticker.dart';
import 'okx_data_service.dart';

class BinanceDataService {
  static const String _spotBaseUrl =
      'https://itrade.ihsueh.com/rest/binance/spot';
  static const String _futuresBaseUrl =
      'https://itrade.ihsueh.com/rest/binance/perp';
  static const Duration _cacheTtl = Duration(seconds: 30);

  final Dio _spotDio = Dio(
    BaseOptions(
      baseUrl: _spotBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
    ),
  );
  final Dio _futuresDio = Dio(
    BaseOptions(
      baseUrl: _futuresBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
    ),
  );
  final Map<String, _CacheEntry> _cache = {};

  Future<List<MarketTicker>> getTickers({
    required bool isSwap,
    bool forceRefresh = false,
  }) async {
    final key = isSwap ? 'swap' : 'spot';
    final cached = _cache[key];
    if (!forceRefresh &&
        cached != null &&
        DateTime.now().isBefore(cached.expiresAt)) {
      return cached.items;
    }

    final dio = isSwap ? _futuresDio : _spotDio;
    final path = isSwap ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr';
    final response = await dio.get<List<dynamic>>(path);
    final data = response.data;
    if (data is! List) return [];

    final items =
        data
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

  Future<Map<String, dynamic>> getTickerDetails({
    required String symbol,
    required bool isSwap,
  }) async {
    final dio = isSwap ? _futuresDio : _spotDio;
    final path = isSwap ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr';
    final response = await dio.get<Map<String, dynamic>>(
      path,
      queryParameters: {'symbol': symbol.toUpperCase()},
    );
    return response.data ?? {};
  }

  Future<OKXOrderBook> getOrderBook({
    required String symbol,
    required bool isSwap,
    int limit = 5,
  }) async {
    final dio = isSwap ? _futuresDio : _spotDio;
    final path = isSwap ? '/fapi/v1/depth' : '/api/v3/depth';
    final response = await dio.get<Map<String, dynamic>>(
      path,
      queryParameters: {
        'symbol': symbol.toUpperCase(),
        'limit': limit.toString(),
      },
    );
    final data = response.data ?? {};
    final bidsRaw = data['bids'];
    final asksRaw = data['asks'];
    final bids = bidsRaw is List
        ? bidsRaw.map((item) => OKXOrderBookLevel.fromList(item)).toList()
        : <OKXOrderBookLevel>[];
    final asks = asksRaw is List
        ? asksRaw.map((item) => OKXOrderBookLevel.fromList(item)).toList()
        : <OKXOrderBookLevel>[];
    return OKXOrderBook(
      bids: bids,
      asks: asks,
      timestamp: DateTime.now().millisecondsSinceEpoch.toString(),
      symbol: symbol,
    );
  }

  Future<List<OKXTrade>> getRecentTrades({
    required String symbol,
    required bool isSwap,
    int limit = 50,
  }) async {
    final dio = isSwap ? _futuresDio : _spotDio;
    final path = isSwap ? '/fapi/v1/trades' : '/api/v3/trades';
    final response = await dio.get<List<dynamic>>(
      path,
      queryParameters: {
        'symbol': symbol.toUpperCase(),
        'limit': limit.toString(),
      },
    );
    final data = response.data;
    if (data is! List) return [];
    return data.whereType<Map<String, dynamic>>().map((item) {
      final isBuyerMaker = item['isBuyerMaker'] == true;
      final timestamp = item['time'];
      return OKXTrade(
        tradeId: item['id']?.toString() ?? '',
        price: _parseDouble(item['price']) ?? 0,
        size: _parseDouble(item['qty']) ?? 0,
        side: isBuyerMaker ? 'sell' : 'buy',
        timestamp: DateTime.fromMillisecondsSinceEpoch(
          timestamp is num
              ? timestamp.toInt()
              : int.tryParse('$timestamp') ?? 0,
        ),
      );
    }).toList();
  }

  Future<List<OKXKline>> getKlines({
    required String symbol,
    required bool isSwap,
    required String interval,
    int limit = 30,
  }) async {
    final dio = isSwap ? _futuresDio : _spotDio;
    final path = isSwap ? '/fapi/v1/klines' : '/api/v3/klines';
    final response = await dio.get<List<dynamic>>(
      path,
      queryParameters: {
        'symbol': symbol.toUpperCase(),
        'interval': interval,
        'limit': limit.toString(),
      },
    );
    final data = response.data;
    if (data is! List) return [];
    return data.whereType<List<dynamic>>().map((item) {
      final timestamp = item.isNotEmpty ? item[0].toString() : '0';
      final open = _parseDouble(item.length > 1 ? item[1] : null) ?? 0;
      final high = _parseDouble(item.length > 2 ? item[2] : null) ?? 0;
      final low = _parseDouble(item.length > 3 ? item[3] : null) ?? 0;
      final close = _parseDouble(item.length > 4 ? item[4] : null) ?? 0;
      final volume = _parseDouble(item.length > 5 ? item[5] : null) ?? 0;
      return OKXKline(
        timestamp: timestamp,
        open: open,
        high: high,
        low: low,
        close: close,
        volume: volume,
        time: DateTime.fromMillisecondsSinceEpoch(int.tryParse(timestamp) ?? 0),
      );
    }).toList();
  }
}

class _CacheEntry {
  final List<MarketTicker> items;
  final DateTime expiresAt;

  const _CacheEntry({required this.items, required this.expiresAt});
}
