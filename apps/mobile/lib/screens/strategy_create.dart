import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/strategy.dart';
import '../services/strategy_service.dart';
import '../services/copy_service.dart';
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';
import '../widgets/exchange_picker_field.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry-point widget
// ─────────────────────────────────────────────────────────────────────────────

class StrategyCreateScreen extends StatefulWidget {
  /// Pass an existing strategy to enter edit mode.
  final Strategy? editStrategy;

  const StrategyCreateScreen({super.key, this.editStrategy});

  bool get isEditing => editStrategy != null;

  @override
  State<StrategyCreateScreen> createState() => _StrategyCreateScreenState();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step constants
// ─────────────────────────────────────────────────────────────────────────────
const int _kTotalSteps = 4;
const List<String> _kStepTitles = [
  'Basic Info',
  'Parameters',
  'Initial Data',
  'Subscriptions',
];

// ─────────────────────────────────────────────────────────────────────────────
// Kline interval constants
// ─────────────────────────────────────────────────────────────────────────────
const List<Map<String, String>> _kKlineIntervals = [
  {'value': '1m', 'label': '1 min'},
  {'value': '3m', 'label': '3 min'},
  {'value': '5m', 'label': '5 min'},
  {'value': '15m', 'label': '15 min'},
  {'value': '30m', 'label': '30 min'},
  {'value': '1h', 'label': '1h'},
  {'value': '2h', 'label': '2h'},
  {'value': '4h', 'label': '4h'},
  {'value': '6h', 'label': '6h'},
  {'value': '12h', 'label': '12h'},
  {'value': '1d', 'label': '1d'},
  {'value': '1w', 'label': '1w'},
];

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

class _StrategyCreateScreenState extends State<StrategyCreateScreen> {
  final StrategyService _strategyService = StrategyService.instance;
  final PageController _pageController = PageController();
  int _currentStep = 0;

  // ── Step 0 – Basic Info ───────────────────────────────────────────────────
  final _nameController = TextEditingController();
  final _symbolController = TextEditingController();
  final _descriptionController = TextEditingController();
  String _selectedExchange = '';
  String? _selectedType;
  List<_StrategyTypeOption> _strategyTypes = [];
  String? _nameError;
  String? _symbolError;
  bool _checkingName = false;
  bool _loadingTypes = true;
  bool _loadingTickers = false;
  String? _tickersError;
  List<_SymbolTicker> _tickers = [];
  Timer? _nameDebounce;
  String _lastCheckedName = '';

  // ── Step 1 – Parameters ───────────────────────────────────────────────────
  final _parametersController = TextEditingController();
  String? _parametersError;
  Timer? _parametersDebounce;

  // ── Step 2 – Initial Data Config ─────────────────────────────────────────
  List<Map<String, dynamic>> _klineEntries = []; // [{interval, limit}]
  bool _fetchPositions = false;
  bool _fetchOpenOrders = false;
  bool _fetchBalance = false;
  bool _fetchAccountInfo = false;
  bool _fetchTicker = false;
  bool _fetchOrderBook = false;
  int _orderBookDepth = 20;

  // ── Step 3 – Subscription Config ─────────────────────────────────────────
  bool _subTicker = false;
  bool _subOrderBook = false;
  int _subOrderBookDepth = 20;
  bool _subTrades = false;
  bool _subKlines = false;
  final List<String> _subKlineIntervals = [];
  String _subMethod = 'websocket';

  // ── Submission ────────────────────────────────────────────────────────────
  bool _isSubmitting = false;

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _loadStrategyConfigs().then((_) {
      if (widget.isEditing) _prefillFromStrategy(widget.editStrategy!);
    });
  }

