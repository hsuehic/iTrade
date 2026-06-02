import 'dart:async';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../services/portfolio_service.dart';

/// Color palette for exchanges and total
const _kChartColors = {
  'binance': Color(0xFFF3BA2F),
  'okx': Color(0xFF22C55E),
  'coinbase': Color(0xFF2463EB),
  'total': Color(0xFF60A5FA),
};

Color _colorForKey(String key) =>
    _kChartColors[key.toLowerCase()] ??
    const Color(0xFF60A5FA); // default: blue

/// Balance chart widget.  Shows a line/area chart of account balance over time
/// with per-exchange breakdown.  Tap the expand button to enter a full-screen
/// landscape view.
class BalanceHistoryChart extends StatefulWidget {
  final String selectedExchange;
  final Duration refreshInterval;

  const BalanceHistoryChart({
    super.key,
    required this.selectedExchange,
    this.refreshInterval = const Duration(seconds: 30),
  });

  @override
  State<BalanceHistoryChart> createState() => _BalanceHistoryChartState();
}

class _BalanceHistoryChartState extends State<BalanceHistoryChart> {
  String _period = '30d';
  List<Map<String, dynamic>> _raw = [];
  List<String> _exchanges = [];
  bool _loading = true;
  bool _hasError = false;
  Timer? _timer;

  // Touch state
  int? _touchedX;

  @override
  void initState() {
    super.initState();
    _fetchData();
    _timer = Timer.periodic(widget.refreshInterval, (_) => _fetchData(silent: true));
  }

  @override
  void didUpdateWidget(BalanceHistoryChart old) {
    super.didUpdateWidget(old);
    if (old.selectedExchange != widget.selectedExchange) {
      setState(() {
        _loading = true;
        _raw = [];
        _touchedX = null;
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
      final data = await PortfolioService.instance.fetchBalanceChartData(
        exchange: widget.selectedExchange,
        period: _period,
      );
      if (!mounted) return;
      // Extract exchange keys (everything except 'date' / 'total')
      final keys = <String>[];
      if (data.isNotEmpty) {
        for (final k in data.first.keys) {
          if (k != 'date' && k != 'total') keys.add(k);
        }
      }
      // Recalculate total so it's always up to date
      final processed = data.map((point) {
        final total = keys.fold<double>(
          0,
          (sum, k) => sum + (double.tryParse(point[k]?.toString() ?? '0') ?? 0),
        );
        return {...point, 'total': total};
      }).toList();

      setState(() {
        _raw = processed;
        _exchanges = keys;
        _loading = false;
        _hasError = false;
        _touchedX = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
      });
    }
  }

  void _onPeriodChanged(String p) {
    if (_period == p) return;
    setState(() {
      _period = p;
      _loading = true;
      _raw = [];
      _touchedX = null;
    });
    _fetchData();
  }

  Future<void> _openFullscreen() async {
    // Allow all orientations so the fullscreen view works in both portrait
    // and landscape — the user can rotate freely without being forced.
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);

    if (!mounted) return;

    await Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _FullscreenChart(
          selectedExchange: widget.selectedExchange,
          initialPeriod: _period,
          refreshInterval: widget.refreshInterval,
        ),
      ),
    );

    // Restore portrait-only orientation when returning to the normal view.
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
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
          _buildLegend(context, isDark),
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
          Text(
            'Balance History',
            style: TextStyle(
              fontSize: 15.sp,
              fontWeight: FontWeight.w700,
              color: isDark ? Colors.white : Colors.black87,
            ),
          ),
          const Spacer(),
          _PeriodSelector(
            current: _period,
            onChanged: _onPeriodChanged,
            isDark: isDark,
          ),
          SizedBox(width: 4.w),
          IconButton(
            icon: Icon(
              Icons.fullscreen,
              size: 20.w,
              color: isDark ? Colors.white60 : Colors.black45,
            ),
            padding: EdgeInsets.zero,
            constraints: BoxConstraints(minWidth: 32.w, minHeight: 32.w),
            tooltip: 'Fullscreen',
            onPressed: _openFullscreen,
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
    if (_hasError || _raw.isEmpty) {
      return SizedBox(
        height: 180.w,
        child: Center(
          child: Text(
            _hasError ? 'Failed to load chart' : 'No data for this period',
            style: TextStyle(fontSize: 12.sp, color: Colors.grey),
          ),
        ),
      );
    }

    return SizedBox(
      height: 180.w,
      child: Padding(
        padding: EdgeInsets.only(left: 4.w, right: 16.w, top: 8.w, bottom: 4.w),
        child: _LineChart(
          raw: _raw,
          exchanges: _exchanges,
          showTotal: widget.selectedExchange == 'all',
          period: _period,
          touchedX: _touchedX,
          onTouch: (x) => setState(() => _touchedX = x),
          isDark: isDark,
          compact: true,
        ),
      ),
    );
  }

