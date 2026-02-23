import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../services/strategy_service.dart';
import '../services/copy_service.dart';
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';
import '../widgets/exchange_picker_field.dart';
import '../widgets/copy_text.dart';

class StrategyCreateScreen extends StatefulWidget {
  const StrategyCreateScreen({super.key});

  @override
  State<StrategyCreateScreen> createState() => _StrategyCreateScreenState();
}

class _StrategyCreateScreenState extends State<StrategyCreateScreen> {
  final StrategyService _strategyService = StrategyService.instance;

  final _nameController = TextEditingController();
  final _symbolController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _parametersController = TextEditingController();
  final _initialDataController = TextEditingController();
  final _subscriptionController = TextEditingController();

  String _selectedExchange = '';
  String? _selectedType;
  List<_StrategyTypeOption> _strategyTypes = [];
  String? _nameError;
  String? _symbolError;
  String? _parametersError;
  String? _initialDataError;
  String? _subscriptionError;
  bool _checkingName = false;
  bool _isSubmitting = false;
  bool _loadingTypes = true;
  bool _showAdvanced = false;
  bool _loadingTickers = false;
  String? _tickersError;
  List<_SymbolTicker> _tickers = [];

  Timer? _nameDebounce;
  Timer? _parametersDebounce;
  Timer? _initialDataDebounce;
  Timer? _subscriptionDebounce;
  String _lastCheckedName = '';

  @override
  void initState() {
    super.initState();
    _loadStrategyConfigs();
  }

  @override
  void dispose() {
    _nameDebounce?.cancel();
    _parametersDebounce?.cancel();
    _initialDataDebounce?.cancel();
    _subscriptionDebounce?.cancel();
    _nameController.dispose();
    _symbolController.dispose();
    _descriptionController.dispose();
    _parametersController.dispose();
    _initialDataController.dispose();
    _subscriptionController.dispose();
    super.dispose();
  }

  void _scheduleNameValidation() {
    _nameDebounce?.cancel();
    _nameDebounce = Timer(const Duration(milliseconds: 500), () {
      _validateName(checkAvailability: true);
    });
  }

  void _scheduleParametersValidation() {
    _parametersDebounce?.cancel();
    _parametersDebounce = Timer(
      const Duration(milliseconds: 500),
      _validateParameters,
    );
  }

  void _scheduleInitialDataValidation() {
    _initialDataDebounce?.cancel();
    _initialDataDebounce = Timer(
      const Duration(milliseconds: 500),
      _validateInitialDataConfig,
    );
  }

