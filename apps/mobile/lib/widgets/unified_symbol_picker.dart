import 'package:flutter/material.dart';

import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';

/// A single entry in the shared symbol picker.
///
/// [symbol] MUST be the UNIFIED CCXT symbol (`BTC/USDT` spot, `BTC/USDT:USDT`
/// perpetual). The picker only ever *displays* the exchange-native form; the
/// value it returns on selection is this unified symbol, so the perpetual
/// `:QUOTE` marker is never lost on the way to the backend (which classifies
/// spot vs perpetual by that marker via `detectMarketType`).
class SymbolPickerItem {
  final String symbol;
  final String marketType; // 'spot' | 'perpetual'
  final String? exchange;
  final double? price;
  final double? changePercent;
  final double? volume24h;
  final String? iconUrl;

  const SymbolPickerItem({
    required this.symbol,
    this.marketType = 'spot',
    this.exchange,
    this.price,
    this.changePercent,
    this.volume24h,
    this.iconUrl,
  });
}

/// Shared bottom-sheet symbol selector for EVERY screen that asks a user to
/// pick a trading pair (strategy create/edit, place order, etc.).
///
/// Two loading modes — both return the UNIFIED symbol on selection:
///
/// * **Pre-loaded** (`[items]` set, `[loadForMarketType]` null): caller loads a
///   combined symbol list once and hands it in. The sheet renders an
///   `All / Spot / Perp` filter that narrows the list locally. (strategy)
///
/// * **Lazy per market-type** (`[loadForMarketType]` set): caller reloads each
///   market type on demand (e.g. the order screen fetches a different set of
///   exchange tickers for SPOT vs SWAP). The sheet renders a `Spot / Perp`
///   toggle and calls `[loadForMarketType]` to fetch fresh items on switch.
///   (place order)
///
/// The only exchange-specific concern inside this widget is the DISPLAY
/// transform (unified -> exchange-native text). The submitted value is always
/// the unchanged unified `[SymbolPickerItem.symbol]`.
class UnifiedSymbolPicker {
  static Future<SymbolPickerItem?> show({
    required BuildContext context,
    required String title,
    required String exchange,
    String initialSymbol = '',
    List<SymbolPickerItem>? items,
    Future<List<SymbolPickerItem>> Function(String marketType)?
        loadForMarketType,
    String initialMarketType = 'spot',
    bool initialLoading = false,
    String? initialError,
  }) {
    final lazy = loadForMarketType != null;
    return showModalBottomSheet<SymbolPickerItem>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _SymbolPickerSheet(
        title: title,
        exchange: exchange,
        initialSymbol: initialSymbol,
        initialItems: items ?? const [],
        loadForMarketType: loadForMarketType,
        initialMarketType: initialMarketType,
        initialLoading: initialLoading,
        initialError: initialError,
        lazy: lazy,
      ),
    );
  }
}

class _SymbolPickerSheet extends StatefulWidget {
  final String title;
  final String exchange;
  final String initialSymbol;
  final List<SymbolPickerItem> initialItems;

  /// When non-null, the sheet is in lazy mode: every Spot/Perp switch calls
  /// this to fetch fresh items (order screen). Otherwise it filters
  /// locally over [initialItems] (strategy screen).
  final Future<List<SymbolPickerItem>> Function(String marketType)?
      loadForMarketType;
  final String initialMarketType;
  final bool lazy;
  final bool initialLoading;
  final String? initialError;

  const _SymbolPickerSheet({
    required this.title,
    required this.exchange,
    required this.initialSymbol,
    required this.initialItems,
    required this.loadForMarketType,
    required this.initialMarketType,
    required this.initialLoading,
    required this.initialError,
    required this.lazy,
  });

  @override
  State<_SymbolPickerSheet> createState() => _SymbolPickerSheetState();
}

