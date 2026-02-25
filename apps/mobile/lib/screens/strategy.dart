import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../design/tokens/color.dart';
import '../models/strategy.dart';
import '../services/strategy_service.dart';
import '../services/copy_service.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../widgets/custom_app_bar.dart';
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';
import '../utils/responsive_layout.dart';
import 'strategy_detail.dart';
import 'strategy_create.dart';
import '../widgets/copy_text.dart';

enum SortBy { name, pnl, createdAt }

class StrategyScreen extends StatefulWidget {
  const StrategyScreen({super.key});

  @override
  State<StrategyScreen> createState() => _StrategyScreenState();
}

class _StrategyScreenState extends State<StrategyScreen>
    with AutomaticKeepAliveClientMixin {
  final StrategyService _strategyService = StrategyService.instance;
  List<Strategy> _allStrategies = [];
  List<Strategy> _filteredStrategies = [];
  Map<int, StrategyPnL> _pnlMap = {};
  bool _isLoading = true;
  String? _errorMessage;
  String _searchQuery = '';
  SortBy _sortBy = SortBy.name;
  bool _sortAscending = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadStrategies();
  }

  Future<void> _loadStrategies() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // Load strategies and PnL data in parallel
      final strategies = await _strategyService.getStrategies();
      final pnlList = await _strategyService.getStrategiesPnL();

      // Create a map of strategy ID to PnL for quick lookup
      final pnlMap = <int, StrategyPnL>{};
      for (final pnl in pnlList) {
        pnlMap[pnl.strategyId] = pnl;
      }

      setState(() {
        _allStrategies = strategies;
        _pnlMap = pnlMap;
        _isLoading = false;
      });
      _applyFiltersAndSort();
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to load strategies: $e';
        _isLoading = false;
      });
    }
  }

  void _applyFiltersAndSort() {
    setState(() {
      // Apply search filter
      _filteredStrategies = _allStrategies.where((strategy) {
        if (_searchQuery.isEmpty) return true;
        final query = _searchQuery.toLowerCase();
        final baseCurrency = _extractBaseCurrency(
          strategy.symbol,
        ).toLowerCase();
        return strategy.name.toLowerCase().contains(query) ||
            (strategy.symbol?.toLowerCase().contains(query) ?? false) ||
            baseCurrency.contains(query) ||
            (strategy.exchange?.toLowerCase().contains(query) ?? false);
      }).toList();

      // Apply sorting
      _filteredStrategies.sort((a, b) {
        int comparison = 0;
        switch (_sortBy) {
          case SortBy.name:
            comparison = a.name.compareTo(b.name);
            break;
          case SortBy.pnl:
            final aPnl = _pnlMap[a.id]?.totalPnl ?? 0.0;
            final bPnl = _pnlMap[b.id]?.totalPnl ?? 0.0;
            comparison = aPnl.compareTo(bPnl);
            break;
          case SortBy.createdAt:
            comparison = a.createdAt.compareTo(b.createdAt);
            break;
        }
        return _sortAscending ? comparison : -comparison;
      });
    });
  }

  void _handleSearch(String query) {
    setState(() {
      _searchQuery = query.trim();
    });
    _applyFiltersAndSort();
  }

  void _handleSortChange(SortBy sortBy) {
    setState(() {
      if (_sortBy == sortBy) {
        _sortAscending = !_sortAscending;
      } else {
        _sortBy = sortBy;
        _sortAscending = true;
      }
    });
    _applyFiltersAndSort();
  }

  String _extractBaseCurrency(String? symbol) {
    if (symbol == null) return '';
    if (symbol.contains('/')) {
      return symbol.split('/')[0];
    }
    return symbol;
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'active':
        return ColorTokens.profitGreen;
      case 'stopped':
        return Colors.grey;
      case 'paused':
        return ColorTokens.warningAmber;
      case 'error':
        return ColorTokens.lossRed;
      default:
        return Colors.grey;
    }
  }

  Color _getPnLColor(double pnl) {
    if (pnl > 0) return ColorTokens.profitGreen;
    if (pnl < 0) return ColorTokens.lossRed;
    return Colors.grey;
  }

  String _formatPnL(double pnl) {
    final sign = pnl >= 0 ? '+' : '';
    return '$sign${pnl.toStringAsFixed(2)}';
  }

  int get _activeCount =>
      _allStrategies.where((strategy) => strategy.status == 'active').length;

  double get _totalPnl {
    double total = 0;
    for (final strategy in _allStrategies) {
      total += _pnlMap[strategy.id]?.totalPnl ?? 0;
    }
    return total;
  }

  bool _shouldUseTabletLayout(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;
    final isTablet = ResponsiveLayout.isTablet(context);

    final isLargeScreen = screenWidth >= 600 ||
        (screenWidth > 800 && screenHeight > 1000) ||
        (screenWidth > 1000 && screenHeight > 800);

    return isTablet || isLargeScreen;
  }

  String _formatStatus(String status) {
    final copy = CopyService.instance;
    switch (status) {
      case 'active':
        return copy.t('screen.strategy.status.active', fallback: 'Active');
      case 'stopped':
        return copy.t('screen.strategy.status.stopped', fallback: 'Stopped');
      case 'paused':
        return copy.t('screen.strategy.status.paused', fallback: 'Paused');
      case 'error':
        return copy.t('screen.strategy.status.error', fallback: 'Error');
      default:
        return status;
    }
  }

  void _navigateToDetail(Strategy strategy) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) =>
            StrategyDetailScreen(strategy: strategy, pnl: _pnlMap[strategy.id]),
      ),
    ).then((_) {
      // Refresh when returning from detail screen
      _loadStrategies();
    });
  }

  Future<void> _openCreateStrategy() async {
    final created = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (context) => const StrategyCreateScreen()),
    );
    if (created == true) {
      _loadStrategies();
    }
  }

  Widget _buildErrorView() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(
            _errorMessage!,
            style: const TextStyle(color: Colors.red),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loadStrategies,
            child: CopyText('screen.strategy.retry', fallback: "Retry"),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyView() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(height: 32),
          Icon(Icons.bar_chart, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          CopyText(
            _searchQuery.isEmpty
                ? 'screen.strategy.empty.no_strategies'
                : 'screen.strategy.empty.no_strategies_found',
            fallback: _searchQuery.isEmpty
                ? 'No strategies yet'
                : 'No strategies found',
            style: TextStyle(fontSize: 18.sp, color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          CopyText(
            _searchQuery.isEmpty
                ? 'screen.strategy.empty.create_hint'
                : 'screen.strategy.empty.search_hint',
            fallback: _searchQuery.isEmpty
                ? 'Create your first strategy using web manager to get started'
                : 'Try a different search term',
            style: TextStyle(fontSize: 14.sp, color: Colors.grey[500]),
          ),
          const SizedBox(height: 16),
          if (_searchQuery.isEmpty)
            ElevatedButton.icon(
              onPressed: _openCreateStrategy,
              icon: const Icon(Icons.add),
              label: CopyText('screen.strategy.add_strategy', fallback: "Add strategy"),
            ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final total = _allStrategies.length;
    final active = _activeCount;
    final pnlColor = _getPnLColor(_totalPnl);
    final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        );
    final subtitleStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
          color: Colors.white.withValues(alpha: 0.8),
        );

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [ColorTokens.gradientStartDark, ColorTokens.gradientEndDark]
              : [ColorTokens.gradientStart, ColorTokens.gradientEnd],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.1),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.insights, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: CopyText('screen.strategy.strategies_overview', fallback: "Strategies overview", style: titleStyle,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          CopyText('screen.strategy.track_performance_and_status_a', fallback: "Track performance and status at a glance", style: subtitleStyle,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _SummaryMetric(
                icon: Icons.folder_open,
                labelKey: 'screen.strategy.summary.total',
                labelFallback: 'Total',
                value: '$total',
                valueColor: Colors.white,
              ),
              const SizedBox(width: 16),
              _SummaryMetric(
                icon: Icons.play_circle_fill,
                labelKey: 'screen.strategy.summary.active',
                labelFallback: 'Active',
                value: '$active',
                valueColor: Colors.white,
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  CopyText('screen.strategy.total_pnl', fallback: "Total PnL", style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _formatPnL(_totalPnl),
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: pnlColor,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildListHeader() {
    final isSearching = _searchQuery.isNotEmpty;
    final titleKey = isSearching
        ? 'screen.strategy.list.results'
        : 'screen.strategy.list.all_strategies';
    final titleFallback = isSearching ? 'Results' : 'All Strategies';
    final count = _filteredStrategies.length;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Row(
        children: [
          CopyText(
            titleKey,
            fallback: titleFallback,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: Theme.of(context)
                  .colorScheme
                  .surfaceContainerHighest
                  .withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: CopyText(
              'screen.strategy.result_count',
              params: {'count': count.toString()},
              fallback: '{{count}}',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          if (isSearching) ...[
            const SizedBox(width: 8),
            Expanded(
              child: CopyText(
                'screen.strategy.search_query',
                params: {'query': _searchQuery},
                fallback: '"{{query}}"',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).hintColor,
                    ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPhoneListSliver() {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final strategy = _filteredStrategies[index];
            final pnl = _pnlMap[strategy.id];
            final baseCurrency = _extractBaseCurrency(strategy.symbol);
            return _StrategyCard(
              strategy: strategy,
              pnl: pnl,
              onTap: () => _navigateToDetail(strategy),
              getStatusColor: _getStatusColor,
              getPnLColor: _getPnLColor,
              formatPnL: _formatPnL,
              formatStatus: _formatStatus,
              baseCurrency: baseCurrency,
            );
          },
          childCount: _filteredStrategies.length,
        ),
      ),
    );
  }

  Widget _buildTabletGridSliver() {
    final screenWidth = MediaQuery.of(context).size.width;
    // Account for sidebar (~240px) when present in landscape
    final effectiveWidth = screenWidth - 240;
    // Use 2 columns for portrait/smaller screens, 3 for wider landscape
    final crossAxisCount = effectiveWidth > 900 ? 3 : 2;

    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 88),
      sliver: SliverGrid(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: crossAxisCount,
          mainAxisSpacing: 16,
          crossAxisSpacing: 16,
          childAspectRatio: 1.6,
        ),
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final strategy = _filteredStrategies[index];
            final pnl = _pnlMap[strategy.id];
            final baseCurrency = _extractBaseCurrency(strategy.symbol);
            return _StrategyCard(
              strategy: strategy,
              pnl: pnl,
              onTap: () => _navigateToDetail(strategy),
              getStatusColor: _getStatusColor,
              getPnLColor: _getPnLColor,
              formatPnL: _formatPnL,
              formatStatus: _formatStatus,
              baseCurrency: baseCurrency,
            );
          },
          childCount: _filteredStrategies.length,
        ),
      ),
    );
  }

  Widget _buildContentSliver() {
    if (_isLoading) {
      return const SliverFillRemaining(
        hasScrollBody: false,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_errorMessage != null) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: _buildErrorView(),
      );
    }

    if (_filteredStrategies.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: _buildEmptyView(),
      );
    }

    return _shouldUseTabletLayout(context)
        ? _buildTabletGridSliver()
        : _buildPhoneListSliver();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // Required for AutomaticKeepAliveClientMixin
    final copy = CopyService.instance;
    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      // AppBar
      appBar: CustomAppBar(
        titleKey: 'screen.strategy.title',
        titleFallback: 'Strategies',
        actions: [
          IconButton(
            tooltip: copy.t(
              'screen.strategy.add_strategy',
              fallback: 'Add strategy',
            ),
            icon: const Icon(Icons.add),
            onPressed: _openCreateStrategy,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadStrategies,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _buildSummaryCard()),
            SliverToBoxAdapter(child: _buildListHeader()),
            // Search Bar
            SliverToBoxAdapter(
              child: SimpleSearchBar(
                onChanged: _handleSearch,
                onSubmitted: _handleSearch,
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 10)),
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 16.w),
                child: Row(
                  children: [
                    CopyText(
                      'screen.strategy.sort_by',
                      fallback: "Sort by",
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey,
                          ),
                    ),
                    const SizedBox(width: 8),
                    _SortChip(
                      labelKey: 'screen.strategy.sort.name',
                      labelFallback: 'Name',
                      isSelected: _sortBy == SortBy.name,
                      isAscending: _sortAscending,
                      onTap: () => _handleSortChange(SortBy.name),
                    ),
                    SizedBox(width: 8.w),
                    _SortChip(
                      labelKey: 'screen.strategy.sort.pnl',
                      labelFallback: 'PnL',
                      isSelected: _sortBy == SortBy.pnl,
                      isAscending: _sortAscending,
                      onTap: () => _handleSortChange(SortBy.pnl),
                    ),
                    SizedBox(width: 8.w),
                    _SortChip(
                      labelKey: 'screen.strategy.sort.date',
                      labelFallback: 'Date',
                      isSelected: _sortBy == SortBy.createdAt,
                      isAscending: _sortAscending,
                      onTap: () => _handleSortChange(SortBy.createdAt),
                    ),
                  ],
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 4)),
            // Strategy List
            _buildContentSliver(),
          ],
        ),
      ),
    );
  }
}

