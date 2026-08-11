import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../models/trading_pair.dart';
import '../services/admin_service.dart';
import '../services/copy_service.dart';
import '../widgets/app_switch.dart';
import '../widgets/copy_text.dart';

/// Admin screen to manage supported trading pairs across exchanges
/// (mirror of the web console's `/admin/trading-pairs` page).
///
/// UX:
/// - Search bar + horizontal filter chips: exchange / type / status
/// - Pull-to-refresh list; per-row active toggle, edit & delete actions
/// - "+ Add pair" opens a modal bottom-sheet form (same sheet used to edit)
class AdminTradingPairsScreen extends StatefulWidget {
  const AdminTradingPairsScreen({super.key});

  @override
  State<AdminTradingPairsScreen> createState() =>
      _AdminTradingPairsScreenState();
}

class _AdminTradingPairsScreenState extends State<AdminTradingPairsScreen> {
  static const _knownExchanges = ['binance', 'coinbase', 'okx'];

  bool _loading = true;
  List<TradingPair> _pairs = const [];

  String _search = '';
  String _exchangeFilter = 'all';
  String _typeFilter = 'all';
  String _statusFilter = 'all'; // 'all' | 'active' | 'inactive'

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final pairs = await AdminService.instance.fetchTradingPairs();
    if (!mounted) return;
    setState(() {
      _pairs = pairs;
      _loading = false;
    });
  }

  List<TradingPair> get _filtered {
    final query = _search.trim().toLowerCase();
    return _pairs.where((pair) {
      final matchesSearch =
          query.isEmpty ||
          pair.symbol.toLowerCase().contains(query) ||
          (pair.name?.toLowerCase().contains(query) ?? false);
      final matchesExchange =
          _exchangeFilter == 'all' || pair.exchange == _exchangeFilter;
      final matchesType = _typeFilter == 'all' || pair.type == _typeFilter;
      final matchesStatus =
          _statusFilter == 'all' ||
          (_statusFilter == 'active' ? pair.isActive : !pair.isActive);
      return matchesSearch && matchesExchange && matchesType && matchesStatus;
    }).toList();
  }

  void _showMessage(String key, String fallback, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: CopyText(key, fallback: fallback),
        backgroundColor: isError
            ? Colors.red
            : Theme.of(context).colorScheme.primary,
      ),
    );
  }

  Future<void> _openEditor({TradingPair? pair}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => _TradingPairEditorSheet(pair: pair),
    );
    if (saved == true) {
      await _load();
    }
  }

  Future<void> _toggleActive(TradingPair pair) async {
    final result = await AdminService.instance.updateTradingPair(pair.id, {
      'isActive': !pair.isActive,
    });
    if (!mounted) return;
    if (result.success) {
      setState(() {
        _pairs = _pairs
            .map(
              (p) =>
                  p.id == pair.id ? p.copyWith(isActive: !pair.isActive) : p,
            )
            .toList();
      });
      _showMessage(
        !pair.isActive
            ? 'screen.admin_trading_pairs.activated'
            : 'screen.admin_trading_pairs.deactivated',
        !pair.isActive ? 'Pair activated' : 'Pair deactivated',
      );
    } else {
      _showMessage(
        'screen.admin_trading_pairs.update_failed',
        result.message ?? 'Failed to update status',
        isError: true,
      );
    }
  }

  Future<void> _confirmDelete(TradingPair pair) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const CopyText(
          'screen.admin_trading_pairs.delete_title',
          fallback: 'Delete trading pair',
        ),
        content: CopyText(
          'screen.admin_trading_pairs.delete_body',
          params: {'symbol': pair.symbol, 'exchange': pair.exchange},
          fallback:
              'Delete {{symbol}} ({{exchange}})? This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const CopyText('common.cancel', fallback: 'Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const CopyText('common.delete', fallback: 'Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final result = await AdminService.instance.deleteTradingPair(pair.id);
    if (!mounted) return;
    if (result.success) {
      setState(() => _pairs = _pairs.where((p) => p.id != pair.id).toList());
      _showMessage(
        'screen.admin_trading_pairs.deleted',
        'Trading pair deleted',
      );
    } else {
      _showMessage(
        'screen.admin_trading_pairs.delete_failed',
        result.message ?? 'Failed to delete trading pair',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filtered = _filtered;
    return Scaffold(
      appBar: AppBar(
        title: const CopyText(
          'screen.admin_trading_pairs.title',
          fallback: 'Trading Pairs',
        ),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: const CopyText(
          'screen.admin_trading_pairs.add_pair',
          fallback: 'Add pair',
        ),
      ),
      body: Column(
        children: [
          _buildSearchBar(isDark),
          _buildFilters(isDark),
          const SizedBox(height: 4),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                ? _buildEmptyState(isDark)
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: EdgeInsets.fromLTRB(16.w, 4, 16.w, 96.w),
                      itemCount: filtered.length,
                      separatorBuilder: (_, index) => SizedBox(height: 8.w),
                      itemBuilder: (context, index) =>
                          _buildPairCard(filtered[index], isDark),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar(bool isDark) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 8, 16.w, 4),
      child: TextField(
        decoration: InputDecoration(
          hintText: CopyService.instance.t(
            'screen.admin_trading_pairs.search_hint',
            fallback: 'Search symbol or name...',
          ),
          prefixIcon: const Icon(Icons.search),
          isDense: true,
          filled: true,
          fillColor: isDark ? Colors.grey[900] : Colors.grey.withOpacity(0.08),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
        ),
        onChanged: (value) => setState(() => _search = value),
      ),
    );
  }

  Widget _buildFilters(bool isDark) {
    final exchanges = <String>{
      ..._knownExchanges,
      ..._pairs.map((p) => p.exchange),
    }.toList()..sort();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildChipRow(
          values: ['all', ...exchanges],
          selected: _exchangeFilter,
          labelBuilder: (v) => v == 'all' ? 'All exchanges' : v,
          onSelected: (v) => setState(() => _exchangeFilter = v),
        ),
        _buildChipRow(
          values: const ['all', 'spot', 'perpetual'],
          selected: _typeFilter,
          labelBuilder: (v) => v == 'all' ? 'All types' : v,
          onSelected: (v) => setState(() => _typeFilter = v),
        ),
        _buildChipRow(
          values: const ['all', 'active', 'inactive'],
          selected: _statusFilter,
          labelBuilder: (v) => v == 'all' ? 'All status' : v,
          onSelected: (v) => setState(() => _statusFilter = v),
        ),
      ],
    );
  }

  Widget _buildChipRow({
    required List<String> values,
    required String selected,
    required String Function(String) labelBuilder,
    required ValueChanged<String> onSelected,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 3),
      child: Row(
        children: [
          for (final value in values) ...[
            ChoiceChip(
              label: Text(
                value == 'all'
                    ? labelBuilder(value)
                    : value[0].toUpperCase() + value.substring(1),
                style: TextStyle(fontSize: 12.sp),
              ),
              selected: selected == value,
              onSelected: (_) => onSelected(value),
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            SizedBox(width: 8.w),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyState(bool isDark) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(32.w),
        child: CopyText(
          'screen.admin_trading_pairs.empty',
          fallback: 'No trading pairs match your filters.',
          style: TextStyle(color: Colors.grey[600], fontSize: 14.sp),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildPairCard(TradingPair pair, bool isDark) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white.withOpacity(0.6),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? Colors.grey[850]! : Colors.grey.withOpacity(0.1),
        ),
      ),
      padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pair.symbol,
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (pair.name != null && pair.name!.isNotEmpty)
                  Text(
                    pair.name!,
                    style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    _buildBadge(pair.exchange, isDark),
                    SizedBox(width: 6.w),
                    _buildBadge(pair.type, isDark, outlined: true),
                  ],
                ),
              ],
            ),
          ),
          AppSwitch(
            value: pair.isActive,
            onChanged: (_) => _toggleActive(pair),
          ),
          SizedBox(width: 4.w),
          PopupMenuButton<String>(
            tooltip: '',
            icon: Icon(Icons.more_vert, size: 20.w, color: Colors.grey[500]),
            onSelected: (value) {
              if (value == 'edit') {
                _openEditor(pair: pair);
              } else if (value == 'delete') {
                _confirmDelete(pair);
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'edit',
                child: ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.edit_outlined),
                  title: CopyText(
                    'common.edit',
                    fallback: 'Edit',
                  ),
                ),
              ),
              const PopupMenuItem(
                value: 'delete',
                child: ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.delete_outline, color: Colors.red),
                  title: CopyText(
                    'common.delete',
                    fallback: 'Delete',
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBadge(String label, bool isDark, {bool outlined = false}) {
    final color = Theme.of(context).colorScheme.primary;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 2),
      decoration: BoxDecoration(
        color: outlined ? Colors.transparent : color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: outlined
            ? Border.all(color: Colors.grey.withOpacity(0.4))
            : null,
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11.sp,
          color: outlined ? Colors.grey[600] : color,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _TradingPairEditorSheet extends StatefulWidget {
  final TradingPair? pair;

  const _TradingPairEditorSheet({this.pair});

  @override
  State<_TradingPairEditorSheet> createState() =>
      _TradingPairEditorSheetState();
}

class _TradingPairEditorSheetState extends State<_TradingPairEditorSheet> {
  static const _knownExchanges = ['binance', 'coinbase', 'okx'];

  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _symbolController;
  late final TextEditingController _nameController;
  late final TextEditingController _baseAssetController;
  late final TextEditingController _quoteAssetController;
  late final TextEditingController _basePrecisionController;
  late final TextEditingController _quotePrecisionController;
  late String _exchange;
  late String _type;
  late bool _isActive;
  bool _submitting = false;

  bool get _isEditing => widget.pair != null;

  @override
  void initState() {
    super.initState();
    final pair = widget.pair;
    _symbolController = TextEditingController(text: pair?.symbol ?? '');
    _nameController = TextEditingController(text: pair?.name ?? '');
    _baseAssetController = TextEditingController(
      text: pair?.baseAsset ?? '',
    );
    _quoteAssetController = TextEditingController(
      text: pair?.quoteAsset ?? '',
    );
    _basePrecisionController = TextEditingController(
      text: '${pair?.baseAssetPrecision ?? 8}',
    );
    _quotePrecisionController = TextEditingController(
      text: '${pair?.quoteAssetPrecision ?? 8}',
    );
    _exchange = pair?.exchange ?? 'binance';
    _type = pair?.type ?? 'spot';
    _isActive = pair?.isActive ?? true;
  }

  @override
  void dispose() {
    _symbolController.dispose();
    _nameController.dispose();
    _baseAssetController.dispose();
    _quoteAssetController.dispose();
    _basePrecisionController.dispose();
    _quotePrecisionController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    final payload = <String, dynamic>{
      'symbol': _symbolController.text.trim(),
      'name': _nameController.text.trim(),
      'baseAsset': _baseAssetController.text.trim(),
      'quoteAsset': _quoteAssetController.text.trim(),
      'exchange': _exchange,
      'type': _type,
      'isActive': _isActive,
      'baseAssetPrecision':
          int.tryParse(_basePrecisionController.text.trim()) ?? 8,
      'quoteAssetPrecision':
          int.tryParse(_quotePrecisionController.text.trim()) ?? 8,
    };
    final result = _isEditing
        ? await AdminService.instance.updateTradingPair(
            widget.pair!.id,
            payload,
          )
        : await AdminService.instance.createTradingPair(payload);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (result.success) {
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: CopyText(
            _isEditing
                ? 'screen.admin_trading_pairs.updated'
                : 'screen.admin_trading_pairs.created',
            fallback: _isEditing
                ? 'Trading pair updated'
                : 'Trading pair created',
          ),
          backgroundColor: Theme.of(context).colorScheme.primary,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: CopyText(
            'screen.admin_trading_pairs.save_failed',
            params: {'error': result.message ?? ''},
            fallback: 'Failed to save trading pair{{error}}',
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: EdgeInsets.only(
        left: 20.w,
        right: 20.w,
        top: 4,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CopyText(
                _isEditing
                    ? 'screen.admin_trading_pairs.edit_title'
                    : 'screen.admin_trading_pairs.add_title',
                fallback: _isEditing ? 'Edit Trading Pair' : 'Add Trading Pair',
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              CopyText(
                'screen.admin_trading_pairs.form_subtitle',
                fallback: 'Set the symbol and assets for the trading pair.',
                style: TextStyle(fontSize: 13.sp, color: Colors.grey[600]),
              ),
              const SizedBox(height: 16),
              _buildTextField(
                controller: _symbolController,
                label: CopyService.instance.t(
                  'screen.admin_trading_pairs.field_symbol',
                  fallback: 'Symbol',
                ),
                hint: 'BTC/USDT',
                required: true,
              ),
              SizedBox(height: 12.w),
              _buildTextField(
                controller: _nameController,
                label: CopyService.instance.t(
                  'screen.admin_trading_pairs.field_name',
                  fallback: 'Name',
                ),
                hint: 'Bitcoin / Tether',
              ),
              SizedBox(height: 12.w),
              _buildDropdown<String>(
                label: CopyService.instance.t(
                  'screen.admin_trading_pairs.field_exchange',
                  fallback: 'Exchange',
                ),
                value: _exchange,
                items: {
                  ..._knownExchanges,
                  if (!_knownExchanges.contains(_exchange)) _exchange,
                }.toList(),
                labelBuilder: (v) => v[0].toUpperCase() + v.substring(1),
                onChanged: (v) => setState(() => _exchange = v!),
              ),
              SizedBox(height: 12.w),
              CopyText(
                'screen.admin_trading_pairs.field_type',
                fallback: 'Type',
                style: TextStyle(fontSize: 13.sp, color: Colors.grey[700]),
              ),
              const SizedBox(height: 6),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(
                    value: 'spot',
                    label: CopyText(
                      'screen.admin_trading_pairs.type_spot',
                      fallback: 'Spot',
                    ),
                  ),
                  ButtonSegment(
                    value: 'perpetual',
                    label: CopyText(
                      'screen.admin_trading_pairs.type_perpetual',
                      fallback: 'Perpetual',
                    ),
                  ),
                ],
                selected: {_type},
                onSelectionChanged: (selection) =>
                    setState(() => _type = selection.first),
              ),
              SizedBox(height: 12.w),
              Row(
                children: [
                  Expanded(
                    child: _buildTextField(
                      controller: _baseAssetController,
                      label: CopyService.instance.t(
                        'screen.admin_trading_pairs.field_base_asset',
                        fallback: 'Base asset',
                      ),
                      hint: 'BTC',
                      required: true,
                    ),
                  ),
                  SizedBox(width: 12.w),
                  Expanded(
                    child: _buildTextField(
                      controller: _quoteAssetController,
                      label: CopyService.instance.t(
                        'screen.admin_trading_pairs.field_quote_asset',
                        fallback: 'Quote asset',
                      ),
                      hint: 'USDT',
                      required: true,
                    ),
                  ),
                ],
              ),
              SizedBox(height: 12.w),
              Row(
                children: [
                  Expanded(
                    child: _buildTextField(
                      controller: _basePrecisionController,
                      label: CopyService.instance.t(
                        'screen.admin_trading_pairs.field_base_precision',
                        fallback: 'Base precision',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  SizedBox(width: 12.w),
                  Expanded(
                    child: _buildTextField(
                      controller: _quotePrecisionController,
                      label: CopyService.instance.t(
                        'screen.admin_trading_pairs.field_quote_precision',
                        fallback: 'Quote precision',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              SizedBox(height: 12.w),
              Container(
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.grey[900]
                      : Colors.grey.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 10),
                child: Row(
                  children: [
                    Expanded(
                      child: CopyText(
                        'screen.admin_trading_pairs.active',
                        fallback: 'Active',
                        style: TextStyle(fontSize: 14.sp),
                      ),
                    ),
                    AppSwitch(
                      value: _isActive,
                      onChanged: (v) => setState(() => _isActive = v),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 46.w,
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? SizedBox(
                          width: 18.w,
                          height: 18.w,
                          child: const CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : CopyText(
                          _isEditing
                              ? 'screen.admin_trading_pairs.save_changes'
                              : 'screen.admin_trading_pairs.add_pair',
                          fallback: _isEditing ? 'Save changes' : 'Add pair',
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    String? hint,
    bool required = false,
    TextInputType? keyboardType,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        isDense: true,
      ),
      validator: required
          ? (value) => (value == null || value.trim().isEmpty)
              ? 'Required'
              : null
          : null,
    );
  }

  Widget _buildDropdown<T>({
    required String label,
    required T value,
    required List<T> items,
    required String Function(T) labelBuilder,
    required ValueChanged<T?> onChanged,
  }) {
    return DropdownButtonFormField<T>(
      value: value,
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        isDense: true,
      ),
      items: items
          .map((item) => DropdownMenuItem(value: item, child: Text(labelBuilder(item))))
          .toList(),
      onChanged: onChanged,
    );
  }
}
