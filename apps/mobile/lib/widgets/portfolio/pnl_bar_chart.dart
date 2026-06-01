import 'dart:async';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../services/portfolio_service.dart';

const _kPositiveColor = Color(0xFF22C55E); // green-500
const _kNegativeColor = Color(0xFFEF4444); // red-500

/// Bar chart showing P&L per hour / day / month, excluding deposits & withdrawals.
class PnlBarChart extends StatefulWidget {
  final String selectedExchange;
  final Duration refreshInterval;

  const PnlBarChart({
    super.key,
    required this.selectedExchange,
    this.refreshInterval = const Duration(seconds: 60),
  });

  @override
  State<PnlBarChart> createState() => _PnlBarChartState();
}

class _PnlBarChartState extends State<PnlBarChart> {
  String _granularity = 'day'; // 'hour' | 'day' | 'month'
  List<Map<String, dynamic>> _data = [];
  List<String> _exchanges = [];
  bool _loading = true;
  bool _hasError = false;
  Timer? _timer;
  int? _touchedIndex;

  @override
  void initState() {
    super.initState();
    _fetchData();
    _timer = Timer.periodic(widget.refreshInterval, (_) => _fetchData(silent: true));
  }

  @override
  void didUpdateWidget(PnlBarChart old) {
    super.didUpdateWidget(old);
    if (old.selectedExchange != widget.selectedExchange) {
      setState(() {
        _loading = true;
        _data = [];
        _touchedIndex = null;
      });
      _fetchData();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _fetchData({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final data = await PortfolioService.instance.fetchPnlChartData(
        exchange: widget.selectedExchange,
        granularity: _granularity,
      );
      if (!mounted) return;
      setState(() {
        _data = data;
        _exchanges = data.isNotEmpty
            ? data[0].keys
                .where((k) => k != 'date' && k != 'total')
                .toList()
            : [];
        _loading = false;
        _hasError = false;
        _touchedIndex = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
      });
    }
  }

  void _onGranularityChanged(String g) {
    if (_granularity == g) return;
    setState(() {
      _granularity = g;
      _loading = true;
      _data = [];
      _exchanges = [];
      _touchedIndex = null;
    });
    _fetchData();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.06),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(context, isDark),
          _buildChart(context, isDark),
          _buildSummary(context, isDark),
          SizedBox(height: 12.w),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 14.w, 8.w, 4.w),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'P&L Chart',
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.w700,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
              SizedBox(height: 2.w),
              Text(
                'Excl. deposits & withdrawals',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: isDark ? Colors.white38 : Colors.black38,
                ),
              ),
            ],
          ),
          const Spacer(),
          _GranularitySelector(
            current: _granularity,
            onChanged: _onGranularityChanged,
            isDark: isDark,
          ),
        ],
      ),
    );
  }

  Widget _buildChart(BuildContext context, bool isDark) {
    if (_loading) {
      return SizedBox(
        height: 180.w,
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (_hasError || _data.isEmpty) {
      return SizedBox(
        height: 180.w,
        child: Center(
          child: Text(
            _hasError ? 'Failed to load P&L data' : 'No P&L data for this period',
            style: TextStyle(fontSize: 12.sp, color: Colors.grey),
          ),
        ),
      );
    }

    // Always use 'total' for the bar — per-exchange breakdown is in tooltip only.
    // This ensures correct bar positioning when exchanges have mixed positive/negative P&L.
    const barKey = 'total';

    // Build bar groups
    double yMin = 0;
    double yMax = 0;
    final groups = <BarChartGroupData>[];
    for (int i = 0; i < _data.length; i++) {
      final val = (double.tryParse(_data[i][barKey]?.toString() ?? '0') ?? 0);
      yMin = math.min(yMin, val);
      yMax = math.max(yMax, val);
      groups.add(BarChartGroupData(
        x: i,
        barRods: [
          BarChartRodData(
            toY: val,
            color: val >= 0 ? _kPositiveColor : _kNegativeColor,
            width: _barWidth(),
            borderRadius: BorderRadius.vertical(
              top: val >= 0 ? const Radius.circular(3) : Radius.zero,
              bottom: val < 0 ? const Radius.circular(3) : Radius.zero,
            ),
          ),
        ],
        showingTooltipIndicators: _touchedIndex == i ? [0] : [],
      ));
    }

    final pad = math.max((yMax - yMin).abs() * 0.12, 1.0);
    final domainMin = yMin - pad;
    final domainMax = yMax + pad;

    final labelColor = isDark ? Colors.white54 : Colors.black38;
    final gridColor = isDark
        ? Colors.white.withValues(alpha: 0.07)
        : Colors.black.withValues(alpha: 0.07);

    return SizedBox(
      height: 180.w,
      child: Padding(
        padding: EdgeInsets.only(left: 4.w, right: 16.w, top: 8.w, bottom: 4.w),
        child: BarChart(
          BarChartData(
            minY: domainMin,
            maxY: domainMax,
            barGroups: groups,
            gridData: FlGridData(
              show: true,
              drawVerticalLine: false,
              horizontalInterval: math.max((domainMax - domainMin) / 5, 0.001),
              getDrawingHorizontalLine: (_) => FlLine(
                color: gridColor,
                strokeWidth: 1,
                dashArray: [4, 4],
              ),
            ),
            borderData: FlBorderData(show: false),
            extraLinesData: ExtraLinesData(
              horizontalLines: [
                HorizontalLine(
                  y: 0,
                  color: isDark ? Colors.white54 : Colors.black45,
                  strokeWidth: 1.5,
                ),
              ],
            ),
            titlesData: FlTitlesData(
              leftTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 56.w,
                  interval: math.max((domainMax - domainMin) / 4, 0.001),
                  getTitlesWidget: (v, _) => Padding(
                    padding: EdgeInsets.only(right: 4.w),
                    child: Text(
                      _formatCompact(v),
                      style: TextStyle(fontSize: 9.sp, color: labelColor),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ),
              ),
              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 22,
                  interval: _xLabelInterval(),
                  getTitlesWidget: (v, _) {
                    final idx = v.round();
                    if (idx < 0 || idx >= _data.length) return const SizedBox.shrink();
                    final label = _formatDateLabel(_data[idx]['date']?.toString() ?? '');
                    return Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        label,
                        style: TextStyle(fontSize: 9.sp, color: labelColor),
                      ),
                    );
                  },
                ),
              ),
            ),
            barTouchData: BarTouchData(
              touchCallback: (event, response) {
                if (!event.isInterestedForInteractions) {
                  setState(() => _touchedIndex = null);
                } else if (response?.spot != null) {
                  setState(() => _touchedIndex = response!.spot!.touchedBarGroupIndex);
                }
              },
              touchTooltipData: BarTouchTooltipData(
                getTooltipColor: (_) => isDark ? const Color(0xFF1A2231) : Colors.white,
                tooltipBorder: BorderSide(
                  color: isDark ? Colors.white12 : Colors.black12,
                ),
                tooltipBorderRadius: BorderRadius.circular(8),
                getTooltipItem: (group, _, rod, __) {
                  final idx = group.x;
                  if (idx < 0 || idx >= _data.length) return null;
                  final point = _data[idx];
                  final dateLabel = _formatDateFull(point['date']?.toString() ?? '');
                  final totalVal = rod.toY;
                  final totalColor = totalVal >= 0 ? _kPositiveColor : _kNegativeColor;
                  final totalSign = totalVal >= 0 ? '+' : '';

                  // Build per-exchange breakdown lines
                  final exchangeLines = <TextSpan>[];
                  for (final ex in _exchanges) {
                    final exVal = double.tryParse(point[ex.toLowerCase()]?.toString() ?? '0') ?? 0;
                    final exColor = exVal >= 0 ? _kPositiveColor : _kNegativeColor;
                    final exSign = exVal >= 0 ? '+' : '';
                    final exLabel = '${ex[0].toUpperCase()}${ex.substring(1)}';
                    exchangeLines.add(TextSpan(
                      text: '$exLabel: $exSign\$${_formatCompactAbs(exVal.abs())}\n',
                      style: TextStyle(
                        fontSize: 10.sp,
                        color: exColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ));
                  }

                  return BarTooltipItem(
                    '$dateLabel\n',
                    TextStyle(
                      fontSize: 10.sp,
                      color: isDark ? Colors.white54 : Colors.black54,
                      fontWeight: FontWeight.w500,
                    ),
                    children: [
                      ...exchangeLines,
                      TextSpan(
                        text: 'Total: $totalSign\$${_formatCompactAbs(totalVal.abs())}',
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: totalColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSummary(BuildContext context, bool isDark) {
    if (_loading || _data.isEmpty) return const SizedBox.shrink();

    double total = 0;
    int profitable = 0;
    int loss = 0;
    for (final d in _data) {
      final v = double.tryParse(d['total']?.toString() ?? '0') ?? 0;
      total += v;
      if (v > 0) profitable++;
      if (v < 0) loss++;
    }

    final totalColor = total >= 0 ? _kPositiveColor : _kNegativeColor;
    final sign = total >= 0 ? '+' : '';
    final mutedColor = isDark ? Colors.white38 : Colors.black38;

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 4.w),
      child: Row(
        children: [
          Text('Total: ', style: TextStyle(fontSize: 11.sp, color: mutedColor)),
          Text(
            '$sign\$${_formatCompactAbs(total.abs())}',
            style: TextStyle(fontSize: 11.sp, fontWeight: FontWeight.w700, color: totalColor),
          ),
          SizedBox(width: 12.w),
          Container(width: 8.w, height: 8.w, decoration: const BoxDecoration(color: _kPositiveColor, borderRadius: BorderRadius.all(Radius.circular(2)))),
          SizedBox(width: 3.w),
          Text('$profitable profitable', style: TextStyle(fontSize: 10.sp, color: mutedColor)),
          SizedBox(width: 8.w),
          Container(width: 8.w, height: 8.w, decoration: const BoxDecoration(color: _kNegativeColor, borderRadius: BorderRadius.all(Radius.circular(2)))),
          SizedBox(width: 3.w),
          Text('$loss loss', style: TextStyle(fontSize: 10.sp, color: mutedColor)),
        ],
      ),
    );
  }

  double _barWidth() {
    if (_granularity == 'month') return 16.w;
    if (_granularity == 'day') return 8.w;
    return 6.w;
  }

  double _xLabelInterval() {
    final count = _data.length;
    if (count <= 12) return 1;
    if (count <= 24) return 3;
    return math.max(1, (count / 6).ceil()).toDouble();
  }

  String _formatDateLabel(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    if (_granularity == 'month') return '${_monthAbbr(dt.month)} ${dt.year.toString().substring(2)}';
    if (_granularity == 'day') return '${_monthAbbr(dt.month)} ${dt.day}';
    return '${dt.hour.toString().padLeft(2, '0')}:00';
  }

  String _formatDateFull(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    if (_granularity == 'month') return '${_monthAbbr(dt.month)} ${dt.year}';
    if (_granularity == 'day') return '${_weekdayAbbr(dt.weekday)}, ${_monthAbbr(dt.month)} ${dt.day} ${dt.year}';
    return '${_monthAbbr(dt.month)} ${dt.day}  ${dt.hour.toString().padLeft(2, '0')}:00';
  }
}

// ---------------------------------------------------------------------------
// Granularity selector
// ---------------------------------------------------------------------------

class _GranularitySelector extends StatelessWidget {
  final String current;
  final ValueChanged<String> onChanged;
  final bool isDark;

  const _GranularitySelector({
    required this.current,
    required this.onChanged,
    required this.isDark,
  });

  static const _options = [
    ('month', 'M'),
    ('day', 'D'),
    ('hour', 'H'),
  ];

  @override
  Widget build(BuildContext context) {
    final activeColor = Theme.of(context).colorScheme.primary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: _options.map((opt) {
        final isActive = opt.$1 == current;
        return GestureDetector(
          onTap: () => onChanged(opt.$1),
          child: Container(
            margin: EdgeInsets.only(left: 2.w),
            padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.w),
            decoration: BoxDecoration(
              color: isActive ? activeColor.withValues(alpha: 0.18) : Colors.transparent,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              opt.$2,
              style: TextStyle(
                fontSize: 11.sp,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                color: isActive ? activeColor : (isDark ? Colors.white54 : Colors.black45),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

String _formatCompact(double v) {
  final sign = v < 0 ? '-' : v > 0 ? '+' : '';
  return '$sign\$${_formatCompactAbs(v.abs())}';
}

String _formatCompactAbs(double v) {
  if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
  if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
  return v.toStringAsFixed(0);
}

String _monthAbbr(int m) =>
    const ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m];

String _weekdayAbbr(int d) =>
    const ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d];
