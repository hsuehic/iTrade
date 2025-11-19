import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/okx_data_service.dart';
import '../widgets/order_book_widget.dart';
import '../widgets/trade_history_widget.dart';
import '../widgets/interactive_kline_chart.dart';

class ProductDetailScreen extends StatefulWidget {
  final String productId;
  final List<String>? availableSymbols; // Optional: symbols to show in dropdown

  const ProductDetailScreen({
    super.key,
    required this.productId,
    this.availableSymbols,
  });

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
  bool _isWebSocketConnected = false;
  String _currentSymbol = '';
  String _selectedInterval = '15m';
  
  // Chart version to control when chart gets fully rebuilt
  // Only increment on symbol/interval changes, not on data updates
  int _chartVersion = 0;

  // Dynamic symbol list - populated in initState
  late final List<String> _symbols;

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

    // Initialize symbol list - ensure current symbol is included
    _symbols = _initializeSymbolList();

    // Show UI immediately with placeholders - no loading state needed
    // Data will load in background and update UI when ready

    // Load data AFTER UI is rendered (non-blocking)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Give UI time to render first
      Future.delayed(const Duration(milliseconds: 100), () {
        _loadDataInBackground();
      });
    });

    // Fallback polling timer (only used if WebSocket fails)
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (!_isWebSocketConnected) {
        _loadData();
      }
    });
  }

  /// Initialize symbol list with current symbol and optional provided symbols
  List<String> _initializeSymbolList() {
    // Default popular trading pairs
    final defaultSymbols = [
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

    // Use provided symbols or defaults
    final baseSymbols = widget.availableSymbols ?? defaultSymbols;

    // Create a Set to avoid duplicates, then convert back to List
    final symbolSet = <String>{
      _currentSymbol, // Always include current symbol first
      ...baseSymbols, // Add all other symbols
    };

    // Return as list with current symbol first
    return symbolSet.toList();
  }

  /// Load data in background without blocking UI
  Future<void> _loadDataInBackground() async {
    // Stage 1: Load historical data (show in UI as it arrives)
    debugPrint('Loading initial data for $_currentSymbol');

    try {
      await _loadData();
      debugPrint('Initial data loaded successfully');
    } catch (e) {
      debugPrint('Failed to load initial data: $e');
      if (mounted && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load data: ${e.toString()}'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    }

    // Stage 2: Connect WebSocket for real-time updates (optional)
    try {
      debugPrint('Connecting to WebSocket for real-time updates');
      await _connectWebSocket();
      debugPrint('WebSocket connected');
    } catch (e) {
      debugPrint('WebSocket connection failed: $e');
      // Don't show error - fallback mode will handle it
    }
  }

  @override
  void dispose() {
    _timer.cancel();
    _tabController.dispose();
    _okxService.dispose();
    super.dispose();
  }

  /// Calculate display volume based on instrument type
  /// For SPOT: volCcy24h is in quote currency (USD/USDT) - use directly
  /// For derivatives: volCcy24h is in base currency (BTC/ETH/SATS/PEPE) - multiply by price
  double _calculateDisplayVolume(OKXTicker ticker) {
    if (ticker.volCcy24h <= 0) {
      return 0; // No valid volume data
    }

    // Detect instrument type from symbol
    final isSpot =
        !ticker.instId.contains('-SWAP') &&
        !ticker.instId.contains('-FUTURES') &&
        !RegExp(r'-\d{6}').hasMatch(ticker.instId); // Option date pattern

    // For SPOT: volCcy24h is already in quote currency (USD/USDT)
    if (isSpot) {
      return ticker.volCcy24h;
    }

    // For derivatives (SWAP/FUTURES/OPTION): volCcy24h is in base currency
    // Convert to quote currency by multiplying by price
    // Example: 280,000,000,000,000 SATS × 0.000000018779 USD = 5,266,765 USD
    return ticker.volCcy24h * ticker.last;
  }

  /// Format volume for display with M (million) or B (billion) suffix
  /// Examples: 1,234,567 -> "1.23M", 1,234,567,890 -> "1.23B"
  String _formatVolume(double volume) {
    if (volume >= 1000000000) {
      // Billions
      return '${(volume / 1000000000).toStringAsFixed(2)}B';
    } else if (volume >= 1000000) {
      // Millions
      return '${(volume / 1000000).toStringAsFixed(2)}M';
    } else if (volume >= 1000) {
      // Thousands
      return '${(volume / 1000).toStringAsFixed(2)}K';
    } else {
      // Less than 1000
      return volume.toStringAsFixed(2);
    }
  }

  Future<void> _connectWebSocket() async {
    try {
      // Add timeout to WebSocket connection
      await _okxService
          .connectWebSocket(_currentSymbol, timeframe: _selectedInterval)
          .timeout(
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
      _okxService.tickerStream.listen((ticker) {
        if (mounted) {
          setState(() {
            _ticker = ticker;
            
            // Update the last candle's close price with current ticker for consistency
            // This ensures price indicator and chart always match
            if (_klines.isNotEmpty) {
              final lastKline = _klines.last;
              final updatedKline = OKXKline(
                timestamp: lastKline.timestamp,
                open: lastKline.open,
                high: lastKline.high > ticker.last
                    ? lastKline.high
                    : ticker.last,
                low: lastKline.low < ticker.last ? lastKline.low : ticker.last,
                close: ticker.last, // Use current ticker price
                volume: lastKline.volume,
                time: lastKline.time,
              );
              _klines[_klines.length - 1] = updatedKline;
            }
          });
        }
      }, onError: (error) => debugPrint('Ticker stream error: $error'));

      _okxService.orderBookStream.listen((orderBook) {
        if (mounted) {
          setState(() {
            _orderBook = orderBook;
          });
        }
      }, onError: (error) => debugPrint('OrderBook stream error: $error'));

      _okxService.klineStream.listen((klines) {
        if (mounted && klines.isNotEmpty) {
          if (_klines.isEmpty) return;

          final newKline = klines[0]; // WebSocket sends newest kline
          final lastKline = _klines.last; // Our list has oldest -> newest

          // Compare timestamps (they are String milliseconds)
          final newTimestamp = int.tryParse(newKline.timestamp) ?? 0;
          final lastTimestamp = int.tryParse(lastKline.timestamp) ?? 0;

          bool shouldUpdate = false;

          // Check if this is an update to the current candle or a new candle
          if (newTimestamp == lastTimestamp) {
            // Same timestamp: Update the current (last) candle
            // Only update if OHLC values actually changed significantly
            final oldClose = lastKline.close;
            final newClose = newKline.close;
            if ((oldClose - newClose).abs() > 0.01) {
              _klines[_klines.length - 1] = newKline;
              shouldUpdate = true;
            }
          } else if (newTimestamp > lastTimestamp) {
            // Newer timestamp: New candle period started, add to the list
            _klines.add(newKline);

            // Keep only the most recent 50 klines
            if (_klines.length > 50) {
              _klines.removeAt(0); // Remove oldest
            }
            shouldUpdate = true;
          }

          // Only call setState if data actually changed
          if (shouldUpdate) {
            setState(() {});
          }
        }
      }, onError: (error) => debugPrint('Kline stream error: $error'));

      _okxService.tradeStream.listen((trade) {
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
      }, onError: (error) => debugPrint('Trade stream error: $error'));
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
              content: const Text(
                'WebSocket connection failed. Using polling.',
              ),
              backgroundColor: Colors.orange,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }
    }
  }

  Future<void> _loadData() async {
    try {
      debugPrint(
        'Fetching klines for $_currentSymbol with interval $_selectedInterval',
      );

      // Load only 50 klines for faster loading
      final klinesF = _okxService
          .getHistoricalKlines(
            _currentSymbol,
            bar: _selectedInterval,
            limit: 50, // Reduced from 100 to 50
          )
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () => throw TimeoutException('Klines request timeout'),
          );

      final tradesF = _okxService
          .getRecentTrades(_currentSymbol, limit: 50)
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () => throw TimeoutException('Trades request timeout'),
          );

      // Also fetch ticker and orderbook from REST API
      final tickerF = _okxService
          .getTicker(_currentSymbol)
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () => throw TimeoutException('Ticker request timeout'),
          );

      final orderBookF = _okxService
          .getOrderBook(_currentSymbol)
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () =>
                throw TimeoutException('OrderBook request timeout'),
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

      debugPrint(
        'Data loaded: ${klines.length} klines, ${trades.length} trades',
      );

      if (mounted) {
        // Update the newest (unclosed) kline with current ticker price
        if (klines.isNotEmpty) {
          final newestKline = klines.first; // First is newest from API
          // Update close price with current ticker price
          final updatedKline = OKXKline(
            timestamp: newestKline.timestamp,
            open: newestKline.open,
            high: newestKline.high > ticker.last
                ? newestKline.high
                : ticker.last,
            low: newestKline.low < ticker.last ? newestKline.low : ticker.last,
            close: ticker.last, // Update with current price
            volume: newestKline.volume,
            time: newestKline.time,
          );

          final updatedKlines = [updatedKline, ...klines.skip(1)];

          setState(() {
            _klines = updatedKlines.reversed.toList();
            _trades = trades;
            _ticker = ticker;
            _orderBook = orderBook;
          });
        } else {
          setState(() {
            _klines = klines.reversed.toList();
            _trades = trades;
            _ticker = ticker;
            _orderBook = orderBook;
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading data: $e');
      // Don't show error UI - just log it
      // User can still interact with the app
    }
  }

  Future<void> _changeSymbol(String newSymbol) async {
    if (newSymbol == _currentSymbol) return;

    // Update state immediately - keep old data visible while loading new
    setState(() {
      _currentSymbol = newSymbol;
      _chartVersion++; // Force chart rebuild for new symbol
      // DON'T clear data - keep old data visible
      // DON'T set loading state - keep UI responsive
    });

    // Load new data in background
    try {
      await _okxService.disconnectWebSocket();
      await _loadData(); // This will update UI when data arrives
      await _connectWebSocket();
    } catch (e) {
      debugPrint('Error changing symbol: $e');
    }
  }

  Future<void> _changeInterval(String newInterval) async {
    if (newInterval == _selectedInterval) return;

    // Update interval immediately
    setState(() {
      _selectedInterval = newInterval;
      // DON'T increment _chartVersion - let chart update data without rebuilding
      // DON'T clear klines - keep old data visible
      // DON'T set loading state
    });

    // Load new data in background
    try {
      await _okxService.disconnectWebSocket();
      await _loadData(); // This will update UI when data arrives
      await _connectWebSocket();
    } catch (e) {
      debugPrint('Error changing interval: $e');
    }
  }

  /// Show searchable symbol selection dialog
  void _showSymbolSearchDialog(bool isDarkMode) {
    String searchQuery = '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final filteredSymbols = _symbols.where((symbol) {
              return symbol.toLowerCase().contains(searchQuery.toLowerCase());
            }).toList();

            return Container(
              height: MediaQuery.of(context).size.height * 0.7,
              decoration: BoxDecoration(
                color: isDarkMode ? Colors.grey[900] : Colors.white,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
              child: Column(
                children: [
                  // Handle bar
                  Container(
                    margin: const EdgeInsets.only(top: 12, bottom: 8),
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: isDarkMode ? Colors.grey[700] : Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),

                  // Title
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      'Select Symbol',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: isDarkMode ? Colors.white : Colors.black,
                      ),
                    ),
                  ),

                  // Search field
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: TextField(
                      autofocus: true,
                      decoration: InputDecoration(
                        hintText: 'Search symbols...',
                        prefixIcon: const Icon(Icons.search),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        filled: true,
                        fillColor: isDarkMode
                            ? Colors.grey[850]
                            : Colors.grey[100],
                      ),
                      onChanged: (value) {
                        setModalState(() {
                          searchQuery = value;
                        });
                      },
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Symbol list
                  Expanded(
                    child: filteredSymbols.isEmpty
                        ? Center(
                            child: Text(
                              'No symbols found',
                              style: TextStyle(
                                color: isDarkMode
                                    ? Colors.grey[400]
                                    : Colors.grey[600],
                              ),
                            ),
                          )
                        : ListView.builder(
                            itemCount: filteredSymbols.length,
                            itemBuilder: (context, index) {
                              final symbol = filteredSymbols[index];
                              final isSelected = symbol == _currentSymbol;

                              return ListTile(
                                title: Text(
                                  symbol,
                                  style: TextStyle(
                                    fontWeight: isSelected
                                        ? FontWeight.bold
                                        : FontWeight.normal,
                                    color: isSelected
                                        ? (isDarkMode
                                              ? Colors.blue[300]
                                              : Colors.blue[700])
                                        : (isDarkMode
                                              ? Colors.white
                                              : Colors.black),
                                  ),
                                ),
                                trailing: isSelected
                                    ? Icon(
                                        Icons.check_circle,
                                        color: isDarkMode
                                            ? Colors.blue[300]
                                            : Colors.blue[700],
                                      )
                                    : null,
                                onTap: () {
                                  Navigator.pop(context);
                                  _changeSymbol(symbol);
                                },
                              );
                            },
                          ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Detect current theme
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(
          onTap: () => _showSymbolSearchDialog(isDarkMode),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _currentSymbol,
                style: TextStyle(
                  color: isDarkMode ? Colors.white : Colors.black,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.search,
                size: 20,
                color: isDarkMode ? Colors.grey[400] : Colors.grey[700],
              ),
            ],
          ),
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
      body: Column(
        children: [
          const SizedBox(height: 16),

          // Ticker Information - Always show with placeholders
          _buildTickerInfo(isDarkMode),

          const SizedBox(height: 16),

          // Interval Selector
          _buildIntervalSelector(isDarkMode),

          const SizedBox(height: 16),

          // Kline Chart - Fixed height, no scroll needed
          SizedBox(
            height: 300,
            child: _klines.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.candlestick_chart,
                          size: 48,
                          color: Colors.grey[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Loading chart data...',
                          style: TextStyle(
                            color: Colors.grey[600],
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  )
                : InteractiveKlineChart(
                    key: ValueKey('chart_${_currentSymbol}_$_chartVersion'),
                    klineData: _klines.map((k) {
                      // Debug: Print first kline data
                      if (k == _klines.first) {
                        debugPrint('🔍 Flutter First Kline Data:');
                        debugPrint('  time: ${k.time}');
                        debugPrint('  open: ${k.open} (${k.open.runtimeType})');
                        debugPrint('  close: ${k.close} (${k.close.runtimeType})');
                        debugPrint('  low: ${k.low} (${k.low.runtimeType})');
                        debugPrint('  high: ${k.high} (${k.high.runtimeType})');
                      }
                      
                      // Format date based on interval
                      String dateLabel;
                      if (_selectedInterval == '1D' || _selectedInterval == '1W' || _selectedInterval == '1M') {
                        // For daily/weekly/monthly: show date only
                        dateLabel = DateFormat('MM/dd').format(k.time);
                      } else if (_selectedInterval == '4H') {
                        // For 4H: show date + hour
                        dateLabel = DateFormat('MM/dd HH:00').format(k.time);
                      } else {
                        // For 15m, 1H: show date + time
                        dateLabel = DateFormat('MM/dd HH:mm').format(k.time);
                      }
                      
                      return {
                        'date': dateLabel,
                        'open': k.open,
                        'close': k.close,
                        'low': k.low,
                        'high': k.high,
                      };
                    }).toList(),
                    symbol: _currentSymbol,
                    interval: _selectedInterval,
                    isDarkMode: isDarkMode,
                    currentPrice: _ticker?.last ?? 0,
                  ),
          ),

          const SizedBox(height: 16),

          // TabBar and TabView for Order Book and Trade History - Expanded to fill remaining space
          Expanded(child: _buildTabSection(isDarkMode)),
        ],
      ),
    );
  }

  Widget _buildTickerInfo(bool isDarkMode) {
    // Calculate values or use placeholders
    final bool hasData = _ticker != null;
    final double? changePercent = hasData
        ? ((_ticker!.last - _ticker!.open24h) / _ticker!.open24h) * 100
        : null;
    final Color changeColor =
        hasData && changePercent! >= 0 ? Colors.green : Colors.red;

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
                    hasData ? '\$${_ticker!.last.toStringAsFixed(2)}' : '\$--',
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
                        hasData && changePercent! >= 0
                            ? Icons.trending_up
                            : Icons.trending_down,
                        color: hasData ? changeColor : Colors.grey,
                        size: 16,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        hasData
                            ? '${changePercent! >= 0 ? '+' : ''}${changePercent.toStringAsFixed(2)}%'
                            : '+0.00%',
                        style: TextStyle(
                          color: hasData ? changeColor : Colors.grey,
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
                    hasData ? '\$${_ticker!.high24h.toStringAsFixed(2)}' : '\$--',
                    isDarkMode,
                  ),
                  const SizedBox(height: 8),
                  _buildTickerStat(
                    '24h Low',
                    hasData ? '\$${_ticker!.low24h.toStringAsFixed(2)}' : '\$--',
                    isDarkMode,
                  ),
                  const SizedBox(height: 8),
                  _buildTickerStat(
                    '24h Volume',
                    hasData ? _formatVolume(_calculateDisplayVolume(_ticker!)) : '--',
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
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isDarkMode ? Colors.grey[700]! : Colors.grey[300]!,
          width: 0.5,
        ),
      ),
      child: Column(
        children: [
          // TabBar - Compact style
          Container(
            decoration: BoxDecoration(
              color: isDarkMode ? Colors.grey[900] : Colors.grey[50],
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(8),
                topRight: Radius.circular(8),
              ),
            ),
            child: TabBar(
              controller: _tabController,
              indicatorSize: TabBarIndicatorSize.tab,
              indicator: BoxDecoration(
                color: isDarkMode ? Colors.grey[800] : Colors.white,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(8),
                  topRight: Radius.circular(8),
                ),
              ),
              dividerColor: Colors.transparent,
              labelColor: isDarkMode ? Colors.white : Colors.black,
              unselectedLabelColor: isDarkMode
                  ? Colors.grey[500]
                  : Colors.grey[600],
              labelStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 0,
              ),
              unselectedLabelStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.normal,
                letterSpacing: 0,
              ),
              labelPadding: const EdgeInsets.symmetric(horizontal: 8),
              indicatorPadding: const EdgeInsets.all(0),
              padding: const EdgeInsets.all(0),
              tabs: const [
                Tab(
                  text: 'Order Book',
                  height: 36,
                ),
                Tab(
                  text: 'Trade History',
                  height: 36,
                ),
              ],
            ),
          ),
          // TabBarView Content - Expanded to fill remaining space
          Expanded(
            child: ClipRRect(
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(8),
                bottomRight: Radius.circular(8),
              ),
              child: TabBarView(
                controller: _tabController,
                children: [
                  // Order Book Tab - Native scrolling with proper physics
                  OrderBookWidget(
                    orderBook: _orderBook,
                    isLoading: _orderBook == null,
                    currentPrice: _ticker?.last,
                    compact: true, // Hide decorations in tab view
                  ),
                  // Trade History Tab - Native scrolling with proper physics
                  TradeHistoryWidget(
                    trades: _trades,
                    isLoading: _trades.isEmpty, // Show loading if no data yet
                    compact: true, // Hide decorations in tab view
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
