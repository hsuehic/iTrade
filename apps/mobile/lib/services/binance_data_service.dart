import 'package:dio/dio.dart';

import '../models/market_ticker.dart';
import 'okx_data_service.dart';

class BinanceDataService {
  static const List<String> _spotBaseUrls = [
    'https://api.binance.com',
    'https://itrade.ihsueh.com/rest/binance/spot',
  ];
  static const List<String> _futuresBaseUrls = [
    'https://fapi.binance.com',
    'https://itrade.ihsueh.com/rest/binance/perp',
  ];
  static const Duration _cacheTtl = Duration(seconds: 30);
  static const int _maxRetriesPerBase = 2;

  late final List<Dio> _spotDioList;
  late final List<Dio> _futuresDioList;
  final Map<String, _CacheEntry> _cache = {};
  final Map<String, _PrecisionCacheEntry> _precisionCache = {};

  BinanceDataService() {
    _spotDioList = _spotBaseUrls.map(_buildDio).toList();
    _futuresDioList = _futuresBaseUrls.map(_buildDio).toList();
  }

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

    final dioList = isSwap ? _futuresDioList : _spotDioList;
    final path = isSwap ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr';
    List<dynamic>? data;
    try {
      final response = await _requestWithFallback<List<dynamic>>(
        dioList,
        (dio) => dio.get<List<dynamic>>(path),
      );
      data = response.data;
    } on DioException catch (error) {
      final status = error.response?.statusCode;
      if (status == 418 || status == 429) {
        if (cached != null) {
          return cached.items;
        }
        final retryAfter =
            int.tryParse(error.response?.headers.value('retry-after') ?? '');
        throw RateLimitException(
          retryAfterSeconds: retryAfter,
          statusCode: status,
        );
      }
      rethrow;
    }
    if (data is! List) return [];

    final items =
        data
            .whereType<Map<String, dynamic>>()
            .map(_parseTicker)
            .where(
              (ticker) =>
                  ticker.symbol.endsWith('USDT') ||
                  ticker.symbol.endsWith('USDC'),
            )
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

  Future<int> getPricePrecision({
    required String symbol,
    required bool isSwap,
  }) async {
    final key = '${isSwap ? 'swap' : 'spot'}:${symbol.toUpperCase()}';
    final cached = _precisionCache[key];
    if (cached != null && DateTime.now().isBefore(cached.expiresAt)) {
      return cached.precision;
    }

    final dioList = isSwap ? _futuresDioList : _spotDioList;
    final path = isSwap ? '/fapi/v1/exchangeInfo' : '/api/v3/exchangeInfo';
    final response = await _requestWithFallback<Map<String, dynamic>>(
      dioList,
      (dio) => dio.get<Map<String, dynamic>>(
        path,
        queryParameters: {'symbol': symbol.toUpperCase()},
      ),
    );
    final data = response.data;
    final symbols = data?['symbols'];
    if (symbols is! List || symbols.isEmpty) {
      return 4;
    }

    Map<String, dynamic>? symbolInfo;
    for (final item in symbols) {
      if (item is Map<String, dynamic>) {
        symbolInfo = item;
        break;
      }
    }
    if (symbolInfo == null) {
      return 4;
    }

    final precisionRaw = symbolInfo['pricePrecision'];
    int precision;
    if (precisionRaw is int) {
      precision = precisionRaw;
    } else if (precisionRaw is num) {
      precision = precisionRaw.toInt();
    } else {
      final filters = symbolInfo['filters'];
      final tickSize = _extractTickSize(filters);
      precision = tickSize != null ? _precisionFromTickSize(tickSize) : 4;
    }

    _precisionCache[key] = _PrecisionCacheEntry(
      precision: precision,
      expiresAt: DateTime.now().add(_cacheTtl),
    );
    return precision;
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
    final dioList = isSwap ? _futuresDioList : _spotDioList;
    final path = isSwap ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr';
    final response = await _requestWithFallback<Map<String, dynamic>>(
      dioList,
      (dio) => dio.get<Map<String, dynamic>>(
        path,
        queryParameters: {'symbol': symbol.toUpperCase()},
      ),
    );
    return response.data ?? {};
  }

