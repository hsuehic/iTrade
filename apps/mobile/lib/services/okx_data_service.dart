import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:dio/dio.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class OKXInstrument {
  final String instId;
  final String tickSz; // Minimum price increment
  final String lotSz; // Minimum quantity increment
  final int? pricePrecision; // Calculated from tickSz

  OKXInstrument({
    required this.instId,
    required this.tickSz,
    required this.lotSz,
    this.pricePrecision,
  });

  factory OKXInstrument.fromJson(Map<String, dynamic> json) {
    final tickSzRaw = json['tickSz'];
    final tickSz = tickSzRaw.toString(); // Convert to string if needed

    // Calculate precision from tickSz (e.g., "0.0001" -> 4 decimal places)
    int precision;
    if (tickSz.contains('.')) {
      final decimalPart = tickSz.split('.')[1];
      precision = decimalPart.length;
      developer.log(
        '📐 TickSz: $tickSz → decimal part: "$decimalPart" → precision: $precision',
      );
    } else {
      precision = 0;
      developer.log('📐 TickSz: $tickSz → no decimal → precision: 0');
    }

    return OKXInstrument(
      instId: json['instId'] as String,
      tickSz: tickSz,
      lotSz: json['lotSz']?.toString() ?? '1',
      pricePrecision: precision,
    );
  }
}

class OKXKline {
  String timestamp;
  double open;
  double high;
  double low;
  double close;
  double volume;
  DateTime time;

  OKXKline({
    required this.timestamp,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volume,
    required this.time,
  });

  factory OKXKline.fromList(List<dynamic> data) {
    return OKXKline(
      timestamp: data[0],
      open: double.parse(data[1]),
      high: double.parse(data[2]),
      low: double.parse(data[3]),
      close: double.parse(data[4]),
      volume: double.parse(data[5]),
      time: DateTime.fromMillisecondsSinceEpoch(int.parse(data[0])),
    );
  }

  List<double> toCandlestickData() {
    return [open, close, low, high];
  }
}

class OKXTicker {
  final String instId;
  final double last;
  final double lastSz;
  final double askPx;
  final double askSz;
  final double bidPx;
  final double bidSz;
  final double open24h;
  final double high24h;
  final double low24h;
  final double volCcy24h;
  final double vol24h;
  final String timestamp;
  final String iconUrl;

  OKXTicker({
    required this.instId,
    required this.last,
    required this.lastSz,
    required this.askPx,
    required this.askSz,
    required this.bidPx,
    required this.bidSz,
    required this.open24h,
    required this.high24h,
    required this.low24h,
    required this.volCcy24h,
    required this.vol24h,
    required this.timestamp,
    required this.iconUrl,
  });

  factory OKXTicker.fromJson(Map<String, dynamic> json) {
    return OKXTicker(
      instId: json['instId'] ?? '',
      last: double.tryParse(json['last'] ?? '0') ?? 0,
      lastSz: double.tryParse(json['lastSz'] ?? '0') ?? 0,
      askPx: double.tryParse(json['askPx'] ?? '0') ?? 0,
      askSz: double.tryParse(json['askSz'] ?? '0') ?? 0,
      bidPx: double.tryParse(json['bidPx'] ?? '0') ?? 0,
      bidSz: double.tryParse(json['bidSz'] ?? '0') ?? 0,
      open24h: double.tryParse(json['open24h'] ?? '0') ?? 0,
      high24h: double.tryParse(json['high24h'] ?? '0') ?? 0,
      low24h: double.tryParse(json['low24h'] ?? '0') ?? 0,
      volCcy24h: double.tryParse(json['volCcy24h'] ?? '0') ?? 0,
      vol24h: double.tryParse(json['vol24h'] ?? '0') ?? 0,
      timestamp: json['ts'] ?? '',
      iconUrl:
          'https://www.okx.com/cdn/oksupport/asset/currency/icon/${json['instId'].split('-')[0].toLowerCase()}.png?x-oss-process=image/format,webp/ignore-error,1',
    );
  }
}

class OKXOrderBookLevel {
  final double price;
  final double size;

  OKXOrderBookLevel({required this.price, required this.size});

  factory OKXOrderBookLevel.fromList(List<dynamic> data) {
    return OKXOrderBookLevel(
      price: double.parse(data[0]),
      size: double.parse(data[1]),
    );
  }
}

