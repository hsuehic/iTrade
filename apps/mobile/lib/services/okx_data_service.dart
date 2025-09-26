import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:dio/dio.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class OKXKline {
  final String timestamp;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volume;
  final DateTime time;

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

class OKXDataService {
  static const String baseUrl = 'https://www.okx.com/api/v5';
  static const List<String> wsUrls = [
    'wss://ws.okx.com:8443/ws/v5/public',
    'wss://wsaws.okx.com:8443/ws/v5/public',
  ];

  int _currentWsUrlIndex = 0;

  late final Dio _dio;
  WebSocketChannel? _wsChannel;
  final StreamController<List<OKXKline>> _klineController =
      StreamController<List<OKXKline>>.broadcast();
  final StreamController<OKXTicker> _tickerController =
      StreamController<OKXTicker>.broadcast();
  final StreamController<double> _currentPriceController =
      StreamController<double>.broadcast();
  final StreamController<OKXOrderBook> _orderBookController =
      StreamController<OKXOrderBook>.broadcast();

  bool _isConnected = false;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  Timer? _fallbackTimer;
  String? _currentSymbol;
  String? _currentTimeframe;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  bool _useFallbackMode = false;

  // Streams for external subscription
  Stream<List<OKXKline>> get klineStream => _klineController.stream;
  Stream<OKXTicker> get tickerStream => _tickerController.stream;
  Stream<double> get currentPriceStream => _currentPriceController.stream;
  Stream<OKXOrderBook> get orderBookStream => _orderBookController.stream;

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

  /// Connect to WebSocket and subscribe to channels
  Future<void> connectWebSocket(
    String symbol, {
    String timeframe = '15m',
  }) async {
    try {
      _currentSymbol = symbol;
      _currentTimeframe = timeframe;

      // Close existing connection if any
      await disconnectWebSocket();

      final currentUrl = wsUrls[_currentWsUrlIndex];
      developer.log('Attempting to connect to OKX WebSocket: $currentUrl');

      // Create WebSocket connection with headers
      _wsChannel = WebSocketChannel.connect(
        Uri.parse(currentUrl),
        protocols: [],
      );

      // Start listening to WebSocket messages
      _wsChannel!.stream.listen(
        _handleWebSocketMessage,
        onError: _handleWebSocketError,
        onDone: _handleWebSocketDone,
      );

      // Wait longer for connection to establish and stabilize
      await Future.delayed(const Duration(milliseconds: 1000));

      _isConnected = true;
      _reconnectAttempts =
          0; // Reset reconnect attempts on successful connection
      _stopFallbackMode(); // Stop fallback mode on successful connection

      // Subscribe to candlestick updates
      await _subscribeToCandlesticks(symbol, timeframe);

      // Subscribe to ticker updates
      await _subscribeToTicker(symbol);

      // Subscribe to order book updates
      await _subscribeToOrderBook(symbol);

      // Start heartbeat
      _startHeartbeat();

      developer.log(
        'WebSocket connected and subscribed to $symbol ($timeframe)',
      );
    } catch (e) {
      developer.log('Error connecting WebSocket: $e');
      _isConnected = false;
      _scheduleReconnect();
      // Don't rethrow to prevent app crashes
    }
  }

  /// Subscribe to candlestick updates
  Future<void> _subscribeToCandlesticks(String symbol, String timeframe) async {
    final channelName = 'candle$timeframe';
    final subscribeMessage = {
      'op': 'subscribe',
      'args': [
        {'channel': channelName, 'instId': symbol},
      ],
    };

    _wsChannel?.sink.add(jsonEncode(subscribeMessage));
  }

  /// Subscribe to ticker updates
  Future<void> _subscribeToTicker(String symbol) async {
    final subscribeMessage = {
      'op': 'subscribe',
      'args': [
        {'channel': 'tickers', 'instId': symbol},
      ],
    };

    _wsChannel?.sink.add(jsonEncode(subscribeMessage));
  }

  /// Subscribe to order book updates
  Future<void> _subscribeToOrderBook(String symbol) async {
    final subscribeMessage = {
      'op': 'subscribe',
      'args': [
        {'channel': 'books5', 'instId': symbol},
      ],
    };

    _wsChannel?.sink.add(jsonEncode(subscribeMessage));
  }

  /// Handle incoming WebSocket messages
  void _handleWebSocketMessage(dynamic message) {
    try {
      final data = jsonDecode(message);

      if (data['event'] == 'subscribe') {
        developer.log('Subscribed to: ${data['arg']}');
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
        } else if (channel == 'tickers' && dataList.isNotEmpty) {
          final ticker = OKXTicker.fromJson(dataList[0]);
          _tickerController.add(ticker);
          _currentPriceController.add(ticker.last);
        } else if (channel == 'books5' && dataList.isNotEmpty) {
          final orderBook = OKXOrderBook.fromJson(dataList[0]);
          _orderBookController.add(orderBook);
        }
      }
    } catch (e) {
      developer.log('Error handling WebSocket message: $e');
    }
  }

  /// Handle WebSocket errors
  void _handleWebSocketError(dynamic error) {
    developer.log('WebSocket error: $error');
    _isConnected = false;
    _scheduleReconnect();
  }

  /// Handle WebSocket connection closed
  void _handleWebSocketDone() {
    developer.log('WebSocket connection closed');
    _isConnected = false;
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

      // Try next WebSocket URL after 3 failed attempts
      if (_reconnectAttempts > 0 && _reconnectAttempts % 3 == 0) {
        _currentWsUrlIndex = (_currentWsUrlIndex + 1) % wsUrls.length;
        developer.log(
          'Switching to WebSocket URL: ${wsUrls[_currentWsUrlIndex]}',
        );
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
      final delaySeconds = (1 << _reconnectAttempts).clamp(1, 60);
      _reconnectAttempts++;

      developer.log(
        'Scheduling reconnection attempt $_reconnectAttempts in ${delaySeconds}s',
      );

      _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
        if (!_isConnected) {
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

  /// Start heartbeat to keep connection alive
  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (timer) {
      if (_isConnected && _wsChannel != null) {
        _wsChannel!.sink.add('ping');
      } else {
        timer.cancel();
      }
    });
  }

  /// Disconnect WebSocket
  Future<void> disconnectWebSocket() async {
    _isConnected = false;
    _reconnectAttempts = 0;
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _stopFallbackMode();

    try {
      await _wsChannel?.sink.close();
    } catch (e) {
      developer.log('Error closing WebSocket: $e');
    }
    _wsChannel = null;
  }

  /// Check if WebSocket is connected
  bool get isConnected => _isConnected;

  /// Get current reconnection attempts
  int get reconnectionAttempts => _reconnectAttempts;

  /// Manual retry connection
  Future<void> retryConnection() async {
    if (_currentSymbol != null && _currentTimeframe != null) {
      _reconnectAttempts = 0; // Reset attempts for manual retry
      _currentWsUrlIndex = 0; // Start with first URL
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
  }
}
