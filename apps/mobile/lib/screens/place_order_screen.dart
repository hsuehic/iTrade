import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../services/copy_service.dart';
import '../services/okx_data_service.dart';
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
  Timer? _debounce;
  Timer? _tickerDebounce;
  StreamSubscription<OKXTicker>? _tickerSubscription;

  String _exchange = '';
  String _side = 'BUY';
  String _type = 'MARKET';
  bool _submitting = false;
  bool _submitAttempted = false;
  final Map<String, bool> _touched = {};
  Map<String, String> _errors = {};
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

  String _normalizeOkxSymbol(String rawSymbol) {
    final trimmed = rawSymbol.trim().toUpperCase();
    if (trimmed.isEmpty) return '';
    final withoutPerp = trimmed.contains(':')
        ? trimmed.substring(0, trimmed.indexOf(':'))
        : trimmed;
    return withoutPerp.replaceAll('/', '-');
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

    _tickerSubscription ??=
        _okxService.tickerStream.listen((ticker) {
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
      final price =
          _type == 'LIMIT' ? double.parse(_priceController.text.trim()) : null;
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
              TextField(
                controller: _symbolController,
                decoration: InputDecoration(
                  labelText: copy.t(
                    'screen.orders.place_order.fields.symbol',
                    fallback: 'Symbol',
                  ),
                  hintText: copy.t(
                    'screen.orders.place_order.fields.symbol_placeholder',
                    fallback: 'e.g., BTC/USDT',
                  ),
                  errorText: _shouldShowError('symbol') ? _errors['symbol'] : null,
                ),
                onChanged: (_) {
                  _markTouched('symbol');
                  _scheduleValidation();
                  _scheduleTickerUpdate();
                },
              ),
              if (_tickerSymbol != null) ...[
                SizedBox(height: 12.w),
                Container(
                  width: double.infinity,
                  padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.w),
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .surfaceContainerHighest
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
                    child: CopyText('screen.orders.side.sell', fallback: 'Sell'),
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
                  errorText: _shouldShowError('price') ? _errors['price'] : null,
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
                  onPressed:
                      !_isFormValid || _submitting ? null : _handleSubmit,
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
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).hintColor,
              ),
        ),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
      ],
    );
  }
}
