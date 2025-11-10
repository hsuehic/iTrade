import 'package:flutter/material.dart';
import '../services/strategy_service.dart';
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';
import '../utils/responsive_layout.dart';
import '../widgets/custom_app_bar.dart';

enum StatTab { topPerformers, byExchange, bySymbol }

enum SortField { name, pnl, orders, fillRate, count, activeCount, avgPnl }

class StatisticsScreen extends StatefulWidget {
  const StatisticsScreen({super.key});

  @override
  State<StatisticsScreen> createState() => _StatisticsScreenState();
}

class _StatisticsScreenState extends State<StatisticsScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  final StrategyService _strategyService = StrategyService.instance;

  StatTab _currentTab = StatTab.topPerformers;
  SortField _sortField = SortField.pnl;
  bool _sortAscending = false;

  Map<String, dynamic>? _analyticsData;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadAnalytics();
  }

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

  Future<void> _loadAnalytics() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await _strategyService.getAnalytics(limit: 50);
      setState(() {
        _analyticsData = data;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<dynamic> _getSortedData() {
    if (_analyticsData == null) return [];

    List<dynamic> data;
    switch (_currentTab) {
      case StatTab.topPerformers:
        data = List.from(_analyticsData!['topPerformers'] ?? []);
        break;
      case StatTab.byExchange:
        data = List.from(_analyticsData!['byExchange'] ?? []);
        break;
      case StatTab.bySymbol:
        data = List.from(_analyticsData!['bySymbol'] ?? []);
        break;
    }

    data.sort((a, b) {
      int comparison = 0;
      switch (_sortField) {
        case SortField.name:
          comparison = (a['name'] ?? '').compareTo(b['name'] ?? '');
          break;
        case SortField.pnl:
          final aPnl = (a['totalPnl'] ?? 0).toDouble();
          final bPnl = (b['totalPnl'] ?? 0).toDouble();
          comparison = aPnl.compareTo(bPnl);
          break;
        case SortField.orders:
          comparison = (a['totalOrders'] ?? 0).compareTo(b['totalOrders'] ?? 0);
          break;
        case SortField.fillRate:
          final aRate = double.tryParse(a['fillRate']?.toString() ?? '0') ?? 0;
          final bRate = double.tryParse(b['fillRate']?.toString() ?? '0') ?? 0;
          comparison = aRate.compareTo(bRate);
          break;
        case SortField.count:
          comparison = (a['count'] ?? 0).compareTo(b['count'] ?? 0);
          break;
        case SortField.activeCount:
          comparison = (a['activeCount'] ?? 0).compareTo(b['activeCount'] ?? 0);
          break;
        case SortField.avgPnl:
          final aAvg = (a['totalPnl'] ?? 0).toDouble() / (a['count'] ?? 1);
          final bAvg = (b['totalPnl'] ?? 0).toDouble() / (b['count'] ?? 1);
          comparison = aAvg.compareTo(bAvg);
          break;
      }
      return _sortAscending ? comparison : -comparison;
    });

    return data;
  }

  void _changeSortField(SortField field) {
    setState(() {
      if (_sortField == field) {
        _sortAscending = !_sortAscending;
      } else {
        _sortField = field;
        _sortAscending = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // Required for AutomaticKeepAliveClientMixin
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: CustomAppBar(title: 'Statistic'),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _buildError()
          : Column(
              children: [
                _buildTabs(isDark),
                Expanded(child: _buildContent(isDark)),
              ],
            ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          Text(
            'Failed to load statistics',
            style: TextStyle(color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: _loadAnalytics, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildTabs(bool isDark) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1A1A) : Colors.grey[100],
        border: Border(
          bottom: BorderSide(
            color: isDark
                ? Colors.grey[850]!
                : Colors.grey.withValues(alpha: 0.2),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildTab('Top Performers', StatTab.topPerformers, isDark),
          ),
          Expanded(child: _buildTab('By Exchange', StatTab.byExchange, isDark)),
          Expanded(child: _buildTab('By Symbol', StatTab.bySymbol, isDark)),
        ],
      ),
    );
  }

  Widget _buildTab(String title, StatTab tab, bool isDark) {
    final isSelected = _currentTab == tab;
    final theme = Theme.of(context);
    // 在深色模式下使用明确的亮青绿色确保可见性
    final primaryColor = theme.colorScheme.primary;

    return InkWell(
      onTap: () {
        setState(() {
          _currentTab = tab;
          // Reset sort when switching tabs
          switch (tab) {
            case StatTab.topPerformers:
              _sortField = SortField.pnl;
              break;
            case StatTab.byExchange:
              _sortField = SortField.pnl;
              break;
            case StatTab.bySymbol:
              _sortField = SortField.pnl;
              break;
          }
          _sortAscending = false;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: isSelected && isDark
              ? primaryColor.withValues(alpha: 0.25)
              : Colors.transparent,
          border: Border(
            bottom: BorderSide(
              color: isSelected ? primaryColor : Colors.transparent,
              width: 3,
            ),
          ),
        ),
        child: Text(
          title,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            color: isSelected
                ? primaryColor
                : (isDark ? Colors.grey[300] : Colors.grey[600]),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(bool isDark) {
    final data = _getSortedData();

    if (data.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.analytics_outlined, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'No data available',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    // Use grid on tablets for better space utilization
    if (_shouldUseTabletLayout(context)) {
      final screenWidth = MediaQuery.of(context).size.width;
      // Account for sidebar (~240px) to determine optimal column count
      final effectiveWidth = screenWidth - 240;
      final crossAxisCount = effectiveWidth > 900 ? 3 : 2;

      return Column(
        children: [
          // Header row with sort controls
          _buildGridHeader(isDark),
          // Grid content
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 2.8,
              ),
              itemCount: data.length,
              itemBuilder: (context, index) {
                final item = data[index];
                switch (_currentTab) {
                  case StatTab.topPerformers:
                    return _buildPerformerCard(item, isDark, isGridMode: true);
                  case StatTab.byExchange:
                    return _buildExchangeCard(item, isDark, isGridMode: true);
                  case StatTab.bySymbol:
                    return _buildSymbolCard(item, isDark, isGridMode: true);
                }
              },
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: data.length,
      itemBuilder: (context, index) {
        final item = data[index];
        switch (_currentTab) {
          case StatTab.topPerformers:
            return _buildPerformerCard(item, isDark);
          case StatTab.byExchange:
            return _buildExchangeCard(item, isDark);
          case StatTab.bySymbol:
            return _buildSymbolCard(item, isDark);
        }
      },
    );
  }

  Widget _buildGridHeader(bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[850] : Colors.grey.withValues(alpha: 0.05),
        border: Border(
          bottom: BorderSide(
            color: isDark
                ? Colors.grey[800]!
                : Colors.grey.withValues(alpha: 0.1),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: _buildSortButton(
              _currentTab == StatTab.topPerformers
                  ? 'Name'
                  : _currentTab == StatTab.byExchange
                  ? 'Exchange'
                  : 'Symbol',
              SortField.name,
              isDark,
            ),
          ),
          const SizedBox(width: 16),
          if (_currentTab == StatTab.topPerformers) ...[
            SizedBox(
              width: 100,
              child: _buildSortButton('PnL', SortField.pnl, isDark),
            ),
            const SizedBox(width: 16),
            SizedBox(
              width: 80,
              child: _buildSortButton('Orders', SortField.orders, isDark),
            ),
          ],
          if (_currentTab != StatTab.topPerformers) ...[
            SizedBox(
              width: 80,
              child: _buildSortButton('Count', SortField.count, isDark),
            ),
            const SizedBox(width: 16),
            SizedBox(
              width: 100,
              child: _buildSortButton('Total PnL', SortField.pnl, isDark),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPerformerCard(
    Map<String, dynamic> strategy,
    bool isDark, {
    bool isGridMode = false,
  }) {
    final pnl = (strategy['totalPnl'] ?? 0).toDouble();
    final totalOrders = strategy['totalOrders'] ?? 0;
    final filledOrders = strategy['filledOrders'] ?? 0;
    final fillRate = strategy['fillRate'] ?? '0.00';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        children: [
          // Header with sort controls (only in list mode)
          if (!isGridMode && strategy == _getSortedData().first)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.grey[850]
                    : Colors.grey.withValues(alpha: 0.05),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  topRight: Radius.circular(12),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _buildSortButton('Name', SortField.name, isDark),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 90,
                    child: _buildSortButton('PnL', SortField.pnl, isDark),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 70,
                    child: _buildSortButton('Orders', SortField.orders, isDark),
                  ),
                ],
              ),
            ),

          // Content
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // Crypto icon
                    Image.network(
                      CryptoIcons.getIconUrl(
                        strategy['symbol']?.toString().split('/')[0] ?? 'BTC',
                      ),
                      width: 32,
                      height: 32,
                      errorBuilder: (context, error, stackTrace) {
                        final baseCurrency =
                            (strategy['symbol']?.toString().split('/')[0] ??
                                    'BTC')
                                .toUpperCase();
                        return Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: Colors.grey[300],
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            baseCurrency[0],
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            strategy['name'] ?? 'Unknown',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Text(
                                strategy['normalizedSymbol'] ??
                                    strategy['symbol'] ??
                                    '',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[600],
                                ),
                              ),
                              const SizedBox(width: 4),
                              if (strategy['exchange'] != null)
                                _ExchangeLogo(
                                  exchange: strategy['exchange'],
                                  size: 16,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _formatCurrency(pnl),
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: pnl >= 0 ? Colors.green : Colors.red,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$filledOrders/$totalOrders ($fillRate%)',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExchangeCard(
    Map<String, dynamic> stats,
    bool isDark, {
    bool isGridMode = false,
  }) {
    final exchange = stats['exchange'] ?? 'Unknown';
    final count = stats['count'] ?? 0;
    final activeCount = stats['activeCount'] ?? 0;
    final totalPnl = (stats['totalPnl'] ?? 0).toDouble();
    final avgPnl = count > 0 ? totalPnl / count : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        children: [
          // Header with sort controls (only in list mode)
          if (!isGridMode && stats == _getSortedData().first)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Expanded(
                    child: _buildSortButton('Exchange', SortField.name, isDark),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 70,
                    child: _buildSortButton('Count', SortField.count, isDark),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 90,
                    child: _buildSortButton('Total PnL', SortField.pnl, isDark),
                  ),
                ],
              ),
            ),

          Row(
            children: [
              _ExchangeLogo(exchange: exchange, size: 32),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      SupportedExchanges.getName(exchange),
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$activeCount active / $count total',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    _formatCurrency(totalPnl),
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: totalPnl >= 0 ? Colors.green : Colors.red,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Avg: ${_formatCurrency(avgPnl)}',
                    style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSymbolCard(
    Map<String, dynamic> stats,
    bool isDark, {
    bool isGridMode = false,
  }) {
    final symbol = stats['symbol'] ?? 'Unknown';
    final normalizedSymbol = stats['normalizedSymbol'];
    final count = stats['count'] ?? 0;
    final activeCount = stats['activeCount'] ?? 0;
    final totalPnl = (stats['totalPnl'] ?? 0).toDouble();
    final avgPnl = count > 0 ? totalPnl / count : 0.0;
    final baseCurrency = symbol.toString().split('/')[0];

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        children: [
          // Header with sort controls (only in list mode)
          if (!isGridMode && stats == _getSortedData().first)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Expanded(
                    child: _buildSortButton('Symbol', SortField.name, isDark),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 70,
                    child: _buildSortButton('Count', SortField.count, isDark),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 90,
                    child: _buildSortButton('Total PnL', SortField.pnl, isDark),
                  ),
                ],
              ),
            ),

          Row(
            children: [
              Image.network(
                CryptoIcons.getIconUrl(baseCurrency),
                width: 32,
                height: 32,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      baseCurrency[0].toUpperCase(),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      normalizedSymbol ?? symbol,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$activeCount active / $count total',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    _formatCurrency(totalPnl),
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: totalPnl >= 0 ? Colors.green : Colors.red,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Avg: ${_formatCurrency(avgPnl)}',
                    style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSortButton(String label, SortField field, bool isDark) {
    final isActive = _sortField == field;
    return InkWell(
      onTap: () => _changeSortField(field),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                color: isActive
                    ? Theme.of(context).primaryColor
                    : (isDark ? Colors.grey[400] : Colors.grey[600]),
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (isActive) ...[
            const SizedBox(width: 4),
            Icon(
              _sortAscending ? Icons.arrow_upward : Icons.arrow_downward,
              size: 12,
              color: Theme.of(context).primaryColor,
            ),
          ],
        ],
      ),
    );
  }

  String _formatCurrency(double value) {
    if (value.abs() >= 1000) {
      return '\$${(value / 1000).toStringAsFixed(1)}k';
    }
    return '\$${value.toStringAsFixed(2)}';
  }
}

class _ExchangeLogo extends StatelessWidget {
  final String exchange;
  final double size;

  const _ExchangeLogo({required this.exchange, this.size = 24});

  @override
  Widget build(BuildContext context) {
    final config = SupportedExchanges.getById(exchange);
    final logoUrl = config?.getLogoUrl();

    if (logoUrl == null) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: Colors.grey[300],
          borderRadius: BorderRadius.circular(4),
        ),
        alignment: Alignment.center,
        child: Text(
          exchange.isNotEmpty ? exchange[0].toUpperCase() : '?',
          style: TextStyle(
            fontSize: size * 0.5,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
      );
    }

    return Image.network(
      logoUrl,
      width: size,
      height: size,
      errorBuilder: (context, error, stackTrace) {
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Colors.grey[300],
            borderRadius: BorderRadius.circular(4),
          ),
          alignment: Alignment.center,
          child: Text(
            exchange.isNotEmpty ? exchange[0].toUpperCase() : '?',
            style: TextStyle(
              fontSize: size * 0.5,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        );
      },
    );
  }
}
