import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../models/market_ticker.dart';
import '../services/binance_data_service.dart';
import '../services/coinbase_data_service.dart';
import '../services/copy_service.dart';
import '../services/okx_data_service.dart';
import '../utils/crypto_icons.dart';
import '../utils/number_format_utils.dart';
import '../widgets/copy_text.dart';
import '../widgets/exchange_picker_field.dart';

class PlaceOrderPayload {
  final String exchange;
  final String symbol;
  final String side;
  final String type;
  final double quantity;
  final double? price;

  const PlaceOrderPayload({
    required this.exchange,
    required this.symbol,
    required this.side,
    required this.type,
    required this.quantity,
    this.price,
  });
}

class PlaceOrderScreen extends StatefulWidget {
  final Future<void> Function(PlaceOrderPayload payload) onSubmit;

  const PlaceOrderScreen({super.key, required this.onSubmit});

  @override
  State<PlaceOrderScreen> createState() => _PlaceOrderScreenState();
}

class _PlaceOrderScreenState extends State<PlaceOrderScreen> {
  final _symbolController = TextEditingController();
  final _quantityController = TextEditingController();
  final _priceController = TextEditingController();
  final OKXDataService _okxService = OKXDataService();
  final BinanceDataService _binanceService = BinanceDataService();
  final CoinbaseDataService _coinbaseService = CoinbaseDataService();
  Timer? _debounce;
  Timer? _tickerDebounce;
  StreamSubscription<OKXTicker>? _tickerSubscription;

  List<String> _symbols = [];
  Map<String, MarketTicker> _symbolTickers = {};
  bool _symbolsLoading = false;
  String? _symbolsError;

  String _exchange = '';
  String _side = 'BUY';
  String _type = 'MARKET';
  bool _submitting = false;
  bool _submitAttempted = false;
  final Map<String, bool> _touched = {};
  Map<String, String> _errors = {};
  String _productType = 'SPOT';
  String? _tickerSymbol;
  double? _lastPrice;
  double? _bestBid;
  double? _bestAsk;
  bool _tickerLoading = false;
  String? _tickerError;
  VoidCallback? _symbolSheetRefresh;

  @override
  void dispose() {
    _debounce?.cancel();
    _tickerDebounce?.cancel();
    _tickerSubscription?.cancel();
    _okxService.dispose();
    _symbolController.dispose();
    _quantityController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _symbols = [];
  }

