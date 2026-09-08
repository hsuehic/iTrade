import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../models/market_ticker.dart';
import '../services/binance_data_service.dart';
import '../services/coinbase_data_service.dart';
import '../services/copy_service.dart';
import '../services/okx_data_service.dart';
import '../utils/number_format_utils.dart';
import '../widgets/copy_text.dart';
import '../widgets/exchange_picker_field.dart';
import '../widgets/unified_symbol_picker.dart';

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

  /// Known quote currencies for Binance/Coinbase compact symbols, ordered by
  /// how `splitCompactSymbol` in the backend splits them (longest first).
  static const List<String> _quoteCurrencies = [
    'USDT',
    'USDC',
  ];

  /// Normalize a compact Binance/Coinbase futures/spot symbol (e.g. "BTCUSDT")
  /// into the display + submit form. When the product type is perpetual, mark
  /// it with a `:QUOTE` suffix so the backend places a perp order, NOT a spot
  /// order. Binance/Coinbase continuous APIs return "BTCUSDT" for BOTH spot
  /// and perpetual (unlike OKX), which is why spot/perp were being confused.
  String _formatContinuousSymbol(String raw, String productType) {
    final upper = raw.trim().toUpperCase();
    if (upper.isEmpty) return '';
    if (_isSwapSymbol(upper)) return upper; // already marked as perpetual
    String? quote;
    for (final q in _quoteCurrencies) {
      if (upper.endsWith(q) && upper.length > q.length) {
        quote = q;
        break;
      }
    }
    if (quote == null) return upper; // unrecognized quote, leave as-is
    final base = upper.substring(0, upper.length - quote.length);
    if (base.isEmpty) return upper;
    return productType == 'SWAP' ? '$base/$quote:$quote' : '$base/$quote';
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
        applyProductFilter: true,
        formatSymbol: (s) => _formatContinuousSymbol(s, productType),
      );
      return;
    }
    if (normalized == 'coinbase') {
      await _loadMarketTickersForExchange(
        exchange,
        productType,
        () => _coinbaseService.getTickers(isSwap: productType == 'SWAP'),
        applyProductFilter: true,
        formatSymbol: (s) => _formatContinuousSymbol(s, productType),
      );
      return;
    }
    if (normalized != 'okx') {
      if (!mounted) return;
      setState(() {
        _symbols = _getDefaultSymbols(exchange, productType);
        _symbolTickers = {};
      });
      _syncSymbolSelection();
      return;
    }

    if (!mounted) return;

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
      });
      _syncSymbolSelection();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _symbols = _getDefaultSymbols(exchange, productType);
        _symbolTickers = {};
      });
      _syncSymbolSelection();
    }
  }

  Future<void> _loadMarketTickersForExchange(
    String exchange,
    String productType,
    Future<List<MarketTicker>> Function() loader, {
    bool applyProductFilter = true,
    String Function(String symbol)? formatSymbol,
  }
  ) async {
    if (!mounted) return;
    setState(() {
      _symbolTickers = {};
    });

    try {
      final raw = await loader().timeout(const Duration(seconds: 10));
      if (!mounted) return;

      final filtered = applyProductFilter
          ? raw.where((ticker) {
              if (productType == 'SWAP') {
                return _isSwapSymbol(
                  formatSymbol?.call(ticker.symbol) ?? ticker.symbol,
                );
              }
              return !_isSwapSymbol(
                formatSymbol?.call(ticker.symbol) ?? ticker.symbol,
              );
            }).toList()
          : raw;

      final symbols = filtered
          .map((ticker) =>
              formatSymbol?.call(ticker.symbol) ?? ticker.symbol)
          .where((s) => s.isNotEmpty)
          .toList();
      final symbolMap = <String, MarketTicker>{
        for (final rawSymbol in filtered)
          (formatSymbol?.call(rawSymbol.symbol) ?? rawSymbol.symbol):
              rawSymbol.copyWith(
                symbol: formatSymbol?.call(rawSymbol.symbol) ?? rawSymbol.symbol,
              ),
      };

      setState(() {
        _symbols =
            symbols.isEmpty ? _getDefaultSymbols(exchange, productType) : symbols;
        _symbolTickers = symbolMap;
      });
      _syncSymbolSelection();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _symbols = _getDefaultSymbols(exchange, productType);
        _symbolTickers = {};
      });
      _syncSymbolSelection();
    }
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

  Future<void> _showSymbolSearchDialog(bool isDarkMode) async {
    final selected = await UnifiedSymbolPicker.show(
      context: context,
      title: 'Select symbol',
      exchange: _exchange,
      initialSymbol: _symbolController.text.trim(),
      initialMarketType: _productType == 'SWAP' ? 'perpetual' : 'spot',
      loadForMarketType: (marketType) async {
        final type = marketType == 'perpetual' ? 'SWAP' : 'SPOT';
        setState(() => _productType = type);
        // _loadSymbolsForExchange populates _symbols/_symbolTickers for the
        // active product type from the exchange (compact -> unified).
        await _loadSymbolsForExchange(_exchange, type);
        return _symbolTickers.values
            .map(
              (t) => SymbolPickerItem(
                symbol: t.symbol,
                marketType: marketType,
                exchange: t.exchange ?? _exchange,
                price: t.last,
                changePercent: t.changePercent,
                volume24h: t.volume24h,
                iconUrl: t.iconUrl,
              ),
            )
            .toList();
      },
    );
    if (selected != null && selected.symbol.isNotEmpty && mounted) {
      setState(() => _symbolController.text = selected.symbol);
      _markTouched('symbol');
      _scheduleValidation();
      _scheduleTickerUpdate();
    }
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
      String message = e.toString();
      // Strip the "Exception: " prefix so users get a clean error message.
      if (message.startsWith('Exception: ')) {
        message = message.substring('Exception: '.length);
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: CopyText(
            'screen.orders.place_order.errors.submit_failed',
            params: {'error': message},
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
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: SafeArea(
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