  Future<OKXOrderBook> getOrderBook({
    required String symbol,
    required bool isSwap,
    int limit = 5,
  }) async {
    final dioList = isSwap ? _futuresDioList : _spotDioList;
    final path = isSwap ? '/fapi/v1/depth' : '/api/v3/depth';
    final response = await _requestWithFallback<Map<String, dynamic>>(
      dioList,
      (dio) => dio.get<Map<String, dynamic>>(
        path,
        queryParameters: {
          'symbol': symbol.toUpperCase(),
          'limit': limit.toString(),
        },
      ),
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
    final dioList = isSwap ? _futuresDioList : _spotDioList;
    final path = isSwap ? '/fapi/v1/trades' : '/api/v3/trades';
    final response = await _requestWithFallback<List<dynamic>>(
      dioList,
      (dio) => dio.get<List<dynamic>>(
        path,
        queryParameters: {
          'symbol': symbol.toUpperCase(),
          'limit': limit.toString(),
        },
      ),
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
    final dioList = isSwap ? _futuresDioList : _spotDioList;
    final path = isSwap ? '/fapi/v1/klines' : '/api/v3/klines';
    final response = await _requestWithFallback<List<dynamic>>(
      dioList,
      (dio) => dio.get<List<dynamic>>(
        path,
        queryParameters: {
          'symbol': symbol.toUpperCase(),
          'interval': interval,
          'limit': limit.toString(),
        },
      ),
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

  String? _extractTickSize(dynamic filters) {
    if (filters is! List) return null;
    for (final filter in filters) {
      if (filter is Map<String, dynamic> &&
          filter['filterType'] == 'PRICE_FILTER') {
        return filter['tickSize']?.toString();
      }
    }
    return null;
  }

  int _precisionFromTickSize(String tickSize) {
    if (!tickSize.contains('.')) return 0;
    final parts = tickSize.split('.');
    final decimals = parts.length > 1 ? parts[1] : '';
    final trimmed = decimals.replaceAll(RegExp(r'0+$'), '');
    return trimmed.isEmpty ? 0 : trimmed.length;
  }

  Dio _buildDio(String baseUrl) {
    return Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
      ),
    );
  }

  Future<Response<T>> _requestWithFallback<T>(
    List<Dio> clients,
    Future<Response<T>> Function(Dio dio) request,
  ) async {
    DioException? lastDioError;
    Object? lastError;
    for (final dio in clients) {
      for (var attempt = 0; attempt < _maxRetriesPerBase; attempt += 1) {
        try {
          return await request(dio);
        } on DioException catch (error) {
          if (!_shouldRetry(error)) {
            rethrow;
          }
          lastDioError = error;
          await _delayForRetry(attempt);
        } catch (error) {
          lastError = error;
          break;
        }
      }
    }
    if (lastDioError != null) {
      throw lastDioError;
    }
    if (lastError != null) {
      throw lastError;
    }
    throw Exception('Binance request failed.');
  }

  bool _shouldRetry(DioException error) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.unknown) {
      return true;
    }
    final status = error.response?.statusCode;
    if (status != null && status >= 500) {
      return true;
    }
    return false;
  }

  Future<void> _delayForRetry(int attempt) async {
    final delayMs = (300 * (attempt + 1)).clamp(300, 1200);
    await Future.delayed(Duration(milliseconds: delayMs));
  }
}

class _CacheEntry {
  final List<MarketTicker> items;
  final DateTime expiresAt;

  const _CacheEntry({required this.items, required this.expiresAt});
}

class _PrecisionCacheEntry {
  final int precision;
  final DateTime expiresAt;

  _PrecisionCacheEntry({required this.precision, required this.expiresAt});
}

class RateLimitException implements Exception {
  final int? retryAfterSeconds;
  final int? statusCode;

  RateLimitException({this.retryAfterSeconds, this.statusCode});

  @override
  String toString() {
    final retryText = retryAfterSeconds != null
        ? 'Retry after ${retryAfterSeconds}s.'
        : 'Please retry later.';
    return 'Rate limited (${statusCode ?? 'unknown'}). $retryText';
  }
}
