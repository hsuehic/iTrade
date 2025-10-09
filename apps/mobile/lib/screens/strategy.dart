import 'package:flutter/material.dart';
import '../models/strategy.dart';
import '../services/strategy_service.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';
import 'strategy_detail.dart';

enum SortBy { name, pnl, status }

class StrategyScreen extends StatefulWidget {
  const StrategyScreen({super.key});

  @override
  State<StrategyScreen> createState() => _StrategyScreenState();
}

class _StrategyScreenState extends State<StrategyScreen> {
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
        return strategy.name.toLowerCase().contains(query) ||
            (strategy.symbol?.toLowerCase().contains(query) ?? false) ||
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
          case SortBy.status:
            comparison = a.status.compareTo(b.status);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // AppBar
          AppBar(title: const Text('Trading Strategies'), elevation: 0),
          // Search Bar
          SimpleSearchBar(onChanged: _handleSearch, onSubmitted: _handleSearch),
          const SizedBox(height: 8),
          // Sort Buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Text('Sort by:', style: TextStyle(fontSize: 14)),
                const SizedBox(width: 8),
                _SortChip(
                  label: 'Name',
                  isSelected: _sortBy == SortBy.name,
                  isAscending: _sortAscending,
                  onTap: () => _handleSortChange(SortBy.name),
                ),
                const SizedBox(width: 8),
                _SortChip(
                  label: 'PnL',
                  isSelected: _sortBy == SortBy.pnl,
                  isAscending: _sortAscending,
                  onTap: () => _handleSortChange(SortBy.pnl),
                ),
                const SizedBox(width: 8),
                _SortChip(
                  label: 'Status',
                  isSelected: _sortBy == SortBy.status,
                  isAscending: _sortAscending,
                  onTap: () => _handleSortChange(SortBy.status),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Strategy List
          Expanded(
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: _isLoading
                      ? const SizedBox(
                          height: 300,
                          child: Center(child: CircularProgressIndicator()),
                        )
                      : _errorMessage != null
                      ? Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              const Icon(
                                Icons.error_outline,
                                size: 64,
                                color: Colors.red,
                              ),
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
                        )
                      : _filteredStrategies.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              const SizedBox(height: 32),
                              Icon(
                                Icons.bar_chart,
                                size: 64,
                                color: Colors.grey[400],
                              ),
                              const SizedBox(height: 16),
                              Text(
                                _searchQuery.isEmpty
                                    ? 'No strategies yet'
                                    : 'No strategies found',
                                style: TextStyle(
                                  fontSize: 18,
                                  color: Colors.grey[600],
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _searchQuery.isEmpty
                                    ? 'Create your first strategy to get started'
                                    : 'Try a different search term',
                                style: TextStyle(
                                  fontSize: 14,
                                  color: Colors.grey[500],
                                ),
                              ),
                            ],
                          ),
                        )
                      : Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: _filteredStrategies.map((strategy) {
                              final pnl = _pnlMap[strategy.id];
                              final baseCurrency = _extractBaseCurrency(
                                strategy.symbol,
                              );
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
                            }).toList(),
                          ),
                        ),
                ),
              ],
            ),
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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? Theme.of(context).colorScheme.primary.withOpacity(0.1)
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
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: isSelected
                    ? Theme.of(context).colorScheme.primary
                    : Colors.grey[700],
              ),
            ),
            if (isSelected) ...[
              const SizedBox(width: 4),
              Icon(
                isAscending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 14,
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = getStatusColor(strategy.status);
    final pnlValue = pnl?.totalPnl ?? 0.0;
    final pnlColor = getPnLColor(pnlValue);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row
              Row(
                children: [
                  // Crypto Icon
                  if (baseCurrency.isNotEmpty)
                    Image.network(
                      CryptoIcons.getIconUrl(baseCurrency),
                      width: 32,
                      height: 32,
                      errorBuilder: (context, error, stackTrace) => Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: statusColor.withOpacity(0.2),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.monetization_on,
                          size: 20,
                          color: statusColor,
                        ),
                      ),
                    )
                  else
                    // Status indicator dot (fallback)
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: statusColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                  const SizedBox(width: 12),
                  // Strategy name
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          strategy.name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            // Market Type Icon (Perp/Futures)
                            if (strategy.marketType != 'spot') ...[
                              Icon(
                                strategy.marketType == 'perpetual'
                                    ? Icons.flash_on
                                    : Icons.trending_up,
                                size: 14,
                                color: Colors.orange,
                              ),
                              const SizedBox(width: 4),
                            ],
                            Text(
                              strategy.normalizedSymbol ??
                                  strategy.symbol ??
                                  'N/A',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Colors.grey[700],
                                fontFamily: 'monospace',
                              ),
                            ),
                            if (strategy.exchange != null &&
                                strategy.exchange!.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              ExchangeChip(
                                exchangeId: strategy.exchange,
                                showIcon: true,
                                fontSize: 10,
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Status badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      formatStatus(strategy.status),
                      style: TextStyle(
                        fontSize: 12,
                        color: statusColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 12),

              // PnL and Stats
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // PnL
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Total PnL',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        formatPnL(pnlValue),
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: pnlColor,
                        ),
                      ),
                    ],
                  ),
                  // Orders
                  if (pnl != null)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'Orders',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${pnl!.filledOrders} / ${pnl!.totalOrders}',
                          style: const TextStyle(
                            fontSize: 16,
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
