import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../models/portfolio.dart';
import '../services/portfolio_service.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/preference.dart';
import '../utils/responsive_layout.dart';
import '../widgets/quick_menu_drawer.dart';
import '../widgets/portfolio/portfolio_summary_card.dart';
import '../widgets/portfolio/asset_allocation_chart.dart';
import '../widgets/portfolio/positions_list.dart';
import '../widgets/portfolio/assets_list.dart';
import '../widgets/portfolio/exchange_filter.dart';

/// Professional portfolio screen with real API data.
class PortfolioScreen extends StatefulWidget {
  const PortfolioScreen({super.key});

  @override
  State<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends State<PortfolioScreen>
    with AutomaticKeepAliveClientMixin, TickerProviderStateMixin {
  @override
  bool get wantKeepAlive => true;

  // Data
  PortfolioData _portfolioData = PortfolioData.empty();
  final ValueNotifier<List<AggregatedAsset>> _chartAssetsNotifier =
      ValueNotifier<List<AggregatedAsset>>([]);
  PositionsData _positionsData = PositionsData.empty();
  PnLData _pnlData = PnLData.empty();

  // State
  bool _isLoading = true;
  bool _isRefreshing = false;
  bool _isInitialLoad = true;
  bool _isUpdatingExchange = false;
  bool _signingOut = false;
  bool _headerElevated = false;
  String? _error;
  String _selectedExchange = 'all';
  String? _selectedAsset;
  int _selectedTab = 0; // 0: Holdings, 1: Positions
  final AuthService _authService = AuthService.instance;
  late final ScrollController _scrollController;

  // Store all available exchanges (not affected by filtering)
  List<String> _allExchanges = [];

  // Animation
  late TabController _tabController;

  // Subscriptions
  StreamSubscription<PortfolioData>? _portfolioSubscription;
  StreamSubscription<List<Position>>? _positionsSubscription;

  String _normalizeExchange(String exchange) {
    return exchange.trim().toLowerCase();
  }

  List<PortfolioAsset> _assetsForSelectedExchange() {
    if (_selectedExchange == 'all') {
      return _portfolioData.assets;
    }

    if (_portfolioData.assetsByExchange.containsKey(_selectedExchange)) {
      return _portfolioData.assetsByExchange[_selectedExchange] ?? [];
    }

    final matchingKey = _portfolioData.assetsByExchange.keys.firstWhere(
      (key) => key.toLowerCase() == _selectedExchange,
      orElse: () => '',
    );

    if (matchingKey.isNotEmpty) {
      return _portfolioData.assetsByExchange[matchingKey] ?? [];
    }

    return _portfolioData.assets
        .where((asset) => asset.exchange.toLowerCase() == _selectedExchange)
        .toList();
  }

  PortfolioData _buildPortfolioViewData(List<PortfolioAsset> assets) {
    final totalValue = assets.fold(
      0.0,
      (sum, asset) => sum + (asset.estimatedValue ?? 0),
    );
    final uniqueAssets = assets.map((asset) => asset.asset).toSet().length;
    final exchanges = assets
        .map((asset) => asset.exchange.toLowerCase())
        .toSet()
        .toList();

    final Map<String, _AggregatedTotals> aggregatedMap = {};
    for (final asset in assets) {
      final key = asset.asset;
      final totals = aggregatedMap.putIfAbsent(key, () => _AggregatedTotals());
      totals.free += asset.free;
      totals.locked += asset.locked;
      totals.quantity += asset.total;
      totals.value += asset.estimatedValue ?? 0;
    }

    final aggregatedAssets = aggregatedMap.entries.map((entry) {
      final totals = entry.value;
      final percentage = totalValue > 0
          ? (totals.value / totalValue) * 100
          : 0.0;
      return AggregatedAsset(
        asset: entry.key,
        free: totals.free,
        locked: totals.locked,
        total: totals.value,
        percentage: percentage,
      );
    }).toList();

    return PortfolioData(
      summary: AssetsSummary(
        totalAssets: assets.length,
        uniqueAssets: uniqueAssets,
        totalValue: totalValue,
        exchanges: exchanges,
      ),
      assets: assets,
      assetsByExchange: _portfolioData.assetsByExchange,
      aggregatedAssets: aggregatedAssets,
      timestamp: DateTime.now(),
    );
  }

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_handleScroll);
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        setState(() {
          _selectedTab = _tabController.index;
        });
      }
    });
    _loadData();
    _setupStreams();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _tabController.dispose();
    _portfolioSubscription?.cancel();
    _positionsSubscription?.cancel();
    _chartAssetsNotifier.dispose();
    PortfolioService.instance.stopAutoRefresh();
    super.dispose();
  }

  void _setupStreams() {
    _portfolioSubscription = PortfolioService.instance.portfolioStream.listen((
      data,
    ) {
      if (mounted) {
        setState(() {
          _portfolioData = data;
          if (!_isUpdatingExchange) {
            _chartAssetsNotifier.value = data.aggregatedAssets;
          }
        });
      }
    });

    _positionsSubscription = PortfolioService.instance.positionsStream.listen((
      positions,
    ) {
      if (mounted) {
        setState(() {
          _positionsData = PositionsData(
            positions: positions,
            summary: _positionsData.summary,
          );
        });
      }
    });
  }

  Future<void> _loadData() async {
    if (!ApiClient.instance.isInitialized) {
      setState(() {
        _isLoading = false;
        _error = 'API client not initialized. Please login first.';
        _isUpdatingExchange = false;
      });
      return;
    }

    setState(() {
      _isLoading = _isInitialLoad;
      _error = null;
    });

    try {
      // First, fetch all exchanges if we don't have them yet
      if (_allExchanges.isEmpty) {
        final allData = await PortfolioService.instance.fetchPortfolioAssets(
          exchange: 'all',
        );
        final normalizedExchanges = <String>{};
        for (final exchange in allData.summary.exchanges) {
          normalizedExchanges.add(_normalizeExchange(exchange));
        }
        _allExchanges = normalizedExchanges.toList();
      }

      // Then fetch filtered data
      final results = await Future.wait([
        PortfolioService.instance.fetchPortfolioAssets(
          exchange: _selectedExchange,
        ),
        PortfolioService.instance.fetchPositions(
          exchange: _selectedExchange == 'all' ? null : _selectedExchange,
        ),
        PortfolioService.instance.fetchPnL(),
      ]);

      if (mounted) {
        setState(() {
          _portfolioData = results[0] as PortfolioData;
          _positionsData = results[1] as PositionsData;
          _pnlData = results[2] as PnLData;
          _isLoading = false;
          _isInitialLoad = false;
          _isUpdatingExchange = false;
        });
        _chartAssetsNotifier.value = _portfolioData.aggregatedAssets;

        // Start auto-refresh after initial load
        PortfolioService.instance.startAutoRefresh(exchange: _selectedExchange);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = e.toString();
          _isUpdatingExchange = false;
        });
      }
    }
  }

  Future<void> _refreshData() async {
    if (_isRefreshing) return;

    setState(() {
      _isRefreshing = true;
    });

    try {
      await _loadData();
    } finally {
      if (mounted) {
        setState(() {
          _isRefreshing = false;
        });
      }
    }
  }

  void _handleScroll() {
    if (!_scrollController.hasClients) return;
    final pixels = _scrollController.position.pixels;
    _setHeaderElevated(pixels > 4);
  }

  void _setHeaderElevated(bool elevated) {
    if (_headerElevated == elevated) return;
    setState(() => _headerElevated = elevated);
  }

  Future<void> _signOut() async {
    if (_signingOut) return;
    setState(() => _signingOut = true);
    try {
      try {
        await _authService.signOut();
        await ApiClient.instance.clearCookies();
        await Preference.remove(Preference.keySavedEmail);
        await Preference.remove(Preference.keySavedPassword);
      } catch (err) {
        // Ignore logout errors
      }
      if (!mounted) return;
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  void _onExchangeSelected(String exchange) {
    final normalizedExchange = _normalizeExchange(exchange);
    PortfolioService.instance.stopAutoRefresh();
    setState(() {
      _selectedExchange = normalizedExchange;
      _selectedAsset = null;
      _isUpdatingExchange = true;
    });
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final backgroundColor = isDark
        ? const Color(0xFF0D1117)
        : const Color(0xFFF5F7FA);
    final statusBarColor = _headerElevated ? Colors.white : backgroundColor;
    final statusBarBrightness = _headerElevated
        ? Brightness.light
        : (isDark ? Brightness.dark : Brightness.light);
    final statusBarIconBrightness = _headerElevated
        ? Brightness.dark
        : (isDark ? Brightness.light : Brightness.dark);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: statusBarColor,
        statusBarBrightness: statusBarBrightness,
        statusBarIconBrightness: statusBarIconBrightness,
      ),
      child: Scaffold(
        backgroundColor: backgroundColor,
        body: _buildBody(context, backgroundColor),
      ),
    );
  }

  Widget _buildBody(BuildContext context, Color backgroundColor) {
    if (_isLoading && _isInitialLoad) {
      return _buildLoadingState(context);
    }

    if (_error != null) {
      return _buildErrorState(context);
    }

    final displayAssets = _assetsForSelectedExchange();
    final displayPortfolio = _selectedExchange == 'all'
        ? _portfolioData
        : _buildPortfolioViewData(displayAssets);
    final topPadding = MediaQuery.of(context).padding.top;

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: _refreshData,
          child: SafeArea(
            top: false,
            bottom: false,
            child: CustomScrollView(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _FixedHeaderDelegate(
                    height: topPadding + 56,
                    child: _buildPinnedHeader(
                      context,
                      topPadding,
                      backgroundColor,
                    ),
                  ),
                ),

                // Portfolio Summary Card (auto-refreshes via PortfolioService streams)
                SliverToBoxAdapter(
                  child: PortfolioSummaryCard(
                    portfolio: displayPortfolio,
                    pnl: _pnlData,
                  ),
                ),

                // Exchange Filter - always use _allExchanges to keep all options visible
                if (_allExchanges.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.only(top: 16, bottom: 8),
                      child: ExchangeFilter(
                        exchanges: _allExchanges,
                        selectedExchange: _selectedExchange,
                        onExchangeSelected: _onExchangeSelected,
                      ),
                    ),
                  ),

                // Asset Allocation Chart
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.only(top: 16),
                    child: ValueListenableBuilder<List<AggregatedAsset>>(
                      valueListenable: _chartAssetsNotifier,
                      builder: (context, assets, child) {
                        final chartAssets = assets.isNotEmpty
                            ? assets
                            : displayPortfolio.aggregatedAssets;
                        return AssetAllocationChart(
                          assets: chartAssets,
                          selectedAsset: _selectedAsset,
                          onAssetSelected: (asset) {
                            setState(() {
                              _selectedAsset = asset;
                            });
                          },
                        );
                      },
                    ),
                  ),
                ),

                // Tab Bar
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.only(top: 20, left: 16.w, right: 16.w),
                    child: _buildTabBar(context),
                  ),
                ),

                // Tab Content
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: _selectedTab == 0
                        ? AssetsList(
                            assets: displayAssets,
                            selectedAsset: _selectedAsset,
                            onAssetTap: (asset) {
                              setState(() {
                                _selectedAsset = _selectedAsset == asset.asset
                                    ? null
                                    : asset.asset;
                              });
                            },
                          )
                        : PositionsList(
                            positions: _positionsData.positions,
                            selectedExchange: _selectedExchange,
                          ),
                  ),
                ),

                // Bottom padding
                SliverToBoxAdapter(child: SizedBox(height: 24)),
              ],
            ),
          ),
        ),
        if (_isUpdatingExchange || _isRefreshing)
          Positioned(
            left: 16.w,
            right: 16.w,
            top: 8,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                minHeight: 3,
                backgroundColor: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.15),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildTabBar(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.05),
        ),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: theme.colorScheme.primary,
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        indicatorPadding: EdgeInsets.all(4),
        dividerColor: Colors.transparent,
        labelColor: Colors.white,
        unselectedLabelColor: isDark ? Colors.white60 : Colors.black54,
        labelStyle: TextStyle(fontSize: 13.sp, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(
          fontSize: 13.sp,
          fontWeight: FontWeight.w500,
        ),
        tabs: [
          Tab(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.account_balance_wallet_outlined, size: 16.w),
                SizedBox(width: 6.w),
                Text('Holdings'),
              ],
            ),
          ),
          Tab(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.show_chart_rounded, size: 16.w),
                SizedBox(width: 6.w),
                Text('Positions'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPinnedHeader(
    BuildContext context,
    double topPadding,
    Color backgroundColor,
  ) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isTablet = ResponsiveLayout.isTablet(context);
    final headerColor = _headerElevated ? Colors.white : backgroundColor;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      padding: EdgeInsets.only(left: 12.w, right: 12.w, top: topPadding),
      decoration: BoxDecoration(
        color: headerColor,
        border: _headerElevated
            ? Border(
                bottom: BorderSide(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.1)
                      : Colors.black.withValues(alpha: 0.08),
                  width: 1,
                ),
              )
            : null,
        boxShadow: _headerElevated
            ? (isDark
                  ? []
                  : const [
                      BoxShadow(
                        color: Color(0x14000000),
                        blurRadius: 10,
                        offset: Offset(0, 1),
                      ),
                    ])
            : null,
      ),
      height: topPadding + 56,
      child: _buildHeaderContent(context, isDark, isTablet),
    );
  }

  Widget _buildHeaderContent(BuildContext context, bool isDark, bool isTablet) {
    return SizedBox(
      height: 56,
      child: Row(
        children: [
          if (!isTablet)
            _buildHeaderIcon(
              icon: Icons.menu,
              onTap: () {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (context) => const QuickMenuDrawer(),
                );
              },
              isDark: isDark,
              tooltip: 'Menu',
            ),
          const Spacer(),
          _buildHeaderIcon(
            icon: Icons.notifications_none,
            onTap: () {
              Navigator.pushNamed(context, '/push-history');
            },
            isDark: isDark,
            tooltip: 'Notifications',
          ),
          SizedBox(width: 4.w),
          _buildHeaderIcon(
            icon: Icons.qr_code_scanner,
            onTap: () {
              Navigator.pushNamed(context, '/scan-qr');
            },
            isDark: isDark,
            tooltip: 'Scan',
          ),
          SizedBox(width: 4.w),
          _buildHeaderIcon(
            icon: _signingOut ? Icons.hourglass_top : Icons.logout,
            onTap: _signingOut ? null : _signOut,
            isDark: isDark,
            highlight: true,
            tooltip: 'Logout',
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderIcon({
    required IconData icon,
    required VoidCallback? onTap,
    required bool isDark,
    required String tooltip,
    bool highlight = false,
  }) {
    return IconButton(
      onPressed: onTap,
      tooltip: tooltip,
      icon: Icon(
        icon,
        size: 20.w,
        color: highlight
            ? Theme.of(context).colorScheme.primary
            : (isDark ? Colors.white : Colors.black87),
      ),
    );
  }

  Widget _buildLoadingState(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 48.w,
            height: 48.w,
            child: CircularProgressIndicator(
              strokeWidth: 3,
              valueColor: AlwaysStoppedAnimation<Color>(
                theme.colorScheme.primary,
              ),
            ),
          ),
          SizedBox(height: 16),
          Text(
            'Loading portfolio...',
            style: TextStyle(
              fontSize: 14.sp,
              fontWeight: FontWeight.w500,
              color: isDark ? Colors.white60 : Colors.black54,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Center(
      child: Padding(
        padding: EdgeInsets.all(32.w),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline_rounded,
              size: 64.w,
              color: theme.colorScheme.error.withValues(alpha: 0.7),
            ),
            SizedBox(height: 16),
            Text(
              'Failed to load portfolio',
              style: TextStyle(
                fontSize: 18.sp,
                fontWeight: FontWeight.w600,
                color: isDark ? Colors.white : Colors.black87,
              ),
            ),
            SizedBox(height: 8),
            Text(
              _error ?? 'Unknown error occurred',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13.sp,
                color: isDark ? Colors.white54 : Colors.black54,
              ),
            ),
            SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: Icon(Icons.refresh_rounded, size: 18.w),
              label: Text(
                'Try Again',
                style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: Colors.white,
                padding: EdgeInsets.symmetric(horizontal: 24.w, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AggregatedTotals {
  double free = 0;
  double locked = 0;
  double quantity = 0;
  double value = 0;
}

class _FixedHeaderDelegate extends SliverPersistentHeaderDelegate {
  final double height;
  final Widget child;

  _FixedHeaderDelegate({required this.height, required this.child});

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return child;
  }

  @override
  bool shouldRebuild(covariant _FixedHeaderDelegate oldDelegate) {
    return height != oldDelegate.height || child != oldDelegate.child;
  }
}
