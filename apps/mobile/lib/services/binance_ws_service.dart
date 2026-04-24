import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'okx_data_service.dart';

class BinanceWsService {
  static const List<String> _spotBaseUrls = [
    'wss://stream.binance.com:9443/ws',
    'wss://itrade.ihsueh.com/ws/binance/spot/ws',
  ];
  static const List<String> _perpBaseUrls = [
    'wss://fstream.binance.com/market/ws',
    'wss://itrade.ihsueh.com/ws/binance/perp/market/ws',
  ];
  static const int _maxRetriesPerBase = 2;

  WebSocketChannel? _tickerChannel;
  WebSocketChannel? _orderBookChannel;
  WebSocketChannel? _tradeChannel;

  final StreamController<double> _priceController =
      StreamController<double>.broadcast();
  final StreamController<OKXOrderBook> _orderBookController =
      StreamController<OKXOrderBook>.broadcast();
  final StreamController<OKXTrade> _tradeController =
      StreamController<OKXTrade>.broadcast();

  Stream<double> get priceStream => _priceController.stream;
  Stream<OKXOrderBook> get orderBookStream => _orderBookController.stream;
  Stream<OKXTrade> get tradeStream => _tradeController.stream;

  Future<void> connect({
    required String symbol,
    required bool isSwap,
  }) async {
    await disconnect();
    final normalized = symbol.toLowerCase();
    final baseUrls = isSwap ? _perpBaseUrls : _spotBaseUrls;
    await _connectWithFallback(baseUrls, normalized, symbol);
  }

  void _handleTicker(dynamic message) {
    final data = _safeJson(message);
    if (data == null) return;
    final price = _parseDouble(data['c'] ?? data['lastPrice']);
    if (price != null) {
      _priceController.add(price);
    }
  }

  void _handleOrderBook(dynamic message, String symbol) {
    final data = _safeJson(message);
    if (data == null) return;
    final bidsRaw = data['b'] ?? data['bids'];
    final asksRaw = data['a'] ?? data['asks'];
    final bids = bidsRaw is List
        ? bidsRaw.map((item) => OKXOrderBookLevel.fromList(item)).toList()
        : <OKXOrderBookLevel>[];
    final asks = asksRaw is List
        ? asksRaw.map((item) => OKXOrderBookLevel.fromList(item)).toList()
        : <OKXOrderBookLevel>[];
    _orderBookController.add(
      OKXOrderBook(
        bids: bids,
        asks: asks,
        timestamp: DateTime.now().millisecondsSinceEpoch.toString(),
        symbol: symbol,
      ),
    );
  }

  void _handleTrade(dynamic message) {
    final data = _safeJson(message);
    if (data == null) return;
    final isBuyerMaker = data['m'] == true;
    final timestamp = data['T'] ?? data['E'];
    _tradeController.add(
      OKXTrade(
        tradeId: data['t']?.toString() ?? '',
        price: _parseDouble(data['p']) ?? 0,
        size: _parseDouble(data['q']) ?? 0,
        side: isBuyerMaker ? 'sell' : 'buy',
        timestamp: DateTime.fromMillisecondsSinceEpoch(
          timestamp is num ? timestamp.toInt() : int.tryParse('$timestamp') ?? 0,
        ),
      ),
    );
  }

  Map<String, dynamic>? _safeJson(dynamic message) {
    try {
      return jsonDecode(message.toString()) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  Future<void> disconnect() async {
    await _tickerChannel?.sink.close();
    await _orderBookChannel?.sink.close();
    await _tradeChannel?.sink.close();
    _tickerChannel = null;
    _orderBookChannel = null;
    _tradeChannel = null;
  }

  void dispose() {
    disconnect();
    _priceController.close();
    _orderBookController.close();
    _tradeController.close();
  }

  Future<void> _connectWithFallback(
    List<String> baseUrls,
    String normalizedSymbol,
    String displaySymbol,
  ) async {
    Object? lastError;
    for (final baseUrl in baseUrls) {
      for (var attempt = 0; attempt < _maxRetriesPerBase; attempt += 1) {
        try {
          await _openChannels(baseUrl, normalizedSymbol, displaySymbol);
          return;
        } catch (error) {
          lastError = error;
          await _delayForRetry(attempt);
          await disconnect();
        }
      }
    }
    throw Exception(
      'Binance WebSocket connection failed. ${lastError ?? ''}',
    );
  }

  Future<void> _openChannels(
    String baseUrl,
    String normalizedSymbol,
    String displaySymbol,
  ) async {
    _tickerChannel = WebSocketChannel.connect(
      Uri.parse('$baseUrl/$normalizedSymbol@ticker'),
    );
    _orderBookChannel = WebSocketChannel.connect(
      Uri.parse('$baseUrl/$normalizedSymbol@depth5@100ms'),
    );
    _tradeChannel = WebSocketChannel.connect(
      Uri.parse('$baseUrl/$normalizedSymbol@trade'),
    );

    await _awaitReady(_tickerChannel);
    await _awaitReady(_orderBookChannel);
    await _awaitReady(_tradeChannel);

    _tickerChannel?.stream.listen(
      (message) => _handleTicker(message),
      onError: (_) {},
    );
    _orderBookChannel?.stream.listen(
      (message) => _handleOrderBook(message, displaySymbol),
      onError: (_) {},
    );
    _tradeChannel?.stream.listen(
      (message) => _handleTrade(message),
      onError: (_) {},
    );
  }

  Future<void> _awaitReady(WebSocketChannel? channel) async {
    if (channel == null) return;
    await channel.ready.timeout(const Duration(seconds: 5));
  }

  Future<void> _delayForRetry(int attempt) async {
    final delayMs = (300 * (attempt + 1)).clamp(300, 1200);
    await Future.delayed(Duration(milliseconds: delayMs));
  }
}