  @override
  void dispose() {
    _nameDebounce?.cancel();
    _parametersDebounce?.cancel();
    _pageController.dispose();
    _nameController.dispose();
    _symbolController.dispose();
    _descriptionController.dispose();
    _parametersController.dispose();
    super.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pre-fill for edit mode
  // ─────────────────────────────────────────────────────────────────────────

  void _prefillFromStrategy(Strategy s) {
    _nameController.text = s.name;
    _symbolController.text = s.normalizedSymbol ?? s.symbol ?? '';
    _descriptionController.text = s.description ?? '';
    _selectedExchange = s.exchange ?? '';
    _selectedType = s.type;
    _parametersController.text =
        const JsonEncoder.withIndent('  ').convert(s.parameters ?? {});

    // Initial data config
    final idc = s.initialDataConfig;
    if (idc != null) {
      final klines = idc['klines'];
      if (klines is Map) {
        // Object format: { "15m": 20, "1h": 10 }
        _klineEntries = klines.entries
            .map((e) => {'interval': e.key as String, 'limit': e.value as int? ?? 20})
            .toList();
      } else if (klines is List) {
        _klineEntries = klines
            .map((e) => {
                  'interval': (e as Map)['interval'] as String? ?? '15m',
                  'limit': (e['limit'] as num?)?.toInt() ?? 20,
                })
            .toList();
      }
      _fetchPositions = idc['fetchPositions'] as bool? ?? false;
      _fetchOpenOrders = idc['fetchOpenOrders'] as bool? ?? false;
      _fetchBalance = idc['fetchBalance'] as bool? ?? false;
      _fetchAccountInfo = idc['fetchAccountInfo'] as bool? ?? false;
      _fetchTicker = idc['fetchTicker'] as bool? ?? false;
      final ob = idc['fetchOrderBook'];
      if (ob is Map) {
        _fetchOrderBook = ob['enabled'] as bool? ?? false;
        _orderBookDepth = (ob['depth'] as num?)?.toInt() ?? 20;
      } else if (ob is bool) {
        _fetchOrderBook = ob;
      }
    }

    // Subscription config
    final sub = s.subscription;
    if (sub != null) {
      _subTicker = sub['ticker'] as bool? ?? false;
      final subOb = sub['orderbook'];
      if (subOb is Map) {
        _subOrderBook = subOb['enabled'] as bool? ?? false;
        _subOrderBookDepth = (subOb['depth'] as num?)?.toInt() ?? 20;
      } else if (subOb is bool) {
        _subOrderBook = subOb;
      }
      _subTrades = sub['trades'] as bool? ?? false;
      final kl = sub['klines'];
      if (kl is Map) {
        _subKlines = kl['enabled'] as bool? ?? false;
        final intervals = kl['intervals'] as List?;
        if (intervals != null) {
          _subKlineIntervals.addAll(intervals.cast<String>());
        } else {
          final single = kl['interval'] as String?;
          if (single != null) _subKlineIntervals.add(single);
        }
      } else if (kl is bool) {
        _subKlines = kl;
      }
      _subMethod = sub['method'] as String? ?? 'websocket';
    }

    setState(() {});

    // Eagerly load tickers for the pre-filled exchange so the symbol picker
    // is ready without an extra round-trip when the user taps the field.
    if (_selectedExchange.trim().isNotEmpty) {
      _loadTickersForExchange();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────────────

  Future<void> _loadStrategyConfigs() async {
    final configs = await _strategyService.getStrategyConfigs();
    if (!mounted) return;

    final types = configs
        .map((c) => _StrategyTypeOption.fromJson(c))
        .where((c) => c.type.isNotEmpty)
        .toList();

    setState(() {
      _strategyTypes = types;
      _loadingTypes = false;
      if (!widget.isEditing) {
        // Only set defaults for create mode
        if (types.isNotEmpty) {
          _selectedType = types.first.type;
          _parametersController.text = const JsonEncoder.withIndent('  ')
              .convert(types.first.defaultParameters ?? {});
        } else {
          _selectedType = 'MovingAverageStrategy';
          _parametersController.text =
              const JsonEncoder.withIndent('  ').convert(<String, dynamic>{});
        }
      }
    });
  }

  Future<void> _loadTickersForExchange() async {
    if (_selectedExchange.trim().isEmpty) return;
    setState(() {
      _loadingTickers = true;
      _tickersError = null;
    });
    final raw = await _strategyService.getTradingPairs();
    if (!mounted) return;
    final filtered = raw
        .map((item) => _SymbolTicker.fromJson(item))
        .where((t) =>
            t.exchange?.toLowerCase() == _selectedExchange.toLowerCase())
        .toList();
    setState(() {
      _tickers = filtered;
      _loadingTickers = false;
      _tickersError = filtered.isEmpty ? 'No trading pairs available' : null;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────

  void _scheduleNameValidation() {
    _nameDebounce?.cancel();
    _nameDebounce = Timer(
      const Duration(milliseconds: 500),
      () => _validateName(checkAvailability: true),
    );
  }

  void _validateName({bool checkAvailability = false}) {
    final value = _nameController.text.trim();
    setState(() {
      _nameError = value.isEmpty ? 'Strategy name is required' : null;
    });
    if (value.isNotEmpty && checkAvailability) {
      _checkNameAvailability(value);
    }
  }

  void _validateSymbol() {
    final value = _symbolController.text.trim();
    setState(() {
      _symbolError = value.isEmpty ? 'Symbol is required' : null;
    });
  }

  Future<void> _checkNameAvailability(String value) async {
    if (value.length < 3 || value == _lastCheckedName) return;
    _lastCheckedName = value;
    setState(() => _checkingName = true);
    final available = await _strategyService.checkNameAvailable(
      value,
      excludeId: widget.editStrategy?.id,
    );
    if (!mounted) return;
    setState(() {
      _checkingName = false;
      if (available == false) {
        _nameError = 'Strategy name already exists';
      }
    });
  }

  void _scheduleParametersValidation() {
    _parametersDebounce?.cancel();
    _parametersDebounce = Timer(
      const Duration(milliseconds: 500),
      _validateParameters,
    );
  }

  void _validateParameters() {
    final raw = _parametersController.text.trim();
    if (raw.isEmpty) {
      setState(() => _parametersError = null);
      return;
    }
    try {
      final parsed = jsonDecode(raw);
      setState(() =>
          _parametersError = parsed is! Map ? 'Parameters must be a JSON object' : null);
    } catch (_) {
      setState(() => _parametersError = 'Invalid JSON format');
    }
  }

  bool _validateStep(int step) {
    switch (step) {
      case 0:
        _validateName();
        _validateSymbol();
        if (_selectedType == null || _selectedType!.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please select a strategy type'),
              backgroundColor: Colors.red,
            ),
          );
          return false;
        }
        if (_selectedExchange.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please select an exchange'),
              backgroundColor: Colors.red,
            ),
          );
          return false;
        }
        return _nameError == null && _symbolError == null;
      case 1:
        _validateParameters();
        return _parametersError == null;
      default:
        return true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────────────

  void _goToStep(int step) {
    if (step < 0 || step >= _kTotalSteps) return;
    // Validate current before advancing
    if (step > _currentStep && !_validateStep(_currentStep)) return;
    setState(() => _currentStep = step);
    _pageController.animateToPage(
      step,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  void _nextStep() => _goToStep(_currentStep + 1);
  void _prevStep() => _goToStep(_currentStep - 1);

  // ─────────────────────────────────────────────────────────────────────────
  // Build initial data config payload
  // ─────────────────────────────────────────────────────────────────────────

  Map<String, dynamic>? _buildInitialDataConfig() {
    final Map<String, dynamic> cfg = {};
    bool hasAny = false;

    if (_klineEntries.isNotEmpty) {
      hasAny = true;
      // Use object format: { "15m": 20, "1h": 10 }
      final Map<String, dynamic> klines = {};
      for (final entry in _klineEntries) {
        klines[entry['interval'] as String] = entry['limit'] as int;
      }
      cfg['klines'] = klines;
    }
    if (_fetchPositions) { cfg['fetchPositions'] = true; hasAny = true; }
    if (_fetchOpenOrders) { cfg['fetchOpenOrders'] = true; hasAny = true; }
    if (_fetchBalance) { cfg['fetchBalance'] = true; hasAny = true; }
    if (_fetchAccountInfo) { cfg['fetchAccountInfo'] = true; hasAny = true; }
    if (_fetchTicker) { cfg['fetchTicker'] = true; hasAny = true; }
    if (_fetchOrderBook) {
      cfg['fetchOrderBook'] = {'enabled': true, 'depth': _orderBookDepth};
      hasAny = true;
    }

    return hasAny ? cfg : null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build subscription config payload
  // ─────────────────────────────────────────────────────────────────────────

  Map<String, dynamic>? _buildSubscriptionConfig() {
    final Map<String, dynamic> cfg = {};
    bool hasAny = false;

    if (_subTicker) { cfg['ticker'] = true; hasAny = true; }
    if (_subOrderBook) {
      cfg['orderbook'] = {'enabled': true, 'depth': _subOrderBookDepth};
      hasAny = true;
    }
    if (_subTrades) { cfg['trades'] = true; hasAny = true; }
    if (_subKlines && _subKlineIntervals.isNotEmpty) {
      cfg['klines'] = {'enabled': true, 'intervals': List<String>.from(_subKlineIntervals)};
      hasAny = true;
    }
    if (hasAny) cfg['method'] = _subMethod;

    return hasAny ? cfg : null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────────────────────────────

  Future<void> _handleSubmit() async {
    if (_isSubmitting) return;
    if (!_validateStep(_currentStep)) return;
    setState(() => _isSubmitting = true);

    Map<String, dynamic>? parameters;
    final parametersText = _parametersController.text.trim();
    if (parametersText.isNotEmpty) {
      try {
        final parsed = jsonDecode(parametersText);
        if (parsed is Map) parameters = Map<String, dynamic>.from(parsed);
      } catch (_) {}
    }

    final initialDataConfig = _buildInitialDataConfig();
    final subscription = _buildSubscriptionConfig();

    try {
      Strategy? result;
      if (widget.isEditing) {
        result = await _strategyService.updateStrategy(
          id: widget.editStrategy!.id,
          name: _nameController.text.trim(),
          type: _selectedType!,
          symbol: _symbolController.text.trim(),
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          exchange: _selectedExchange,
          parameters: parameters,
          initialDataConfig: initialDataConfig,
          subscription: subscription,
        );
      } else {
        result = await _strategyService.createStrategy(
          name: _nameController.text.trim(),
          type: _selectedType!,
          symbol: _symbolController.text.trim(),
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          exchange: _selectedExchange,
          parameters: parameters,
          initialDataConfig: initialDataConfig,
          subscription: subscription,
        );
      }

      if (!mounted) return;

      if (result == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isEditing
                ? 'Failed to update strategy'
                : 'Failed to create strategy'),
            backgroundColor: Colors.red,
          ),
        );
        setState(() => _isSubmitting = false);
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.isEditing ? 'Strategy updated' : 'Strategy created'),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.pop(context, result);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: Colors.red,
        ),
      );
      setState(() => _isSubmitting = false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  void _handleTypeChange(String? value) {
    if (value == null) return;
    final match = _strategyTypes.firstWhere(
      (item) => item.type == value,
      orElse: () => const _StrategyTypeOption(type: '', name: ''),
    );
    setState(() {
      _selectedType = value;
      if (!widget.isEditing) {
        _parametersController.text = const JsonEncoder.withIndent('  ')
            .convert(match.defaultParameters ?? {});
      }
    });
  }

  Future<void> _openSymbolPicker() async {
    if (_selectedExchange.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select an exchange first'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    if (_tickers.isEmpty && !_loadingTickers) {
      await _loadTickersForExchange();
    }
    if (!mounted) return;
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _SymbolPickerSheet(
        title: 'Select Trading Pair',
        exchange: _selectedExchange,
        tickers: _tickers,
        loading: _loadingTickers,
        errorMessage: _tickersError,
        initialQuery: _symbolController.text.trim(),
      ),
    );
    if (selected != null && selected.isNotEmpty && mounted) {
      setState(() => _symbolController.text = selected);
      _validateSymbol();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isLastStep = _currentStep == _kTotalSteps - 1;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isEditing ? 'Edit Strategy' : 'New Strategy'),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: Column(
          children: [
            _StepIndicator(currentStep: _currentStep, totalSteps: _kTotalSteps),
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _buildStep0BasicInfo(),
                  _buildStep1Parameters(),
                  _buildStep2InitialData(),
                  _buildStep3Subscriptions(),
                ],
              ),
            ),
            _buildNavButtons(isLastStep),
          ],
        ),
      ),
    );
  }