class OKXOrderBook {
  final List<OKXOrderBookLevel> bids;
  final List<OKXOrderBookLevel> asks;
  final String timestamp;
  final String symbol;

  OKXOrderBook({
    required this.bids,
    required this.asks,
    required this.timestamp,
    required this.symbol,
  });

  factory OKXOrderBook.fromJson(Map<String, dynamic> json) {
    final List<dynamic> bidsData = json['bids'] ?? [];
    final List<dynamic> asksData = json['asks'] ?? [];

    return OKXOrderBook(
      bids: bidsData.map((item) => OKXOrderBookLevel.fromList(item)).toList(),
      asks: asksData.map((item) => OKXOrderBookLevel.fromList(item)).toList(),
      timestamp: json['ts'] ?? '',
      symbol: json['instId'] ?? '',
    );
  }
}

class OKXTrade {
  final String tradeId;
  final double price;
  final double size;
  final String side; // 'buy' or 'sell'
  final DateTime timestamp;

  OKXTrade({
    required this.tradeId,
    required this.price,
    required this.size,
    required this.side,
    required this.timestamp,
  });

  factory OKXTrade.fromJson(Map<String, dynamic> json) {
    return OKXTrade(
      tradeId: json['tradeId'] ?? '',
      price: double.tryParse(json['px'] ?? '0') ?? 0,
      size: double.tryParse(json['sz'] ?? '0') ?? 0,
      side: json['side'] ?? 'buy',
      timestamp: DateTime.fromMillisecondsSinceEpoch(
        int.tryParse(json['ts'] ?? '0') ?? 0,
      ),
    );
  }
}

class OKXDataService {
  static const String baseUrl = 'https://www.okx.com/api/v5';
  static const List<String> publicWsUrls = [
    'wss://ws.okx.com/ws/v5/public',
    'wss://wsaws.okx.com/ws/v5/public',
  ];
  static const List<String> businessWsUrls = [
    'wss://ws.okx.com/ws/v5/business',
    'wss://wsaws.okx.com/ws/v5/business',
  ];

  int _currentPublicWsUrlIndex = 0;
  int _currentBusinessWsUrlIndex = 0;

  late final Dio _dio;
  WebSocketChannel? _publicWsChannel; // For tickers, order book, trades
  WebSocketChannel? _businessWsChannel; // For candlestick data
  final StreamController<List<OKXKline>> _klineController =
      StreamController<List<OKXKline>>.broadcast();
  final StreamController<OKXTicker> _tickerController =
      StreamController<OKXTicker>.broadcast();
  final StreamController<double> _currentPriceController =
      StreamController<double>.broadcast();
  final StreamController<OKXOrderBook> _orderBookController =
      StreamController<OKXOrderBook>.broadcast();
  final StreamController<OKXTrade> _tradeController =
      StreamController<OKXTrade>.broadcast();

  bool _isPublicConnected = false;
  bool _isBusinessConnected = false;
  Timer? _publicHeartbeatTimer;
  Timer? _businessHeartbeatTimer;
  Timer? _reconnectTimer;
  Timer? _fallbackTimer;
  String? _currentSymbol;
  String? _currentTimeframe;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  bool _useFallbackMode = false;

  // Track pending unsubscribe confirmations
  final Set<String> _pendingBusinessUnsubscribes = {};
  final Set<String> _pendingPublicUnsubscribes = {};

  // Cache for instrument metadata (tickSize, precision, etc.)
  final Map<String, OKXInstrument> _instrumentCache = {};

  // Streams for external subscription
  Stream<List<OKXKline>> get klineStream => _klineController.stream;
  Stream<OKXTicker> get tickerStream => _tickerController.stream;
  Stream<double> get currentPriceStream => _currentPriceController.stream;
  Stream<OKXOrderBook> get orderBookStream => _orderBookController.stream;
  Stream<OKXTrade> get tradeStream => _tradeController.stream;

