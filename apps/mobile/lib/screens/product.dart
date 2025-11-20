import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../widgets/tag_list.dart';
import '../widgets/custom_app_bar.dart';
import '../services/okx_data_service.dart';
import '../utils/responsive_layout.dart';
import '../utils/number_format_utils.dart';
import 'product_detail.dart';

class ProductScreen extends StatefulWidget {
  const ProductScreen({super.key});

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends State<ProductScreen>
    with AutomaticKeepAliveClientMixin {
  late final OKXDataService _okxService;
  Tag _currentTag = Tag(name: 'Spot', value: 'SPOT');
  String _query = '';
  List<OKXTicker> _tickers = [];
  List<OKXTicker> _allTickers = [];
  bool _loading = true;
  late Timer _timer;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _okxService = OKXDataService();
    _loadData();

    // 每秒只刷新数据，不触发整个 FutureBuilder 重建
    _timer = Timer.periodic(const Duration(milliseconds: 600), (_) {
      _refreshData();
    });
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final data = await _okxService.getTickers(_currentTag.value);
    setState(() {
      _tickers = data.where((ticker) {
        return ticker.instId.toLowerCase().contains(_query);
      }).toList();

      // Sort by turnover (Vol * Price) for derivatives, volume for spot
      _sortTickersByTurnover();

      _loading = false;
    });
  }

  Future<void> _refreshData() async {
    final data = await _okxService.getTickers(_currentTag.value);
    // ⚠️ 不重新 setState 整个 widget，只更新 _tickers
    if (mounted) {
      setState(() {
        _tickers = data.where((ticker) {
          return ticker.instId.toLowerCase().contains(_query);
        }).toList();

        _allTickers = data;

        // Sort by turnover (Vol * Price) for derivatives, volume for spot
        _sortTickersByTurnover();
      });
    }
  }

  /// Sort tickers by turnover for better ranking
  /// Use the same logic as display volume for consistency
  void _sortTickersByTurnover() {
    _tickers.sort((a, b) {
      // Use volCcy24h if populated, otherwise calculate from vol24h * price
      final aTurnover = _calculateDisplayVolume(a);
      final bTurnover = _calculateDisplayVolume(b);

      return bTurnover.compareTo(aTurnover); // Descending order (highest first)
    });
  }

  /// Calculate display volume based on instrument type
  /// For SPOT: volCcy24h is in quote currency (USD/USDT) - use directly
  /// For derivatives: volCcy24h is in base currency (BTC/ETH) - multiply by price
  double _calculateDisplayVolume(OKXTicker ticker) {
    if (ticker.volCcy24h <= 0) {
      return 0; // No valid volume data
    }

    // For SPOT: volCcy24h is already in quote currency (USD/USDT)
    if (_currentTag.value == 'SPOT') {
      return ticker.volCcy24h;
    }

    // For derivatives (SWAP/FUTURES/OPTION): volCcy24h is in base currency
    // Convert to quote currency by multiplying by price
    return ticker.volCcy24h * ticker.last;
  }

  void _handleQuery(String query) {
    if (query.trim().isNotEmpty) {
      final lowerQuery = query.trim().toLowerCase();
      if (_query != lowerQuery) {
        setState(() {
          _query = lowerQuery;
          _loadData();
        });
      }
    }
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
    final List<Tag> tags = [
      Tag(name: 'Spot', value: 'SPOT'),
      Tag(name: 'Swap', value: 'SWAP'),
      Tag(name: 'Futures', value: 'FUTURES'),
      Tag(name: 'Option', value: 'OPTION'),
    ];

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: const CustomAppBar(title: 'Products'),
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
          const SizedBox(height: 16),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w), // ✅ Width-adapted
            child: TagList(
              tags: tags,
              currentTag: _currentTag,
              onTap: (tag) async {
                setState(() {
                  _currentTag = tag;
                });
                await _loadData(); // 切换标签重新加载
              },
            ),
          ),
          const SizedBox(height: 16),

          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
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
    return ListView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      controller: _scrollController,
      itemCount: _tickers.length,
      itemBuilder: (context, index) => _buildProductListTile(_tickers[index]),
    );
  }

  Widget _buildTabletGrid() {
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
      itemCount: _tickers.length,
      itemBuilder: (context, index) => _buildProductCard(_tickers[index]),
    );
  }

  Widget _buildProductListTile(OKXTicker ticker) {
    final changePercent =
        ((ticker.last - ticker.open24h) / ticker.open24h) * 100;
    final changeColor = changePercent >= 0 ? Colors.green : Colors.red;

    return ListTile(
      key: ValueKey(ticker.instId),
      onTap: () {
        // Pass ticker data directly (no need to refetch)
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(
              productId: ticker.instId,
              availableTickers: {
                for (final t in _allTickers) t.instId: t,
              }, // Pass ticker data
            ),
          ),
        );
      },
      leading: Image.network(
        ticker.iconUrl,
        width: 28.w,
        height: 28.w,
        errorBuilder: (context, error, stackTrace) =>
            Icon(Icons.monetization_on, size: 28.w),
      ),
      title: Text(
        ticker.instId,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontSize: 12.sp, // Reduced from 16.sp for better proportions
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        'Vol: ${formatVolume(_calculateDisplayVolume(ticker))}',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 10.sp),
      ),
      trailing: IntrinsicWidth(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              ticker.last.toString(),
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
                  changePercent >= 0 ? Icons.trending_up : Icons.trending_down,
                  size: 16.w,
                  color: changeColor,
                ),
                const SizedBox(width: 4),
                Text(
                  '${changePercent.toStringAsFixed(2)}%',
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

  Widget _buildProductCard(OKXTicker ticker) {
    final changePercent =
        ((ticker.last - ticker.open24h) / ticker.open24h) * 100;
    final changeColor = changePercent >= 0 ? Colors.green : Colors.red;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return InkWell(
      onTap: () {
        // Pass ticker data directly (no need to refetch)
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(
              productId: ticker.instId,
              availableTickers: {
                for (final t in _tickers) t.instId: t,
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
              ticker.iconUrl,
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
                    ticker.instId,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Vol: ${formatVolume(_calculateDisplayVolume(ticker))}',
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
                  ticker.last.toString(),
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
                      changePercent >= 0
                          ? Icons.trending_up
                          : Icons.trending_down,
                      size: 14.w,
                      color: changeColor,
                    ),
                    const SizedBox(width: 2),
                    Text(
                      '${changePercent.toStringAsFixed(2)}%',
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
