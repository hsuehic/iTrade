import 'dart:async';
// import 'dart:convert';
import 'dart:developer' as developer;

import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_charts/charts.dart';
import '../services/okx_data_service.dart';
import '../widgets/order_book_widget.dart';

class _CandlePoint {
  final String x;
  final double open;
  final double high;
  final double low;
  final double close;
  _CandlePoint({
    required this.x,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
  });
}

class _LinePoint {
  final String x;
  final double y;
  _LinePoint({required this.x, required this.y});
}

class ProductScreen extends StatefulWidget {
  const ProductScreen({super.key});

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends State<ProductScreen>
    with AutomaticKeepAliveClientMixin {
  late final OKXDataService _okxService;
  final List<OKXKline> _klineData = [];
  String _currentSymbol = 'BTC-USDT';
  double? _currentPrice;
  bool _isLoading = true;
  String _error = '';

  late StreamSubscription<List<OKXKline>> _klineSubscription;
  late StreamSubscription<OKXTicker> _tickerSubscription;
  late StreamSubscription<double> _priceSubscription;
  late StreamSubscription<OKXOrderBook> _orderBookSubscription;

  OKXOrderBook? _currentOrderBook;

  // Popular trading symbols
  final List<String> _popularSymbols = [
    'BTC-USDT',
    'ETH-USDT',
    'BNB-USDT',
    'ADA-USDT',
    'SOL-USDT',
    'XRP-USDT',
    'DOGE-USDT',
    'MATIC-USDT',
    'DOT-USDT',
    'LTC-USDT',
    'AVAX-USDT',
    'LINK-USDT',
  ];

  // Time interval options for candlestick charts
  // time intervals list kept via chips below

  String _currentTimeframe = '15m';

  // connection status helpers removed

  @override
  void initState() {
    super.initState();
    _okxService = OKXDataService();
    _initializeData();
  }

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _klineSubscription.cancel();
    _tickerSubscription.cancel();
    _priceSubscription.cancel();
    _orderBookSubscription.cancel();
    _okxService.dispose();
    super.dispose();
  }

  Future<void> _initializeData() async {
    try {
      setState(() {
        _isLoading = true;
        _error = '';
        _currentPrice = null;
      });

      // Get historical data first
      final historicalData = await _okxService.getHistoricalKlines(
        _currentSymbol,
        bar: _currentTimeframe,
        limit: 100,
      );

      // Sort by timestamp (oldest first)
      historicalData.sort((a, b) => a.time.compareTo(b.time));

      setState(() {
        _klineData.clear();
        _klineData.addAll(historicalData);
        _isLoading = false;
      });

      // Setup WebSocket subscriptions
      _setupWebSocketSubscriptions();

      // Connect to WebSocket
      await _okxService.connectWebSocket(
        _currentSymbol,
        timeframe: _currentTimeframe,
      );
    } catch (e) {
      setState(() {
        _error = 'Failed to load data: $e';
        _isLoading = false;
      });
      developer.log('Error initializing data: $e');
    }
  }

  void _setupWebSocketSubscriptions() {
    // Listen to real-time kline updates
    _klineSubscription = _okxService.klineStream.listen(
      (newKlines) {
        setState(() {
          // Update or add new kline data
          for (final newKline in newKlines) {
            final existingIndex = _klineData.indexWhere(
              (k) => k.timestamp == newKline.timestamp,
            );

            if (existingIndex != -1) {
              // Update existing kline
              _klineData[existingIndex] = newKline;
            } else {
              // Add new kline and maintain limit
              _klineData.add(newKline);
              if (_klineData.length > 100) {
                _klineData.removeAt(0);
              }
            }
          }

          // Keep data sorted
          _klineData.sort((a, b) => a.time.compareTo(b.time));
        });
      },
      onError: (error) {
        developer.log('Kline stream error: $error');
        // Don't set error state for stream errors as it might be temporary
      },
    );

    // Listen to ticker updates
    _tickerSubscription = _okxService.tickerStream.listen(
      (ticker) {
        setState(() {
          _currentPrice = ticker.last;
        });
      },
      onError: (error) {
        developer.log('Ticker stream error: $error');
      },
    );

    // Listen to current price updates
    _priceSubscription = _okxService.currentPriceStream.listen(
      (price) {
        setState(() {
          _currentPrice = price;
        });
      },
      onError: (error) {
        developer.log('Price stream error: $error');
      },
    );

    // Listen to order book updates
    _orderBookSubscription = _okxService.orderBookStream.listen(
      (orderBook) {
        setState(() {
          _currentOrderBook = orderBook;
        });
      },
      onError: (error) {
        developer.log('Order book stream error: $error');
      },
    );
  }

