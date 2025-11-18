import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_echarts/flutter_echarts.dart';
import 'package:intl/intl.dart';
import 'dart:convert';

import '../services/okx_data_service.dart';
import '../widgets/order_book_widget.dart';
import '../widgets/trade_history_widget.dart';

class ProductDetailScreen extends StatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen>
    with SingleTickerProviderStateMixin {
  late final OKXDataService _okxService;
  List<OKXKline> _klines = [];
  OKXTicker? _ticker;
  OKXOrderBook? _orderBook;
  List<OKXTrade> _trades = [];
  late final Timer _timer;
  late final TabController _tabController;
  bool _isLoading = false;
  bool _isWebSocketConnected = false;
  String _currentSymbol = '';
  String _selectedInterval = '15m';

  // Popular trading pairs
  final List<String> _symbols = [
    'BTC-USDT',
    'ETH-USDT',
    'BNB-USDT',
    'SOL-USDT',
    'XRP-USDT',
    'ADA-USDT',
    'DOGE-USDT',
    'MATIC-USDT',
    'DOT-USDT',
    'AVAX-USDT',
  ];

  // Kline intervals
  final Map<String, String> _intervals = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1H': '1H',
    '4H': '4H',
    '1D': '1D',
  };
  @override
  void initState() {
    super.initState();
    _okxService = OKXDataService();
    _currentSymbol = widget.productId;
    _tabController = TabController(length: 2, vsync: this);
    
    // Set initial loading state
    _isLoading = true;

    // Load data in stages for better UX
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      // Stage 1: Load historical data (critical for chart)
      try {
        debugPrint('Loading initial data for $_currentSymbol');
        await _loadData();
        debugPrint('Initial data loaded successfully');
      } catch (e) {
        debugPrint('Failed to load initial data: $e');
        if (mounted) {
          setState(() {
            _isLoading = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to load chart data: ${e.toString()}'),
              backgroundColor: Colors.red,
              duration: const Duration(seconds: 3),
            ),
          );
        }
        return; // Don't proceed if initial data failed
      }

      // Stage 2: Connect WebSocket for real-time updates (non-blocking)
      // This is optional - app works without it
      try {
        debugPrint('Connecting to WebSocket for real-time updates');
        await _connectWebSocket();
        debugPrint('WebSocket connected');
      } catch (e) {
        debugPrint('WebSocket connection failed: $e');
        // Don't show error - fallback mode will handle it
      }
    });

    // Fallback polling timer (only used if WebSocket fails)
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (!_isWebSocketConnected) {
        _loadData();
      }
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    _tabController.dispose();
    _okxService.dispose();
    super.dispose();
  }

  Future<void> _connectWebSocket() async {
    try {
      // Add timeout to WebSocket connection
      await _okxService.connectWebSocket(
        _currentSymbol,
        timeframe: _selectedInterval,
      ).timeout(
        const Duration(seconds: 15),
        onTimeout: () {
          debugPrint('WebSocket connection timeout');
          throw TimeoutException('WebSocket connection timeout');
        },
      );

      if (mounted) {
        setState(() {
          _isWebSocketConnected = true;
        });
      }

      // Listen to WebSocket streams with error handling
      _okxService.tickerStream.listen(
        (ticker) {
          if (mounted) {
            setState(() {
              _ticker = ticker;
            });
          }
        },
        onError: (error) => debugPrint('Ticker stream error: $error'),
      );

      _okxService.orderBookStream.listen(
        (orderBook) {
          if (mounted) {
            setState(() {
              _orderBook = orderBook;
            });
          }
        },
        onError: (error) => debugPrint('OrderBook stream error: $error'),
      );

      _okxService.klineStream.listen(
        (klines) {
          if (mounted && klines.isNotEmpty) {
            setState(() {
              // Update the last kline or add new one
              if (_klines.isNotEmpty) {
                _klines[_klines.length - 1] = klines[0];
              }
            });
          }
        },
        onError: (error) => debugPrint('Kline stream error: $error'),
      );

      _okxService.tradeStream.listen(
        (trade) {
          if (mounted) {
            setState(() {
              // Add new trade to the beginning of the list
              _trades.insert(0, trade);
              // Keep only the most recent 100 trades
              if (_trades.length > 100) {
                _trades = _trades.sublist(0, 100);
              }
            });
          }
        },
        onError: (error) => debugPrint('Trade stream error: $error'),
      );
    } catch (e) {
      debugPrint('WebSocket connection error: $e');
      if (mounted) {
        setState(() {
          _isWebSocketConnected = false;
        });
        
        // Show error to user if context is available
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('WebSocket connection failed. Using polling.'),
              backgroundColor: Colors.orange,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }
    }
  }

  Future<void> _loadData() async {
    if (_klines.isEmpty) {
      setState(() {
        _isLoading = true;
      });
    }

    try {
      debugPrint('Fetching klines for $_currentSymbol with interval $_selectedInterval');
      
      // Add timeout to prevent hanging - load all initial data in parallel
      final klinesF = _okxService.getHistoricalKlines(
        _currentSymbol,
        bar: _selectedInterval,
        limit: 100,
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw TimeoutException('Klines request timeout'),
      );

      final tradesF = _okxService.getRecentTrades(
        _currentSymbol,
        limit: 50,
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw TimeoutException('Trades request timeout'),
      );

      // Also fetch ticker and orderbook from REST API
      final tickerF = _okxService.getTicker(_currentSymbol).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw TimeoutException('Ticker request timeout'),
      );

      final orderBookF = _okxService.getOrderBook(_currentSymbol).timeout(
        const Duration(seconds: 10),
        onTimeout: () => throw TimeoutException('OrderBook request timeout'),
      );

      // Wait for all data
      final results = await Future.wait([
        klinesF,
        tradesF,
        tickerF,
        orderBookF,
      ], eagerError: true);

      final klines = results[0] as List<OKXKline>;
      final trades = results[1] as List<OKXTrade>;
      final ticker = results[2] as OKXTicker;
      final orderBook = results[3] as OKXOrderBook;

      debugPrint('Data loaded: ${klines.length} klines, ${trades.length} trades');

      if (mounted) {
        setState(() {
          _klines = klines.reversed.toList();
          _trades = trades;
          _ticker = ticker;
          _orderBook = orderBook;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading data: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
        
        // Show error to user if context is available
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to load data: ${e.toString()}'),
              backgroundColor: Colors.red,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }
    }
  }

  Future<void> _changeSymbol(String newSymbol) async {
    if (newSymbol == _currentSymbol) return;

    setState(() {
      _currentSymbol = newSymbol;
      _isLoading = true;
      _klines = [];
      _ticker = null;
      _orderBook = null;
      _trades = [];
    });

    try {
      await _okxService.disconnectWebSocket();
      await _loadData();
      await _connectWebSocket();
    } catch (e) {
      debugPrint('Error changing symbol: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _changeInterval(String newInterval) async {
    if (newInterval == _selectedInterval) return;

    setState(() {
      _selectedInterval = newInterval;
      _isLoading = true;
      _klines = [];
    });

    try {
      await _okxService.disconnectWebSocket();
      await _loadData();
      await _connectWebSocket();
    } catch (e) {
      debugPrint('Error changing interval: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Detect current theme
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    // Theme-aware colors
    final bgColor = isDarkMode ? '#1a1a1a' : '#ffffff';
    final gridLineColor = isDarkMode ? '#333333' : '#e0e0e0';
    final textColor = isDarkMode ? '#e0e0e0' : '#333333';
    final axisLineColor = isDarkMode ? '#444444' : '#cccccc';

    // Candlestick colors (green for up, red for down)
    final upColor = isDarkMode ? '#26a69a' : '#26a69a';
    final downColor = isDarkMode ? '#ef5350' : '#ef5350';

    // MA line colors
    final ma5Color = isDarkMode ? '#ffa726' : '#ff9800';
    final ma10Color = isDarkMode ? '#42a5f5' : '#2196f3';

    // Current price mark line
    final markLineColor = isDarkMode ? '#ff9800' : '#ff9800';
    final markLineBgColor = isDarkMode ? '#aa0000' : '#aa0000';
    final markLineTextColor = '#ffffff';

    final dates = _klines.map((e) {
      return DateFormat('MM/dd hh:mm').format(e.time);
    }).toList();
    final values = _klines.map((e) {
      return [e.open, e.close, e.low, e.high];
    }).toList();

    // 简单 MA 计算
    List<double?> calcMA(int dayCount) {
      List<double?> result = [];
      for (int i = 0; i < values.length; i++) {
        if (i < dayCount) {
          result.add(null);
          continue;
        }
        double sum = 0;
        for (int j = 0; j < dayCount; j++) {
          sum += (values[i - j][1] as num).toDouble(); // 收盘价
        }
        result.add(sum / dayCount);
      }
      return result;
    }

    final option = {
      'backgroundColor': bgColor,
      'animation': false,

      'tooltip': {
        'trigger': 'axis',
        'axisPointer': {'type': 'cross'},
        'backgroundColor': isDarkMode
            ? 'rgba(50, 50, 50, 0.9)'
            : 'rgba(255, 255, 255, 0.9)',
        'borderColor': isDarkMode ? '#666' : '#ccc',
        'textStyle': {'color': textColor},
      },
      'grid': {
        'left': '5%',
        'right': '5%',
        'top': '2%',
        'bottom': '2%',
        'containLabel': true,
      },
      'xAxis': {
        'type': 'category',
        'data': dates,
        'scale': true,
        'boundaryGap': false,
        'axisLine': {
          'onZero': false,
          'lineStyle': {'color': axisLineColor},
        },
        'axisLabel': {'color': textColor},
        'splitLine': {
          'show': true,
          'lineStyle': {'color': gridLineColor, 'width': 1, 'type': 'dashed'},
        },
      },
      'yAxis': {
        'scale': true,
        'splitArea': {'show': false},
        'axisLine': {
          'lineStyle': {'color': axisLineColor},
        },
        'axisLabel': {'color': textColor},
        'splitLine': {
          'show': true,
          'lineStyle': {'color': gridLineColor, 'width': 1, 'type': 'dashed'},
        },
      },
      // Disable interactive panning/zooming
      'dataZoom': [
        {
          'type': 'inside',
          'disabled': true, // 👈 this disables pinch/scroll zoom
        },
        {
          'type': 'slider',
          'show': false, // 👈 hide zoom slider
        },
      ],
      'series': [
        {
          'name': 'Candlestick',
          'type': 'candlestick',
          'data': values,
          'itemStyle': {
            'color': upColor,
            'color0': downColor,
            'borderColor': upColor,
            'borderColor0': downColor,
          },
          'barWidth': '70%',
          'barGap': '10%',
          'markLine': {
            'symbol': 'none',
            'label': {
              'show': true,
              'color': markLineTextColor,
              'position': 'start',
              'formatter': '{c}',
              'backgroundColor': markLineBgColor,
              'borderRadius': 4,
              'padding': [4, 8],
              'align': 'left',
              'verticalAlign': 'top',
              'offset': [0, -8],
            },
            'lineStyle': {'color': markLineColor, 'width': 1, 'type': 'dashed'},
            'data': [
              {'yAxis': _ticker?.last.toDouble() ?? 0},
            ],
          },
        },
        {
          'name': 'MA5',
          'type': 'line',
          'data': calcMA(5),
          'smooth': true,
          'lineStyle': {'color': ma5Color, 'opacity': 0.7},
          'showSymbol': false,
        },
        {
          'name': 'MA10',
          'type': 'line',
          'data': calcMA(10),
          'smooth': true,
          'lineStyle': {'color': ma10Color, 'opacity': 0.7},
          'showSymbol': false,
        },
      ],
    };

    return Scaffold(
      appBar: AppBar(
        title: DropdownButton<String>(
          value: _currentSymbol,
          underline: Container(),
          dropdownColor: isDarkMode ? Colors.grey[850] : Colors.white,
          style: TextStyle(
            color: isDarkMode ? Colors.white : Colors.black,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
          items: _symbols.map((String symbol) {
            return DropdownMenuItem<String>(value: symbol, child: Text(symbol));
          }).toList(),
          onChanged: (String? newSymbol) {
            if (newSymbol != null) {
              _changeSymbol(newSymbol);
            }
          },
        ),
        centerTitle: true,
        actions: [
          // WebSocket connection indicator
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _isWebSocketConnected ? Colors.green : Colors.red,
                ),
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            const SizedBox(height: 16),

            // Ticker Information
            if (_ticker != null) _buildTickerInfo(isDarkMode),

            const SizedBox(height: 16),

            // Interval Selector
            _buildIntervalSelector(isDarkMode),

            const SizedBox(height: 16),

            // Kline Chart
            SizedBox(
              height: 300,
              child: _isLoading || _klines.isEmpty
                  ? Center(child: CircularProgressIndicator())
                  : Echarts(
                      option: jsonEncode(option),
                      // Prevent WebView bounce/overscroll (pull-to-refresh-like) behavior
                      extraScript: '''
                    (function(){
                      try {
                        var style = document.createElement('style');
                        style.type = 'text/css';
                        style.innerHTML = `
                          html, body { height: 100%; margin: 0; overscroll-behavior: none; }
                          /* Lock scrolling and rubber-banding */
                          body { position: fixed; overflow: hidden; width: 100%; -webkit-overflow-scrolling: auto; touch-action: manipulation; }
                          #chart { touch-action: manipulation; }
                        `;
                        document.head.appendChild(style);
                      } catch (e) {
                        console.log('style inject failed', e);
                      }
                    })();
                  ''',
                    ),
            ),

            const SizedBox(height: 24),

            // TabBar and TabView for Order Book and Trade History
            _buildTabSection(isDarkMode),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildTickerInfo(bool isDarkMode) {
    final changePercent =
        ((_ticker!.last - _ticker!.open24h) / _ticker!.open24h) * 100;
    final changeColor = changePercent >= 0 ? Colors.green : Colors.red;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDarkMode ? Colors.grey[850] : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDarkMode ? Colors.grey[700]! : Colors.grey[300]!,
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Last Price',
                    style: TextStyle(
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '\$${_ticker!.last.toStringAsFixed(2)}',
                    style: TextStyle(
                      color: isDarkMode ? Colors.white : Colors.black,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(
                        changePercent >= 0
                            ? Icons.trending_up
                            : Icons.trending_down,
                        color: changeColor,
                        size: 16,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${changePercent >= 0 ? '+' : ''}${changePercent.toStringAsFixed(2)}%',
                        style: TextStyle(
                          color: changeColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _buildTickerStat(
                    '24h High',
                    '\$${_ticker!.high24h.toStringAsFixed(2)}',
                    isDarkMode,
                  ),
                  const SizedBox(height: 8),
                  _buildTickerStat(
                    '24h Low',
                    '\$${_ticker!.low24h.toStringAsFixed(2)}',
                    isDarkMode,
                  ),
                  const SizedBox(height: 8),
                  _buildTickerStat(
                    '24h Volume',
                    '${(_ticker!.vol24h / 1000000).toStringAsFixed(2)}M',
                    isDarkMode,
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTickerStat(String label, String value, bool isDarkMode) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          label,
          style: TextStyle(
            color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
            fontSize: 10,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: isDarkMode ? Colors.white : Colors.black,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildIntervalSelector(bool isDarkMode) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Text(
            'Interval',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontSize: 12,
              color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 12),
          PopupMenuButton<String>(
            onSelected: (value) {
              _changeInterval(value);
            },
            position: PopupMenuPosition.under,
            color: isDarkMode ? const Color(0xFF2A2A2A) : Colors.white,
            elevation: 4,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            padding: EdgeInsets.zero,
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              for (final entry in _intervals.entries)
                PopupMenuItem<String>(
                  value: entry.value,
                  height: 36,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 0,
                  ),
                  child: Text(
                    entry.key,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontSize: 12,
                      fontWeight: _selectedInterval == entry.value
                          ? FontWeight.bold
                          : null,
                      color: isDarkMode ? Colors.grey[200] : Colors.grey[800],
                    ),
                  ),
                ),
            ],
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: isDarkMode ? Colors.grey[800] : Colors.grey[200],
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _intervals.entries
                        .firstWhere(
                          (entry) => entry.value == _selectedInterval,
                          orElse: () => _intervals.entries.first,
                        )
                        .key,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isDarkMode ? Colors.white : Colors.black,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.arrow_drop_down,
                    size: 16,
                    color: isDarkMode ? Colors.white : Colors.black,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabSection(bool isDarkMode) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: isDarkMode ? Colors.grey[850] : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDarkMode ? Colors.grey[700]! : Colors.grey[300]!,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // TabBar
          Container(
            decoration: BoxDecoration(
              color: isDarkMode ? Colors.grey[800] : Colors.grey[100],
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(11),
                topRight: Radius.circular(11),
              ),
            ),
            child: TabBar(
              controller: _tabController,
              indicatorSize: TabBarIndicatorSize.tab,
              indicator: BoxDecoration(
                color: isDarkMode ? Colors.grey[700] : Colors.white,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(11),
                  topRight: Radius.circular(11),
                ),
              ),
              dividerColor: Colors.transparent,
              labelColor: isDarkMode ? Colors.white : Colors.black,
              unselectedLabelColor:
                  isDarkMode ? Colors.grey[400] : Colors.grey[600],
              labelStyle: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
              unselectedLabelStyle: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.normal,
              ),
              tabs: const [
                Tab(text: 'Order Book'),
                Tab(text: 'Trade History'),
              ],
            ),
          ),
          // TabBarView Content - No extra decorations needed
          ClipRRect(
            borderRadius: const BorderRadius.only(
              bottomLeft: Radius.circular(11),
              bottomRight: Radius.circular(11),
            ),
            child: SizedBox(
              height: 350, // Reduced height for better UX
              child: TabBarView(
                controller: _tabController,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  // Order Book Tab - Use compact mode to hide decorations
                  SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    padding: const EdgeInsets.all(12),
                    child: OrderBookWidget(
                      orderBook: _orderBook,
                      isLoading: _orderBook == null,
                      currentPrice: _ticker?.last,
                      compact: true, // Hide decorations in tab view
                    ),
                  ),
                  // Trade History Tab - Use compact mode to hide decorations
                  SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    padding: const EdgeInsets.all(12),
                    child: TradeHistoryWidget(
                      trades: _trades,
                      isLoading: _trades.isEmpty && _isLoading,
                      compact: true, // Hide decorations in tab view
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
