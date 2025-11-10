import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:fl_chart/fl_chart.dart';
import '../model/api.dart';
import '../widgets/asset_list.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/responsive_layout_builder.dart';

class PortfolioScreen extends StatefulWidget {
  const PortfolioScreen({super.key});

  @override
  State<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends State<PortfolioScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  String? _selectedSymbol;

  @override
  Widget build(BuildContext context) {
    super.build(context); // Required for AutomaticKeepAliveClientMixin
    final assets = [
      AssetItem(
        symbol: 'USDT',
        name: 'Tether',
        iconUrl: 'https://cryptocurrencyliveprices.com/img/usdt-tether.png',
        price: 1,
        amount: 6000,
        dailyChange: 0.12,
      ),
      AssetItem(
        symbol: 'BTC',
        name: 'Bitcoin',
        iconUrl: 'https://cryptocurrencyliveprices.com/img/btc-bitcoin.png',
        price: 68000,
        amount: 0.05,
        dailyChange: 1.25,
      ),
      AssetItem(
        symbol: 'ETH',
        name: 'Ethereum',
        iconUrl: 'https://cryptocurrencyliveprices.com/img/eth-ethereum.png',
        price: 3500,
        amount: 1.2,
        dailyChange: -0.85,
      ),
      AssetItem(
        symbol: 'SOL',
        name: 'Solana',
        iconUrl: 'https://cryptocurrencyliveprices.com/img/sol-solana.png',
        price: 180,
        amount: 5,
        dailyChange: 3.12,
      ),
    ];

    final total = assets.fold<double>(0, (sum, a) => sum + a.value);
    final dailyWeightedPct = total == 0
        ? 0.0
        : assets.fold<double>(0.0, (sum, a) => sum + a.value * a.dailyChange) /
              total;
    final chartData = assets.map((a) => _PieData(a.symbol, a.value)).toList();

    return Scaffold(
      appBar: const CustomAppBar(title: 'Portfolio'),
      body: ResponsiveLayoutBuilder(
        phone: (context) =>
            _buildPhoneLayout(assets, total, dailyWeightedPct, chartData),
        tablet: (context) =>
            _buildTabletLayout(assets, total, dailyWeightedPct, chartData),
      ),
    );
  }

