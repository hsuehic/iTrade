import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'okx_data_service.dart';

class BinanceWsService {
  static const String _spotBaseUrl =
      'wss://itrade.ihsueh.com/ws/binance/spot/ws';
  static const String _perpBaseUrl =
      'wss://itrade.ihsueh.com/ws/binance/perp/ws';

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
    final baseUrl = isSwap ? _perpBaseUrl : _spotBaseUrl;

    _tickerChannel = WebSocketChannel.connect(
      Uri.parse('$baseUrl/$normalized@ticker'),
    );
    _orderBookChannel = WebSocketChannel.connect(
      Uri.parse('$baseUrl/$normalized@depth5@100ms'),
    );
    _tradeChannel = WebSocketChannel.connect(
      Uri.parse('$baseUrl/$normalized@trade'),
    );

    _tickerChannel?.stream.listen(
      (message) => _handleTicker(message),
      onError: (_) {},
    );
    _orderBookChannel?.stream.listen(
      (message) => _handleOrderBook(message, symbol),
      onError: (_) {},
    );
    _tradeChannel?.stream.listen(
      (message) => _handleTrade(message),
      onError: (_) {},
    );
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
}
