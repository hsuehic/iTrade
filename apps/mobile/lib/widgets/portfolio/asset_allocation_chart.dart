import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/portfolio.dart';
import '../../design/tokens/color.dart';

/// A professional asset allocation donut chart with legend.
class AssetAllocationChart extends StatefulWidget {
  final List<AggregatedAsset> assets;
  final String? selectedAsset;
  final ValueChanged<String?>? onAssetSelected;

  const AssetAllocationChart({
    super.key,
    required this.assets,
    this.selectedAsset,
    this.onAssetSelected,
  });

  @override
  State<AssetAllocationChart> createState() => _AssetAllocationChartState();
}

class _AssetAllocationChartState extends State<AssetAllocationChart>
    with SingleTickerProviderStateMixin {
  int _touchedIndex = -1;
  late AnimationController _animationController;
  late Animation<double> _animation;

  // Harmonious color palette - flows from teal/cyan through blues to warm accents
  // Ordered for visual harmony: cool tones first, then warm accents
  static const List<Color> _chartColors = [
    ColorTokens.chartTeal, // Primary teal - matches brand
    ColorTokens.chartCyan, // Cyan - cool transition
    ColorTokens.chartBlue, // Blue - cool
    ColorTokens.chartIndigo, // Indigo - cool/deep
    ColorTokens.chartEmerald, // Emerald - natural
    ColorTokens.chartViolet, // Violet - accent
    ColorTokens.chartSky, // Sky - light accent
    ColorTokens.chartAmber, // Amber - warm accent
    ColorTokens.chartRose, // Rose - warm accent
    ColorTokens.chartLime, // Lime - fresh accent
  ];

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );
    _animation = CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeOutCubic,
    );
    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    // Show top 6 assets, group rest as "Others"
    final displayAssets = _getDisplayAssets();
    final total = displayAssets.fold(0.0, (sum, a) => sum + a.total);

    if (displayAssets.isEmpty) {
      return _buildEmptyState(context);
    }

    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) => Container(
        margin: EdgeInsets.symmetric(horizontal: 16.w),
        padding: EdgeInsets.all(16.w),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.08)
                : Colors.black.withValues(alpha: 0.05),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.08),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Section header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Asset Allocation',
                  style: TextStyle(
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.white : Colors.black87,
                  ),
                ),
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${displayAssets.length} Assets',
                    style: TextStyle(
                      fontSize: 11.sp,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: 16),

            // Chart and legend row
            Row(
              children: [
                // Donut chart
                Expanded(
                  flex: 5,
                  child: SizedBox(
                    height: 180,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        PieChart(
                          PieChartData(
                            sectionsSpace: 2,
                            centerSpaceRadius: 50,
                            startDegreeOffset: -90,
                            pieTouchData: PieTouchData(
                              touchCallback: (event, pieTouchResponse) {
                                if (event is FlTapUpEvent &&
                                    pieTouchResponse != null &&
                                    pieTouchResponse.touchedSection != null) {
                                  final index = pieTouchResponse
                                      .touchedSection!
                                      .touchedSectionIndex;
                                  setState(() {
                                    _touchedIndex = _touchedIndex == index ? -1 : index;
                                  });
                                  if (index >= 0 && index < displayAssets.length) {
                                    widget.onAssetSelected?.call(
                                      _touchedIndex == -1
                                          ? null
                                          : displayAssets[index].asset,
                                    );
                                  }
                                }
                              },
                            ),
                            sections: _buildChartSections(displayAssets, total),
                          ),
                        ),
                        // Center info
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Total',
                              style: TextStyle(
                                fontSize: 11.sp,
                                fontWeight: FontWeight.w500,
                                color: isDark
                                    ? Colors.white60
                                    : Colors.black54,
                              ),
                            ),
                            Text(
                              '\$${_formatValue(total)}',
                              style: TextStyle(
                                fontSize: 14.sp,
                                fontWeight: FontWeight.w700,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),

                // Legend
                Expanded(
                  flex: 5,
                  child: _buildLegend(displayAssets, total, isDark),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  List<AggregatedAsset> _getDisplayAssets() {
    if (widget.assets.isEmpty) return [];

    // Sort by total value descending
    final sorted = List<AggregatedAsset>.from(widget.assets)
      ..sort((a, b) => b.total.compareTo(a.total));

    // Take top 6, combine rest as "Others"
    if (sorted.length <= 6) return sorted;

    final top6 = sorted.take(6).toList();
    final others = sorted.skip(6).toList();
    final othersTotal = others.fold(0.0, (sum, a) => sum + a.total);
    final totalPercentage = others.fold(0.0, (sum, a) => sum + a.percentage);

    if (othersTotal > 0) {
      top6.add(AggregatedAsset(
        asset: 'Others',
        free: 0,
        locked: 0,
        total: othersTotal,
        percentage: totalPercentage,
      ));
    }

    return top6;
  }

  List<PieChartSectionData> _buildChartSections(
    List<AggregatedAsset> assets,
    double total,
  ) {
    return assets.asMap().entries.map((entry) {
      final index = entry.key;
      final asset = entry.value;
      final isTouched = _touchedIndex == index;
      final percentage = total > 0 ? (asset.total / total * 100) : 0;

      return PieChartSectionData(
        color: _chartColors[index % _chartColors.length],
        value: asset.total,
        title: percentage >= 5 ? '${percentage.toStringAsFixed(1)}%' : '',
        radius: isTouched ? 35 : 28,
        titleStyle: TextStyle(
          fontSize: 10.sp,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
        titlePositionPercentageOffset: 0.6,
      );
    }).toList();
  }

  Widget _buildLegend(
    List<AggregatedAsset> assets,
    double total,
    bool isDark,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: assets.asMap().entries.map((entry) {
        final index = entry.key;
        final asset = entry.value;
        final isSelected = _touchedIndex == index;
        final percentage = total > 0 ? (asset.total / total * 100) : 0;

        return GestureDetector(
          onTap: () {
            setState(() {
              _touchedIndex = _touchedIndex == index ? -1 : index;
            });
            widget.onAssetSelected?.call(
              _touchedIndex == -1 ? null : asset.asset,
            );
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: EdgeInsets.only(bottom: 6),
            padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 6),
            decoration: BoxDecoration(
              color: isSelected
                  ? _chartColors[index % _chartColors.length]
                      .withValues(alpha: 0.15)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                // Color indicator
                Container(
                  width: 10.w,
                  height: 10.w,
                  decoration: BoxDecoration(
                    color: _chartColors[index % _chartColors.length],
                    shape: BoxShape.circle,
                  ),
                ),
                SizedBox(width: 8.w),
                // Asset icon and name
                if (asset.asset != 'Others')
                  CachedNetworkImage(
                    imageUrl: asset.iconUrl,
                    width: 18.w,
                    height: 18.w,
                    placeholder: (context, url) => SizedBox(
                      width: 18.w,
                      height: 18.w,
                    ),
                    errorWidget: (context, url, error) => Icon(
                      Icons.currency_bitcoin,
                      size: 18.w,
                      color: _chartColors[index % _chartColors.length],
                    ),
                  )
                else
                  Icon(
                    Icons.more_horiz,
                    size: 18.w,
                    color: isDark ? Colors.white60 : Colors.black54,
                  ),
                SizedBox(width: 6.w),
                Expanded(
                  child: Text(
                    asset.asset,
                    style: TextStyle(
                      fontSize: 11.sp,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                      color: isDark ? Colors.white : Colors.black87,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  '${percentage.toStringAsFixed(1)}%',
                  style: TextStyle(
                    fontSize: 11.sp,
                    fontWeight: FontWeight.w600,
                    color: _chartColors[index % _chartColors.length],
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      padding: EdgeInsets.all(32.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.05),
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.pie_chart_outline_rounded,
            size: 48.w,
            color: isDark ? Colors.white30 : Colors.black26,
          ),
          SizedBox(height: 12),
          Text(
            'No Assets Yet',
            style: TextStyle(
              fontSize: 16.sp,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white60 : Colors.black54,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Your portfolio allocation will appear here',
            style: TextStyle(
              fontSize: 12.sp,
              color: isDark ? Colors.white38 : Colors.black38,
            ),
          ),
        ],
      ),
    );
  }

  String _formatValue(double value) {
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(2)}M';
    } else if (value >= 1000) {
      return '${(value / 1000).toStringAsFixed(2)}K';
    } else {
      return value.toStringAsFixed(2);
    }
  }
}