  // Phone layout - single column
  Widget _buildPhoneLayout(
    List<AssetItem> assets,
    double total,
    double dailyWeightedPct,
    List<_PieData> chartData,
  ) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16.w, 12, 16.w, 0),
            child: _BalanceHeader(total: total, dailyPct: dailyWeightedPct),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(16.w),
            child: _buildAllocationChart(chartData, total),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 8),
            child: _buildAssetsHeader(),
          ),
        ),
        SliverToBoxAdapter(
          child: PortfolioAssetList(
            assets: assets,
            shrinkWrap: true,
            selectedSymbol: _selectedSymbol,
            onTap: (asset) {
              setState(() {
                _selectedSymbol = _selectedSymbol == asset.symbol
                    ? null
                    : asset.symbol;
              });
            },
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 16)),
      ],
    );
  }

  // Tablet layout - two columns
  Widget _buildTabletLayout(
    List<AssetItem> assets,
    double total,
    double dailyWeightedPct,
    List<_PieData> chartData,
  ) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(24.w, 16, 24.w, 0),
            child: _BalanceHeader(total: total, dailyPct: dailyWeightedPct),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 16)),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 24.w),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Left: Allocation Chart
                Expanded(
                  flex: 2,
                  child: _buildAllocationChart(chartData, total),
                ),
                const SizedBox(width: 24),
                // Right: Assets List (top 3)
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildAssetsHeader(),
                      const SizedBox(height: 8),
                      ...assets
                          .take(3)
                          .map((asset) => _buildAssetListItem(asset)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 24.w),
            child: Text(
              'All Assets',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontSize: 16.sp,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
        SliverPadding(
          padding: EdgeInsets.symmetric(horizontal: 24.w),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 2.5,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) => _buildAssetCard(assets[index]),
              childCount: assets.length,
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 16)),
      ],
    );
  }

  Widget _buildAllocationChart(List<_PieData> chartData, double total) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(0, 12, 12.w, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4),
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'Allocation',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 200,
              child: PieChart(
                PieChartData(
                  sectionsSpace: 2,
                  centerSpaceRadius: 0,
                  pieTouchData: PieTouchData(
                    touchCallback: (FlTouchEvent event, pieTouchResponse) {
                      if (event is FlTapUpEvent &&
                          pieTouchResponse != null &&
                          pieTouchResponse.touchedSection != null) {
                        setState(() {
                          final index = pieTouchResponse
                              .touchedSection!
                              .touchedSectionIndex;
                          _selectedSymbol =
                              index >= 0 && index < chartData.length
                              ? chartData[index].label
                              : null;
                        });
                      }
                    },
                  ),
                  sections: chartData.asMap().entries.map((entry) {
                    final index = entry.key;
                    final data = entry.value;
                    final isSelected = _selectedSymbol == data.label;
                    final percentage = total == 0
                        ? 0
                        : (data.value / total * 100);

                    final colors = [
                      Colors.blue.shade300,
                      Colors.orange.shade300,
                      Colors.green.shade300,
                      Colors.purple.shade300,
                      Colors.red.shade300,
                      Colors.teal.shade300,
                    ];

                    return PieChartSectionData(
                      color: colors[index % colors.length],
                      value: data.value,
                      title: '${percentage.toStringAsFixed(1)}%',
                      radius: isSelected ? 110 : 100,
                      titleStyle: TextStyle(
                        fontSize: 12.sp,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                      titlePositionPercentageOffset: 0.6,
                    );
                  }).toList(),
                ),
              ),
            ),
            const SizedBox(height: 12),
            _buildChartLegend(context, chartData, total),
          ],
        ),
      ),
    );
  }

  Widget _buildAssetsHeader() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          'Assets',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontSize: 14.sp,
            fontWeight: FontWeight.w600,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }

  Widget _buildAssetListItem(AssetItem asset) {
    final changeColor = asset.dailyChange >= 0
        ? Colors.green
        : Theme.of(context).colorScheme.error;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _selectedSymbol == asset.symbol
            ? Theme.of(context).primaryColor.withValues(alpha: 0.1)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _selectedSymbol == asset.symbol
              ? Theme.of(context).primaryColor
              : Colors.grey.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        children: [
          Image.network(
            asset.iconUrl,
            width: 28.w,
            height: 28.w,
            errorBuilder: (context, error, stackTrace) =>
                Icon(Icons.currency_bitcoin, size: 28.w),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  asset.symbol,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 12.sp,
                  ),
                ),
                Text(
                  '\$${asset.value.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Icon(
                asset.dailyChange >= 0
                    ? Icons.trending_up
                    : Icons.trending_down,
                size: 16.w,
                color: changeColor,
              ),
              Text(
                '${asset.dailyChange >= 0 ? '+' : ''}${asset.dailyChange.toStringAsFixed(2)}%',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: changeColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAssetCard(AssetItem asset) {
    final changeColor = asset.dailyChange >= 0
        ? Colors.green
        : Theme.of(context).colorScheme.error;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return InkWell(
      onTap: () {
        setState(() {
          _selectedSymbol = _selectedSymbol == asset.symbol
              ? null
              : asset.symbol;
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: _selectedSymbol == asset.symbol
              ? theme.primaryColor.withValues(alpha: 0.1)
              : (isDark
                    ? Colors.grey[900]
                    : Colors.white.withValues(alpha: 0.5)),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: _selectedSymbol == asset.symbol
                ? theme.primaryColor
                : (isDark
                      ? Colors.grey[850]!
                      : Colors.grey.withValues(alpha: 0.08)),
          ),
        ),
        child: Row(
          children: [
            Image.network(
              asset.iconUrl,
              width: 32.w,
              height: 32.w,
              errorBuilder: (context, error, stackTrace) =>
                  Icon(Icons.currency_bitcoin, size: 32.w),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    asset.symbol,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14.sp,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '\$${asset.value.toStringAsFixed(2)}',
                    style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  asset.dailyChange >= 0
                      ? Icons.trending_up
                      : Icons.trending_down,
                  size: 12.w,
                  color: changeColor,
                ),
                const SizedBox(height: 2),
                Text(
                  '${asset.dailyChange >= 0 ? '+' : ''}${asset.dailyChange.toStringAsFixed(2)}%',
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
      ),
    );
  }

  Widget _buildChartLegend(
    BuildContext context,
    List<_PieData> chartData,
    double total,
  ) {
    final colors = [
      Colors.blue.shade300,
      Colors.orange.shade300,
      Colors.green.shade300,
      Colors.purple.shade300,
      Colors.red.shade300,
      Colors.teal.shade300,
    ];

    return Center(
      child: Wrap(
        spacing: 12,
        runSpacing: 8,
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: chartData.asMap().entries.map((entry) {
          final index = entry.key;
          final data = entry.value;

          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 12.w, // ✅ Uniform scaling
                height: 12.w, // ✅ Uniform scaling
                decoration: BoxDecoration(
                  color: colors[index % colors.length],
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                data.label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontSize: 12.sp,
                ), // ✅ Adaptive font
              ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _PieData {
  final String label;
  final double value;
  _PieData(this.label, this.value);
}

class _BalanceHeader extends StatefulWidget {
  final double total;
  final double dailyPct; // weighted daily % change

  const _BalanceHeader({required this.total, required this.dailyPct});

  @override
  State<_BalanceHeader> createState() => _BalanceHeaderState();
}

class _BalanceHeaderState extends State<_BalanceHeader> {
  String _period = '1D';
  bool _isBalanceHidden = false;

  static const Map<String, int> _periodDays = {
    '1D': 1,
    '7D': 7,
    '1M': 30,
    'YTD': 365,
  };

  double get _selectedPct {
    final factor = _periodDays[_period] ?? 1;
    return widget.dailyPct * factor;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final changeColor = _selectedPct >= 0
        ? Colors.green
        : theme.colorScheme.error;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Total Balance',
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12.sp, // ✅ Adaptive font
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () {
                setState(() {
                  _isBalanceHidden = !_isBalanceHidden;
                });
              },
              child: Icon(
                _isBalanceHidden ? Icons.visibility_off : Icons.visibility,
                size: 16.w, // ✅ Uniform scaling
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        TweenAnimationBuilder<double>(
          duration: const Duration(milliseconds: 800),
          curve: Curves.easeOut,
          tween: Tween(begin: widget.total - 10, end: widget.total),
          builder: (context, value, _) => SizedBox(
            height: theme.textTheme.displaySmall?.fontSize != null
                ? (theme.textTheme.displaySmall!.fontSize! * 1.2)
                : null,
            child: Text(
              _isBalanceHidden ? '••••••' : '\$${value.toStringAsFixed(2)}',
              style: theme.textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Row(
              children: [
                Icon(
                  _selectedPct >= 0 ? Icons.trending_up : Icons.trending_down,
                  size: 16.w, // ✅ Uniform scaling
                  color: changeColor,
                ),
                const SizedBox(width: 4),
                Text(
                  _isBalanceHidden
                      ? '••••%'
                      : '${_selectedPct >= 0 ? '+' : ''}${_selectedPct.toStringAsFixed(2)}%',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: changeColor,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            const SizedBox(width: 12),
            PopupMenuButton<String>(
              onSelected: (value) {
                setState(() {
                  _period = value;
                });
              },
              position: PopupMenuPosition.under,
              color: theme.brightness == Brightness.dark
                  ? const Color(0xFF2A2A2A)
                  : Colors.white,
              elevation: 4,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8), // ✅ Uniform radius
              ),
              padding: EdgeInsets.zero,
              itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
                for (final period in ['1D', '7D', '1M', 'YTD'])
                  PopupMenuItem<String>(
                    value: period,
                    height: 36,
                    padding: EdgeInsets.symmetric(
                      horizontal: 12.w, // ✅ Width-adapted
                      vertical: 0, // ✅ Fixed vertical
                    ),
                    child: Text(
                      period,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12.sp, // ✅ Adaptive font
                        fontWeight: period == _period ? FontWeight.bold : null,
                        color: theme.brightness == Brightness.dark
                            ? Colors.grey[200]
                            : Colors.grey[800],
                      ),
                    ),
                  ),
              ],
              child: Container(
                padding: EdgeInsets.symmetric(
                  horizontal: 8.w,
                  vertical: 4,
                ), // ✅ Width-adapted horizontal
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(6), // ✅ Uniform radius
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _period,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12.sp, // ✅ Adaptive font
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.arrow_drop_down,
                      size: 16.w, // ✅ Uniform scaling
                      color: theme.colorScheme.onSurface,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