  // ECharts removed

  String _formatTimeLabel(DateTime t) {
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  Widget _buildOrderForm() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.shopping_cart_checkout, size: 18),
              const SizedBox(width: 8),
              Text(
                'Place Order',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: 'BUY',
                  items: const [
                    DropdownMenuItem(value: 'BUY', child: Text('Buy')),
                    DropdownMenuItem(value: 'SELL', child: Text('Sell')),
                  ],
                  onChanged: (_) {},
                  decoration: const InputDecoration(
                    labelText: 'Side',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: 'LIMIT',
                  items: const [
                    DropdownMenuItem(value: 'LIMIT', child: Text('Limit')),
                    DropdownMenuItem(value: 'MARKET', child: Text('Market')),
                  ],
                  onChanged: (_) {},
                  decoration: const InputDecoration(
                    labelText: 'Type',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Price',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Quantity',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.playlist_add_check),
              label: const Text('Submit Order'),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      appBar: null,
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusScope.of(context).unfocus(),
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading data...'),
          ],
        ),
      );
    }

    return Column(
      children: [
        // Removed connection status bar
        // Top: chart full width (fixed height)
        SizedBox(
          height: 200,
          child: Padding(
            padding: const EdgeInsets.only(right: 8),
            child: SfCartesianChart(
              plotAreaBorderWidth: 0,
              primaryXAxis: CategoryAxis(
                isVisible: true,
                majorGridLines: const MajorGridLines(width: 0),
              ),
              primaryYAxis: NumericAxis(
                opposedPosition: true,
                majorGridLines: const MajorGridLines(width: 0.5),
              ),
              trackballBehavior: TrackballBehavior(
                enable: true,
                activationMode: ActivationMode.singleTap,
                tooltipSettings: const InteractiveTooltip(
                  enable: true,
                  color: Colors.black87,
                  borderWidth: 0,
                  format:
                      'point.x\nO: \$point.open  H: \$point.high\nL: \$point.low  C: \$point.close',
                ),
                lineColor: Colors.white70,
                lineWidth: 1,
              ),
              series: <CartesianSeries<dynamic, String>>[
                CandleSeries<_CandlePoint, String>(
                  animationDuration: 0,
                  dataSource: _klineData
                      .map(
                        (k) => _CandlePoint(
                          x: _formatTimeLabel(k.time),
                          open: k.open,
                          high: k.high,
                          low: k.low,
                          close: k.close,
                        ),
                      )
                      .toList(),
                  xValueMapper: (_CandlePoint p, _) => p.x,
                  lowValueMapper: (_CandlePoint p, _) => p.low,
                  highValueMapper: (_CandlePoint p, _) => p.high,
                  openValueMapper: (_CandlePoint p, _) => p.open,
                  closeValueMapper: (_CandlePoint p, _) => p.close,
                  bearColor: const Color(0xFFEC0000),
                  bullColor: const Color(0xFF00DA3C),
                ),
                if (_currentPrice != null)
                  LineSeries<_LinePoint, String>(
                    animationDuration: 0,
                    enableTooltip: false,
                    dataSource: _klineData
                        .map(
                          (k) => _LinePoint(
                            x: _formatTimeLabel(k.time),
                            y: _currentPrice!,
                          ),
                        )
                        .toList(),
                    xValueMapper: (_LinePoint p, _) => p.x,
                    yValueMapper: (_LinePoint p, _) => p.y,
                    color: const Color(0xFFFF6600),
                    width: 2,
                  ),
              ],
            ),
          ),
        ),
        // Middle: Order Book row (separate row)

        // Bottom: scrollable Order Form
        Expanded(
          flex: 1,
          child: SingleChildScrollView(
            key: const PageStorageKey('product_bottom_scroll'),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              children: [
                SizedBox(height: 8),
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: OrderBookWidget(
                    orderBook: _currentOrderBook,
                    isLoading: _isLoading,
                    currentPrice: _currentPrice,
                  ),
                ),
                SizedBox(height: 8),
                _buildOrderForm(),
                SizedBox(height: 8),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
