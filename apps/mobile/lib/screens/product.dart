import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../widgets/tag_list.dart';
import '../widgets/custom_app_bar.dart';
import '../services/binance_data_service.dart';
import '../services/coinbase_data_service.dart';
import '../services/okx_data_service.dart';
import '../services/copy_service.dart';
import '../models/market_ticker.dart';
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';
import '../utils/responsive_layout.dart';
import '../utils/number_format_utils.dart';
import 'product_detail.dart';
import '../widgets/copy_text.dart';

class ProductScreen extends StatefulWidget {
  const ProductScreen({super.key});

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends State<ProductScreen>
    with AutomaticKeepAliveClientMixin {
  static const String _defaultExchange = 'binance';
  late final OKXDataService _okxService;
  late final BinanceDataService _binanceService;
  late final CoinbaseDataService _coinbaseService;
  String _currentExchange = _defaultExchange;
  Tag _currentTag = Tag(name: 'Spot', value: 'SPOT');
  String _query = '';

  // Separate caches for each tag type - no more flashing!
  final Map<String, List<MarketTicker>> _allTickersByKey = {};
  final Map<String, List<MarketTicker>> _filteredTickersByKey = {};
  final Map<String, bool> _loadingByKey = {};

  late Timer _timer;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _okxService = OKXDataService();
    _binanceService = BinanceDataService();
    _coinbaseService = CoinbaseDataService();
    _loadData();

    // Refresh current tag data periodically
    _timer = Timer.periodic(const Duration(milliseconds: 600), (_) {
      _refreshData();
    });
  }

  String _buildCacheKey(String exchange, String tagValue) {
    return '$exchange:$tagValue';
  }

  List<Tag> _getTagsForExchange(String exchange) {
    final copy = CopyService.instance;
    return [
      Tag(
        name: copy.t('screen.product.filter.spot', fallback: 'Spot'),
        value: 'SPOT',
      ),
      Tag(
        name: copy.t('screen.product.filter.perp', fallback: 'Perp'),
        value: 'PERP',
      ),
    ];
  }

  bool _isPerpTag(String tagValue) {
    return tagValue == 'PERP';
  }

