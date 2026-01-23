import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../models/portfolio.dart';
import '../services/portfolio_service.dart';
import '../services/api_client.dart';
import '../widgets/custom_app_bar.dart';
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
  PositionsData _positionsData = PositionsData.empty();
  PnLData _pnlData = PnLData.empty();

  // State
  bool _isLoading = true;
  bool _isRefreshing = false;
  String? _error;
  String _selectedExchange = 'all';
  String? _selectedAsset;
  int _selectedTab = 0; // 0: Holdings, 1: Positions

  // Store all available exchanges (not affected by filtering)
  List<String> _allExchanges = [];

  // Animation
  late TabController _tabController;

  // Subscriptions
  StreamSubscription<PortfolioData>? _portfolioSubscription;
  StreamSubscription<List<Position>>? _positionsSubscription;

  @override
  void initState() {
    super.initState();
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
    _tabController.dispose();
    _portfolioSubscription?.cancel();
    _positionsSubscription?.cancel();
    PortfolioService.instance.stopAutoRefresh();
    super.dispose();
  }

  void _setupStreams() {
    _portfolioSubscription = PortfolioService.instance.portfolioStream.listen(
      (data) {
        if (mounted) {
          setState(() {
            _portfolioData = data;
          });
        }
      },
    );

    _positionsSubscription = PortfolioService.instance.positionsStream.listen(
      (positions) {
        if (mounted) {
          setState(() {
            _positionsData = PositionsData(
              positions: positions,
              summary: _positionsData.summary,
            );
          });
        }
      },
    );
  }

  Future<void> _loadData() async {
    if (!ApiClient.instance.isInitialized) {
      setState(() {
        _isLoading = false;
        _error = 'API client not initialized. Please login first.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // First, fetch all exchanges if we don't have them yet
      if (_allExchanges.isEmpty) {
        final allData = await PortfolioService.instance.fetchPortfolioAssets(
          exchange: 'all',
        );
        _allExchanges = List<String>.from(allData.summary.exchanges);
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
        });

        // Start auto-refresh after initial load
        PortfolioService.instance.startAutoRefresh(exchange: _selectedExchange);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = e.toString();
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

  void _onExchangeSelected(String exchange) {
    setState(() {
      _selectedExchange = exchange;
      _selectedAsset = null;
    });
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0D1117) : const Color(0xFFF5F7FA),
      appBar: CustomAppBar(
        title: 'Portfolio',
        // No refresh icon - data updates automatically via PortfolioService
      ),
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_isLoading) {
      return _buildLoadingState(context);
    }

    if (_error != null) {
      return _buildErrorState(context);
    }

    return RefreshIndicator(
      onRefresh: _refreshData,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          // Portfolio Summary Card (auto-refreshes via PortfolioService streams)
          SliverToBoxAdapter(
            child: PortfolioSummaryCard(
              portfolio: _portfolioData,
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
              child: AssetAllocationChart(
                assets: _portfolioData.aggregatedAssets,
                selectedAsset: _selectedAsset,
                onAssetSelected: (asset) {
                  setState(() {
                    _selectedAsset = asset;
                  });
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
                      assets: _selectedExchange == 'all'
                          ? _portfolioData.assets
                          : _portfolioData.assetsByExchange[_selectedExchange] ?? [],
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
          SliverToBoxAdapter(
            child: SizedBox(height: 24),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: isDark
            ? const Color(0xFF1A1F2E)
            : Colors.white,
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
        labelStyle: TextStyle(
          fontSize: 13.sp,
          fontWeight: FontWeight.w600,
        ),
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
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.w600,
                ),
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
