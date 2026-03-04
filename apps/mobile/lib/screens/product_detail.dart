import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

import '../services/binance_data_service.dart';
import '../services/coinbase_data_service.dart';
import '../services/okx_data_service.dart';
import '../services/copy_service.dart';
import '../models/market_ticker.dart';
import '../utils/exchange_config.dart';
import '../widgets/order_book_widget.dart';
import '../widgets/trade_history_widget.dart';
import '../widgets/interactive_kline_chart.dart';
import '../utils/number_format_utils.dart';
import '../widgets/copy_text.dart';
import '../services/binance_ws_service.dart';

class _ProductTicker {
  final String symbol;
  final double last;
  final double open24h;
  final double high24h;
  final double low24h;
  final double volume24h;
  final String? iconUrl;

  const _ProductTicker({
    required this.symbol,
    required this.last,
    required this.open24h,
    required this.high24h,
    required this.low24h,
    required this.volume24h,
    this.iconUrl,
  });
}

class ProductDetailScreen extends StatefulWidget {
  final String productId;
  final String exchangeId;
  final String productType;
  final Map<String, MarketTicker>?
  availableTickers; // Optional: ticker data for symbols

  const ProductDetailScreen({
    super.key,
    required this.productId,
    required this.exchangeId,
    required this.productType,
    this.availableTickers,
  });

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen>
    with SingleTickerProviderStateMixin {
  late final OKXDataService _okxService;
  late final BinanceDataService _binanceService;
  late final CoinbaseDataService _coinbaseService;
  late final BinanceWsService _binanceWsService;
  List<OKXKline> _klines = [];
  _ProductTicker? _ticker;
  OKXOrderBook? _orderBook;
  List<OKXTrade> _trades = [];
  late final Timer _timer;
  late final TabController _tabController;
  bool _isWebSocketConnected = false;
  String _currentSymbol = '';
  String _selectedInterval = '15m';
  int _pricePrecision = 4; // Default precision, will be fetched from API
  late final String _exchangeId;
  late final String _productType;

  // Global key to access chart state for reinitializing
  final GlobalKey _chartKey = GlobalKey();

  // Stream subscriptions for cleanup
  StreamSubscription<dynamic>? _tickerSubscription;
  StreamSubscription<OKXOrderBook>? _orderBookSubscription;
  StreamSubscription<List<OKXKline>>? _klineSubscription;
  StreamSubscription<OKXTrade>? _tradeSubscription;

  // Dynamic symbol list - populated in initState
  late final List<String> _symbols;

  // Ticker data for symbol list - passed from parent
  late final Map<String, MarketTicker> _symbolTickers;

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
    _binanceService = BinanceDataService();
    _coinbaseService = CoinbaseDataService();
    _binanceWsService = BinanceWsService();
    _exchangeId = widget.exchangeId.toLowerCase();
    _productType = widget.productType;
    _currentSymbol = widget.productId;
    _tabController = TabController(length: 2, vsync: this);

    // Initialize symbol list and ticker data
    _symbols = _initializeSymbolList();
    _symbolTickers = widget.availableTickers ?? {};

    // Show UI immediately with placeholders - no loading state needed
    // Data will load in background and update UI when ready

    // Load data AFTER UI is rendered (non-blocking)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Give UI time to render first
      Future.delayed(const Duration(milliseconds: 100), () {
        _loadDataInBackground();
      });
    });

    // Polling timer (fallback for OKX, primary for Binance/Coinbase)
    _timer = Timer.periodic(const Duration(seconds: 12), (_) {
      if (_exchangeId == 'okx') {
        if (!_isWebSocketConnected) {
          _loadData();
        }
      } else if (_exchangeId == 'binance') {
        if (!_isWebSocketConnected) {
          _loadData();
        }
      } else {
        _loadData();
      }
    });
  }

  /// Initialize symbol list with current symbol and available tickers
  List<String> _initializeSymbolList() {
    // Default popular trading pairs (fallback if no tickers provided)
    final defaultSymbols = _getDefaultSymbols();

    // Use symbols from tickers if available, otherwise use defaults
    final availableSymbols =
        widget.availableTickers?.keys.toList() ?? defaultSymbols;

    // Create a Set to avoid duplicates, then convert back to List
    final symbolSet = <String>{
      _currentSymbol, // Always include current symbol first
      ...availableSymbols, // Add all other symbols
    };

    // Return as list with current symbol first
    return symbolSet.toList();
  }

  List<String> _getDefaultSymbols() {
    switch (_exchangeId) {
      case 'binance':
        return [
          'BTCUSDT',
          'ETHUSDT',
          'BNBUSDT',
          'SOLUSDT',
          'XRPUSDT',
          'ADAUSDT',
          'DOGEUSDT',
          'AVAXUSDT',
        ];
      case 'coinbase':
        return [
          'BTC-USD',
          'ETH-USD',
          'SOL-USD',
          'XRP-USD',
          'ADA-USD',
          'DOGE-USD',
        ];
      default:
        return [
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
    }
  }

  /// Load data in background without blocking UI
  Future<void> _loadDataInBackground() async {
    // Stage 1: Load historical data (show in UI as it arrives)
    try {
      await _loadData();
    } catch (e) {
      if (mounted && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CopyText(
              'screen.product_detail.load_failed',
              params: {'error': e.toString()},
              fallback: 'Failed to load data: {{error}}',
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    }

    // Stage 2: Connect WebSocket for real-time updates (optional)
    if (_exchangeId == 'okx') {
      try {
        await _connectWebSocket();
      } catch (e) {
        // Don't show error - fallback mode will handle it
      }
    } else if (_exchangeId == 'binance') {
      try {
        await _connectBinanceWebSocket();
      } catch (e) {
        // Don't show error - fallback mode will handle it
      }
    }
  }

  /// Cancel all stream subscriptions
  Future<void> _cancelStreamSubscriptions() async {
    await _tickerSubscription?.cancel();
    await _orderBookSubscription?.cancel();
    await _klineSubscription?.cancel();
    await _tradeSubscription?.cancel();

    _tickerSubscription = null;
    _orderBookSubscription = null;
    _klineSubscription = null;
    _tradeSubscription = null;
  }

  @override
  void dispose() {
    _timer.cancel();
    _tabController.dispose();
    _cancelStreamSubscriptions(); // Cancel stream subscriptions
    _okxService.dispose();
    _binanceWsService.dispose();
    super.dispose();
  }

  /// Convert interval string to milliseconds
  int _getIntervalMilliseconds(String interval) {
    switch (interval.toUpperCase()) {
      case '1M':
        return 60 * 1000; // 1 minute
      case '5M':
        return 5 * 60 * 1000; // 5 minutes
      case '15M':
        return 15 * 60 * 1000; // 15 minutes
      case '30M':
        return 30 * 60 * 1000; // 30 minutes
      case '1H':
        return 60 * 60 * 1000; // 1 hour
      case '4H':
        return 4 * 60 * 60 * 1000; // 4 hours
      case '1D':
        return 24 * 60 * 60 * 1000; // 1 day
      case '1W':
        return 7 * 24 * 60 * 60 * 1000; // 1 week
      default:
        return 60 * 1000; // Default to 1 minute
    }
  }

  double get _priceChangeThreshold {
    if (_pricePrecision <= 0) {
      return 0.01;
    }
    final threshold = 1 / math.pow(10, _pricePrecision);
    return threshold.toDouble();
  }

  bool _hasSignificantPriceChange(double a, double b) {
    return (a - b).abs() > _priceChangeThreshold;
  }

  /// Calculate display volume using exchange-specific units.
  /// OKX/Binance tickers already provide quote volume; Coinbase volume is base.
  double _calculateDisplayVolume(_ProductTicker ticker) {
    if (ticker.volume24h <= 0) {
      return 0;
    }

    if (_exchangeId == 'coinbase') {
      if (ticker.last <= 0) return ticker.volume24h;
      return ticker.volume24h * ticker.last;
    }

    return ticker.volume24h;
  }

  double _calculateMarketVolume(MarketTicker ticker) {
    final volume = ticker.volume24h ?? 0;
    if (volume <= 0) return 0;
    if (_exchangeId == 'coinbase') {
      return volume * (ticker.last ?? 0);
    }
    return volume;
  }

  double? _getMarketChangePercent(MarketTicker ticker) {
    if (ticker.changePercent != null) return ticker.changePercent;
    final last = ticker.last;
    final open = ticker.open24h;
    if (last == null || open == null || open == 0) return null;
    return ((last - open) / open) * 100;
  }

  Future<void> _connectWebSocket() async {
    if (_exchangeId != 'okx') {
      if (mounted) {
        setState(() {
          _isWebSocketConnected = false;
        });
      }
      return;
    }
    try {
      // Cancel existing subscriptions before creating new ones
      await _cancelStreamSubscriptions();

      // Add timeout to WebSocket connection
      await _okxService
          .connectWebSocket(_currentSymbol, timeframe: _selectedInterval)
          .timeout(
            const Duration(seconds: 15),
            onTimeout: () {
              throw TimeoutException('WebSocket connection timeout');
            },
          );

      if (mounted) {
        setState(() {
          _isWebSocketConnected = true;
        });
      }

      // Listen to WebSocket streams with error handling
      _tickerSubscription = _okxService.tickerStream.listen((ticker) {
        if (mounted) {
          setState(() {
            _ticker = _ProductTicker(
              symbol: ticker.instId,
              last: ticker.last,
              open24h: ticker.open24h,
              high24h: ticker.high24h,
              low24h: ticker.low24h,
              volume24h: ticker.volCcy24h,
              iconUrl: ticker.iconUrl,
            );

            // Update or generate candles based on ticker data
            if (_klines.isNotEmpty) {
              final lastKline = _klines.last;
              final currentPrice = ticker.last;
              final now = DateTime.now();

              // Calculate expected candle interval in milliseconds
              final intervalMs = _getIntervalMilliseconds(_selectedInterval);
              final lastKlineTime = lastKline.time;
              final timeSinceLastCandle = now
                  .difference(lastKlineTime)
                  .inMilliseconds;

              // If time gap is larger than interval, generate a new candle
              if (timeSinceLastCandle > intervalMs * 1.5) {
                // Generate new candle starting from last close price
                final newCandleTime = DateTime.fromMillisecondsSinceEpoch(
                  (lastKlineTime.millisecondsSinceEpoch ~/ intervalMs + 1) *
                      intervalMs,
                );

                final newKline = OKXKline(
                  timestamp: newCandleTime.millisecondsSinceEpoch.toString(),
                  open: lastKline.close, // Open = previous close
                  high: currentPrice > lastKline.close
                      ? currentPrice
                      : lastKline.close,
                  low: currentPrice < lastKline.close
                      ? currentPrice
                      : lastKline.close,
                  close: currentPrice,
                  volume: 0, // Unknown volume for synthetic candle
                  time: newCandleTime,
                );

                // Keep exactly 30 klines: remove oldest before adding new
                if (_klines.length >= 30) {
                  _klines.removeAt(0);
                }
                _klines.add(newKline);
              } else {
                // Update the last (unclosed) candle with live ticker data
                final newHigh = lastKline.high > currentPrice
                    ? lastKline.high
                    : currentPrice;

                final newLow = lastKline.low < currentPrice
                    ? lastKline.low
                    : currentPrice;

                final updatedKline = OKXKline(
                  timestamp: lastKline.timestamp,
                  open: lastKline.open,
                  high: newHigh,
                  low: newLow,
                  close: currentPrice,
                  volume: lastKline.volume,
                  time: lastKline.time,
                );
                _klines[_klines.length - 1] = updatedKline;
              }
            }
          });
        }
      }, onError: (error) {});

      _orderBookSubscription = _okxService.orderBookStream.listen((orderBook) {
        if (mounted) {
          setState(() {
            _orderBook = orderBook;
          });
        }
      }, onError: (error) {});

      _klineSubscription = _okxService.klineStream.listen((klines) {
        if (mounted && klines.isNotEmpty) {
          if (_klines.isEmpty) return;

          final newKline = klines[0]; // WebSocket sends newest kline
          final lastKline = _klines.last; // Our list has oldest -> newest

          // Compare timestamps (they are String milliseconds)
          final newTimestamp = int.tryParse(newKline.timestamp) ?? 0;
          final lastTimestamp = int.tryParse(lastKline.timestamp) ?? 0;

          // Validate that this kline matches the current interval
          // by checking if timestamp spacing matches expected interval
          final expectedIntervalMs = _getIntervalMilliseconds(
            _selectedInterval,
          );
          final timestampDiff = (newTimestamp - lastTimestamp).abs();

          // If timestamps differ, check if the difference matches our interval
          // Allow some tolerance for timing (±10%)
          if (timestampDiff > 0) {
            final isMatchingInterval =
                timestampDiff >= expectedIntervalMs * 0.9 &&
                timestampDiff <= expectedIntervalMs * 1.1;

            // Skip this update if it's for a different interval
            if (!isMatchingInterval &&
                timestampDiff > expectedIntervalMs * 0.5) {
              return;
            }
          }

          bool shouldUpdate = false;

          // Check if this is an update to the current candle or a new candle
          if (newTimestamp == lastTimestamp) {
            // Same timestamp: Update the current (last) candle
            final hasMeaningfulChange =
                _hasSignificantPriceChange(newKline.open, lastKline.open) ||
                _hasSignificantPriceChange(newKline.high, lastKline.high) ||
                _hasSignificantPriceChange(newKline.low, lastKline.low) ||
                _hasSignificantPriceChange(newKline.close, lastKline.close);

            if (hasMeaningfulChange) {
              _klines[_klines.length - 1] = newKline;
              shouldUpdate = true;
            }
          } else if (newTimestamp > lastTimestamp) {
            // Newer timestamp: New candle period started, add to the list
            // Keep exactly 30 klines: remove oldest before adding new
            if (_klines.length >= 30) {
              _klines.removeAt(0); // Remove oldest
            }
            _klines.add(newKline);
            shouldUpdate = true;
          }

          // Only call setState if data actually changed
          if (shouldUpdate) {
            setState(() {});
          }
        }
      }, onError: (error) {});

      _tradeSubscription = _okxService.tradeStream.listen((trade) {
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
      }, onError: (error) {});
    } catch (e) {
      if (mounted) {
        setState(() {
          _isWebSocketConnected = false;
        });

        // Show error to user if context is available
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: CopyText('screen.product_detail.websocket_connection_failed_us', fallback: "Websocket connection failed. using polling.", ),
              backgroundColor: Colors.orange,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }
    }
  }

  Future<void> _connectBinanceWebSocket() async {
    if (_exchangeId != 'binance') {
      if (mounted) {
        setState(() {
          _isWebSocketConnected = false;
        });
      }
      return;
    }

    await _cancelStreamSubscriptions();
    await _binanceWsService.connect(
      symbol: _currentSymbol,
      isSwap: _productType != 'SPOT',
    );

    if (mounted) {
      setState(() {
        _isWebSocketConnected = true;
      });
    }

    _tickerSubscription = _binanceWsService.priceStream.listen((price) {
      if (!mounted) return;
      setState(() {
        final current = _ticker;
        if (current != null) {
          _ticker = _ProductTicker(
            symbol: current.symbol,
            last: price,
            open24h: current.open24h,
            high24h: current.high24h,
            low24h: current.low24h,
            volume24h: current.volume24h,
            iconUrl: current.iconUrl,
          );
        }
      });
    }, onError: (_) {});

    _orderBookSubscription = _binanceWsService.orderBookStream.listen((book) {
      if (!mounted) return;
      setState(() {
        _orderBook = book;
      });
    }, onError: (_) {});

    _tradeSubscription = _binanceWsService.tradeStream.listen((trade) {
      if (!mounted) return;
      setState(() {
        _trades.insert(0, trade);
        if (_trades.length > 100) {
          _trades = _trades.sublist(0, 100);
        }
      });
    }, onError: (_) {});
  }

  Future<void> _loadData() async {
    try {
      if (_exchangeId == 'okx') {
        await _loadOkxData();
        return;
      }
      if (_exchangeId == 'binance') {
        await _loadBinanceData();
        return;
      }
      if (_exchangeId == 'coinbase') {
        await _loadCoinbaseData();
        return;
      }
    } catch (e) {
      // Don't show error UI - just log it
      // User can still interact with the app
    }
  }

  Future<void> _loadOkxData() async {
    // Fetch price precision for this symbol from API
    final precisionF = _okxService
        .getPricePrecision(_currentSymbol, instType: _okxInstType())
        .timeout(
          const Duration(seconds: 5),
          onTimeout: () {
            return 4; // Default to 4 decimals for crypto
          },
        );

    // Load only 29 closed klines - wait for WebSocket to push the 30th (live) one
    final klinesF = _okxService
        .getHistoricalKlines(
          _currentSymbol,
          bar: _selectedInterval,
          limit: 29, // Load 29 closed candlesticks
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
          onTimeout: () => throw TimeoutException('OrderBook request timeout'),
        );

    // Wait for all data
    final results = await Future.wait([
      precisionF,
      klinesF,
      tradesF,
      tickerF,
      orderBookF,
    ], eagerError: true);

    final precision = results[0] as int;
    final klines = results[1] as List<OKXKline>;
    final trades = results[2] as List<OKXTrade>;
    final ticker = results[3] as OKXTicker;
    final orderBook = results[4] as OKXOrderBook;

    if (mounted) {
      setState(() {
        _pricePrecision = precision; // Update precision
        // Store 29 closed klines (oldest -> newest)
        _klines = klines.reversed.toList();

        // Create placeholder 30th candlestick using 29th candle's close price
        if (_klines.isNotEmpty) {
          final lastClosedKline = _klines.last;
          final placeholderPrice = lastClosedKline.close;

          // Calculate next candlestick timestamp
          final intervalMs = _getIntervalMilliseconds(_selectedInterval);
          final nextCandleTime = DateTime.fromMillisecondsSinceEpoch(
            lastClosedKline.time.millisecondsSinceEpoch + intervalMs,
          );

          // Create placeholder kline with OHLC = last close price
          final placeholderKline = OKXKline(
            timestamp: nextCandleTime.millisecondsSinceEpoch.toString(),
            open: placeholderPrice,
            high: placeholderPrice,
            low: placeholderPrice,
            close: placeholderPrice,
            volume: 0, // Placeholder, no volume yet
            time: nextCandleTime,
          );

          _klines.add(placeholderKline);
        }

        _trades = trades;
        _ticker = _ProductTicker(
          symbol: ticker.instId,
          last: ticker.last,
          open24h: ticker.open24h,
          high24h: ticker.high24h,
          low24h: ticker.low24h,
          volume24h: ticker.volCcy24h,
          iconUrl: ticker.iconUrl,
        );
        _orderBook = orderBook;
      });
    }
  }

  Future<void> _loadBinanceData() async {
    final isSwap = _productType != 'SPOT';
    final precisionF = _binanceService
        .getPricePrecision(symbol: _currentSymbol, isSwap: isSwap)
        .timeout(
          const Duration(seconds: 5),
          onTimeout: () => _pricePrecision,
        );
    final tickerF = _binanceService
        .getTickerDetails(symbol: _currentSymbol, isSwap: isSwap)
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('Ticker request timeout'),
        );
    final klinesF = _binanceService
        .getKlines(
          symbol: _currentSymbol,
          isSwap: isSwap,
          interval: _binanceInterval(_selectedInterval),
          limit: 30,
        )
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('Klines request timeout'),
        );
    final tradesF = _binanceService
        .getRecentTrades(
          symbol: _currentSymbol,
          isSwap: isSwap,
          limit: 50,
        )
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('Trades request timeout'),
        );
    final orderBookF = _binanceService
        .getOrderBook(
          symbol: _currentSymbol,
          isSwap: isSwap,
          limit: 5,
        )
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('OrderBook request timeout'),
        );

    final results = await Future.wait([
      precisionF,
      tickerF,
      klinesF,
      tradesF,
      orderBookF,
    ], eagerError: true);

    final precision = results[0] as int;
    final ticker = results[1] as Map<String, dynamic>;
    final klines = results[2] as List<OKXKline>;
    final trades = results[3] as List<OKXTrade>;
    final orderBook = results[4] as OKXOrderBook;

    final lastRaw = ticker['lastPrice'];
    final last = _parseDouble(lastRaw) ?? 0;
    final open = _parseDouble(ticker['openPrice']) ?? last;
    final high = _parseDouble(ticker['highPrice']) ?? last;
    final low = _parseDouble(ticker['lowPrice']) ?? last;
    final volume = _parseDouble(ticker['quoteVolume'] ?? ticker['volume']) ?? 0;

    if (mounted) {
      setState(() {
        _pricePrecision = precision;
        _klines = klines;
        _trades = trades;
        _orderBook = orderBook;
        _ticker = _ProductTicker(
          symbol: _currentSymbol,
          last: last,
          open24h: open,
          high24h: high,
          low24h: low,
          volume24h: volume,
        );
      });
    }
  }

  Future<void> _loadCoinbaseData() async {
    final tickerF = _coinbaseService
        .getTickerDetails(_currentSymbol)
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('Ticker request timeout'),
        );
    final klinesF = _coinbaseService
        .getKlines(
          _currentSymbol,
          granularity: _coinbaseGranularity(_selectedInterval),
          limit: 30,
        )
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('Klines request timeout'),
        );
    final tradesF = _coinbaseService
        .getRecentTrades(_currentSymbol, limit: 50)
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('Trades request timeout'),
        )
        .catchError((_) => <OKXTrade>[]);
    final orderBookF = _coinbaseService
        .getOrderBook(_currentSymbol, level: 2)
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('OrderBook request timeout'),
        )
        .catchError(
          (_) => OKXOrderBook(
            bids: const [],
            asks: const [],
            timestamp: DateTime.now().millisecondsSinceEpoch.toString(),
            symbol: _currentSymbol,
          ),
        );

    final results = await Future.wait([
      tickerF,
      klinesF,
      tradesF,
      orderBookF,
    ], eagerError: true);

    final ticker = results[0] as Map<String, dynamic>;
    final klines = results[1] as List<OKXKline>;
    final trades = results[2] as List<OKXTrade>;
    final orderBook = results[3] as OKXOrderBook;

    final lastRaw =
        ticker['price'] ?? ticker['last'] ?? ticker['trade_price'];
    final last = _parseDouble(lastRaw) ?? 0;
    final open =
        _parseDouble(ticker['open_24h'] ?? ticker['open24h']) ?? last;
    final high =
        _parseDouble(ticker['high_24h'] ?? ticker['high24h']) ?? last;
    final low = _parseDouble(ticker['low_24h'] ?? ticker['low24h']) ?? last;
    final volume =
        _parseDouble(ticker['volume_24h'] ?? ticker['volume24h']) ?? 0;

    if (mounted) {
      setState(() {
        _pricePrecision = _inferPrecision(lastRaw, fallback: _pricePrecision);
        _klines = klines.reversed.toList();
        _trades = trades;
        _orderBook = orderBook;
        _ticker = _ProductTicker(
          symbol: _currentSymbol,
          last: last,
          open24h: open,
          high24h: high,
          low24h: low,
          volume24h: volume,
        );
      });
    }
  }

  int _inferPrecision(dynamic value, {required int fallback}) {
    if (value == null) return fallback;
    final text = value.toString();
    if (!text.contains('.')) return 0;
    return text.split('.').last.length;
  }

  double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  String _binanceInterval(String interval) {
    switch (interval.toUpperCase()) {
      case '1M':
        return '1m';
      case '5M':
        return '5m';
      case '15M':
        return '15m';
      case '30M':
        return '30m';
      case '1H':
        return '1h';
      case '4H':
        return '4h';
      case '1D':
        return '1d';
      default:
        return '15m';
    }
  }

  String _okxInstType() {
    switch (_productType.toUpperCase()) {
      case 'SWAP':
        return 'SWAP';
      case 'FUTURES':
        return 'FUTURES';
      case 'OPTION':
        return 'OPTION';
      default:
        return 'SPOT';
    }
  }

  int _coinbaseGranularity(String interval) {
    switch (interval.toUpperCase()) {
      case '1M':
        return 60;
      case '5M':
        return 300;
      case '15M':
        return 900;
      case '30M':
        return 1800;
      case '1H':
        return 3600;
      case '4H':
        return 21600;
      case '1D':
        return 86400;
      default:
        return 900;
    }
  }

  Future<void> _changeSymbol(String newSymbol) async {
    if (newSymbol == _currentSymbol) return;

    // Update state immediately
    setState(() {
      _currentSymbol = newSymbol;
    });

    // Reinitialize chart via JavaScript (keeps WebView, recreates ECharts instance)
    (_chartKey.currentState as dynamic)?.reinitializeChart();

    // Load new data in background
    try {
      if (_exchangeId == 'okx') {
        await _okxService.disconnectWebSocket();
        await _loadData(); // This will update UI when data arrives
        await _connectWebSocket();
      } else if (_exchangeId == 'binance') {
        await _binanceWsService.disconnect();
        await _loadData();
        await _connectBinanceWebSocket();
      } else {
        await _loadData();
      }
    } catch (e) {
      // Error ignored
    }
  }

  Future<void> _changeInterval(String newInterval) async {
    if (newInterval == _selectedInterval) return;

    // Update interval immediately
    setState(() {
      _selectedInterval = newInterval;
    });

    // Reinitialize chart via JavaScript (keeps WebView, recreates ECharts instance)
    (_chartKey.currentState as dynamic)?.reinitializeChart();

    // Load new data in background
    try {
      if (_exchangeId == 'okx') {
        await _okxService.disconnectWebSocket();
        await _loadData(); // This will update UI when data arrives
        await _connectWebSocket();
      } else if (_exchangeId == 'binance') {
        await _loadData();
      } else {
        await _loadData();
      }
    } catch (e) {
      // Error ignored
    }
  }

  /// Custom widget for symbol list item matching product list layout
  Widget _buildSymbolListItem(
    String symbol,
    bool isDarkMode,
    MarketTicker? ticker,
  ) {
    final isSelected = symbol == _currentSymbol;
    final resolvedTicker = ticker;
    final hasData = resolvedTicker != null;
    final changePercent = hasData ? _getMarketChangePercent(resolvedTicker) : null;
    final changeColor = changePercent != null && changePercent >= 0
        ? Colors.green
        : Colors.red;
    final selectedColor =
        isDarkMode ? Colors.blue.withValues(alpha: 0.12) : Colors.blue[50];
    final borderColor = isSelected
        ? (isDarkMode ? Colors.blue[300]! : Colors.blue[400]!)
        : Colors.transparent;

    return Material(
      color: isSelected ? selectedColor : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        key: ValueKey(symbol),
        borderRadius: BorderRadius.circular(10),
        onTap: () {
          Navigator.pop(context);
          _changeSymbol(symbol);
        },
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: borderColor, width: 1),
          ),
          child: Row(
            children: [
              hasData &&
                      resolvedTicker.iconUrl != null &&
                      resolvedTicker.iconUrl!.isNotEmpty
                  ? Image.network(
                      resolvedTicker.iconUrl!,
                      width: 28,
                      height: 28,
                      errorBuilder: (context, error, stackTrace) =>
                          Icon(Icons.monetization_on, size: 28),
                    )
                  : Icon(
                      Icons.currency_exchange,
                      size: 28,
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                    ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      symbol,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: isDarkMode ? Colors.white : Colors.black87,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      hasData
                          ? 'Vol: ${formatVolume(_calculateMarketVolume(resolvedTicker))}'
                          : 'Price unavailable',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    hasData
                        ? '\$${formatPriceExact(
                            resolvedTicker.last ?? 0,
                            precision: symbol == _currentSymbol
                                ? _pricePrecision
                                : 4,
                          )}'
                        : '--',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDarkMode ? Colors.white : Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 2),
                  if (changePercent != null)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          changePercent >= 0
                              ? Icons.trending_up
                              : Icons.trending_down,
                          size: 14,
                          color: changeColor,
                        ),
                        const SizedBox(width: 4),
                        CopyText(
                          'common.percent',
                          params: {
                            'percent':
                                '${changePercent >= 0 ? '+' : ''}${changePercent.toStringAsFixed(2)}',
                          },
                          fallback: '{{percent}}%',
                          style: TextStyle(
                            fontSize: 11,
                            color: changeColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    )
                  else
                    CopyText('screen.product_detail.text', fallback: "--", style: TextStyle(
                        fontSize: 11,
                        color: isDarkMode ? Colors.grey[500] : Colors.grey[600],
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Show searchable symbol selection dialog
  void _showSymbolSearchDialog(bool isDarkMode) {
    String searchQuery = '';
    final TextEditingController searchController = TextEditingController();
    final copy = CopyService.instance;

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

            return AnimatedPadding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
              ),
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeOut,
              child: Container(
                height: MediaQuery.of(context).size.height * 0.8,
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
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(
                        children: [
                          Expanded(
                            child: CopyText('screen.product_detail.select_symbol', fallback: "Select symbol", style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: isDarkMode ? Colors.white : Colors.black,
                              ),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(context),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: TextField(
                        controller: searchController,
                        autofocus: false,
                        style: TextStyle(
                          color: isDarkMode ? Colors.white : Colors.black87,
                          fontSize: 14,
                        ),
                        decoration: InputDecoration(
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            vertical: 12,
                            horizontal: 16,
                          ),
                          hintText: copy.t(
                            'common.search_placeholder',
                            fallback: 'Search...',
                          ),
                          hintStyle: TextStyle(
                            color: isDarkMode
                                ? Colors.grey[500]
                                : Colors.grey[600],
                            fontSize: 14,
                          ),
                          prefixIcon: Icon(
                            Icons.search,
                            color: isDarkMode
                                ? Colors.grey[400]
                                : Colors.grey[600],
                            size: 20,
                          ),
                          suffixIcon: ValueListenableBuilder<TextEditingValue>(
                            valueListenable: searchController,
                            builder: (context, value, child) {
                              if (value.text.isEmpty) {
                                return const SizedBox.shrink();
                              }
                              return IconButton(
                                icon: Icon(
                                  Icons.clear,
                                  color: isDarkMode
                                      ? Colors.grey[400]
                                      : Colors.grey[600],
                                  size: 20,
                                ),
                                onPressed: () {
                                  searchController.clear();
                                  setModalState(() {
                                    searchQuery = '';
                                  });
                                },
                                tooltip: copy.t(
                                  'common.clear_search',
                                  fallback: 'Clear search',
                                ),
                              );
                            },
                          ),
                          filled: true,
                          fillColor:
                              isDarkMode ? Colors.grey[850] : Colors.grey[100],
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(
                              color: isDarkMode
                                  ? Colors.grey[700]!
                                  : Colors.grey[300]!,
                              width: 1.0,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(
                              color: Theme.of(
                                context,
                              ).colorScheme.primary.withValues(alpha: 0.5),
                              width: 2.0,
                            ),
                          ),
                        ),
                        onChanged: (value) {
                          setModalState(() {
                            searchQuery = value;
                          });
                        },
                      ),
                    ),
                    const SizedBox(height: 12),
                    Expanded(
                      child: filteredSymbols.isEmpty
                          ? Center(
                              child: CopyText('screen.product_detail.no_symbols_found', fallback: "No symbols found", style: TextStyle(
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
                                final ticker = _symbolTickers[symbol];

                                return _buildSymbolListItem(
                                  symbol,
                                  isDarkMode,
                                  ticker,
                                );
                              },
                            ),
                    ),
                  ],
                ),
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
                Icons.arrow_drop_down,
                size: 28,
                color: isDarkMode ? Colors.grey[400] : Colors.grey[700],
              ),
            ],
          ),
        ),
        centerTitle: true,
        actions: [
          Padding(
            padding: EdgeInsets.only(right: 8.w),
            child: Center(
              child: ExchangeChip(exchangeId: _exchangeId),
            ),
          ),
          // WebSocket connection indicator
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (_exchangeId == 'okx' || _exchangeId == 'binance')
                      ? (_isWebSocketConnected ? Colors.green : Colors.red)
                      : Colors.grey,
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
                          CopyText('screen.product_detail.loading_chart_data', fallback: "Loading chart data...", style: TextStyle(
                              color: Colors.grey[600],
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    )
                  : InteractiveKlineChart(
                      key: _chartKey,
                      klineData: (() {
                        return _klines.map((k) {
                          // Format date based on interval
                          String dateLabel;
                          if (_selectedInterval == '1D' ||
                              _selectedInterval == '1W' ||
                              _selectedInterval == '1M') {
                            // For daily/weekly/monthly: show date only
                            dateLabel = DateFormat('MM/dd').format(k.time);
                          } else if (_selectedInterval == '4H') {
                            // For 4H: show date + hour
                            dateLabel = DateFormat(
                              'MM/dd HH:00',
                            ).format(k.time);
                          } else {
                            // For 15m, 1H: show date + time
                            dateLabel = DateFormat(
                              'MM/dd HH:mm',
                            ).format(k.time);
                          }

                          return {
                            'date': dateLabel,
                            'open': k.open,
                            'close': k.close,
                            'low': k.low,
                            'high': k.high,
                            'volume': k.volume,
                          };
                        }).toList();
                      })(),
                      symbol: _currentSymbol,
                      interval: _selectedInterval,
                      isDarkMode: isDarkMode,
                      currentPrice: _ticker?.last ?? 0,
                      pricePrecision: _pricePrecision,
                    ),
            ),

            const SizedBox(height: 16),

            // TabBar and TabView for Order Book and Trade History - Fixed height instead of Expanded
            SizedBox(
              height: 400, // Fixed height for the tab section
              child: _buildTabSection(isDarkMode),
            ),

            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildTickerInfo(bool isDarkMode) {
    // Calculate values or use placeholders
    final bool hasData = _ticker != null;
    final double? changePercent = hasData && _ticker!.open24h > 0
        ? ((_ticker!.last - _ticker!.open24h) / _ticker!.open24h) * 100
        : null;
    final bool hasChange = changePercent != null;
    final Color changeColor =
        hasChange && changePercent >= 0 ? Colors.green : Colors.red;

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
                  // Symbol Icon and Name Row
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          color: isDarkMode
                              ? Colors.grey[800]
                              : Colors.grey[200],
                        ),
                        child: hasData &&
                                _ticker!.iconUrl != null &&
                                _ticker!.iconUrl!.isNotEmpty
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(16),
                                child: Image.network(
                                  _ticker!.iconUrl!,
                                  width: 32,
                                  height: 32,
                                  fit: BoxFit.cover,
                                  errorBuilder: (context, error, stackTrace) =>
                                      Icon(
                                        Icons.currency_exchange,
                                        size: 20,
                                        color: isDarkMode
                                            ? Colors.grey[400]
                                            : Colors.grey[600],
                                      ),
                                ),
                              )
                            : Icon(
                                Icons.currency_exchange,
                                size: 20,
                                color: isDarkMode
                                    ? Colors.grey[400]
                                    : Colors.grey[600],
                              ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _currentSymbol,
                        style: TextStyle(
                          color: isDarkMode ? Colors.white : Colors.black,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  CopyText('screen.product_detail.last_price', fallback: "Last price", style: TextStyle(
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    hasData
                        ? '\$${formatPriceExact(_ticker!.last, precision: _pricePrecision)}'
                        : '\$--',
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
                        hasChange && changePercent >= 0
                            ? Icons.trending_up
                            : Icons.trending_down,
                        color: hasChange ? changeColor : Colors.grey,
                        size: 16,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        hasChange
                            ? '${changePercent >= 0 ? '+' : ''}${changePercent.toStringAsFixed(2)}%'
                            : '--',
                        style: TextStyle(
                          color: hasChange ? changeColor : Colors.grey,
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
                    hasData
                        ? '\$${formatPriceExact(_ticker!.high24h, precision: _pricePrecision)}'
                        : '\$--',
                    isDarkMode,
                  ),
                  const SizedBox(height: 8),
                  _buildTickerStat(
                    '24h Low',
                    hasData
                        ? '\$${formatPriceExact(_ticker!.low24h, precision: _pricePrecision)}'
                        : '\$--',
                    isDarkMode,
                  ),
                  const SizedBox(height: 8),
                  _buildTickerStat(
                    '24h Volume',
                    hasData
                        ? formatVolume(_calculateDisplayVolume(_ticker!))
                        : '--',
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
          CopyText('screen.product_detail.interval', fallback: "Interval", style: Theme.of(context).textTheme.bodySmall?.copyWith(
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
                Tab(text: 'Order Book', height: 36),
                Tab(text: 'Trade History', height: 36),
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
