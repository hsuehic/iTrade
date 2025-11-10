import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../models/strategy.dart';
import '../services/strategy_service.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../widgets/custom_app_bar.dart';
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';
import '../utils/responsive_layout.dart';
import 'strategy_detail.dart';

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
        return Colors.green;
      case 'stopped':
        return Colors.grey;
      case 'paused':
        return Colors.orange;
      case 'error':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Color _getPnLColor(double pnl) {
    if (pnl > 0) return Colors.green;
    if (pnl < 0) return Colors.red;
    return Colors.grey;
  }

  String _formatPnL(double pnl) {
    final sign = pnl >= 0 ? '+' : '';
    return '$sign${pnl.toStringAsFixed(2)}';
  }

  String _formatStatus(String status) {
    switch (status) {
      case 'active':
        return 'Active';
      case 'stopped':
        return 'Stopped';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
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
            child: const Text('Retry'),
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
          Text(
            _searchQuery.isEmpty ? 'No strategies yet' : 'No strategies found',
            style: TextStyle(fontSize: 18.sp, color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          Text(
            _searchQuery.isEmpty
                ? 'Create your first strategy using web manager to get started'
                : 'Try a different search term',
            style: TextStyle(fontSize: 14.sp, color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }

  Widget _buildPhoneList() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _filteredStrategies.length,
      itemBuilder: (context, index) {
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
    );
  }

  Widget _buildTabletGrid() {
    return GridView.builder(
      padding: EdgeInsets.all(24.w),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 1.6,
      ),
      itemCount: _filteredStrategies.length,
      itemBuilder: (context, index) {
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
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // Required for AutomaticKeepAliveClientMixin
    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      // AppBar
      appBar: const CustomAppBar(title: 'Strategies'),
      body: Column(
        children: [
          // Search Bar
          SimpleSearchBar(onChanged: _handleSearch, onSubmitted: _handleSearch),
          const SizedBox(height: 16),
          // Sort Buttons
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w),
            child: Row(
              children: [
                  _SortChip(
                    label: 'Name',
                    isSelected: _sortBy == SortBy.name,
                    isAscending: _sortAscending,
                    onTap: () => _handleSortChange(SortBy.name),
                  ),
                  SizedBox(width: 8.w),
                  _SortChip(
                    label: 'PnL',
                    isSelected: _sortBy == SortBy.pnl,
                    isAscending: _sortAscending,
                    onTap: () => _handleSortChange(SortBy.pnl),
                  ),
                  SizedBox(width: 8.w),
                  _SortChip(
                    label: 'Date',
                    isSelected: _sortBy == SortBy.createdAt,
                    isAscending: _sortAscending,
                    onTap: () => _handleSortChange(SortBy.createdAt),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Strategy List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null
                    ? _buildErrorView()
                    : _filteredStrategies.isEmpty
                        ? _buildEmptyView()
                        : context.isTablet
                            ? _buildTabletGrid()
                            : _buildPhoneList(),
          ),
        ],
      ),
    );
  }
}

class _SortChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final bool isAscending;
  final VoidCallback onTap;

  const _SortChip({
    required this.label,
    required this.isSelected,
    required this.isAscending,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.1)
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
            Text(
              label,
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

  String _getSymbolWithMarketType() {
    final symbol = strategy.normalizedSymbol ?? strategy.symbol ?? 'N/A';
    if (strategy.marketType == 'perpetual') {
      return '$symbol ⚡'; // Lightning bolt for perpetual
    } else if (strategy.marketType == 'futures') {
      return '$symbol 📅'; // Calendar for futures
    }
    return symbol;
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays == 0) {
      return 'Today';
    } else if (difference.inDays == 1) {
      return 'Yesterday';
    } else if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    } else if (difference.inDays < 30) {
      return '${(difference.inDays / 7).floor()}w ago';
    } else if (difference.inDays < 365) {
      return '${(difference.inDays / 30).floor()}mo ago';
    } else {
      return '${(difference.inDays / 365).floor()}y ago';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = getStatusColor(strategy.status);
    final pnlValue = pnl?.totalPnl ?? 0.0;
    final pnlColor = getPnLColor(pnlValue);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: EdgeInsets.only(bottom: 8.w),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.08),
          width: 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: EdgeInsets.all(16.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row
              Row(
                children: [
                  // Crypto Icon
                  if (baseCurrency.isNotEmpty)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.network(
                        CryptoIcons.getIconUrl(baseCurrency),
                        width: 32.w,
                        height: 32.w,
                        errorBuilder: (context, error, stackTrace) => Container(
                          width: 32.w,
                          height: 32.w,
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
                      width: 32.w,
                      height: 32.w,
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
                  const SizedBox(width: 12),
                  // Strategy name and symbol
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          strategy.name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            // Symbol with market type indicator at the end
                            Flexible(
                              child:                               Text(
                                _getSymbolWithMarketType(),
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.grey[700],
                                  fontFamily: 'monospace',
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Exchange logo
                  if (strategy.exchange != null &&
                      strategy.exchange!.isNotEmpty)
                    _ExchangeLogo(exchangeId: strategy.exchange!),
                  const SizedBox(width: 8),
                  // Status badge
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: 8.w,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      formatStatus(strategy.status),
                      style: TextStyle(
                        fontSize: 11.sp,
                        color: statusColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 12),
              Divider(
                height: 1,
                thickness: 0.5,
                color: isDark
                    ? Colors.grey[850]
                    : Colors.grey.withValues(alpha: 0.15),
              ),
              const SizedBox(height: 12),

              // PnL and Stats
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // PnL with arrow
                  Expanded(
                    child: Row(
                      children: [
                        Icon(
                          pnlValue > 0
                              ? Icons.arrow_upward
                              : pnlValue < 0
                              ? Icons.arrow_downward
                              : Icons.remove,
                          size: 20.w,
                          color: pnlColor,
                        ),
                        const SizedBox(width: 4),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Total PnL',
                              style: TextStyle(
                                fontSize: 11.sp,
                                color: Colors.grey[600],
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              formatPnL(pnlValue),
                              style: TextStyle(
                                fontSize: 18.sp,
                                fontWeight: FontWeight.bold,
                                color: pnlColor,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Orders
                  if (pnl != null)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'Orders',
                          style: TextStyle(
                            fontSize: 11.sp,
                            color: Colors.grey[600],
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${pnl!.filledOrders} / ${pnl!.totalOrders}',
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
              // Created time
              Row(
                children: [
                  Icon(Icons.schedule, size: 12.w, color: Colors.grey[500]),
                  SizedBox(width: 4.w),
                  Text(
                    'Created ${_formatDate(strategy.createdAt)}',
                    style: TextStyle(fontSize: 11.sp, color: Colors.grey[500]),
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