  void _scheduleSubscriptionValidation() {
    _subscriptionDebounce?.cancel();
    _subscriptionDebounce = Timer(
      const Duration(milliseconds: 500),
      _validateSubscriptionConfig,
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

  void _validateParameters() {
    final raw = _parametersController.text.trim();
    if (raw.isEmpty) {
      setState(() => _parametersError = null);
      return;
    }
    try {
      final parsed = jsonDecode(raw);
      if (parsed is! Map) {
        setState(() => _parametersError = 'Parameters must be a JSON object');
        return;
      }
      setState(() => _parametersError = null);
    } catch (_) {
      setState(() => _parametersError = 'Invalid JSON format');
    }
  }

  void _validateInitialDataConfig() {
    final raw = _initialDataController.text.trim();
    if (raw.isEmpty) {
      setState(() => _initialDataError = null);
      return;
    }
    try {
      final parsed = jsonDecode(raw);
      if (parsed is! Map) {
        setState(() => _initialDataError = 'Initial data must be a JSON object');
        return;
      }
      setState(() => _initialDataError = null);
    } catch (_) {
      setState(() => _initialDataError = 'Invalid JSON format');
    }
  }

  void _validateSubscriptionConfig() {
    final raw = _subscriptionController.text.trim();
    if (raw.isEmpty) {
      setState(() => _subscriptionError = null);
      return;
    }
    try {
      final parsed = jsonDecode(raw);
      if (parsed is! Map) {
        setState(() => _subscriptionError = 'Subscription must be a JSON object');
        return;
      }
      setState(() => _subscriptionError = null);
    } catch (_) {
      setState(() => _subscriptionError = 'Invalid JSON format');
    }
  }

  bool _validateAll() {
    _validateName();
    _validateSymbol();
    _validateParameters();
    _validateInitialDataConfig();
    _validateSubscriptionConfig();

    return _nameError == null &&
        _symbolError == null &&
        _parametersError == null &&
        _initialDataError == null &&
        _subscriptionError == null;
  }

  Future<void> _handleSubmit() async {
    if (_isSubmitting) return;
    if (_selectedType == null || _selectedType!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: CopyText('screen.strategy_create.please_select_a_strategy_type', fallback: "Please select a strategy type"),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    final isValid = _validateAll();
    if (!isValid) return;

    setState(() => _isSubmitting = true);

    Map<String, dynamic>? parameters;
    final parametersText = _parametersController.text.trim();
    if (parametersText.isNotEmpty) {
      final parsed = jsonDecode(parametersText);
      if (parsed is Map) {
        parameters = Map<String, dynamic>.from(parsed);
      }
    }

    Map<String, dynamic>? initialDataConfig;
    final initialDataText = _initialDataController.text.trim();
    if (initialDataText.isNotEmpty) {
      final parsed = jsonDecode(initialDataText);
      if (parsed is Map) {
        initialDataConfig = Map<String, dynamic>.from(parsed);
      }
    }

    Map<String, dynamic>? subscription;
    final subscriptionText = _subscriptionController.text.trim();
    if (subscriptionText.isNotEmpty) {
      final parsed = jsonDecode(subscriptionText);
      if (parsed is Map) {
        subscription = Map<String, dynamic>.from(parsed);
      }
    }

    try {
      final strategy = await _strategyService.createStrategy(
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

      if (!mounted) return;

      if (strategy == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: CopyText('screen.strategy_create.failed_to_create_strategy', fallback: "Failed to create strategy"),
            backgroundColor: Colors.red,
          ),
        );
        setState(() => _isSubmitting = false);
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: CopyText('screen.strategy_create.strategy_created', fallback: "Strategy created"),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: CopyText(
            'screen.strategy_create.failed_to_create_strategy_detail',
            params: {'error': e.toString()},
            fallback: 'Failed to create strategy: {{error}}',
          ),
          backgroundColor: Colors.red,
        ),
      );
      setState(() => _isSubmitting = false);
    }
  }

  Future<void> _loadStrategyConfigs() async {
    final configs = await _strategyService.getStrategyConfigs();
    if (!mounted) return;

    final types = configs
        .map((config) => _StrategyTypeOption.fromJson(config))
        .where((config) => config.type.isNotEmpty)
        .toList();

    if (types.isEmpty) {
      setState(() {
        _strategyTypes = [];
        _selectedType = 'MovingAverageStrategy';
        _parametersController.text = const JsonEncoder.withIndent('  ')
            .convert(<String, dynamic>{});
        _loadingTypes = false;
      });
      return;
    }

    final defaultType = types.first.type;
    final defaultParameters = types.first.defaultParameters ?? <String, dynamic>{};

    setState(() {
      _strategyTypes = types;
      _selectedType = defaultType;
      _parametersController.text =
          const JsonEncoder.withIndent('  ').convert(defaultParameters);
      _loadingTypes = false;
    });
  }

  void _handleTypeChange(String? value) {
    if (value == null) return;
    if (_strategyTypes.isEmpty) {
      setState(() {
        _selectedType = value;
        _parametersController.text =
            const JsonEncoder.withIndent('  ').convert(<String, dynamic>{});
      });
      return;
    }

    final match = _strategyTypes.firstWhere(
      (item) => item.type == value,
      orElse: () => _strategyTypes.first,
    );
    final defaultParameters = match.defaultParameters ?? <String, dynamic>{};
    setState(() {
      _selectedType = value;
      _parametersController.text =
          const JsonEncoder.withIndent('  ').convert(defaultParameters);
    });
  }

  Future<void> _checkNameAvailability(String value) async {
    if (value.length < 3 || value == _lastCheckedName) return;
    _lastCheckedName = value;
    setState(() => _checkingName = true);
    final available = await _strategyService.checkNameAvailable(value);
    if (!mounted) return;
    setState(() {
      _checkingName = false;
      if (available == false) {
        _nameError = 'Strategy name already exists';
      }
    });
  }

  Future<void> _loadTickersForExchange() async {
    if (_selectedExchange.trim().isEmpty) {
      return;
    }
    setState(() {
      _loadingTickers = true;
      _tickersError = null;
    });
    final raw = await _strategyService.getMarketTickers();
    if (!mounted) return;

    final normalized = raw.map((item) => _SymbolTicker.fromJson(item)).toList();
    final exchangeName = SupportedExchanges.getName(_selectedExchange);
    final filtered = normalized.where((ticker) {
      if (ticker.exchange == null) return false;
      return ticker.exchange!.toLowerCase() == exchangeName.toLowerCase();
    }).toList();

    setState(() {
      _tickers = filtered;
      _loadingTickers = false;
      _tickersError = filtered.isEmpty ? 'No market data available' : null;
    });
  }

  List<String> _getDefaultSymbols() {
    switch (_selectedExchange) {
      case 'binance':
        return [
          'BTC/USDT',
          'ETH/USDT',
          'BNB/USDT',
          'SOL/USDT',
          'XRP/USDT',
          'ADA/USDT',
        ];
      case 'okx':
        return [
          'BTC/USDT',
          'ETH/USDT',
          'SOL/USDT',
          'XRP/USDT',
          'ADA/USDT',
          'DOGE/USDT',
        ];
      case 'coinbase':
      default:
        return [
          'BTC/USDC',
          'ETH/USDC',
          'SOL/USDC',
          'XRP/USDC',
          'DOGE/USDC',
        ];
    }
  }

  Future<void> _openSymbolPicker() async {
    if (_selectedExchange.trim().isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: CopyText('screen.strategy_create.please_select_an_exchange_firs', fallback: "Please select an exchange first"),
            backgroundColor: Colors.red,
          ),
        );
      }
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
      builder: (context) => _SymbolPickerSheet(
        title: 'Select Symbol',
        defaultSymbols: _getDefaultSymbols(),
        tickers: _tickers,
        loading: _loadingTickers,
        errorMessage: _tickersError,
        initialQuery: _symbolController.text.trim(),
      ),
    );

    if (selected != null && selected.isNotEmpty && mounted) {
      setState(() {
        _symbolController.text = selected;
      });
      _validateSymbol();
    }
  }

  @override
  Widget build(BuildContext context) {
    final symbolHint = SupportedExchanges.getSymbolFormatHint(_selectedExchange);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selectedType = _strategyTypes.firstWhere(
      (item) => item.type == _selectedType,
      orElse: () => const _StrategyTypeOption(type: '', name: ''),
    );

    return Scaffold(
      appBar: AppBar(
        title: CopyText('screen.strategy_create.new_strategy', fallback: "New strategy"),
        centerTitle: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SectionCard(
                title: 'Basic Info',
                child: Column(
                  children: [
                    TextField(
                      controller: _nameController,
                      textInputAction: TextInputAction.next,
                      decoration: _inputDecoration(
                        context,
                labelText: CopyService.instance.t(
                  'screen.strategy_create.strategy_name',
                  fallback: 'Strategy name',
                ),
                        suffixIcon: _checkingName
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : null,
                        errorText: _nameError,
                      ),
                      onChanged: (_) => _scheduleNameValidation(),
                    ),
                    const SizedBox(height: 12),
                    _loadingTypes
                        ? Container(
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
                          )
                        : _StrategyTypePickerField(
                            value: _selectedType,
                            options: _strategyTypes,
                            onChanged: _handleTypeChange,
                            placeholder: 'Select strategy type',
                          ),
                    if (selectedType.description != null &&
                        selectedType.description!.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          selectedType.description!,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).hintColor,
                              ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    ExchangePickerField(
                      selectedExchange: _selectedExchange,
                      onChanged: (value) {
                        setState(() {
                          _selectedExchange = value;
                          _tickers = [];
                          if (_symbolController.text.trim().isEmpty) {
                            final defaults = _getDefaultSymbols();
                            _symbolController.text =
                                defaults.isNotEmpty ? defaults.first : '';
                          }
                        });
                      },
                    hintText: CopyService.instance.t(
                      'screen.strategy_create.select_exchange',
                      fallback: 'Select exchange',
                    ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: _selectedExchange.trim().isEmpty
                          ? null
                          : _openSymbolPicker,
                      child: InputDecorator(
                        decoration: _inputDecoration(
                          context,
                          labelText: CopyService.instance.t(
                            'screen.strategy_create.symbol',
                            fallback: 'Symbol',
                          ),
                          hintText: symbolHint,
                          errorText: _symbolError,
                          suffixIcon: const Icon(Icons.search),
                        ),
                        child: Text(
                          _symbolController.text.trim().isEmpty
                              ? symbolHint
                              : _symbolController.text.trim(),
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: _symbolController.text.trim().isEmpty
                                    ? Theme.of(context).hintColor
                                    : Theme.of(context).colorScheme.onSurface,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _descriptionController,
                      maxLines: 2,
                      decoration: _inputDecoration(
                        context,
                        labelText: CopyService.instance.t(
                          'screen.strategy_create.description_optional',
                          fallback: 'Description (optional)',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Parameters',
                helperText: 'Defaults are loaded from selected strategy type.',
                child: TextField(
                  controller: _parametersController,
                  maxLines: 6,
                  decoration: _inputDecoration(
                    context,
                    hintText: CopyService.instance.t(
                      'screen.strategy_create.initial_config_hint',
                      fallback:
                          '{\n  "leverage": 10,\n  "orderAmount": 100\n}',
                    ),
                    errorText: _parametersError,
                  ),
                  onChanged: (_) => _scheduleParametersValidation(),
                ),
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Advanced',
                helperText: 'Optional initial data & subscription config',
                child: Column(
                  children: [
                    SwitchListTile(
                      value: _showAdvanced,
                      contentPadding: EdgeInsets.zero,
                      title: CopyText('screen.strategy_create.show_advanced_settings', fallback: "Show advanced settings"),
                      onChanged: (value) => setState(() => _showAdvanced = value),
                    ),
                    if (_showAdvanced) ...[
                      const SizedBox(height: 8),
                      TextField(
                        controller: _initialDataController,
                        maxLines: 5,
                        decoration: _inputDecoration(
                          context,
                        labelText: CopyService.instance.t(
                          'screen.strategy_create.initial_config',
                          fallback: 'Initial data config (JSON)',
                        ),
                          errorText: _initialDataError,
                        ),
                        onChanged: (_) => _scheduleInitialDataValidation(),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _subscriptionController,
                        maxLines: 5,
                        decoration: _inputDecoration(
                          context,
                        labelText: CopyService.instance.t(
                          'screen.strategy_create.subscription_config',
                          fallback: 'Subscription config (JSON)',
                        ),
                          errorText: _subscriptionError,
                        ),
                        onChanged: (_) => _scheduleSubscriptionValidation(),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _isSubmitting ? null : _handleSubmit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : CopyText('screen.strategy_create.create_strategy', fallback: "Create strategy"),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(
    BuildContext context, {
    String? labelText,
    String? hintText,
    String? errorText,
    Widget? suffixIcon,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderColor = isDark
        ? Colors.grey[850]!
        : Colors.grey.withValues(alpha: 0.15);
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
        borderSide: BorderSide(
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String? helperText;
  final Widget child;

  const _SectionCard({
    required this.title,
    this.helperText,
    required this.child,
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
            offset: const Offset(0, 6),
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
                      .surfaceContainerHighest
                      .withValues(alpha: 0.6),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.tune,
                  size: 16,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          if (helperText != null) ...[
            const SizedBox(height: 4),
            Text(
              helperText!,
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).hintColor,
              ),
            ),
          ],
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

}

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
            borderSide: BorderSide(
              color: Colors.grey.withValues(alpha: 0.15),
            ),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(
              color: Colors.grey.withValues(alpha: 0.15),
            ),
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

    if (selected != null) {
      onChanged(selected);
    }
  }
}

class _StrategyTypePickerSheet extends StatefulWidget {
  final List<_StrategyTypeOption> options;

  const _StrategyTypePickerSheet({required this.options});

  @override
  State<_StrategyTypePickerSheet> createState() =>
      _StrategyTypePickerSheetState();
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

  List<_StrategyTypeOption> get _filteredOptions {
    if (_query.trim().isEmpty) return widget.options;
    final lower = _query.trim().toLowerCase();
    return widget.options
        .where(
          (option) =>
              option.name.toLowerCase().contains(lower) ||
              option.type.toLowerCase().contains(lower) ||
              (option.description?.toLowerCase().contains(lower) ?? false),
        )
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
                      child: CopyText('screen.strategy_create.select_strategy_type', fallback: "Select strategy type", style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
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
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: CopyService.instance.t(
                      'screen.strategy_create.search_strategies',
                      fallback: 'Search strategies',
                    ),
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
                child: _filteredOptions.isEmpty
                    ? Center(
                        child: CopyText('screen.strategy_create.no_strategies_found', fallback: "No strategies found", style:
                              Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    color: Theme.of(context).hintColor,
                                  ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        itemCount: _filteredOptions.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final option = _filteredOptions[index];
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
                                    Text(
                                      option.name,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyLarge
                                          ?.copyWith(
                                            fontWeight: FontWeight.w600,
                                          ),
                                    ),
                                    if (option.description != null &&
                                        option.description!.isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        option.description!,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                              color:
                                                  Theme.of(context).hintColor,
                                            ),
                                      ),
                                    ],
                                    const SizedBox(height: 6),
                                    Text(
                                      option.type,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color:
                                                Theme.of(context).hintColor,
                                          ),
                                    ),
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

class _SymbolPickerSheet extends StatefulWidget {
  final String title;
  final List<String> defaultSymbols;
  final List<_SymbolTicker> tickers;
  final bool loading;
  final String? errorMessage;
  final String? initialQuery;

  const _SymbolPickerSheet({
    required this.title,
    required this.defaultSymbols,
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

  List<String> get _filteredSymbols {
    if (_query.trim().isEmpty) return widget.defaultSymbols;
    final lower = _query.trim().toLowerCase();
    return widget.defaultSymbols
        .where((symbol) => symbol.toLowerCase().contains(lower))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedPadding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
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
            height: MediaQuery.of(context).size.height * 0.85,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.title,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
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
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: CopyService.instance.t(
                        'common.search_placeholder',
                        fallback: 'Search...',
                      ),
                      prefixIcon: const Icon(Icons.search),
                      filled: true,
                      fillColor: isDark ? Colors.grey[850] : Colors.grey[100],
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onChanged: (value) => setState(() => _query = value),
                  ),
                ),
                Expanded(
                  child: widget.loading
                      ? const Center(child: CircularProgressIndicator())
                      : _buildSymbolList(context),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSymbolList(BuildContext context) {
    if (widget.errorMessage != null && widget.tickers.isEmpty) {
      return Center(
        child: Text(
          widget.errorMessage!,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).hintColor,
              ),
        ),
      );
    }

    final list = _filteredSymbols;
    if (list.isEmpty) {
      return Center(
        child: CopyText('screen.product_detail.no_symbols_found', fallback: "No symbols found", style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).hintColor,
              ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      itemCount: list.length,
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final symbol = list[index];
        final ticker = widget.tickers.firstWhere(
          (item) => item.symbol == symbol,
          orElse: () => _SymbolTicker(symbol: symbol),
        );
        return _SymbolListTile(
          ticker: ticker,
          onTap: () => Navigator.pop(context, symbol),
        );
      },
    );
  }
}

class _SymbolTicker {
  final String symbol;
  final double? price;
  final double? change24h;
  final String? exchange;

  const _SymbolTicker({
    required this.symbol,
    this.price,
    this.change24h,
    this.exchange,
  });

  factory _SymbolTicker.fromJson(Map<String, dynamic> json) {
    return _SymbolTicker(
      symbol: json['symbol'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble(),
      change24h: (json['change24h'] as num?)?.toDouble(),
      exchange: json['exchange'] as String?,
    );
  }
}

class _SymbolListTile extends StatelessWidget {
  final _SymbolTicker ticker;
  final VoidCallback onTap;

  const _SymbolListTile({
    required this.ticker,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final base = ticker.symbol.split('/').first;
    final price = ticker.price;
    final change = ticker.change24h;
    final changeColor = (change ?? 0) >= 0 ? Colors.green : Colors.red;
    final subtitle = ticker.exchange?.isNotEmpty == true
        ? ticker.exchange!.toUpperCase()
        : '24h';

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Image.network(
                CryptoIcons.getIconUrl(base),
                width: 28,
                height: 28,
                errorBuilder: (context, error, stackTrace) => Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      base.substring(0, 1).toUpperCase(),
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      ticker.symbol,
                      style: Theme.of(context)
                          .textTheme
                          .bodyLarge
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).hintColor,
                          ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    price == null ? '--' : price.toStringAsFixed(4),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: 4),
                  change == null
                      ? CopyText('screen.product_detail.text', fallback: "--", style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).hintColor,
                                fontWeight: FontWeight.w600,
                              ),
                        )
                      : Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              change >= 0
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
                                    '${change >= 0 ? '+' : ''}${change.toStringAsFixed(2)}',
                              },
                              fallback: '{{percent}}%',
                              style:
                                  Theme.of(context).textTheme.bodySmall?.copyWith(
                                        color: changeColor,
                                        fontWeight: FontWeight.w600,
                                      ),
                            ),
                          ],
                        ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