  OKXDataService() {
    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ),
    );
  }

  /// Get instrument information including tick size and precision
  Future<OKXInstrument?> getInstrument(String symbol) async {
    // Check cache first
    if (_instrumentCache.containsKey(symbol)) {
      return _instrumentCache[symbol];
    }

    try {
      developer.log('🔍 Fetching instrument info for $symbol...');
      final response = await _dio.get(
        '/public/instruments',
        queryParameters: {'instType': 'SPOT', 'instId': symbol},
      );

      developer.log(
        '📡 Instrument API response code: ${response.data['code']}',
      );

      if (response.data['code'] == '0') {
        final List<dynamic> data = response.data['data'];
        developer.log('📊 Instrument data length: ${data.length}');

        if (data.isNotEmpty) {
          final instrument = OKXInstrument.fromJson(data[0]);
          _instrumentCache[symbol] = instrument; // Cache it
          developer.log(
            '✅ Instrument info for $symbol: tickSz=${instrument.tickSz}, precision=${instrument.pricePrecision}',
          );
          return instrument;
        } else {
          developer.log('⚠️ No instrument data returned for $symbol');
        }
      } else {
        developer.log('⚠️ Instrument API error: ${response.data['msg']}');
      }
    } catch (e, stackTrace) {
      developer.log('❌ Error fetching instrument info for $symbol: $e');
      developer.log('Stack trace: $stackTrace');
    }

    developer.log('⚠️ Returning null for $symbol, will default to 2 decimals');
    return null;
  }

  /// Get price precision for a symbol (returns number of decimal places)
  Future<int> getPricePrecision(String symbol) async {
    final instrument = await getInstrument(symbol);
    final precision =
        instrument?.pricePrecision ?? 4; // Default to 4 for crypto
    developer.log('🎯 Final precision for $symbol: $precision decimals');
    return precision;
  }

  /// Get historical candlestick data
  Future<List<OKXKline>> getHistoricalKlines(
    String symbol, {
    String bar = '15m', // 15 minute bars
    int limit = 100,
    String? after,
    String? before,
  }) async {
    try {
      final response = await _dio.get(
        '/market/history-candles',
        queryParameters: {
          'instId': symbol,
          'bar': bar,
          'limit': limit.toString(),
          if (after != null) 'after': after,
          if (before != null) 'before': before,
        },
      );

      if (response.data['code'] == '0') {
        final List<dynamic> data = response.data['data'];
        return data.map((item) => OKXKline.fromList(item)).toList();
      } else {
        throw Exception(
          'Failed to get historical data: ${response.data['msg']}',
        );
      }
    } catch (e) {
      developer.log('Error getting historical klines: $e');
      rethrow;
    }
  }

  /// Get current ticker information
  Future<OKXTicker> getTicker(String symbol) async {
    try {
      final response = await _dio.get(
        '/market/ticker',
        queryParameters: {'instId': symbol},
      );

      if (response.data['code'] == '0') {
        final List<dynamic> data = response.data['data'];
        if (data.isNotEmpty) {
          return OKXTicker.fromJson(data[0]);
        }
      }
      throw Exception('Failed to get ticker: ${response.data['msg']}');
    } catch (e) {
      developer.log('Error getting ticker: $e');
      rethrow;
    }
  }

  Future<List<OKXTicker>> getTickers(String instType) async {
    try {
      final response = await _dio.get(
        '/market/tickers',
        queryParameters: {'instType': instType},
      );

      if (response.data['code'] == '0') {
        final List<dynamic> data = response.data['data'];
        if (data.isNotEmpty) {
          final List<OKXTicker> tickers = data
              .map((item) => OKXTicker.fromJson(item))
              .toList();
          tickers.sort((a, b) => b.volCcy24h.compareTo(a.volCcy24h));
          return tickers;
        }
      }
      developer.log('Error getting tickers: ${response.data['msg']}');
      throw Exception('Failed to get ticker: ${response.data['msg']}');
    } catch (e) {
      developer.log('Error getting ticker: $e');
    }
    return [];
  }

  /// Get order book data
  Future<OKXOrderBook> getOrderBook(String symbol, {int sz = 5}) async {
    try {
      final response = await _dio.get(
        '/market/books',
        queryParameters: {'instId': symbol, 'sz': sz.toString()},
      );

      if (response.data['code'] == '0') {
        final List<dynamic> data = response.data['data'];
        if (data.isNotEmpty) {
          return OKXOrderBook.fromJson(data[0]);
        }
      }
      throw Exception('Failed to get order book: ${response.data['msg']}');
    } catch (e) {
      developer.log('Error getting order book: $e');
      rethrow;
    }
  }

  /// Get recent trades
  Future<List<OKXTrade>> getRecentTrades(
    String symbol, {
    int limit = 100,
  }) async {
    try {
      final response = await _dio.get(
        '/market/trades',
        queryParameters: {'instId': symbol, 'limit': limit.toString()},
      );

      if (response.data['code'] == '0') {
        final List<dynamic> data = response.data['data'];
        return data.map((item) => OKXTrade.fromJson(item)).toList();
      }
      throw Exception('Failed to get trades: ${response.data['msg']}');
    } catch (e) {
      developer.log('Error getting trades: $e');
      rethrow;
    }
  }

  /// Connect to WebSocket and subscribe to channels
  Future<void> connectWebSocket(
    String symbol, {
    String timeframe = '15m',
  }) async {
    try {
      // If already connected, just change subscriptions (more efficient)
      if (isConnected &&
          _currentSymbol != null &&
          (_currentSymbol != symbol || _currentTimeframe != timeframe)) {
        developer.log(
          '🔄 WebSocket already connected, changing subscriptions from '
          '$_currentSymbol ($_currentTimeframe) to $symbol ($timeframe)',
        );
        await changeSymbol(symbol, timeframe: timeframe);
        return;
      }

      // Save old symbol/timeframe for unsubscribe
      final oldSymbol = _currentSymbol;
      final oldTimeframe = _currentTimeframe;

      // Update to new symbol/timeframe
      _currentSymbol = symbol;
      _currentTimeframe = timeframe;

      // Unsubscribe from old channels before disconnecting
      if (oldSymbol != null && oldTimeframe != null) {
        await _unsubscribeAll(oldSymbol, oldTimeframe);
        await Future.delayed(const Duration(milliseconds: 200));
      }

      // Close existing connections if any
      await disconnectWebSocket();

      // Connect to both Business (for candlesticks) and Public (for tickers, orderbook, trades) WebSockets
      await Future.wait([
        _connectBusinessWebSocket(symbol, timeframe),
        _connectPublicWebSocket(symbol),
      ]);

      developer.log(
        '✅ WebSocket connected and subscribed to $symbol ($timeframe)',
      );
    } catch (e) {
      developer.log('❌ Error connecting WebSocket: $e');
      _scheduleReconnect();
      // Don't rethrow to prevent app crashes
    }
  }

  /// Change symbol/timeframe without disconnecting (more efficient)
  Future<void> changeSymbol(
    String newSymbol, {
    String timeframe = '15m',
  }) async {
    if (!isConnected) {
      developer.log('⚠️ Not connected, calling connectWebSocket instead');
      await connectWebSocket(newSymbol, timeframe: timeframe);
      return;
    }

    try {
      final oldSymbol = _currentSymbol;
      final oldTimeframe = _currentTimeframe;

      developer.log(
        '🔄 Changing from $oldSymbol ($oldTimeframe) to $newSymbol ($timeframe)',
      );

      // Unsubscribe from old channels
      if (oldSymbol != null && oldTimeframe != null) {
        await _unsubscribeAll(oldSymbol, oldTimeframe);

        // Wait for unsubscribe confirmations (max 2 seconds)
        await _waitForUnsubscribeConfirmations();
      }

      // Update current symbol/timeframe
      _currentSymbol = newSymbol;
      _currentTimeframe = timeframe;

      // Subscribe to new channels
      await _subscribeAll(newSymbol, timeframe);

      developer.log('✅ Successfully changed to $newSymbol ($timeframe)');
    } catch (e) {
      developer.log('❌ Error changing symbol: $e');
      // If changing fails, try reconnecting
      await connectWebSocket(newSymbol, timeframe: timeframe);
    }
  }

  /// Wait for all pending unsubscribe confirmations
  Future<void> _waitForUnsubscribeConfirmations() async {
    const maxWaitTime = Duration(seconds: 2);
    const checkInterval = Duration(milliseconds: 50);
    final startTime = DateTime.now();

    while ((_pendingBusinessUnsubscribes.isNotEmpty ||
            _pendingPublicUnsubscribes.isNotEmpty) &&
        DateTime.now().difference(startTime) < maxWaitTime) {
      await Future.delayed(checkInterval);
    }

    if (_pendingBusinessUnsubscribes.isNotEmpty ||
        _pendingPublicUnsubscribes.isNotEmpty) {
      developer.log(
        '⚠️ Timeout waiting for unsubscribe confirmations. '
        'Pending: Business=${_pendingBusinessUnsubscribes.length}, '
        'Public=${_pendingPublicUnsubscribes.length}',
      );
      // Clear pending sets to avoid blocking
      _pendingBusinessUnsubscribes.clear();
      _pendingPublicUnsubscribes.clear();
    }
  }

  /// Unsubscribe from all channels for a given symbol
  Future<void> _unsubscribeAll(String symbol, String timeframe) async {
    await Future.wait([
      _unsubscribeFromCandlesticks(symbol, timeframe),
      _unsubscribeFromTicker(symbol),
      _unsubscribeFromOrderBook(symbol),
      _unsubscribeFromTrades(symbol),
    ]);
  }

  /// Subscribe to all channels for a given symbol
  Future<void> _subscribeAll(String symbol, String timeframe) async {
    await Future.wait([
      _subscribeToCandlesticks(symbol, timeframe),
      _subscribeToTicker(symbol),
      _subscribeToOrderBook(symbol),
      _subscribeToTrades(symbol),
    ]);
  }

  /// Connect to Business WebSocket (for candlestick data)
  Future<void> _connectBusinessWebSocket(
    String symbol,
    String timeframe,
  ) async {
    try {
      final currentUrl = businessWsUrls[_currentBusinessWsUrlIndex];
      developer.log('📊 Connecting to OKX Business WebSocket: $currentUrl');

      // Create WebSocket connection
      _businessWsChannel = WebSocketChannel.connect(
        Uri.parse(currentUrl),
        protocols: [],
      );

      // Start listening to WebSocket messages
      _businessWsChannel!.stream.listen(
        (message) => _handleBusinessWebSocketMessage(message),
        onError: (error) => _handleBusinessWebSocketError(error),
        onDone: () => _handleBusinessWebSocketDone(),
      );

      // Wait for connection to establish
      await Future.delayed(const Duration(milliseconds: 1000));

      _isBusinessConnected = true;
      _reconnectAttempts = 0;
      _stopFallbackMode();

      // Subscribe to candlestick updates
      await _subscribeToCandlesticks(symbol, timeframe);

      // Start heartbeat for business channel
      _startBusinessHeartbeat();

      developer.log('✅ Business WebSocket connected for candlesticks');
    } catch (e) {
      developer.log('❌ Error connecting Business WebSocket: $e');
      _isBusinessConnected = false;
      rethrow;
    }
  }

  /// Connect to Public WebSocket (for tickers, order book, trades)
  Future<void> _connectPublicWebSocket(String symbol) async {
    try {
      final currentUrl = publicWsUrls[_currentPublicWsUrlIndex];
      developer.log('📡 Connecting to OKX Public WebSocket: $currentUrl');

      // Create WebSocket connection
      _publicWsChannel = WebSocketChannel.connect(
        Uri.parse(currentUrl),
        protocols: [],
      );

      // Start listening to WebSocket messages
      _publicWsChannel!.stream.listen(
        (message) => _handlePublicWebSocketMessage(message),
        onError: (error) => _handlePublicWebSocketError(error),
        onDone: () => _handlePublicWebSocketDone(),
      );

      // Wait for connection to establish
      await Future.delayed(const Duration(milliseconds: 1000));

      _isPublicConnected = true;

      // Subscribe to ticker updates
      await _subscribeToTicker(symbol);

      // Subscribe to order book updates
      await _subscribeToOrderBook(symbol);

      // Subscribe to trade updates
      await _subscribeToTrades(symbol);

      // Start heartbeat for public channel
      _startPublicHeartbeat();

      developer.log('✅ Public WebSocket connected for market data');
    } catch (e) {
      developer.log('❌ Error connecting Public WebSocket: $e');
      _isPublicConnected = false;
      rethrow;
    }
  }

  /// Subscribe to candlestick updates (Business WebSocket)
  Future<void> _subscribeToCandlesticks(String symbol, String timeframe) async {
    final channelName = 'candle$timeframe';
    final subscribeMessage = {
      'op': 'subscribe',
      'args': [
        {'channel': channelName, 'instId': symbol},
      ],
    };

    _businessWsChannel?.sink.add(jsonEncode(subscribeMessage));
    developer.log('📊 Subscribed to $channelName for $symbol (Business WS)');
  }

  /// Unsubscribe from candlestick updates (Business WebSocket)
  Future<void> _unsubscribeFromCandlesticks(
    String symbol,
    String timeframe,
  ) async {
    final channelName = 'candle$timeframe';
    final unsubscribeMessage = {
      'op': 'unsubscribe',
      'args': [
        {'channel': channelName, 'instId': symbol},
      ],
    };

    // Track pending unsubscribe
    final key = '$channelName:$symbol';
    _pendingBusinessUnsubscribes.add(key);

    _businessWsChannel?.sink.add(jsonEncode(unsubscribeMessage));
    developer.log(
      '📊 Unsubscribed from $channelName for $symbol (Business WS)',
    );
  }

  /// Subscribe to ticker updates (Public WebSocket)
  Future<void> _subscribeToTicker(String symbol) async {
    final subscribeMessage = {
      'op': 'subscribe',
      'args': [
        {'channel': 'tickers', 'instId': symbol},
      ],
    };

    _publicWsChannel?.sink.add(jsonEncode(subscribeMessage));
    developer.log('📡 Subscribed to tickers for $symbol (Public WS)');
  }

  /// Unsubscribe from ticker updates (Public WebSocket)
  Future<void> _unsubscribeFromTicker(String symbol) async {
    final unsubscribeMessage = {
      'op': 'unsubscribe',
      'args': [
        {'channel': 'tickers', 'instId': symbol},
      ],
    };

    // Track pending unsubscribe
    final key = 'tickers:$symbol';
    _pendingPublicUnsubscribes.add(key);

    _publicWsChannel?.sink.add(jsonEncode(unsubscribeMessage));
    developer.log('📡 Unsubscribed from tickers for $symbol (Public WS)');
  }

  /// Subscribe to order book updates (Public WebSocket)
  Future<void> _subscribeToOrderBook(String symbol) async {
    final subscribeMessage = {
      'op': 'subscribe',
      'args': [
        {'channel': 'books5', 'instId': symbol},
      ],
    };

    _publicWsChannel?.sink.add(jsonEncode(subscribeMessage));
    developer.log('📡 Subscribed to books5 for $symbol (Public WS)');
  }

  /// Unsubscribe from order book updates (Public WebSocket)
  Future<void> _unsubscribeFromOrderBook(String symbol) async {
    final unsubscribeMessage = {
      'op': 'unsubscribe',
      'args': [
        {'channel': 'books5', 'instId': symbol},
      ],
    };

    // Track pending unsubscribe
    final key = 'books5:$symbol';
    _pendingPublicUnsubscribes.add(key);

    _publicWsChannel?.sink.add(jsonEncode(unsubscribeMessage));
    developer.log('📡 Unsubscribed from books5 for $symbol (Public WS)');
  }

  /// Subscribe to trade updates (Public WebSocket)
  Future<void> _subscribeToTrades(String symbol) async {
    final subscribeMessage = {
      'op': 'subscribe',
      'args': [
        {'channel': 'trades', 'instId': symbol},
      ],
    };

    _publicWsChannel?.sink.add(jsonEncode(subscribeMessage));
    developer.log('📡 Subscribed to trades for $symbol (Public WS)');
  }

  /// Unsubscribe from trade updates (Public WebSocket)
  Future<void> _unsubscribeFromTrades(String symbol) async {
    final unsubscribeMessage = {
      'op': 'unsubscribe',
      'args': [
        {'channel': 'trades', 'instId': symbol},
      ],
    };

    // Track pending unsubscribe
    final key = 'trades:$symbol';
    _pendingPublicUnsubscribes.add(key);

    _publicWsChannel?.sink.add(jsonEncode(unsubscribeMessage));
    developer.log('📡 Unsubscribed from trades for $symbol (Public WS)');
  }

  /// Handle incoming Business WebSocket messages (candlesticks)
  void _handleBusinessWebSocketMessage(dynamic message) {
    try {
      final data = jsonDecode(message);

      // Handle error responses
      if (data['event'] == 'error') {
        developer.log('❌ Business WS error: ${data['code']} - ${data['msg']}');
        return;
      }

      if (data['event'] == 'subscribe') {
        developer.log('✅ Business WS subscribed to: ${data['arg']}');
        return;
      }

      if (data['event'] == 'unsubscribe') {
        final arg = data['arg'];
        final channel = arg['channel'];
        final instId = arg['instId'];
        final key = '$channel:$instId';
        _pendingBusinessUnsubscribes.remove(key);
        developer.log('✅ Business WS unsubscribed from: $arg');
        return;
      }

      if (data['data'] != null) {
        final String channel = data['arg']['channel'];
        final List<dynamic> dataList = data['data'];

        if (channel.startsWith('candle') && dataList.isNotEmpty) {
          final klines = dataList
              .map((item) => OKXKline.fromList(item))
              .toList();
          _klineController.add(klines);
          developer.log(
            '📊 Business WS: Received ${klines.length} candlestick(s)',
          );
        }
      } else {
        // Log unexpected message format for debugging
        developer.log('⚠️ Business WS unexpected message: $data');
      }
    } catch (e) {
      developer.log('❌ Error handling Business WebSocket message: $e');
      developer.log('   Raw message: $message');
    }
  }

  /// Handle incoming Public WebSocket messages (tickers, order book, trades)
  void _handlePublicWebSocketMessage(dynamic message) {
    try {
      final data = jsonDecode(message);

      // Handle error responses
      if (data['event'] == 'error') {
        developer.log('❌ Public WS error: ${data['code']} - ${data['msg']}');
        return;
      }

      if (data['event'] == 'subscribe') {
        developer.log('✅ Public WS subscribed to: ${data['arg']}');
        return;
      }

      if (data['event'] == 'unsubscribe') {
        final arg = data['arg'];
        final channel = arg['channel'];
        final instId = arg['instId'];
        final key = '$channel:$instId';
        _pendingPublicUnsubscribes.remove(key);
        developer.log('✅ Public WS unsubscribed from: $arg');
        return;
      }

      if (data['data'] != null) {
        final String channel = data['arg']['channel'];
        final List<dynamic> dataList = data['data'];

        if (channel == 'tickers' && dataList.isNotEmpty) {
          final ticker = OKXTicker.fromJson(dataList[0]);
          _tickerController.add(ticker);
          _currentPriceController.add(ticker.last);
        } else if (channel == 'books5' && dataList.isNotEmpty) {
          final orderBook = OKXOrderBook.fromJson(dataList[0]);
          _orderBookController.add(orderBook);
        } else if (channel == 'trades' && dataList.isNotEmpty) {
          for (var tradeData in dataList) {
            final trade = OKXTrade.fromJson(tradeData);
            _tradeController.add(trade);
          }
        }
      } else {
        // Log unexpected message format for debugging
        developer.log('⚠️ Public WS unexpected message: $data');
      }
    } catch (e) {
      developer.log('❌ Error handling Public WebSocket message: $e');
      developer.log('   Raw message: $message');
    }
  }

  /// Handle Business WebSocket errors
  void _handleBusinessWebSocketError(dynamic error) {
    developer.log('❌ Business WebSocket error: $error');
    _isBusinessConnected = false;
    _scheduleReconnect();
  }

  /// Handle Business WebSocket connection closed
  void _handleBusinessWebSocketDone() {
    developer.log('🔌 Business WebSocket connection closed');
    _isBusinessConnected = false;
    _scheduleReconnect();
  }

  /// Handle Public WebSocket errors
  void _handlePublicWebSocketError(dynamic error) {
    developer.log('❌ Public WebSocket error: $error');
    _isPublicConnected = false;
    _scheduleReconnect();
  }

  /// Handle Public WebSocket connection closed
  void _handlePublicWebSocketDone() {
    developer.log('🔌 Public WebSocket connection closed');
    _isPublicConnected = false;
    _scheduleReconnect();
  }

  /// Schedule reconnection with exponential backoff
  void _scheduleReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      developer.log(
        'Max reconnection attempts reached. Switching to fallback mode.',
      );
      _startFallbackMode();
      return;
    }

    if (_currentSymbol != null && _currentTimeframe != null) {
      _reconnectTimer?.cancel();

      // Try next WebSocket URLs after 3 failed attempts
      if (_reconnectAttempts > 0 && _reconnectAttempts % 3 == 0) {
        _currentPublicWsUrlIndex =
            (_currentPublicWsUrlIndex + 1) % publicWsUrls.length;
        _currentBusinessWsUrlIndex =
            (_currentBusinessWsUrlIndex + 1) % businessWsUrls.length;
        developer.log(
          'Switching WebSocket URLs:\n'
          '  Public: ${publicWsUrls[_currentPublicWsUrlIndex]}\n'
          '  Business: ${businessWsUrls[_currentBusinessWsUrlIndex]}',
        );
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
      final delaySeconds = (1 << _reconnectAttempts).clamp(1, 60);
      _reconnectAttempts++;

      developer.log(
        'Scheduling reconnection attempt $_reconnectAttempts in ${delaySeconds}s',
      );

      _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
        if (!isConnected) {
          developer.log(
            'Attempting to reconnect WebSocket (attempt $_reconnectAttempts)...',
          );
          connectWebSocket(_currentSymbol!, timeframe: _currentTimeframe!);
        }
      });
    }
  }

  /// Start fallback mode using REST API polling
  void _startFallbackMode() {
    if (_useFallbackMode) return;

    _useFallbackMode = true;
    developer.log('Starting fallback mode with REST API polling');

    _fallbackTimer = Timer.periodic(const Duration(seconds: 10), (timer) async {
      if (_currentSymbol != null) {
        try {
          // Get latest ticker data
          final ticker = await getTicker(_currentSymbol!);
          _tickerController.add(ticker);
          _currentPriceController.add(ticker.last);

          // Get order book data
          final orderBook = await getOrderBook(_currentSymbol!, sz: 5);
          _orderBookController.add(orderBook);

          // Optionally get latest kline data
          if (_currentTimeframe != null) {
            final klines = await getHistoricalKlines(
              _currentSymbol!,
              bar: _currentTimeframe!,
              limit: 1,
            );
            if (klines.isNotEmpty) {
              _klineController.add(klines);
            }
          }
        } catch (e) {
          developer.log('Fallback mode error: $e');
        }
      }
    });
  }

  /// Stop fallback mode
  void _stopFallbackMode() {
    _useFallbackMode = false;
    _fallbackTimer?.cancel();
    _fallbackTimer = null;
  }

  /// Start heartbeat for Public WebSocket
  void _startPublicHeartbeat() {
    _publicHeartbeatTimer?.cancel();
    _publicHeartbeatTimer = Timer.periodic(const Duration(seconds: 25), (
      timer,
    ) {
      if (_isPublicConnected && _publicWsChannel != null) {
        _publicWsChannel!.sink.add('ping');
      } else {
        timer.cancel();
      }
    });
  }

  /// Start heartbeat for Business WebSocket
  void _startBusinessHeartbeat() {
    _businessHeartbeatTimer?.cancel();
    _businessHeartbeatTimer = Timer.periodic(const Duration(seconds: 25), (
      timer,
    ) {
      if (_isBusinessConnected && _businessWsChannel != null) {
        _businessWsChannel!.sink.add('ping');
      } else {
        timer.cancel();
      }
    });
  }

  /// Disconnect WebSocket
  Future<void> disconnectWebSocket() async {
    _isPublicConnected = false;
    _isBusinessConnected = false;
    _reconnectAttempts = 0;
    _publicHeartbeatTimer?.cancel();
    _businessHeartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _stopFallbackMode();

    try {
      await _publicWsChannel?.sink.close();
      await _businessWsChannel?.sink.close();
    } catch (e) {
      developer.log('Error closing WebSocket: $e');
    }
    _publicWsChannel = null;
    _businessWsChannel = null;
  }

  /// Check if WebSocket is connected (both public and business)
  bool get isConnected => _isPublicConnected && _isBusinessConnected;

  /// Get current reconnection attempts
  int get reconnectionAttempts => _reconnectAttempts;

  /// Manual retry connection
  Future<void> retryConnection() async {
    if (_currentSymbol != null && _currentTimeframe != null) {
      _reconnectAttempts = 0; // Reset attempts for manual retry
      _currentPublicWsUrlIndex = 0; // Start with first URL
      _currentBusinessWsUrlIndex = 0; // Start with first URL
      _stopFallbackMode(); // Stop fallback mode
      await connectWebSocket(_currentSymbol!, timeframe: _currentTimeframe!);
    }
  }

  /// Dispose all resources
  void dispose() {
    disconnectWebSocket();
    _reconnectTimer?.cancel();
    _klineController.close();
    _tickerController.close();
    _currentPriceController.close();
    _orderBookController.close();
    _tradeController.close();
  }
}