  Widget _buildNavButtons(bool isLastStep) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        border: Border(
          top: BorderSide(
            color: isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: Row(
        children: [
          if (_currentStep > 0)
            Expanded(
              child: OutlinedButton(
                onPressed: _prevStep,
                child: const Text('Back'),
              ),
            ),
          if (_currentStep > 0) const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton(
              onPressed: _isSubmitting
                  ? null
                  : isLastStep
                      ? _handleSubmit
                      : _nextStep,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(isLastStep
                      ? (widget.isEditing ? 'Save Changes' : 'Create Strategy')
                      : 'Next'),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 0 – Basic Info
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildStep0BasicInfo() {
    final symbolHint = SupportedExchanges.getSymbolFormatHint(_selectedExchange);
    final selectedType = _strategyTypes.firstWhere(
      (t) => t.type == _selectedType,
      orElse: () => const _StrategyTypeOption(type: '', name: ''),
    );

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepHeader(
            step: 1,
            title: 'Basic Information',
            subtitle: 'Name your strategy and choose the market',
          ),
          const SizedBox(height: 16),

          // Name
          TextField(
            controller: _nameController,
            textInputAction: TextInputAction.next,
            decoration: _inputDecoration(
              context,
              labelText: 'Strategy name',
              suffixIcon: _checkingName
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : null,
              errorText: _nameError,
            ),
            onChanged: (_) => _scheduleNameValidation(),
          ),
          const SizedBox(height: 12),

          // Strategy type
          _loadingTypes
              ? _loadingPlaceholder(context)
              : _StrategyTypePickerField(
                  value: _selectedType,
                  options: _strategyTypes,
                  onChanged: _handleTypeChange,
                  placeholder: 'Select strategy type',
                ),
          if (selectedType.description != null && selectedType.description!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                selectedType.description!,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Theme.of(context).hintColor),
              ),
            ),
          ],
          const SizedBox(height: 12),

          // Exchange
          ExchangePickerField(
            selectedExchange: _selectedExchange,
            onChanged: (value) {
              setState(() {
                _selectedExchange = value;
                _tickers = [];
                _tickersError = null;
                // Clear symbol so user must pick from the new exchange's pairs
                _symbolController.text = '';
                _symbolError = null;
              });
              // Auto-load tickers for the newly selected exchange
              _loadTickersForExchange();
            },
            hintText: 'Select exchange',
          ),
          const SizedBox(height: 12),

          // Symbol picker
          _SymbolPickerField(
            selectedSymbol: _symbolController.text.trim(),
            hint: symbolHint,
            errorText: _symbolError,
            loading: _loadingTickers,
            tickerCount: _tickers.length,
            exchangeSelected: _selectedExchange.trim().isNotEmpty,
            onTap: _selectedExchange.trim().isEmpty ? null : _openSymbolPicker,
          ),
          const SizedBox(height: 12),

          // Description
          TextField(
            controller: _descriptionController,
            maxLines: 2,
            decoration: _inputDecoration(
              context,
              labelText: 'Description (optional)',
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 – Parameters
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildStep1Parameters() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepHeader(
            step: 2,
            title: 'Strategy Parameters',
            subtitle: 'Configure parameters for the selected strategy type',
          ),
          const SizedBox(height: 16),
          _InfoBanner(
            text: 'Defaults are automatically loaded from the selected strategy type. '
                'Edit values as JSON below.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _parametersController,
            maxLines: 16,
            decoration: _inputDecoration(
              context,
              hintText: '{\n  "leverage": 10,\n  "orderAmount": 100\n}',
              errorText: _parametersError,
            ),
            style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            onChanged: (_) => _scheduleParametersValidation(),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 – Initial Data Config
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildStep2InitialData() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? Colors.grey[900] : Colors.white;
    final borderColor =
        isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.12);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepHeader(
            step: 3,
            title: 'Initial Data Config',
            subtitle: 'Pre-load historical data and account state when strategy starts',
          ),
          const SizedBox(height: 16),

          // ── Kline Data ──
          _SectionCard(
            title: 'Historical Kline Data',
            icon: Icons.candlestick_chart,
            trailing: TextButton.icon(
              onPressed: () => setState(() {
                _klineEntries.add({'interval': '15m', 'limit': 20});
              }),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add'),
            ),
            child: _klineEntries.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      'No kline data configured. Click "Add" to provide historical price data.',
                      style: TextStyle(
                        fontSize: 13,
                        color: Theme.of(context).hintColor,
                      ),
                    ),
                  )
                : Column(
                    children: List.generate(_klineEntries.length, (i) {
                      final entry = _klineEntries[i];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: cardColor,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: borderColor),
                        ),
                        child: Row(
                          children: [
                            // Interval selector
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Interval',
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelSmall
                                          ?.copyWith(color: Theme.of(context).hintColor)),
                                  const SizedBox(height: 4),
                                  _IntervalDropdown(
                                    value: entry['interval'] as String,
                                    onChanged: (v) => setState(
                                      () => _klineEntries[i]['interval'] = v,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 10),
                            // Limit input
                            SizedBox(
                              width: 80,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Bars',
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelSmall
                                          ?.copyWith(color: Theme.of(context).hintColor)),
                                  const SizedBox(height: 4),
                                  TextFormField(
                                    initialValue: (entry['limit'] as int).toString(),
                                    keyboardType: TextInputType.number,
                                    decoration: InputDecoration(
                                      isDense: true,
                                      contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 10,
                                      ),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(8),
                                        borderSide: BorderSide(color: borderColor),
                                      ),
                                      enabledBorder: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(8),
                                        borderSide: BorderSide(color: borderColor),
                                      ),
                                    ),
                                    onChanged: (v) {
                                      final parsed = int.tryParse(v);
                                      if (parsed != null && parsed > 0) {
                                        setState(() => _klineEntries[i]['limit'] = parsed);
                                      }
                                    },
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, color: Colors.red),
                              onPressed: () =>
                                  setState(() => _klineEntries.removeAt(i)),
                              tooltip: 'Remove',
                            ),
                          ],
                        ),
                      );
                    }),
                  ),
          ),
          const SizedBox(height: 12),

          // ── Account Data ──
          _SectionCard(
            title: 'Account Data',
            icon: Icons.account_balance_wallet_outlined,
            child: Column(
              children: [
                _ToggleRow(
                  label: 'Position Info',
                  description: 'Fetch current positions for the symbol',
                  value: _fetchPositions,
                  onChanged: (v) => setState(() => _fetchPositions = v),
                ),
                _ToggleRow(
                  label: 'Open Orders',
                  description: 'Fetch open orders for the current symbol',
                  value: _fetchOpenOrders,
                  onChanged: (v) => setState(() => _fetchOpenOrders = v),
                ),
                _ToggleRow(
                  label: 'Account Balance',
                  description: 'Fetch balance information for all assets',
                  value: _fetchBalance,
                  onChanged: (v) => setState(() => _fetchBalance = v),
                ),
                _ToggleRow(
                  label: 'Account Details',
                  description: 'Fetch complete account information',
                  value: _fetchAccountInfo,
                  onChanged: (v) => setState(() => _fetchAccountInfo = v),
                  isLast: true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── Market Data Snapshot ──
          _SectionCard(
            title: 'Market Data Snapshot',
            icon: Icons.bar_chart,
            child: Column(
              children: [
                _ToggleRow(
                  label: 'Ticker Data',
                  description: 'Fetch latest price and 24h statistics',
                  value: _fetchTicker,
                  onChanged: (v) => setState(() => _fetchTicker = v),
                ),
                _ToggleRow(
                  label: 'Order Book',
                  description: 'Fetch order book depth data',
                  value: _fetchOrderBook,
                  onChanged: (v) => setState(() => _fetchOrderBook = v),
                  isLast: !_fetchOrderBook,
                ),
                if (_fetchOrderBook) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(
                        'Depth:',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: Theme.of(context).hintColor),
                      ),
                      const SizedBox(width: 8),
                      _DepthSelector(
                        value: _orderBookDepth,
                        onChanged: (v) => setState(() => _orderBookDepth = v),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 – Subscription Config
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildStep3Subscriptions() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepHeader(
            step: 4,
            title: 'Real-time Subscriptions',
            subtitle: 'Configure real-time market data feeds (optional)',
          ),
          const SizedBox(height: 16),

          // ── Data Types ──
          _SectionCard(
            title: 'Data Types',
            icon: Icons.stream,
            child: Column(
              children: [
                _ToggleRow(
                  label: 'Ticker Data',
                  description: 'Real-time price updates',
                  value: _subTicker,
                  onChanged: (v) => setState(() => _subTicker = v),
                ),
                _ToggleRow(
                  label: 'Order Book',
                  description: 'Real-time order book depth updates',
                  value: _subOrderBook,
                  onChanged: (v) => setState(() => _subOrderBook = v),
                  isLast: !_subOrderBook,
                ),
                if (_subOrderBook) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(
                        'Depth:',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: Theme.of(context).hintColor),
                      ),
                      const SizedBox(width: 8),
                      _DepthSelector(
                        value: _subOrderBookDepth,
                        onChanged: (v) => setState(() => _subOrderBookDepth = v),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                _ToggleRow(
                  label: 'Trades',
                  description: 'Real-time trade stream',
                  value: _subTrades,
                  onChanged: (v) => setState(() => _subTrades = v),
                ),
                _ToggleRow(
                  label: 'Kline Data',
                  description: 'Candlestick data stream',
                  value: _subKlines,
                  onChanged: (v) => setState(() {
                    _subKlines = v;
                    if (!v) _subKlineIntervals.clear();
                  }),
                  isLast: !_subKlines,
                ),
                if (_subKlines) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Select Intervals',
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall
                        ?.copyWith(color: Theme.of(context).hintColor),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: _kKlineIntervals.map((interval) {
                      final selected = _subKlineIntervals.contains(interval['value']);
                      return FilterChip(
                        label: Text(interval['label']!),
                        selected: selected,
                        onSelected: (checked) => setState(() {
                          if (checked) {
                            _subKlineIntervals.add(interval['value']!);
                          } else {
                            _subKlineIntervals.remove(interval['value']);
                          }
                        }),
                        visualDensity: VisualDensity.compact,
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── Data Method ──
          _SectionCard(
            title: 'Data Method',
            icon: Icons.settings_ethernet,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Choose how to receive real-time data:',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Theme.of(context).hintColor),
                ),
                const SizedBox(height: 10),
                _MethodSelector(
                  value: _subMethod,
                  onChanged: (v) => setState(() => _subMethod = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shared input decoration
  // ─────────────────────────────────────────────────────────────────────────

  InputDecoration _inputDecoration(
    BuildContext context, {
    String? labelText,
    String? hintText,
    String? errorText,
    Widget? suffixIcon,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderColor =
        isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.15);
    final fillColor = isDark ? Colors.grey[900] : Colors.white;

    return InputDecoration(
      labelText: labelText,
      hintText: hintText,
      errorText: errorText,
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: fillColor,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Theme.of(context).colorScheme.primary),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Colors.red),
      ),
    );
  }

  Widget _loadingPlaceholder(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      height: 52,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.12),
        ),
      ),
      child: const SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Indicator
// ─────────────────────────────────────────────────────────────────────────────

class _StepIndicator extends StatelessWidget {
  final int currentStep;
  final int totalSteps;

  const _StepIndicator({required this.currentStep, required this.totalSteps});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primary = Theme.of(context).colorScheme.primary;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        border: Border(
          bottom: BorderSide(
            color: isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.1),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: List.generate(totalSteps, (i) {
              final isCompleted = i < currentStep;
              final isActive = i == currentStep;
              return Expanded(
                child: Row(
                  children: [
                    Expanded(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        height: 4,
                        decoration: BoxDecoration(
                          color: isCompleted || isActive
                              ? primary
                              : isDark
                                  ? Colors.grey[800]
                                  : Colors.grey.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    if (i < totalSteps - 1) const SizedBox(width: 4),
                  ],
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          Text(
            'Step ${currentStep + 1} of $totalSteps  ·  ${_kStepTitles[currentStep]}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).hintColor,
                  fontWeight: FontWeight.w500,
                ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Header
// ─────────────────────────────────────────────────────────────────────────────

class _StepHeader extends StatelessWidget {
  final int step;
  final String title;
  final String subtitle;

  const _StepHeader({
    required this.step,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).hintColor,
              ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Card
// ─────────────────────────────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;
  final Widget? trailing;

  const _SectionCard({
    required this.title,
    required this.icon,
    required this.child,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(
          color: isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .primary
                      .withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle Row
// ─────────────────────────────────────────────────────────────────────────────

class _ToggleRow extends StatelessWidget {
  final String label;
  final String description;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool isLast;

  const _ToggleRow({
    required this.label,
    required this.description,
    required this.value,
    required this.onChanged,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(
                    description,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Theme.of(context).hintColor),
                  ),
                ],
              ),
            ),
            Switch(value: value, onChanged: onChanged),
          ],
        ),
        if (!isLast) ...[
          const SizedBox(height: 4),
          Divider(
            height: 1,
            color: Theme.of(context).dividerColor.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Depth Selector
// ─────────────────────────────────────────────────────────────────────────────

class _DepthSelector extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;

  const _DepthSelector({required this.value, required this.onChanged});

  static const List<int> _depths = [5, 10, 20, 50, 100];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return DropdownButton<int>(
      value: _depths.contains(value) ? value : 20,
      isDense: true,
      underline: const SizedBox.shrink(),
      dropdownColor: isDark ? Colors.grey[900] : Colors.white,
      items: _depths
          .map((d) => DropdownMenuItem(value: d, child: Text('$d levels')))
          .toList(),
      onChanged: (v) { if (v != null) onChanged(v); },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Method Selector
// ─────────────────────────────────────────────────────────────────────────────

class _MethodSelector extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const _MethodSelector({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MethodOption(
            label: 'WebSocket',
            description: 'Lower latency',
            icon: Icons.flash_on,
            selected: value == 'websocket',
            onTap: () => onChanged('websocket'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MethodOption(
            label: 'REST Polling',
            description: 'More stable',
            icon: Icons.refresh,
            selected: value == 'rest',
            onTap: () => onChanged('rest'),
          ),
        ),
      ],
    );
  }
}

class _MethodOption extends StatelessWidget {
  final String label;
  final String description;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _MethodOption({
    required this.label,
    required this.description,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primary = Theme.of(context).colorScheme.primary;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected
              ? primary.withValues(alpha: 0.1)
              : isDark
                  ? Colors.grey[850]
                  : Colors.grey.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? primary : Colors.transparent,
            width: 1.5,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: selected ? primary : Theme.of(context).hintColor),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: selected ? primary : null,
                    )),
                Text(description,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Theme.of(context).hintColor)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interval Dropdown
// ─────────────────────────────────────────────────────────────────────────────

class _IntervalDropdown extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const _IntervalDropdown({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final allValues = _kKlineIntervals.map((e) => e['value']!).toList();
    final safeValue = allValues.contains(value) ? value : allValues.first;

    return DropdownButtonFormField<String>(
      value: safeValue,
      isDense: true,
      dropdownColor: isDark ? Colors.grey[900] : Colors.white,
      decoration: InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(
            color: isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.15),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(
            color: isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.15),
          ),
        ),
      ),
      items: _kKlineIntervals
          .map((i) => DropdownMenuItem(value: i['value'], child: Text(i['label']!)))
          .toList(),
      onChanged: (v) { if (v != null) onChanged(v); },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Info Banner
// ─────────────────────────────────────────────────────────────────────────────

class _InfoBanner extends StatelessWidget {
  final String text;

  const _InfoBanner({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline,
            size: 16,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Type Option model
// ─────────────────────────────────────────────────────────────────────────────

class _StrategyTypeOption {
  final String type;
  final String name;
  final String? description;
  final String? category;
  final Map<String, dynamic>? defaultParameters;

  const _StrategyTypeOption({
    required this.type,
    required this.name,
    this.description,
    this.category,
    this.defaultParameters,
  });

  factory _StrategyTypeOption.fromJson(Map<String, dynamic> json) {
    final defaultParams = json['defaultParameters'];
    return _StrategyTypeOption(
      type: json['type'] as String? ?? '',
      name: json['name'] as String? ?? json['type'] as String? ?? '',
      description: json['description'] as String?,
      category: json['category'] as String?,
      defaultParameters: defaultParams is Map
          ? Map<String, dynamic>.from(defaultParams)
          : null,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Type Picker Field
// ─────────────────────────────────────────────────────────────────────────────

class _StrategyTypePickerField extends StatelessWidget {
  final String? value;
  final List<_StrategyTypeOption> options;
  final ValueChanged<String?> onChanged;
  final String placeholder;

  const _StrategyTypePickerField({
    required this.value,
    required this.options,
    required this.onChanged,
    required this.placeholder,
  });

  @override
  Widget build(BuildContext context) {
    final selected = options.firstWhere(
      (item) => item.type == value,
      orElse: () => const _StrategyTypeOption(type: '', name: ''),
    );

    return InkWell(
      onTap: () => _openTypePicker(context),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: CopyService.instance.t(
            'screen.strategy_create.strategy_type',
            fallback: 'Strategy type',
          ),
          filled: true,
          fillColor: Theme.of(context).brightness == Brightness.dark
              ? Colors.grey[900]
              : Colors.white,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          suffixIcon: const Icon(Icons.expand_more),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.withValues(alpha: 0.15)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.withValues(alpha: 0.15)),
          ),
        ),
        child: Text(
          selected.type.isEmpty ? placeholder : selected.name,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
      ),
    );
  }

  Future<void> _openTypePicker(BuildContext context) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _StrategyTypePickerSheet(options: options),
    );
    if (selected != null) onChanged(selected);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Type Picker Sheet
// ─────────────────────────────────────────────────────────────────────────────

class _StrategyTypePickerSheet extends StatefulWidget {
  final List<_StrategyTypeOption> options;
  const _StrategyTypePickerSheet({required this.options});

  @override
  State<_StrategyTypePickerSheet> createState() => _StrategyTypePickerSheetState();
}

class _StrategyTypePickerSheetState extends State<_StrategyTypePickerSheet> {
  late final TextEditingController _searchController;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<_StrategyTypeOption> get _filtered {
    if (_query.trim().isEmpty) return widget.options;
    final lower = _query.trim().toLowerCase();
    return widget.options
        .where((o) =>
            o.name.toLowerCase().contains(lower) ||
            o.type.toLowerCase().contains(lower) ||
            (o.description?.toLowerCase().contains(lower) ?? false))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.85,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Select Strategy Type',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search strategies',
                    prefixIcon: const Icon(Icons.search),
                    filled: true,
                    fillColor: isDark
                        ? Colors.grey[850]
                        : Colors.grey.withValues(alpha: 0.08),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ),
              Expanded(
                child: _filtered.isEmpty
                    ? Center(
                        child: Text(
                          'No strategies found',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: Theme.of(context).hintColor),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        itemCount: _filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final option = _filtered[i];
                          return Material(
                            color: isDark ? Colors.grey[900] : Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () => Navigator.pop(context, option.type),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(option.name,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodyLarge
                                            ?.copyWith(fontWeight: FontWeight.w600)),
                                    if (option.description?.isNotEmpty == true) ...[
                                      const SizedBox(height: 4),
                                      Text(option.description!,
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall
                                              ?.copyWith(
                                                  color: Theme.of(context).hintColor)),
                                    ],
                                    const SizedBox(height: 4),
                                    Text(option.type,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                                color: Theme.of(context).hintColor)),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbol Ticker model
// ─────────────────────────────────────────────────────────────────────────────

class _SymbolTicker {
  final String symbol;
  final double? price;
  final double? change24h;
  final String? exchange;
  /// 'spot' or 'perpetual'
  final String marketType;

  const _SymbolTicker({
    required this.symbol,
    this.price,
    this.change24h,
    this.exchange,
    this.marketType = 'spot',
  });

  factory _SymbolTicker.fromJson(Map<String, dynamic> json) {
    return _SymbolTicker(
      symbol: json['symbol'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble(),
      change24h: (json['change24h'] as num?)?.toDouble(),
      exchange: json['exchange'] as String?,
      marketType: json['type'] as String? ?? 'spot',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbol Picker Field — tap-to-open selector with loading state
// ─────────────────────────────────────────────────────────────────────────────

class _SymbolPickerField extends StatelessWidget {
  final String selectedSymbol;
  final String hint;
  final String? errorText;
  final bool loading;
  final int tickerCount;
  final bool exchangeSelected;
  final VoidCallback? onTap;

  const _SymbolPickerField({
    required this.selectedSymbol,
    required this.hint,
    required this.loading,
    required this.tickerCount,
    required this.exchangeSelected,
    this.errorText,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderColor =
        isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.15);
    final fillColor = isDark ? Colors.grey[900]! : Colors.white;
    final hasSymbol = selectedSymbol.isNotEmpty;
    final disabled = !exchangeSelected;

    return GestureDetector(
      onTap: disabled ? null : onTap,
      child: Opacity(
        opacity: disabled ? 0.5 : 1.0,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: fillColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: errorText != null ? Colors.red : borderColor,
            ),
          ),
          child: Row(
            children: [
              // Leading: coin icon or placeholder
              if (hasSymbol) ...[
                _CoinAvatar(symbol: selectedSymbol, size: 26),
                const SizedBox(width: 10),
              ] else ...[
                Icon(Icons.currency_exchange,
                    size: 18,
                    color: Theme.of(context).hintColor),
                const SizedBox(width: 10),
              ],

              // Main content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      hasSymbol ? selectedSymbol : hint,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight:
                                hasSymbol ? FontWeight.w700 : FontWeight.normal,
                            color: hasSymbol
                                ? Theme.of(context).colorScheme.onSurface
                                : Theme.of(context).hintColor,
                          ),
                    ),
                    if (exchangeSelected && !loading && tickerCount > 0) ...[
                      const SizedBox(height: 2),
                      Text(
                        '$tickerCount pairs available',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context).hintColor,
                              fontSize: 11,
                            ),
                      ),
                    ],
                  ],
                ),
              ),

              // Trailing: spinner / search icon
              if (loading)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(Icons.search_rounded,
                    size: 20, color: Theme.of(context).hintColor),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coin Avatar — small circular crypto icon
// ─────────────────────────────────────────────────────────────────────────────

class _CoinAvatar extends StatelessWidget {
  final String symbol;
  final double size;

  const _CoinAvatar({required this.symbol, required this.size});

  @override
  Widget build(BuildContext context) {
    final base = symbol.split('/').firstOrNull ?? symbol.split('-').firstOrNull ?? symbol;
    return SizedBox(
      width: size,
      height: size,
      child: ClipOval(
        child: Image.network(
          CryptoIcons.getIconUrl(base),
          width: size,
          height: size,
          errorBuilder: (_, __, ___) => Container(
            width: size,
            height: size,
            color: Theme.of(context).colorScheme.primaryContainer,
            child: Center(
              child: Text(
                base.isNotEmpty ? base[0].toUpperCase() : '?',
                style: TextStyle(
                  fontSize: size * 0.45,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbol Picker Sheet
// ─────────────────────────────────────────────────────────────────────────────

class _SymbolPickerSheet extends StatefulWidget {
  final String title;
  final String exchange;
  final List<_SymbolTicker> tickers;
  final bool loading;
  final String? errorMessage;
  final String? initialQuery;

  const _SymbolPickerSheet({
    required this.title,
    required this.exchange,
    required this.tickers,
    required this.loading,
    required this.errorMessage,
    this.initialQuery,
  });

  @override
  State<_SymbolPickerSheet> createState() => _SymbolPickerSheetState();
}

class _SymbolPickerSheetState extends State<_SymbolPickerSheet> {
  late final TextEditingController _searchController;
  String _query = '';
  /// 'all', 'spot', or 'perpetual'
  String _marketFilter = 'all';

  @override
  void initState() {
    super.initState();
    _query = widget.initialQuery ?? '';
    _searchController = TextEditingController(text: _query);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// Convert a CCXT-format symbol (e.g. BTC/USDT) to the exchange-native
  /// display format (e.g. BTCUSDT for Binance, BTC-USDT for OKX).
  String _nativeSymbol(String ccxtSymbol) =>
      SupportedExchanges.normalizeSymbol(ccxtSymbol, widget.exchange);

  List<_SymbolTicker> get _filtered {
    var list = widget.tickers;
    // Apply market type filter
    if (_marketFilter != 'all') {
      list = list.where((t) => t.marketType == _marketFilter).toList();
    }
    if (_query.trim().isEmpty) return list;
    final lower = _query.trim().toLowerCase();
    return list.where((t) {
      return t.symbol.toLowerCase().contains(lower) ||
          _nativeSymbol(t.symbol).toLowerCase().contains(lower);
    }).toList();
  }

  bool get _hasPerp => widget.tickers.any((t) => t.marketType == 'perpetual');
  bool get _hasSpot => widget.tickers.any((t) => t.marketType == 'spot');

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedPadding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOut,
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.88,
            child: Column(
              children: [
                // ── Drag handle ──────────────────────────────────────────
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 10),
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // ── Header ───────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 8, 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.title,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            if (widget.tickers.isNotEmpty)
                              Text(
                                '${widget.tickers.length} pairs loaded',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                        color: Theme.of(context).hintColor),
                              ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                ),

                // ── Market Type Filter ───────────────────────────────────
                if (_hasSpot && _hasPerp)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: Row(
                      children: [
                        _MarketFilterChip(
                          label: 'All',
                          selected: _marketFilter == 'all',
                          onTap: () => setState(() => _marketFilter = 'all'),
                        ),
                        const SizedBox(width: 8),
                        _MarketFilterChip(
                          label: 'Spot',
                          selected: _marketFilter == 'spot',
                          onTap: () => setState(() => _marketFilter = 'spot'),
                        ),
                        const SizedBox(width: 8),
                        _MarketFilterChip(
                          label: 'Perp',
                          selected: _marketFilter == 'perpetual',
                          onTap: () => setState(() => _marketFilter = 'perpetual'),
                        ),
                      ],
                    ),
                  ),

                // ── Search ───────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: TextField(
                    controller: _searchController,
                    autofocus: true,
                    decoration: InputDecoration(
                      hintText: 'Search pairs…',
                      prefixIcon: const Icon(Icons.search_rounded),
                      filled: true,
                      fillColor: isDark
                          ? Colors.grey[850]
                          : Colors.grey.withValues(alpha: 0.07),
                      contentPadding:
                          const EdgeInsets.symmetric(vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onChanged: (v) => setState(() => _query = v),
                  ),
                ),

                // ── List ─────────────────────────────────────────────────
                Expanded(
                  child: widget.loading
                      ? const Center(child: CircularProgressIndicator())
                      : _buildList(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildList() {
    final list = _filtered;
    if (list.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off_rounded,
                size: 40,
                color: Theme.of(context).hintColor.withValues(alpha: 0.4)),
            const SizedBox(height: 12),
            Text(
              'No pairs found',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Theme.of(context).hintColor),
            ),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      itemCount: list.length,
      itemBuilder: (_, i) {
        final native = _nativeSymbol(list[i].symbol);
        return _SymbolListTile(
          ticker: list[i],
          displaySymbol: native,
          onTap: () => Navigator.pop(context, native),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbol List Tile
// ─────────────────────────────────────────────────────────────────────────────

class _SymbolListTile extends StatelessWidget {
  final _SymbolTicker ticker;
  /// Exchange-native display string, e.g. "BTCUSDT" or "BTC-USDT".
  final String displaySymbol;
  final VoidCallback onTap;

  const _SymbolListTile({
    required this.ticker,
    required this.displaySymbol,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final price = ticker.price;
    final change = ticker.change24h;
    final isPositive = (change ?? 0) >= 0;
    final changeColor = isPositive ? const Color(0xFF10B981) : const Color(0xFFEF4444);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
        child: Row(
          children: [
            // Coin icon
            _CoinAvatar(symbol: ticker.symbol, size: 38),
            const SizedBox(width: 12),

            // Name
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        displaySymbol,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                      ),
                      const SizedBox(width: 6),
                      _MarketTypeBadge(marketType: ticker.marketType),
                    ],
                  ),
                  if (change != null) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(
                          isPositive
                              ? Icons.arrow_drop_up_rounded
                              : Icons.arrow_drop_down_rounded,
                          size: 14,
                          color: changeColor,
                        ),
                        Text(
                          '${isPositive ? '+' : ''}${change.toStringAsFixed(2)}%',
                          style: TextStyle(
                            fontSize: 11,
                            color: changeColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),

            // Price
            if (price != null)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.grey[850]
                      : Colors.grey.withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _formatPrice(price),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _formatPrice(double p) {
    if (p >= 1000) return p.toStringAsFixed(2);
    if (p >= 1) return p.toStringAsFixed(4);
    if (p >= 0.001) return p.toStringAsFixed(6);
    return p.toStringAsFixed(8);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Market Type Badge — small pill showing "Spot" or "Perp"
// ─────────────────────────────────────────────────────────────────────────────

class _MarketTypeBadge extends StatelessWidget {
  final String marketType;
  const _MarketTypeBadge({required this.marketType});

  @override
  Widget build(BuildContext context) {
    final isPerp = marketType == 'perpetual';
    final label = isPerp ? 'Perp' : 'Spot';
    final bg = isPerp
        ? const Color(0xFF6366F1).withValues(alpha: 0.15)
        : const Color(0xFF10B981).withValues(alpha: 0.15);
    final fg = isPerp ? const Color(0xFF6366F1) : const Color(0xFF10B981);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: fg,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Market Filter Chip — pill button for All / Spot / Perp tabs
// ─────────────────────────────────────────────────────────────────────────────

class _MarketFilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _MarketFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primary = Theme.of(context).colorScheme.primary;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? primary
              : (isDark ? Colors.grey[850] : Colors.grey.withValues(alpha: 0.1)),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected
                ? Colors.white
                : Theme.of(context).textTheme.bodyMedium?.color,
          ),
        ),
      ),
    );
  }
}