  List<String> _getDefaultSymbols(String exchange, String productType) {
    final normalized = exchange.trim().toLowerCase();
    if (normalized.isEmpty) return [];
    final isSwap = productType == 'SWAP';
    switch (normalized) {
      case 'binance':
        final base = [
          'BTC/USDT',
          'ETH/USDT',
          'BNB/USDT',
          'SOL/USDT',
          'XRP/USDT',
          'ADA/USDT',
          'DOGE/USDT',
          'MATIC/USDT',
          'DOT/USDT',
          'AVAX/USDT',
        ];
        return isSwap ? base.map((s) => '$s:USDT').toList() : base;
      case 'coinbase':
        final base = [
          'BTC/USDC',
          'ETH/USDC',
          'SOL/USDC',
          'XRP/USDC',
          'DOGE/USDC',
        ];
        return isSwap ? base.map((s) => '$s:USDC').toList() : base;
      case 'okx':
        final base = [
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
        return isSwap ? base.map((s) => '$s-SWAP').toList() : base;
      default:
        return [];
    }
  }

  String _normalizeOkxSymbol(String rawSymbol) {
    final trimmed = rawSymbol.trim().toUpperCase();
    if (trimmed.isEmpty) return '';
    if (trimmed.contains('-SWAP')) {
      return trimmed.replaceAll('/', '-');
    }
    final hasPerpSuffix = trimmed.contains(':');
    final withoutPerp = hasPerpSuffix
        ? trimmed.substring(0, trimmed.indexOf(':'))
        : trimmed;
    final base = withoutPerp.replaceAll('/', '-');
    if (hasPerpSuffix || _productType == 'SWAP') {
      return '$base-SWAP';
    }
    return base;
  }

  String _formatOkxSymbol(String instId) {
    return instId;
  }

  String _extractBaseSymbol(String symbol) {
    final trimmed = symbol.trim();
    if (trimmed.isEmpty) return '';
    final withoutSuffix = trimmed.split(':').first;
    final parts = withoutSuffix.split(RegExp(r'[-/]'));
    if (parts.isNotEmpty && parts.first.isNotEmpty) {
      return parts.first;
    }

    final upper = withoutSuffix.toUpperCase();
    const knownQuotes = [
      'USDT',
      'USDC',
      'BUSD',
      'TUSD',
      'FDUSD',
      'USD',
    ];
    for (final quote in knownQuotes) {
      if (upper.endsWith(quote) && upper.length > quote.length) {
        return upper.substring(0, upper.length - quote.length);
      }
    }
    return withoutSuffix;
  }

  String _buildBaseIconUrl(String symbol) {
    final base = _extractBaseSymbol(symbol);
    if (base.isEmpty) return '';
    return CryptoIcons.getIconUrl(base, exchangeId: _exchange);
  }

  double _calculateDisplayVolume(MarketTicker ticker) {
    final volume = ticker.volume24h;
    if (volume == null || volume <= 0) {
      return 0;
    }

    final symbol = ticker.symbol.toUpperCase();
    final isSpot = !_isSwapSymbol(symbol);

    if (isSpot) {
      return volume;
    }

    if (ticker.last == null) {
      return volume;
    }
    return volume * ticker.last!;
  }

  bool _isSwapSymbol(String symbol) {
    final upper = symbol.toUpperCase();
    return upper.contains(':') ||
        upper.contains('-SWAP') ||
        upper.contains('-PERP') ||
        upper.contains('-FUTURES');
  }

  MarketTicker _fromOkxTicker(OKXTicker ticker) {
    return MarketTicker(
      symbol: ticker.instId,
      last: ticker.last,
      open24h: ticker.open24h,
      volume24h: ticker.volCcy24h,
      iconUrl: ticker.iconUrl,
      exchange: 'OKX',
    );
  }

  Future<void> _loadSymbolsForExchange(
    String exchange,
    String productType,
  ) async {
    final normalized = exchange.trim().toLowerCase();
    if (normalized == 'binance') {
      await _loadMarketTickersForExchange(
        exchange,
        productType,
        () => _binanceService.getTickers(isSwap: productType == 'SWAP'),
        applyProductFilter: false,
      );
      return;
    }
    if (normalized == 'coinbase') {
      await _loadMarketTickersForExchange(
        exchange,
        productType,
        () => _coinbaseService.getTickers(isSwap: productType == 'SWAP'),
        applyProductFilter: false,
      );
      return;
    }
    if (normalized != 'okx') {
      if (!mounted) return;
      setState(() {
        _symbols = _getDefaultSymbols(exchange, productType);
        _symbolTickers = {};
        _symbolsLoading = false;
        _symbolsError = 'Unsupported exchange';
      });
      _syncSymbolSelection();
      _refreshSymbolSheet();
      return;
    }

    if (!mounted) return;
    setState(() {
      _symbolsLoading = true;
      _symbolsError = null;
    });

    try {
      final instType = productType == 'SWAP' ? 'SWAP' : 'SPOT';
      final tickers = await _okxService.getTickers(instType);
      final limited = tickers.take(200).toList();
      final symbolMap = <String, MarketTicker>{};
      final symbols = <String>[];
      for (final ticker in limited) {
        final symbol = _formatOkxSymbol(ticker.instId);
        if (symbol.isEmpty) continue;
        symbols.add(symbol);
        symbolMap[symbol] = _fromOkxTicker(ticker);
      }

      if (!mounted) return;
      setState(() {
        _symbols = symbols.isEmpty
            ? _getDefaultSymbols(exchange, productType)
            : symbols;
        _symbolTickers = symbolMap;
        _symbolsLoading = false;
        _symbolsError = null;
      });
      _syncSymbolSelection();
      _refreshSymbolSheet();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _symbols = _getDefaultSymbols(exchange, productType);
        _symbolTickers = {};
        _symbolsLoading = false;
        _symbolsError = e.toString();
      });
      _syncSymbolSelection();
      _refreshSymbolSheet();
    }
  }

  Future<void> _loadMarketTickersForExchange(
    String exchange,
    String productType,
    Future<List<MarketTicker>> Function() loader, {
    bool applyProductFilter = true,
  }
  ) async {
    if (!mounted) return;
    setState(() {
      _symbolsLoading = true;
      _symbolsError = null;
      _symbolTickers = {};
    });

    try {
      final raw = await loader().timeout(const Duration(seconds: 10));
      if (!mounted) return;

      final filtered = applyProductFilter
          ? raw.where((ticker) {
              if (productType == 'SWAP') {
                return _isSwapSymbol(ticker.symbol);
              }
              return !_isSwapSymbol(ticker.symbol);
            }).toList()
          : raw;

      final symbols = filtered
          .map((ticker) => ticker.symbol)
          .where((s) => s.isNotEmpty)
          .toList();
      final symbolMap = <String, MarketTicker>{
        for (final ticker in filtered) ticker.symbol: ticker,
      };

      setState(() {
        _symbols =
            symbols.isEmpty ? _getDefaultSymbols(exchange, productType) : symbols;
        _symbolTickers = symbolMap;
        _symbolsLoading = false;
        _symbolsError = symbols.isEmpty ? 'No market data available' : null;
      });
      _syncSymbolSelection();
      _refreshSymbolSheet();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _symbols = _getDefaultSymbols(exchange, productType);
        _symbolTickers = {};
        _symbolsLoading = false;
        _symbolsError = e.toString();
      });
      _syncSymbolSelection();
      _refreshSymbolSheet();
    }
  }

  void _refreshSymbolSheet() {
    final refresh = _symbolSheetRefresh;
    if (refresh == null) return;
    refresh();
  }

  void _syncSymbolSelection() {
    if (!mounted) return;
    final current = _symbolController.text.trim();
    if (current.isNotEmpty && _symbols.contains(current)) {
      return;
    }
    if (_symbols.isEmpty) return;
    setState(() {
      _symbolController.text = _symbols.first;
    });
    _markTouched('symbol');
    _scheduleValidation();
    _scheduleTickerUpdate();
  }

  void _handleProductTypeChange(String value) {
    if (_productType == value) return;
    setState(() {
      _productType = value;
      _symbols = _getDefaultSymbols(_exchange, _productType);
      _symbolTickers = {};
      _symbolsLoading = _exchange.trim().isNotEmpty;
      _symbolsError = null;
    });
    _loadSymbolsForExchange(_exchange, _productType);
  }

  void _scheduleTickerUpdate() {
    _tickerDebounce?.cancel();
    _tickerDebounce = Timer(const Duration(milliseconds: 500), _updateTicker);
  }

  Future<void> _updateTicker() async {
    final isOkx = _exchange.trim().toLowerCase() == 'okx';
    final rawSymbol = _symbolController.text.trim();
    if (!isOkx || rawSymbol.isEmpty) {
      await _disconnectTicker();
      return;
    }

    final normalized = _normalizeOkxSymbol(rawSymbol);
    if (normalized.isEmpty) {
      await _disconnectTicker();
      return;
    }

    if (_tickerSymbol == normalized) return;
    await _disconnectTicker();
    setState(() {
      _tickerSymbol = normalized;
      _tickerLoading = true;
      _tickerError = null;
      _lastPrice = null;
      _bestBid = null;
      _bestAsk = null;
    });

    _tickerSubscription ??= _okxService.tickerStream.listen((ticker) {
      if (_tickerSymbol == null || ticker.instId != _tickerSymbol) return;
      setState(() {
        _lastPrice = ticker.last;
        _bestBid = ticker.bidPx;
        _bestAsk = ticker.askPx;
        _tickerLoading = false;
      });
    });

    try {
      await _okxService.connectWebSocket(_tickerSymbol!);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _tickerLoading = false;
        _tickerError = e.toString();
      });
    }
  }

  Future<void> _disconnectTicker() async {
    if (_tickerSymbol == null && !_tickerLoading) return;
    _tickerSymbol = null;
    _tickerLoading = false;
    _tickerError = null;
    _lastPrice = null;
    _bestBid = null;
    _bestAsk = null;
    await _okxService.disconnectWebSocket();
  }

  void _showSymbolSearchDialog(bool isDarkMode) {
    String searchQuery = '';
    final searchController = TextEditingController();
    final copy = CopyService.instance;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            _symbolSheetRefresh = () => setModalState(() {});
            final filteredSymbols = _symbols.where((symbol) {
              return symbol.toLowerCase().contains(searchQuery.toLowerCase());
            }).toList();

            return AnimatedPadding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
              ),
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeOut,
              child: ClipRRect(
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(20.w),
                  topRight: Radius.circular(20.w),
                ),
                child: Container(
                  height: MediaQuery.of(context).size.height * 0.8,
                  decoration: BoxDecoration(
                    color: isDarkMode ? Colors.grey[900] : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: Radius.circular(20.w),
                      topRight: Radius.circular(20.w),
                    ),
                  ),
                  child: Column(
                    children: [
                      Container(
                        margin: EdgeInsets.only(top: 12.w, bottom: 8.w),
                        width: 40.w,
                        height: 4.w,
                        decoration: BoxDecoration(
                          color: isDarkMode
                              ? Colors.grey[700]
                              : Colors.grey[300],
                          borderRadius: BorderRadius.circular(2.w),
                        ),
                      ),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16.w),
                        child: Row(
                          children: [
                            Expanded(
                              child: CopyText(
                                'screen.product_detail.select_symbol',
                                fallback: 'Select symbol',
                                style: TextStyle(
                                  fontSize: 18.sp,
                                  fontWeight: FontWeight.bold,
                                  color:
                                      isDarkMode ? Colors.white : Colors.black,
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
                      SizedBox(height: 10.w),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16.w),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _buildProductTypeChip(
                              context: context,
                              labelKey: 'screen.product.filter.spot',
                              fallback: 'Spot',
                              selected: _productType == 'SPOT',
                              onSelected: () {
                                setModalState(() {});
                                _handleProductTypeChange('SPOT');
                              },
                            ),
                            SizedBox(width: 8.w),
                            _buildProductTypeChip(
                              context: context,
                            labelKey: 'screen.product.filter.swap',
                            fallback: 'Perp',
                              selected: _productType == 'SWAP',
                              onSelected: () {
                                setModalState(() {});
                                _handleProductTypeChange('SWAP');
                              },
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: 10.w),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16.w),
                        child: TextField(
                          controller: searchController,
                          autofocus: false,
                          style: TextStyle(
                            color: isDarkMode ? Colors.white : Colors.black87,
                            fontSize: 14.sp,
                          ),
                          decoration: InputDecoration(
                            isDense: true,
                            contentPadding: EdgeInsets.symmetric(
                              vertical: 12.w,
                              horizontal: 16.w,
                            ),
                            hintText: copy.t(
                              'common.search_placeholder',
                              fallback: 'Search...',
                            ),
                            hintStyle: TextStyle(
                              color: isDarkMode
                                  ? Colors.grey[500]
                                  : Colors.grey[600],
                              fontSize: 14.sp,
                            ),
                            prefixIcon: Icon(
                              Icons.search,
                              color: isDarkMode
                                  ? Colors.grey[400]
                                  : Colors.grey[600],
                              size: 20.w,
                            ),
                            suffixIcon:
                                ValueListenableBuilder<TextEditingValue>(
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
                                    size: 20.w,
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
                            fillColor: isDarkMode
                                ? Colors.grey[850]
                                : Colors.grey[100],
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20.w),
                              borderSide: BorderSide(
                                color: isDarkMode
                                    ? Colors.grey[700]!
                                    : Colors.grey[300]!,
                                width: 1.0,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20.w),
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
                      SizedBox(height: 12.w),
                      Expanded(
                        child: _symbolsLoading
                            ? const Center(child: CircularProgressIndicator())
                            : _symbolsError != null && _symbols.isEmpty
                                ? Center(
                                    child: Text(
                                      _symbolsError!,
                                      style: TextStyle(
                                        color: isDarkMode
                                            ? Colors.grey[400]
                                            : Colors.grey[600],
                                        fontSize: 12.sp,
                                      ),
                                    ),
                                  )
                                : filteredSymbols.isEmpty
                                    ? Center(
                                        child: CopyText(
                                          'screen.product_detail.no_symbols_found',
                                          fallback: 'No symbols found',
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
                                          final symbol =
                                              filteredSymbols[index];
                                          final ticker =
                                              _symbolTickers[symbol];
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
              ),
            );
          },
        );
      },
    ).whenComplete(() {
      _symbolSheetRefresh = null;
    });
  }

  Widget _buildSymbolListItem(
    String symbol,
    bool isDarkMode,
    MarketTicker? ticker,
  ) {
    final selectedSymbol = _symbolController.text.trim();
    final isSelected = selectedSymbol.isNotEmpty && selectedSymbol == symbol;
    final hasData = ticker != null;
    final baseIconUrl = _buildBaseIconUrl(symbol);
    final iconUrl = baseIconUrl.isNotEmpty
        ? baseIconUrl
        : (hasData ? (ticker.iconUrl ?? '') : '');
    final changePercent = hasData
        ? (ticker.changePercent ??
            ((ticker.open24h != null &&
                    ticker.open24h! > 0 &&
                    ticker.last != null)
                ? ((ticker.last! - ticker.open24h!) / ticker.open24h!) * 100
                : null))
        : null;
    final changeColor = changePercent != null && changePercent >= 0
        ? Colors.green
        : Colors.red;
    final selectedFill = isDarkMode
        ? Colors.blue.withValues(alpha: 0.15)
        : Colors.blue.withValues(alpha: 0.12);
    final selectedBorder =
        isSelected ? (isDarkMode ? Colors.blue[300] : Colors.blue[400]) : null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12.w),
        onTap: () {
          Navigator.pop(context);
          _symbolController.text = symbol;
          _markTouched('symbol');
          _scheduleValidation();
          _scheduleTickerUpdate();
        },
        child: Container(
          margin: EdgeInsets.symmetric(horizontal: 12.w, vertical: 6.w),
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.w),
          decoration: BoxDecoration(
            color: isSelected ? selectedFill : Colors.transparent,
            borderRadius: BorderRadius.circular(12.w),
            border: Border.all(
              color: selectedBorder ?? Colors.transparent,
              width: 1.w,
            ),
          ),
          child: Row(
            children: [
              iconUrl.isNotEmpty
                  ? Image.network(
                      iconUrl,
                      width: 28.w,
                      height: 28.w,
                      errorBuilder: (context, error, stackTrace) => Icon(
                        Icons.monetization_on,
                        size: 28.w,
                        color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                      ),
                    )
                  : Icon(
                      Icons.currency_exchange,
                      size: 28.w,
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                    ),
              SizedBox(width: 12.w),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      symbol,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14.sp,
                        color: isDarkMode ? Colors.white : Colors.black87,
                      ),
                    ),
                    SizedBox(height: 4.w),
                    Text(
                      hasData
                          ? 'Vol: ${formatVolume(_calculateDisplayVolume(ticker))}'
                          : 'Vol: --',
                      style: TextStyle(
                        fontSize: 11.sp,
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
                    hasData && ticker.last != null
                        ? '\$${formatPriceExact(ticker.last!, precision: 4)}'
                        : '--',
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w600,
                      color: isDarkMode ? Colors.white : Colors.black87,
                    ),
                  ),
                  SizedBox(height: 2.w),
                  if (changePercent != null)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          changePercent >= 0
                              ? Icons.trending_up
                              : Icons.trending_down,
                          size: 14.w,
                          color: changeColor,
                        ),
                        SizedBox(width: 4.w),
                        CopyText(
                          'common.percent',
                          params: {
                            'percent':
                                '${changePercent >= 0 ? '+' : ''}${changePercent.toStringAsFixed(2)}',
                          },
                          fallback: '{{percent}}%',
                          style: TextStyle(
                            fontSize: 11.sp,
                            color: changeColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    )
                  else
                    CopyText(
                      'screen.product_detail.text',
                      fallback: '--',
                      style: TextStyle(
                        fontSize: 11.sp,
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

  Widget _buildProductTypeChip({
    required BuildContext context,
    required String labelKey,
    required String fallback,
    required bool selected,
    required VoidCallback onSelected,
  }) {
    final theme = Theme.of(context);
    final isDarkMode = theme.brightness == Brightness.dark;
    final borderColor = selected
        ? theme.colorScheme.primary
        : (isDarkMode ? Colors.grey[700]! : Colors.grey[300]!);
    final textColor = selected
        ? theme.colorScheme.primary
        : (isDarkMode ? Colors.grey[200] : Colors.grey[700]);
    final backgroundColor = selected
        ? theme.colorScheme.primary.withValues(alpha: 0.12)
        : Colors.transparent;

    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(16.w),
      child: InkWell(
        borderRadius: BorderRadius.circular(16.w),
        onTap: onSelected,
        child: Container(
          height: 28.w,
          padding: EdgeInsets.symmetric(horizontal: 10.w),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16.w),
            border: Border.all(color: borderColor, width: 1),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: CopyText(
              labelKey,
              fallback: fallback,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.sp,
                height: 1,
                color: textColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSymbolSelector(
    BuildContext context,
    CopyService copy,
    bool isDarkMode,
  ) {
    final symbol = _symbolController.text.trim();
    final hasSymbol = symbol.isNotEmpty;
    final hasExchange = _exchange.trim().isNotEmpty;
    final hintColor = Theme.of(context).hintColor;
    final isEnabled = hasExchange && !_submitting;
    final textColor = hasSymbol
        ? (isDarkMode ? Colors.white : Colors.black87)
        : hintColor;

    return InkWell(
      onTap: isEnabled
          ? () {
              _markTouched('symbol');
              _showSymbolSearchDialog(isDarkMode);
            }
          : null,
      borderRadius: BorderRadius.circular(12.w),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: copy.t(
            'screen.orders.place_order.fields.symbol',
            fallback: 'Symbol',
          ),
          errorText: _shouldShowError('symbol') ? _errors['symbol'] : null,
          suffixIcon: Icon(
            Icons.arrow_drop_down,
            size: 20.w,
            color: isEnabled ? null : hintColor.withValues(alpha: 0.6),
          ),
          enabled: isEnabled,
        ),
        child: Text(
          hasSymbol
              ? symbol
              : copy.t(
                  'screen.orders.place_order.fields.symbol_placeholder',
                  fallback: 'e.g., BTC-USDT',
                ),
          style: TextStyle(
            color: isEnabled ? textColor : hintColor.withValues(alpha: 0.6),
            fontSize: 14.sp,
          ),
        ),
      ),
    );
  }

  Map<String, String> _validateForm() {
    final errors = <String, String>{};
    final symbol = _symbolController.text.trim();
    final quantityText = _quantityController.text.trim();
    final priceText = _priceController.text.trim();
    final quantity = double.tryParse(quantityText);
    final price = double.tryParse(priceText);

    if (_exchange.trim().isEmpty) {
      errors['exchange'] = 'Exchange is required';
    }
    if (symbol.length < 3) {
      errors['symbol'] = 'Symbol is required';
    }
    if (quantityText.isEmpty) {
      errors['quantity'] = 'Quantity is required';
    } else if (quantity == null || quantity <= 0) {
      errors['quantity'] = 'Quantity must be a positive number';
    }
    if (_type == 'LIMIT') {
      if (price == null || price <= 0) {
        errors['price'] = 'Price must be a positive number for limit orders';
      }
    }

    return errors;
  }

  void _validateNow() {
    setState(() => _errors = _validateForm());
  }

  void _scheduleValidation() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), _validateNow);
  }

  void _markTouched(String field) {
    if (_touched[field] == true) return;
    setState(() => _touched[field] = true);
  }

  bool _shouldShowError(String field) =>
      _submitAttempted || (_touched[field] ?? false);

  bool get _hasErrors => _errors.isNotEmpty;

  bool get _isFormValid => _validateForm().isEmpty;

  Future<void> _handleSubmit() async {
    if (_submitting) return;
    setState(() => _submitAttempted = true);
    _validateNow();
    if (_hasErrors) return;

    setState(() => _submitting = true);
    try {
      final quantity = double.parse(_quantityController.text.trim());
      final price = _type == 'LIMIT'
          ? double.parse(_priceController.text.trim())
          : null;
      await widget.onSubmit(
        PlaceOrderPayload(
          exchange: _exchange,
          symbol: _symbolController.text.trim(),
          side: _side,
          type: _type,
          quantity: quantity,
          price: price,
        ),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: CopyText(
            'screen.orders.place_order.messages.placed',
            fallback: 'Order placed',
          ),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: CopyText(
            'screen.orders.place_order.errors.submit_failed',
            params: {'error': e.toString()},
            fallback: 'Failed to place order: {{error}}',
          ),
          backgroundColor: Colors.red,
        ),
      );
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final copy = CopyService.instance;
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: CopyText(
          'screen.orders.place_order.title',
          fallback: 'Place order',
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 16.w),
          child: Column(
            children: [
              ExchangePickerField(
                selectedExchange: _exchange,
                onChanged: (value) {
                  setState(() => _exchange = value);
                  _markTouched('exchange');
                  _scheduleValidation();
                  _scheduleTickerUpdate();
                  _loadSymbolsForExchange(value, _productType);
                },
                hintText: copy.t(
                  'screen.orders.place_order.fields.exchange_placeholder',
                  fallback: 'Select exchange',
                ),
              ),
              if (_shouldShowError('exchange') && _errors['exchange'] != null)
                Padding(
                  padding: EdgeInsets.only(top: 6.w),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      _errors['exchange']!,
                      style: TextStyle(color: Colors.red, fontSize: 12.sp),
                    ),
                  ),
                ),
              SizedBox(height: 12.w),
              _buildSymbolSelector(context, copy, isDarkMode),
              if (_tickerSymbol != null) ...[
                SizedBox(height: 12.w),
                Container(
                  width: double.infinity,
                  padding: EdgeInsets.symmetric(
                    horizontal: 12.w,
                    vertical: 10.w,
                  ),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest
                        .withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  child: _tickerLoading
                      ? Row(
                          children: [
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            SizedBox(width: 8.w),
                            Text(
                              copy.t(
                                'screen.orders.place_order.ticker.loading',
                                fallback: 'Loading ticker...',
                              ),
                            ),
                          ],
                        )
                      : _tickerError != null
                      ? Text(
                          _tickerError!,
                          style: TextStyle(color: Colors.red, fontSize: 12.sp),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildTickerRow(
                              context,
                              label: copy.t(
                                'screen.orders.place_order.ticker.last',
                                fallback: 'Last price',
                              ),
                              value: _lastPrice == null
                                  ? '--'
                                  : formatPriceExact(_lastPrice!),
                            ),
                            SizedBox(height: 6.w),
                            _buildTickerRow(
                              context,
                              label: copy.t(
                                'screen.orders.place_order.ticker.bid',
                                fallback: 'Best bid',
                              ),
                              value: _bestBid == null
                                  ? '--'
                                  : formatPriceExact(_bestBid!),
                            ),
                            SizedBox(height: 6.w),
                            _buildTickerRow(
                              context,
                              label: copy.t(
                                'screen.orders.place_order.ticker.ask',
                                fallback: 'Best ask',
                              ),
                              value: _bestAsk == null
                                  ? '--'
                                  : formatPriceExact(_bestAsk!),
                            ),
                          ],
                        ),
                ),
              ],
              SizedBox(height: 12.w),
              DropdownButtonFormField<String>(
                key: ValueKey('order-side-$_side'),
                initialValue: _side,
                decoration: InputDecoration(
                  labelText: copy.t(
                    'screen.orders.place_order.fields.side',
                    fallback: 'Side',
                  ),
                ),
                items: [
                  DropdownMenuItem(
                    value: 'BUY',
                    child: CopyText('screen.orders.side.buy', fallback: 'Buy'),
                  ),
                  DropdownMenuItem(
                    value: 'SELL',
                    child: CopyText(
                      'screen.orders.side.sell',
                      fallback: 'Sell',
                    ),
                  ),
                ],
                onChanged: _submitting
                    ? null
                    : (value) {
                        if (value == null) return;
                        setState(() => _side = value);
                        _markTouched('side');
                        _scheduleValidation();
                      },
              ),
              SizedBox(height: 12.w),
              DropdownButtonFormField<String>(
                key: ValueKey('order-type-$_type'),
                initialValue: _type,
                decoration: InputDecoration(
                  labelText: copy.t(
                    'screen.orders.place_order.fields.type',
                    fallback: 'Type',
                  ),
                ),
                items: const [
                  DropdownMenuItem(value: 'MARKET', child: Text('Market')),
                  DropdownMenuItem(value: 'LIMIT', child: Text('Limit')),
                ],
                onChanged: _submitting
                    ? null
                    : (value) {
                        if (value == null) return;
                        setState(() => _type = value);
                        _markTouched('type');
                        _scheduleValidation();
                      },
              ),
              SizedBox(height: 12.w),
              TextField(
                controller: _priceController,
                enabled: _type == 'LIMIT',
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: copy.t(
                    'screen.orders.place_order.fields.price',
                    fallback: 'Price',
                  ),
                  errorText: _shouldShowError('price')
                      ? _errors['price']
                      : null,
                ),
                onChanged: (_) {
                  _markTouched('price');
                  _scheduleValidation();
                },
              ),
              SizedBox(height: 12.w),
              TextField(
                controller: _quantityController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: copy.t(
                    'screen.orders.place_order.fields.quantity',
                    fallback: 'Quantity',
                  ),
                  errorText: _shouldShowError('quantity')
                      ? _errors['quantity']
                      : null,
                ),
                onChanged: (_) {
                  _markTouched('quantity');
                  _scheduleValidation();
                },
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(20.w, 12.w, 20.w, 16.w),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _submitting ? null : () => Navigator.pop(context),
                  child: CopyText('screen.login.cancel', fallback: "Cancel"),
                ),
              ),
              SizedBox(width: 12.w),
              Expanded(
                child: FilledButton(
                  onPressed: !_isFormValid || _submitting
                      ? null
                      : _handleSubmit,
                  child: _submitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : CopyText(
                          'screen.orders.place_order.actions.submit',
                          fallback: 'Place order',
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTickerRow(
    BuildContext context, {
    required String label,
    required String value,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Theme.of(context).hintColor),
        ),
        Text(
          value,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