class _SortChip extends StatelessWidget {
  final String labelKey;
  final String labelFallback;
  final bool isSelected;
  final bool isAscending;
  final VoidCallback onTap;

  const _SortChip({
    required this.labelKey,
    required this.labelFallback,
    required this.isSelected,
    required this.isAscending,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.12)
              : isDark
                  ? Colors.grey[850]
                  : Colors.grey[200],
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected
                ? Theme.of(context).colorScheme.primary
                : Colors.transparent,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CopyText(
              labelKey,
              fallback: labelFallback,
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: isSelected
                    ? Theme.of(context).colorScheme.primary
                    : Colors.grey[700],
              ),
            ),
            if (isSelected) ...[
              SizedBox(width: 4.w),
              Icon(
                isAscending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 14.w,
                color: Theme.of(context).colorScheme.primary,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StrategyCard extends StatelessWidget {
  final Strategy strategy;
  final StrategyPnL? pnl;
  final VoidCallback onTap;
  final Color Function(String) getStatusColor;
  final Color Function(double) getPnLColor;
  final String Function(double) formatPnL;
  final String Function(String) formatStatus;
  final String baseCurrency;

  const _StrategyCard({
    required this.strategy,
    required this.pnl,
    required this.onTap,
    required this.getStatusColor,
    required this.getPnLColor,
    required this.formatPnL,
    required this.formatStatus,
    required this.baseCurrency,
  });

  String? _getStatusCopyKey(String status) {
    switch (status) {
      case 'active':
        return 'screen.strategy.status.active';
      case 'stopped':
        return 'screen.strategy.status.stopped';
      case 'paused':
        return 'screen.strategy.status.paused';
      case 'error':
        return 'screen.strategy.status.error';
      default:
        return null;
    }
  }

  String _getSymbol(CopyService copy) {
    return strategy.normalizedSymbol ??
        strategy.symbol ??
        copy.t('screen.strategy.symbol.na', fallback: 'N/A');
  }

  String _getMarketTypeLabel(CopyService copy) {
    switch (strategy.marketType) {
      case 'perpetual':
        return copy.t('screen.strategy.market_type.perp', fallback: 'PERP');
      case 'futures':
        return copy.t('screen.strategy.market_type.futures', fallback: 'FUT');
      case 'spot':
      default:
        return copy.t('screen.strategy.market_type.spot', fallback: 'SPOT');
    }
  }

  String _formatDate(CopyService copy, DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays == 0) {
      return copy.t('screen.strategy.date.today', fallback: 'Today');
    } else if (difference.inDays == 1) {
      return copy.t('screen.strategy.date.yesterday', fallback: 'Yesterday');
    } else if (difference.inDays < 7) {
      return copy.t(
        'screen.strategy.date.days_ago',
        params: {'count': difference.inDays.toString()},
        fallback: '{{count}}d ago',
      );
    } else if (difference.inDays < 30) {
      return copy.t(
        'screen.strategy.date.weeks_ago',
        params: {'count': (difference.inDays / 7).floor().toString()},
        fallback: '{{count}}w ago',
      );
    } else if (difference.inDays < 365) {
      return copy.t(
        'screen.strategy.date.months_ago',
        params: {'count': (difference.inDays / 30).floor().toString()},
        fallback: '{{count}}mo ago',
      );
    } else {
      return copy.t(
        'screen.strategy.date.years_ago',
        params: {'count': (difference.inDays / 365).floor().toString()},
        fallback: '{{count}}y ago',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final copy = CopyService.instance;
    final theme = Theme.of(context);
    final statusColor = getStatusColor(strategy.status);
    final pnlValue = pnl?.totalPnl ?? 0.0;
    final pnlColor = getPnLColor(pnlValue);
    final isDark = theme.brightness == Brightness.dark;
    final secondaryText = isDark ? Colors.grey[400] : Colors.grey[600];
    final surface = theme.colorScheme.surface;

    return Container(
      margin: EdgeInsets.only(bottom: 12.w),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.06),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
        border: Border.all(
          color: isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.1),
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: EdgeInsets.all(16.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (baseCurrency.isNotEmpty)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.network(
                        CryptoIcons.getIconUrl(baseCurrency),
                        width: 34.w,
                        height: 34.w,
                        errorBuilder: (context, error, stackTrace) => Container(
                          width: 34.w,
                          height: 34.w,
                          decoration: BoxDecoration(
                            color: Colors.grey[300],
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Text(
                              baseCurrency.substring(0, 1).toUpperCase(),
                              style: TextStyle(
                                fontSize: 14.sp,
                                fontWeight: FontWeight.bold,
                                color: Colors.grey[700],
                              ),
                            ),
                          ),
                        ),
                      ),
                    )
                  else
                    Container(
                      width: 34.w,
                      height: 34.w,
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.currency_exchange,
                        size: 16.w,
                        color: Colors.grey,
                      ),
                    ),
                  SizedBox(width: 12.w),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          strategy.name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                _getSymbol(copy),
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  fontWeight: FontWeight.w600,
                                  color: secondaryText,
                                  fontFamily: 'monospace',
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: EdgeInsets.symmetric(
                                horizontal: 6.w,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _getMarketTypeLabel(copy),
                                style: TextStyle(
                                  fontSize: 10.sp,
                                  fontWeight: FontWeight.w600,
                                  color: secondaryText,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (strategy.exchange != null &&
                            strategy.exchange!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              SupportedExchanges.getName(strategy.exchange),
                              style: TextStyle(
                                fontSize: 11.sp,
                                color: secondaryText,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (strategy.exchange != null &&
                      strategy.exchange!.isNotEmpty)
                    _ExchangeLogo(exchangeId: strategy.exchange!),
                  SizedBox(width: 8.w),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: _getStatusCopyKey(strategy.status) == null
                        ? Text(
                            formatStatus(strategy.status),
                            style: TextStyle(
                              fontSize: 11.sp,
                              color: statusColor,
                              fontWeight: FontWeight.w600,
                            ),
                          )
                        : CopyText(
                            _getStatusCopyKey(strategy.status)!,
                            fallback: formatStatus(strategy.status),
                            style: TextStyle(
                              fontSize: 11.sp,
                              color: statusColor,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                  SizedBox(width: 6.w),
                  Icon(
                    Icons.chevron_right,
                    size: 18.w,
                    color: secondaryText,
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Divider(
                height: 1,
                thickness: 0.6,
                color: isDark
                    ? Colors.grey[850]
                    : Colors.grey.withValues(alpha: 0.15),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(
                        pnlValue > 0
                            ? Icons.trending_up
                            : pnlValue < 0
                                ? Icons.trending_down
                                : Icons.horizontal_rule,
                        size: 18.w,
                        color: pnlColor,
                      ),
                      const SizedBox(width: 6),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CopyText('screen.strategy.total_pnl', fallback: "Total PnL", style: TextStyle(
                              fontSize: 11.sp,
                              color: secondaryText,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            formatPnL(pnlValue),
                            style: TextStyle(
                              fontSize: 19.sp,
                              fontWeight: FontWeight.w700,
                              color: pnlColor,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (pnl != null)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        CopyText('screen.strategy.orders', fallback: "Orders", style: TextStyle(
                            fontSize: 11.sp,
                            color: secondaryText,
                          ),
                        ),
                        const SizedBox(height: 2),
                        CopyText(
                          'screen.strategy.filled_total',
                          params: {
                            'filled': pnl!.filledOrders.toString(),
                            'total': pnl!.totalOrders.toString(),
                          },
                          fallback: '{{filled}} / {{total}}',
                          style: TextStyle(
                            fontSize: 16.sp,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(Icons.schedule, size: 12.w, color: secondaryText),
                  SizedBox(width: 4.w),
                  CopyText(
                    'screen.strategy.created_at',
                    params: {'date': _formatDate(copy, strategy.createdAt)},
                    fallback: 'Created {{date}}',
                    style: TextStyle(fontSize: 11.sp, color: secondaryText),
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

class _SummaryMetric extends StatelessWidget {
  final IconData icon;
  final String labelKey;
  final String labelFallback;
  final String value;
  final Color valueColor;

  const _SummaryMetric({
    required this.icon,
    required this.labelKey,
    required this.labelFallback,
    required this.value,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: Colors.white, size: 16),
        ),
        const SizedBox(width: 8),
        Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CopyText(
          labelKey,
          fallback: labelFallback,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.8),
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            color: valueColor,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
        ),
      ],
    );
  }
}

/// Exchange logo widget with image support
class _ExchangeLogo extends StatelessWidget {
  final String exchangeId;

  const _ExchangeLogo({required this.exchangeId});

  @override
  Widget build(BuildContext context) {
    final config = SupportedExchanges.getById(exchangeId);
    final logoUrl = config?.getLogoUrl();
    final name = SupportedExchanges.getName(exchangeId);
    final color = SupportedExchanges.getColor(exchangeId);

    return Container(
      width: 24.w,
      height: 24.w,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: Colors.grey[300]!, width: 0.5),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(3.5),
        child: logoUrl != null
            ? Image.network(
                logoUrl,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  // Fallback to first letter
                  return Container(
                    color: color.withValues(alpha: 0.1),
                    child: Center(
                      child: Text(
                        name.substring(0, 1),
                        style: TextStyle(
                          fontSize: 10.sp,
                          fontWeight: FontWeight.bold,
                          color: color,
                        ),
                      ),
                    ),
                  );
                },
              )
            : Container(
                color: color.withValues(alpha: 0.1),
                child: Center(
                  child: Text(
                    name.substring(0, 1),
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: color,
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