class _SymbolPickerSheetState extends State<_SymbolPickerSheet> {
  late List<SymbolPickerItem> _items;
  late String _marketType; // 'all' | 'spot' | 'perpetual'
  String _query = '';
  bool _loading = false;
  String? _error;

  bool get _lazy => widget.loadForMarketType != null;

  @override
  void initState() {
    super.initState();
    _items = widget.initialItems;
    _marketType = widget.lazy ? widget.initialMarketType : 'all';
    _query = widget.initialSymbol;
    if (_lazy) {
      // Kick off the initial load for the seeded market type.
      _loadForMarketType(_marketType);
    } else {
      // Pre-loaded mode: surface the caller's initial fetch state so the
      // sheet can show a spinner / error while the items were still loading.
      _loading = widget.initialLoading;
      _error = widget.initialError;
    }
  }

  Future<void> _loadForMarketType(String marketType) async {
    final loader = widget.loadForMarketType;
    if (loader == null) return;
    setState(() {
      _marketType = marketType;
      _loading = true;
      _error = null;
      _items = const [];
    });
    try {
      final fresh = await loader(marketType);
      if (!mounted) return;
      setState(() {
        _items = fresh;
        _loading = false;
        _error = fresh.isEmpty ? 'No trading pairs available' : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  /// Display-only transform: unified -> exchange-native (e.g. BTC/USDT:USDT ->
  /// BTCUSDT for Binance). The submitted value keeps the unified symbol.
  String _nativeSymbol(String ccxtSymbol) =>
      SupportedExchanges.normalizeSymbol(ccxtSymbol, widget.exchange);

  List<SymbolPickerItem> get _visible {
    var list = _items;
    if (_lazy) {
      // Items are already scoped to the active market type by the loader.
      list = list.where((t) => t.marketType == _marketType).toList();
    } else if (_marketType != 'all') {
      list = list.where((t) => t.marketType == _marketType).toList();
    }
    if (_query.trim().isEmpty) return list;
    final lower = _query.trim().toLowerCase();
    return list.where((t) {
      return t.symbol.toLowerCase().contains(lower) ||
          _nativeSymbol(t.symbol).toLowerCase().contains(lower);
    }).toList();
  }

  bool get _hasPerp => _items.any((t) => t.marketType == 'perpetual');
  bool get _hasSpot => _items.any((t) => t.marketType == 'spot');

  void _onMarketTypeTap(String marketType) {
    if (_lazy) {
      if (marketType == _marketType) return;
      _loadForMarketType(marketType);
    } else {
      setState(() => _marketType = marketType);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Show the Spot/Perp filter only when there is more than one product type
    // to choose from.
    final showFilter = _lazy || (_hasSpot && _hasPerp);

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
                              style: Theme.of(context).textTheme.titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            if (!_loading && _items.isNotEmpty)
                              Text(
                                '${_items.length} pairs',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: Theme.of(context).hintColor,
                                    ),
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
                if (showFilter)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: Row(
                      children: [
                        if (!_lazy)
                          _FilterChip(
                            label: 'All',
                            selected: _marketType == 'all',
                            onTap: () => _onMarketTypeTap('all'),
                          ),
                        if (!_lazy) const SizedBox(width: 8),
                        _FilterChip(
                          label: 'Spot',
                          selected: _marketType == 'spot',
                          onTap: () => _onMarketTypeTap('spot'),
                        ),
                        const SizedBox(width: 8),
                        _FilterChip(
                          label: 'Perp',
                          selected: _marketType == 'perpetual',
                          onTap: () => _onMarketTypeTap('perpetual'),
                        ),
                      ],
                    ),
                  ),

                // ── Search ───────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: TextField(
                    controller: TextEditingController(text: _query),
                    onChanged: (v) => setState(() => _query = v),
                    style: TextStyle(
                      color: isDark ? Colors.white : Colors.black87,
                      fontSize: 14,
                    ),
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 16,
                      ),
                      hintText: 'Search...',
                      hintStyle: TextStyle(
                        color: isDark ? Colors.grey[500] : Colors.grey[600],
                        fontSize: 14,
                      ),
                      prefixIcon: Icon(
                        Icons.search,
                        color: isDark ? Colors.grey[400] : Colors.grey[600],
                        size: 20,
                      ),
                      suffixIcon: _query.isEmpty
                          ? null
                          : IconButton(
                              icon: Icon(
                                Icons.clear,
                                color: isDark
                                    ? Colors.grey[400]
                                    : Colors.grey[600],
                                size: 20,
                              ),
                              onPressed: () => setState(() => _query = ''),
                            ),
                      filled: true,
                      fillColor: isDark ? Colors.grey[850] : Colors.grey[100],
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(
                          color: isDark ? Colors.grey[700]! : Colors.grey[300]!,
                          width: 1.0,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(
                          color: Theme.of(
                            context,
                          ).colorScheme.primary.withValues(alpha: 0.5),
                          width: 2.0,
                        ),
                      ),
                    ),
                  ),
                ),

                // ── List ─────────────────────────────────────────────────
                Expanded(child: _buildList(isDark: isDark)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildList({required bool isDark}) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _items.isEmpty) {
      return Center(
        child: Text(
          _error!,
          style: TextStyle(
            color: isDark ? Colors.grey[400] : Colors.grey[600],
            fontSize: 12,
          ),
        ),
      );
    }
    final visible = _visible;
    if (visible.isEmpty) {
      return Center(
        child: Text(
          'No pairs found',
          style: TextStyle(
            color: isDark ? Colors.grey[400] : Colors.grey[600],
          ),
        ),
      );
    }
    return ListView.builder(
      itemCount: visible.length,
      itemBuilder: (_, i) {
        final item = visible[i];
        return _SymbolListTile(
          item: item,
          displaySymbol: _nativeSymbol(item.symbol),
          selected: item.symbol == widget.initialSymbol,
          onTap: () => Navigator.pop(context, item),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbol List Tile
// ─────────────────────────────────────────────────────────────────────────────

class _SymbolListTile extends StatelessWidget {
  final SymbolPickerItem item;

  /// Exchange-native display string, e.g. "BTCUSDT" or "BTC-USDT".
  /// Display only — the returned value is [SymbolPickerItem.symbol] (unified).
  final String displaySymbol;
  final bool selected;
  final VoidCallback onTap;

  const _SymbolListTile({
    required this.item,
    required this.displaySymbol,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final price = item.price;
    final change = item.changePercent;
    final isPositive = (change ?? 0) >= 0;
    final changeColor = isPositive
        ? const Color(0xFF10B981)
        : const Color(0xFFEF4444);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: selected
              ? Theme.of(context)
                  .colorScheme
                  .primary
                  .withValues(alpha: 0.08)
              : null,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
        child: Row(
          children: [
            _CoinAvatar(symbol: item.symbol, size: 38),
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
                      _MarketTypeBadge(marketType: item.marketType),
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
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
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
// Coin Avatar
// ─────────────────────────────────────────────────────────────────────────────

class _CoinAvatar extends StatelessWidget {
  final String symbol;
  final double size;

  const _CoinAvatar({required this.symbol, required this.size});

  String get _base =>
      symbol.split('/').firstOrNull ??
      symbol.split('-').firstOrNull ??
      symbol;

  @override
  Widget build(BuildContext context) {
    final base = _base;
    return SizedBox(
      width: size,
      height: size,
      child: ClipOval(
        child: Image.network(
          CryptoIcons.getIconUrl(base),
          width: size,
          height: size,
          errorBuilder: (_, _, _) => Container(
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
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Chip
// ─────────────────────────────────────────────────────────────────────────────

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
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
              : (isDark
                    ? Colors.grey[850]
                    : Colors.grey.withValues(alpha: 0.1)),
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