  Future<void> _loadData({bool isRefresh = false}) async {
    final tagValue = _currentTag.value;
    final key = _buildCacheKey(_currentExchange, tagValue);
    final hasCached = _allTickersByKey[key] != null &&
        _allTickersByKey[key]!.isNotEmpty;
    if (mounted && !(isRefresh && hasCached)) {
      setState(() {
        _loadingByKey[key] = true;
      });
    }

    List<MarketTicker> data = [];
    try {
      if (_currentExchange == 'okx') {
        final okxTickers =
            await _okxService.getTickers(_isPerpTag(tagValue) ? 'SWAP' : 'SPOT');
        data = okxTickers.map(_fromOkxTicker).toList();
      } else if (_currentExchange == 'binance') {
        final tickers = await _binanceService.getTickers(
          isSwap: _isPerpTag(tagValue),
          forceRefresh: isRefresh,
        );
        data = tickers.map(_withIcon).toList();
      } else if (_currentExchange == 'coinbase') {
        final tickers = await _coinbaseService.getTickers(
          isSwap: _isPerpTag(tagValue),
          forceRefresh: isRefresh,
        );
        data = tickers.map(_withIcon).toList();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingByKey[key] = false;
        });
      }
      return;
    }

    if (mounted) {
      setState(() {
        _allTickersByKey[key] = data;
        final filtered = data.where((ticker) {
          return ticker.symbol.toLowerCase().contains(_query);
        }).toList();
        _filteredTickersByKey[key] = filtered;
        _sortTickersByTurnover(key, tagValue);
        _loadingByKey[key] = false;
      });
    }
  }

  Future<void> _refreshData() async {
    final tagValue = _currentTag.value;
    final key = _buildCacheKey(_currentExchange, tagValue);
    if (_allTickersByKey[key] == null) return;
    await _loadData(isRefresh: true);
  }

  /// Sort tickers by turnover for better ranking
  /// Use the same logic as display volume for consistency
  void _sortTickersByTurnover(String key, String tagValue) {
    final tickers = _filteredTickersByKey[key];
    if (tickers == null) return;

    tickers.sort((a, b) {
      // Use volCcy24h if populated, otherwise calculate from vol24h * price
      final aTurnover = _calculateDisplayVolume(a, tagValue);
      final bTurnover = _calculateDisplayVolume(b, tagValue);

      return bTurnover.compareTo(aTurnover); // Descending order (highest first)
    });
  }

  /// Calculate display volume based on instrument type
  /// For SPOT: volCcy24h is in quote currency (USD/USDT) - use directly
  /// For derivatives: volCcy24h is in base currency (BTC/ETH) - multiply by price
  double _calculateDisplayVolume(MarketTicker ticker, String tagValue) {
    final volume = ticker.volume24h ?? 0;
    if (volume <= 0) {
      return 0; // No valid volume data
    }

    // For SPOT: volCcy24h is already in quote currency (USD/USDT)
    if (tagValue == 'SPOT') {
      return volume;
    }

    // For derivatives (SWAP/FUTURES/OPTION): volCcy24h is in base currency
    // Convert to quote currency by multiplying by price
    return volume * (ticker.last ?? 0);
  }

  MarketTicker _fromOkxTicker(OKXTicker ticker) {
    return MarketTicker(
      symbol: ticker.instId,
      last: ticker.last,
      open24h: ticker.open24h,
      volume24h: ticker.volCcy24h,
      exchange: 'OKX',
      iconUrl: ticker.iconUrl,
    );
  }

  MarketTicker _withIcon(MarketTicker ticker) {
    if (ticker.iconUrl != null && ticker.iconUrl!.isNotEmpty) {
      return ticker;
    }
    return ticker.copyWith(
      iconUrl: CryptoIcons.getIconUrl(
        ticker.symbol,
        exchangeId: ticker.exchange,
      ),
    );
  }

  double? _getChangePercent(MarketTicker ticker) {
    if (ticker.changePercent != null) return ticker.changePercent;
    final last = ticker.last;
    final open = ticker.open24h;
    if (last == null || open == null || open == 0) return null;
    return ((last - open) / open) * 100;
  }

  void _changeExchange(String exchange) {
    if (exchange == _currentExchange) return;
    final nextTags = _getTagsForExchange(exchange);
    final nextTag = nextTags.first;
    setState(() {
      _currentExchange = exchange;
      _currentTag = nextTag;
    });
    if (_scrollController.hasClients) {
      _scrollController.jumpTo(0);
    }
    final key = _buildCacheKey(exchange, nextTag.value);
    if (_allTickersByKey[key] == null) {
      _loadData();
    }
  }

  void _showExchangeSheet() {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;
    final exchanges = SupportedExchanges.all
        .where((exchange) => exchange.id == 'binance' || exchange.id == 'okx')
        .toList();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return Container(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).padding.bottom,
          ),
          decoration: BoxDecoration(
            color: isDarkMode ? Colors.grey[900] : Colors.white,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(20),
              topRight: Radius.circular(20),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                margin: EdgeInsets.only(top: 10.w, bottom: 6.w),
                width: 40.w,
                height: 4.w,
                decoration: BoxDecoration(
                  color: isDarkMode ? Colors.grey[700] : Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 6.w),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Select Exchange',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w600,
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
              const Divider(height: 1),
              ...exchanges.map((exchange) {
                final isSelected = exchange.id == _currentExchange;
                return ListTile(
                  onTap: () {
                    Navigator.pop(context);
                    _changeExchange(exchange.id);
                  },
                  leading: exchange.getLogoUrl() != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: Image.network(
                            exchange.getLogoUrl()!,
                            width: 28.w,
                            height: 28.w,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) =>
                                Icon(exchange.icon, color: exchange.color),
                          ),
                        )
                      : Icon(exchange.icon, color: exchange.color),
                  title: Text(
                    exchange.name,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: isDarkMode ? Colors.white : Colors.black87,
                    ),
                  ),
                  subtitle: Text(
                    exchange.description,
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: isDarkMode ? Colors.grey[400] : Colors.grey[600],
                    ),
                  ),
                  trailing: isSelected
                      ? Icon(Icons.check_circle, color: exchange.color)
                      : null,
                );
              }),
              SizedBox(height: 8.w),
            ],
          ),
        );
      },
    );
  }

  Widget _buildExchangeTitle() {
    final config = SupportedExchanges.getById(_currentExchange);
    final color = config?.color ?? Colors.grey;
    final logoUrl = config?.getLogoUrl();
    return GestureDetector(
      onTap: _showExchangeSheet,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (logoUrl != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Image.network(
                logoUrl,
                width: 20.w,
                height: 20.w,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) =>
                    Icon(config?.icon ?? Icons.swap_horiz, size: 20.w),
              ),
            )
          else
            Icon(config?.icon ?? Icons.swap_horiz, size: 20.w, color: color),
          SizedBox(width: 8.w),
          Text(
            config?.name ?? _currentExchange.toUpperCase(),
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          SizedBox(width: 4.w),
          Icon(
            Icons.keyboard_arrow_down,
            size: 20.w,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ],
      ),
    );
  }

  void _handleQuery(String query) {
    final lowerQuery = query.trim().toLowerCase();
    if (_query != lowerQuery) {
      setState(() {
        _query = lowerQuery;

        // Re-filter all cached tag data with new query
        for (final entry in _allTickersByKey.entries) {
          final key = entry.key;
          final allTickers = entry.value;

          final filtered = allTickers.where((ticker) {
            return ticker.symbol.toLowerCase().contains(_query);
          }).toList();

          _filteredTickersByKey[key] = filtered;
          final tagValue = key.split(':').last;
          _sortTickersByTurnover(key, tagValue);
        }
      });
    }
  }

  /// Get filtered tickers for current tag
  List<MarketTicker> _getCurrentFilteredTickers() {
    final key = _buildCacheKey(_currentExchange, _currentTag.value);
    return _filteredTickersByKey[key] ?? [];
  }

  /// Get all tickers for current tag
  List<MarketTicker> _getCurrentAllTickers() {
    final key = _buildCacheKey(_currentExchange, _currentTag.value);
    return _allTickersByKey[key] ?? [];
  }

  @override
  bool get wantKeepAlive => true;

  bool _shouldUseTabletLayout(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;
    final isTablet = ResponsiveLayout.isTablet(context);

    // iPad detection: Use tablet layout if screen is large enough OR if it's clearly iPad dimensions
    final isLargeScreen =
        screenWidth >= 600 ||
        (screenWidth > 800 && screenHeight > 1000) ||
        (screenWidth > 1000 && screenHeight > 800);

    return isTablet || isLargeScreen;
  }

  @override
  void dispose() {
    _timer.cancel();
    _scrollController.dispose();
    _okxService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // Required for AutomaticKeepAliveClientMixin
    final List<Tag> tags = _getTagsForExchange(_currentExchange);
    final currentTag = tags.firstWhere(
      (tag) => tag.value == _currentTag.value,
      orElse: () => tags.first,
    );

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: CustomAppBar(
        titleWidget: _buildExchangeTitle(),
        showScanner: false,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SimpleSearchBar(
            onChanged: (query) {
              _handleQuery(query);
            },
            onSubmitted: (query) {
              _handleQuery(query);
            },
          ),
          SizedBox(height: 16.w),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w), // ✅ Width-adapted
            child: TagList(
              tags: tags,
              currentTag: currentTag,
              onTap: (tag) async {
                if (_currentTag.value != tag.value) {
                  setState(() {
                    _currentTag = tag;
                  });

                  // Reset scroll position to top when switching tags
                  if (_scrollController.hasClients) {
                    _scrollController.jumpTo(0);
                  }

                  // Only load if this tag hasn't been loaded yet
                  final key = _buildCacheKey(_currentExchange, tag.value);
                  if (_allTickersByKey[key] == null) {
                    await _loadData();
                  }
                }
              },
            ),
          ),
          SizedBox(height: 16.w),

          // Check loading state for current tag
          if (_loadingByKey[
                  _buildCacheKey(_currentExchange, _currentTag.value)] ==
              true)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_getCurrentFilteredTickers().isEmpty &&
              _getCurrentAllTickers().isEmpty)
            // No data loaded yet for this tag (shouldn't happen with proper init)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_getCurrentFilteredTickers().isEmpty)
            // Search filtered everything out
            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.search_off, size: 48, color: Colors.grey[400]),
                    const SizedBox(height: 16),
                    CopyText('screen.product.no_results_found', fallback: "No results found", style: TextStyle(color: Colors.grey[600], fontSize: 16),
                    ),
                  ],
                ),
              ),
            )
          else
            Expanded(
              child: _shouldUseTabletLayout(context)
                  ? _buildTabletGrid()
                  : _buildPhoneList(),
            ),
        ],
      ),
    );
  }

  Widget _buildPhoneList() {
    final tickers = _getCurrentFilteredTickers();
    return ListView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      controller: _scrollController,
      itemCount: tickers.length,
      itemBuilder: (context, index) => _buildProductListTile(tickers[index]),
    );
  }

  Widget _buildTabletGrid() {
    final tickers = _getCurrentFilteredTickers();
    final screenWidth = MediaQuery.of(context).size.width;
    // Determine column count based on available width
    // If sidebar is visible (~240px), we have less space
    final effectiveWidth = screenWidth - 240; // Account for sidebar
    final crossAxisCount = effectiveWidth > 900 ? 3 : 2;

    return GridView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      controller: _scrollController,
      padding: const EdgeInsets.all(24),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 3.5,
      ),
      itemCount: tickers.length,
      itemBuilder: (context, index) => _buildProductCard(tickers[index]),
    );
  }

  Widget _buildProductListTile(MarketTicker ticker) {
    final changePercent = _getChangePercent(ticker);
    final changeColor = changePercent == null
        ? Colors.grey
        : (changePercent >= 0 ? Colors.green : Colors.red);
    final iconUrl = ticker.iconUrl ?? CryptoIcons.getIconUrl(ticker.symbol);

    return ListTile(
      key: ValueKey(ticker.symbol),
      onTap: () {
        // Pass ticker data directly (no need to refetch)
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(
              productId: ticker.symbol,
              exchangeId: _currentExchange,
              productType: _currentTag.value,
              availableTickers: {
                for (final t in _getCurrentAllTickers()) t.symbol: t,
              }, // Pass ticker data
            ),
          ),
        );
      },
      leading: Image.network(
        iconUrl,
        width: 28.w,
        height: 28.w,
        errorBuilder: (context, error, stackTrace) =>
            Icon(Icons.monetization_on, size: 28.w),
      ),
      title: Text(
        ticker.symbol,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontSize: 12.sp, // Reduced from 16.sp for better proportions
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: CopyText(
        'common.volume',
        params: {
          'volume': formatVolume(
            _calculateDisplayVolume(ticker, _currentTag.value),
          ),
        },
        fallback: 'Vol: {{volume}}',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 10.sp),
      ),
      trailing: IntrinsicWidth(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              ticker.last?.toString() ?? '--',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  changePercent == null
                      ? Icons.remove
                      : (changePercent >= 0
                          ? Icons.trending_up
                          : Icons.trending_down),
                  size: 16.w,
                  color: changeColor,
                ),
                const SizedBox(width: 4),
                if (changePercent == null)
                  Text(
                    '--',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontSize: 10.sp,
                      color: changeColor,
                    ),
                  )
                else
                  CopyText(
                    'common.percent',
                    params: {
                      'percent': changePercent.toStringAsFixed(2),
                    },
                    fallback: '{{percent}}%',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontSize: 10.sp,
                      color: changeColor,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductCard(MarketTicker ticker) {
    final changePercent = _getChangePercent(ticker);
    final changeColor = changePercent == null
        ? Colors.grey
        : (changePercent >= 0 ? Colors.green : Colors.red);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final iconUrl = ticker.iconUrl ?? CryptoIcons.getIconUrl(ticker.symbol);

    return InkWell(
      onTap: () {
        // Pass ticker data directly (no need to refetch)
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(
              productId: ticker.symbol,
              exchangeId: _currentExchange,
              productType: _currentTag.value,
              availableTickers: {
                for (final t in _getCurrentFilteredTickers()) t.symbol: t,
              }, // Pass ticker data
            ),
          ),
        );
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.grey[900]
              : Colors.white.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark
                ? Colors.grey[850]!
                : Colors.grey.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          children: [
            Image.network(
              iconUrl,
              width: 36.w,
              height: 36.w,
              errorBuilder: (context, error, stackTrace) =>
                  Icon(Icons.monetization_on, size: 36.w),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    ticker.symbol,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  CopyText(
                    'common.volume',
                    params: {
                      'volume': formatVolume(
                        _calculateDisplayVolume(ticker, _currentTag.value),
                      ),
                    },
                    fallback: 'Vol: {{volume}}',
                    style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  ticker.last?.toString() ?? '--',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      changePercent == null
                          ? Icons.remove
                          : (changePercent >= 0
                              ? Icons.trending_up
                              : Icons.trending_down),
                      size: 14.w,
                      color: changeColor,
                    ),
                    const SizedBox(width: 2),
                    if (changePercent == null)
                      Text(
                        '--',
                        style: TextStyle(
                          fontSize: 11,
                          color: changeColor,
                          fontWeight: FontWeight.w600,
                        ),
                      )
                    else
                      CopyText(
                        'common.percent',
                        params: {
                          'percent': changePercent.toStringAsFixed(2),
                        },
                        fallback: '{{percent}}%',
                        style: TextStyle(
                          fontSize: 11,
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
    );
  }
}