  Widget _buildLegend(BuildContext context, bool isDark) {
    final keys = [
      ..._exchanges,
      if (widget.selectedExchange == 'all' && _exchanges.length > 1) 'total',
    ];
    if (keys.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w),
      child: Wrap(
        spacing: 12.w,
        runSpacing: 4.w,
        children: keys.map((k) {
          final color = _colorForKey(k);
          final label = k == 'total'
              ? 'Total'
              : k.substring(0, 1).toUpperCase() + k.substring(1);
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 10.w,
                height: 10.w,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              SizedBox(width: 4.w),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10.sp,
                  color: isDark ? Colors.white60 : Colors.black54,
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Fullscreen chart screen
// ---------------------------------------------------------------------------

class _FullscreenChart extends StatefulWidget {
  final String selectedExchange;
  final String initialPeriod;
  final Duration refreshInterval;

  const _FullscreenChart({
    required this.selectedExchange,
    required this.initialPeriod,
    required this.refreshInterval,
  });

  @override
  State<_FullscreenChart> createState() => _FullscreenChartState();
}

class _FullscreenChartState extends State<_FullscreenChart> {
  String _period = '30d';
  List<Map<String, dynamic>> _raw = [];
  List<String> _exchanges = [];
  bool _loading = true;
  bool _hasError = false;
  Timer? _timer;
  int? _touchedX;

  @override
  void initState() {
    super.initState();
    _period = widget.initialPeriod;
    // Ensure all orientations are unlocked inside the fullscreen view so the
    // user can rotate freely between portrait and landscape.
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    _fetchData();
    _timer = Timer.periodic(widget.refreshInterval, (_) => _fetchData(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    // Restore all orientations when leaving the fullscreen view.
    // The caller (_openFullscreen) also restores after pop, so whichever
    // runs last wins — both set the same value, so there is no race hazard.
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    super.dispose();
  }

  Future<void> _fetchData({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final data = await PortfolioService.instance.fetchBalanceChartData(
        exchange: widget.selectedExchange,
        period: _period,
      );
      if (!mounted) return;
      final keys = <String>[];
      if (data.isNotEmpty) {
        for (final k in data.first.keys) {
          if (k != 'date' && k != 'total') keys.add(k);
        }
      }
      final processed = data.map((point) {
        final total = keys.fold<double>(
          0,
          (sum, k) => sum + (double.tryParse(point[k]?.toString() ?? '0') ?? 0),
        );
        return {...point, 'total': total};
      }).toList();

      setState(() {
        _raw = processed;
        _exchanges = keys;
        _loading = false;
        _hasError = false;
        _touchedX = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
      });
    }
  }

  void _onPeriodChanged(String p) {
    if (_period == p) return;
    setState(() {
      _period = p;
      _loading = true;
      _raw = [];
      _touchedX = null;
    });
    _fetchData();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0D1117) : const Color(0xFFF5F7FA);

    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: Column(
          children: [
            // Top bar
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                    tooltip: 'Close',
                  ),
                  Text(
                    'Balance History',
                    style: TextStyle(
                      fontSize: 16.sp,
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : Colors.black87,
                    ),
                  ),
                  const Spacer(),
                  _PeriodSelector(
                    current: _period,
                    onChanged: _onPeriodChanged,
                    isDark: isDark,
                  ),
                  const SizedBox(width: 8),
                ],
              ),
            ),
            // Chart
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _hasError || _raw.isEmpty
                  ? Center(
                      child: Text(
                        _hasError ? 'Failed to load chart' : 'No data for this period',
                        style: TextStyle(fontSize: 13.sp, color: Colors.grey),
                      ),
                    )
                  : Padding(
                      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
                      child: _LineChart(
                        raw: _raw,
                        exchanges: _exchanges,
                        showTotal: widget.selectedExchange == 'all',
                        period: _period,
                        touchedX: _touchedX,
                        onTouch: (x) => setState(() => _touchedX = x),
                        isDark: isDark,
                        compact: false,
                      ),
                    ),
            ),
            // Legend
            if (!_loading && !_hasError && _raw.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: _Legend(
                  exchanges: _exchanges,
                  showTotal: widget.selectedExchange == 'all' && _exchanges.length > 1,
                  isDark: isDark,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared inner line chart
// ---------------------------------------------------------------------------

class _LineChart extends StatelessWidget {
  final List<Map<String, dynamic>> raw;
  final List<String> exchanges;
  final bool showTotal;
  final String period;
  final int? touchedX;
  final ValueChanged<int?> onTouch;
  final bool isDark;
  final bool compact;

  const _LineChart({
    required this.raw,
    required this.exchanges,
    required this.showTotal,
    required this.period,
    required this.touchedX,
    required this.onTouch,
    required this.isDark,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    final keys = [...exchanges, if (showTotal && exchanges.length > 1) 'total'];
    if (keys.isEmpty || raw.isEmpty) return const SizedBox.shrink();

    // Build spots for each key
    final spotsMap = <String, List<FlSpot>>{};
    for (final k in keys) {
      spotsMap[k] = [];
    }
    for (int i = 0; i < raw.length; i++) {
      final point = raw[i];
      for (final k in keys) {
        final v = double.tryParse(point[k]?.toString() ?? '0') ?? 0;
        spotsMap[k]!.add(FlSpot(i.toDouble(), v));
      }
    }

    // Y-axis range with 5% padding
    double yMin = double.infinity;
    double yMax = double.negativeInfinity;
    for (final spots in spotsMap.values) {
      for (final s in spots) {
        yMin = math.min(yMin, s.y);
        yMax = math.max(yMax, s.y);
      }
    }
    if (yMin == double.infinity) {
      yMin = 0;
      yMax = 1;
    }
    final yRange = (yMax - yMin).abs();
    final yPad = yRange * 0.05;
    double domainMin = math.max(0.0, yMin - yPad);
    double domainMax = yMax + yPad;

    // Guard against a zero-span Y domain (all values identical).
    // fl_chart cannot position a line when minY == maxY, so enforce a
    // minimum visible range centred on the value.
    if (domainMax - domainMin < 0.001) {
      final center = (domainMin + domainMax) / 2;
      final half = math.max(center * 0.05, 1.0);
      domainMin = math.max(0.0, center - half);
      domainMax = center + half;
    }

    final gridColor = isDark
        ? Colors.white.withValues(alpha: 0.07)
        : Colors.black.withValues(alpha: 0.07);
    final labelColor = isDark ? Colors.white54 : Colors.black38;
    final tooltipBg = isDark ? const Color(0xFF1A2231) : Colors.white;

    final lineBarsData = keys.map((k) {
      final color = _colorForKey(k);
      final isTotal = k == 'total';
      return LineChartBarData(
        spots: spotsMap[k]!,
        isCurved: true,
        curveSmoothness: 0.35,
        // Use a solid gradient so the stroke is always rendered regardless of
        // how the installed fl_chart version resolves the color/gradient
        // precedence.  This guarantees a visible line even when all data
        // points share the same Y value.
        gradient: LinearGradient(colors: [color, color]),
        barWidth: isTotal ? 2 : 1.5,
        isStrokeCapRound: true,
        dotData: const FlDotData(show: false),
        belowBarData: BarAreaData(
          show: true,
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              color.withValues(alpha: isTotal ? 0.08 : 0.15),
              color.withValues(alpha: 0),
            ],
          ),
        ),
      );
    }).toList();

    // Determine label gap for x-axis
    final labelCount = compact ? 4 : 6;
    final interval = math.max(1, (raw.length / labelCount).ceil()).toDouble();

    return LineChart(
      LineChartData(
        minX: 0,
        maxX: (raw.length - 1).toDouble(),
        minY: domainMin,
        maxY: domainMax,
        clipData: const FlClipData.all(),
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
        titlesData: FlTitlesData(
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: compact ? 56.w : 72.w,
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
          rightTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          topTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 22,
              interval: interval,
              getTitlesWidget: (v, _) {
                final idx = v.round();
                if (idx < 0 || idx >= raw.length) return const SizedBox.shrink();
                final dateStr = raw[idx]['date']?.toString() ?? '';
                final label = _formatDateLabel(dateStr, period);
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
        lineTouchData: LineTouchData(
          touchCallback: (event, response) {
            // Clear selection when the touch/pointer is no longer active
            if (!event.isInterestedForInteractions) {
              onTouch(null);
            } else if (response?.lineBarSpots?.isNotEmpty ?? false) {
              onTouch(response!.lineBarSpots!.first.x.round());
            }
          },
          getTouchedSpotIndicator: (barData, indices) => indices.map((_) {
            return TouchedSpotIndicatorData(
              FlLine(
                color: isDark ? Colors.white30 : Colors.black26,
                strokeWidth: 1,
                dashArray: [4, 4],
              ),
              FlDotData(
                show: true,
                getDotPainter: (spot, _, bar, __) => FlDotCirclePainter(
                  radius: 4,
                  color: (bar.gradient is LinearGradient)
                      ? (bar.gradient as LinearGradient).colors.first
                      : (bar.color ?? Colors.blue),
                  strokeWidth: 1.5,
                  strokeColor: isDark ? Colors.white : Colors.white,
                ),
              ),
            );
          }).toList(),
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => tooltipBg,
            tooltipBorder: BorderSide(
              color: isDark ? Colors.white12 : Colors.black12,
            ),
            tooltipBorderRadius: BorderRadius.circular(8),
            getTooltipItems: (spots) {
              final idx = spots.first.x.round();
              if (idx < 0 || idx >= raw.length) return [];
              final dateStr = raw[idx]['date']?.toString() ?? '';
              final dateLabel = _formatDateFull(dateStr, period);
              return spots.asMap().entries.map((e) {
                final spot = e.value;
                // Use spot.barIndex (not e.key) because fl_chart sorts
                // touchedSpots by y-value, so the positional index in the
                // list does not match the bar's index in lineBarsData.
                final k = keys[spot.barIndex];
                final label = k == 'total'
                    ? 'Total'
                    : k.substring(0, 1).toUpperCase() + k.substring(1);

                return LineTooltipItem(
                  e.key == 0 ? '$dateLabel\n' : '',
                  TextStyle(
                    fontSize: 10.sp,
                    color: isDark ? Colors.white54 : Colors.black54,
                    fontWeight: FontWeight.w500,
                  ),
                  textAlign: TextAlign.left,
                  children: [
                    TextSpan(
                      text: '$label: \$${_formatCompact(spot.y)}',
                      style: TextStyle(
                        fontSize: 11.sp,
                        color: _colorForKey(k),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                );
              }).toList();
            },
          ),
        ),
        lineBarsData: lineBarsData,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Period selector
// ---------------------------------------------------------------------------

class _PeriodSelector extends StatelessWidget {
  final String current;
  final ValueChanged<String> onChanged;
  final bool isDark;

  const _PeriodSelector({
    required this.current,
    required this.onChanged,
    required this.isDark,
  });

  static const _periods = [
    ('1d', '1D'),
    ('7d', '7D'),
    ('30d', '30D'),
    ('90d', '3M'),
  ];

  @override
  Widget build(BuildContext context) {
    final activeColor = Theme.of(context).colorScheme.primary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: _periods.map((p) {
        final isActive = p.$1 == current;
        return GestureDetector(
          onTap: () => onChanged(p.$1),
          child: Container(
            margin: EdgeInsets.only(left: 2.w),
            padding: EdgeInsets.symmetric(horizontal: 7.w, vertical: 4.w),
            decoration: BoxDecoration(
              color: isActive
                  ? activeColor.withValues(alpha: 0.18)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              p.$2,
              style: TextStyle(
                fontSize: 11.sp,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                color: isActive
                    ? activeColor
                    : (isDark ? Colors.white54 : Colors.black45),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

class _Legend extends StatelessWidget {
  final List<String> exchanges;
  final bool showTotal;
  final bool isDark;

  const _Legend({
    required this.exchanges,
    required this.showTotal,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final keys = [...exchanges, if (showTotal) 'total'];
    return Wrap(
      spacing: 16,
      runSpacing: 4,
      children: keys.map((k) {
        final color = _colorForKey(k);
        final label =
            k == 'total' ? 'Total' : k.substring(0, 1).toUpperCase() + k.substring(1);
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11.sp,
                color: isDark ? Colors.white60 : Colors.black54,
              ),
            ),
          ],
        );
      }).toList(),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

String _formatCompact(double v) {
  if (v >= 1000000) return '\$${(v / 1000000).toStringAsFixed(1)}M';
  if (v >= 1000) return '\$${(v / 1000).toStringAsFixed(1)}K';
  return '\$${v.toStringAsFixed(0)}';
}

String _formatDateLabel(String iso, String period) {
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  if (period == '1d') {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
  return '${_monthAbbr(dt.month)} ${dt.day}';
}

String _formatDateFull(String iso, String period) {
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  if (period == '1d') {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '${_monthAbbr(dt.month)} ${dt.day}  $h:$m';
  }
  return '${_weekdayAbbr(dt.weekday)}, ${_monthAbbr(dt.month)} ${dt.day} ${dt.year}';
}

String _monthAbbr(int m) =>
    const ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m];

String _weekdayAbbr(int d) =>
    const ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d];
