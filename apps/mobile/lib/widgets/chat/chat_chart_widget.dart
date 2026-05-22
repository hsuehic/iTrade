import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../models/chat_message.dart';

// ── Colour palette ─────────────────────────────────────────────────────────────

const _palette = [
  Color(0xFF6366f1), // indigo
  Color(0xFF22d3ee), // cyan
  Color(0xFFf59e0b), // amber
  Color(0xFF10b981), // emerald
  Color(0xFFec4899), // pink
  Color(0xFFef4444), // red
  Color(0xFF8b5cf6), // violet
  Color(0xFFf97316), // orange
  Color(0xFF14b8a6), // teal
  Color(0xFF84cc16), // lime
];
const _totalColor = Color(0xFF60a5fa); // blue-400
const _positiveColor = Color(0xFF10b981); // emerald
const _negativeColor = Color(0xFFef4444); // red

// ── Currency formatting ────────────────────────────────────────────────────────

String _fmtK(double v) {
  if (v.abs() >= 1000) return '\$${(v / 1000).toStringAsFixed(1)}k';
  return '\$${v.toStringAsFixed(0)}';
}

String _fmtFull(double v) {
  final abs = v.abs().toStringAsFixed(2);
  final parts = abs.split('.');
  final intPart = parts[0].replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'),
    (m) => '${m[1]},',
  );
  final formatted = '\$$intPart.${parts[1]}';
  return v >= 0 ? formatted : '-$formatted';
}

// ── Bar chart (rankings) ───────────────────────────────────────────────────────

class _BarChartSection extends StatefulWidget {
  final List<Map<String, dynamic>> items;
  final String? title;

  const _BarChartSection({required this.items, this.title});

  @override
  State<_BarChartSection> createState() => _BarChartSectionState();
}

class _BarChartSectionState extends State<_BarChartSection> {
  int? _touchedIndex;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = widget.items.take(10).toList();

    final maxAbs = items.fold<double>(
      0,
      (prev, e) => (e['pnl'] as double).abs() > prev
          ? (e['pnl'] as double).abs()
          : prev,
    );
    final yMax = maxAbs * 1.15;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              widget.title!.toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        SizedBox(
          height: 200,
          child: BarChart(
            BarChartData(
              alignment: BarChartAlignment.spaceAround,
              maxY: yMax,
              minY: -yMax,
              barTouchData: BarTouchData(
                touchTooltipData: BarTouchTooltipData(
                  getTooltipColor: (_) =>
                      theme.colorScheme.surfaceContainerHighest,
                  getTooltipItem: (group, groupIndex, rod, rodIndex) {
                    return BarTooltipItem(
                      '${items[group.x]['name']}\n',
                      theme.textTheme.labelSmall!.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.onSurface,
                      ),
                      textAlign: TextAlign.left,
                      children: [
                        TextSpan(
                          text: _fmtFull(rod.toY),
                          style: TextStyle(
                            color: rod.toY >= 0
                                ? _positiveColor
                                : _negativeColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    );
                  },
                ),
                touchCallback: (event, response) {
                  if (!event.isInterestedForInteractions ||
                      response?.spot == null) {
                    setState(() => _touchedIndex = null);
                    return;
                  }
                  setState(
                    () => _touchedIndex =
                        response!.spot!.touchedBarGroupIndex,
                  );
                },
              ),
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 46,
                    getTitlesWidget: (v, meta) => Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: Text(
                        _fmtK(v),
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontSize: 9,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 30,
                    getTitlesWidget: (v, meta) {
                      final idx = v.toInt();
                      if (idx < 0 || idx >= items.length) {
                        return const SizedBox.shrink();
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          items[idx]['name'] as String,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontSize: 9,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    },
                  ),
                ),
                topTitles: const AxisTitles(
                  sideTitles: SideTitles(showTitles: false),
                ),
                rightTitles: const AxisTitles(
                  sideTitles: SideTitles(showTitles: false),
                ),
              ),
              gridData: FlGridData(
                drawVerticalLine: false,
                getDrawingHorizontalLine: (v) => FlLine(
                  color: theme.colorScheme.outline.withValues(alpha: 0.15),
                  strokeWidth: 0.5,
                ),
              ),
              borderData: FlBorderData(show: false),
              barGroups: List.generate(items.length, (i) {
                final pnl = items[i]['pnl'] as double;
                final isTouched = _touchedIndex == i;
                return BarChartGroupData(
                  x: i,
                  barRods: [
                    BarChartRodData(
                      toY: pnl,
                      color: (pnl >= 0 ? _positiveColor : _negativeColor)
                          .withValues(alpha: isTouched ? 1.0 : 0.85),
                      width: isTouched ? 14 : 12,
                      borderRadius: pnl >= 0
                          ? const BorderRadius.only(
                              topLeft: Radius.circular(4),
                              topRight: Radius.circular(4),
                            )
                          : const BorderRadius.only(
                              bottomLeft: Radius.circular(4),
                              bottomRight: Radius.circular(4),
                            ),
                    ),
                  ],
                );
              }),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Line chart (time series) ───────────────────────────────────────────────────

class _LineChartSection extends StatefulWidget {
  final List<Map<String, dynamic>> points;
  final List<String> seriesKeys;
  final String? title;

  const _LineChartSection({
    required this.points,
    required this.seriesKeys,
    this.title,
  });

  @override
  State<_LineChartSection> createState() => _LineChartSectionState();
}

class _LineChartSectionState extends State<_LineChartSection> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final points = widget.points;
    final seriesKeys = widget.seriesKeys;

    // Build line data per series
    final lineBarsData = seriesKeys.asMap().entries.map((entry) {
      final idx = entry.key;
      final key = entry.value;
      final isTotal = key == 'total';
      final color = isTotal ? _totalColor : _palette[idx % _palette.length];

      final spots = List.generate(points.length, (i) {
        final v = (points[i][key] as num?)?.toDouble() ?? 0.0;
        return FlSpot(i.toDouble(), v);
      });

      return LineChartBarData(
        spots: spots,
        isCurved: true,
        curveSmoothness: 0.25,
        color: color,
        barWidth: isTotal ? 2.5 : 1.5,
        dotData: const FlDotData(show: false),
        belowBarData: isTotal
            ? BarAreaData(
                show: true,
                color: color.withValues(alpha: 0.08),
              )
            : BarAreaData(show: false),
      );
    }).toList();

    // Y range
    double minY = double.infinity, maxY = double.negativeInfinity;
    for (final p in points) {
      for (final k in seriesKeys) {
        final v = (p[k] as num?)?.toDouble() ?? 0.0;
        if (v < minY) minY = v;
        if (v > maxY) maxY = v;
      }
    }
    final pad = (maxY - minY) * 0.1;
    minY -= pad;
    maxY += pad;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              widget.title!.toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        // Legend
        if (seriesKeys.length > 1)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(
              spacing: 12,
              runSpacing: 4,
              children: seriesKeys.asMap().entries.map((e) {
                final isTotal = e.value == 'total';
                final color = isTotal
                    ? _totalColor
                    : _palette[e.key % _palette.length];
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 12,
                      height: 2.5,
                      color: color,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      e.value,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),
        SizedBox(
          height: 200,
          child: LineChart(
            LineChartData(
              minY: minY,
              maxY: maxY,
              lineBarsData: lineBarsData,
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 46,
                    getTitlesWidget: (v, meta) => Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: Text(
                        _fmtK(v),
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontSize: 9,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 24,
                    interval: (points.length / 4).ceilToDouble(),
                    getTitlesWidget: (v, meta) {
                      final idx = v.toInt();
                      if (idx < 0 || idx >= points.length) {
                        return const SizedBox.shrink();
                      }
                      final date =
                          (points[idx]['date'] as String?)?.substring(5) ??
                              '';
                      return Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          date,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontSize: 9,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      );
                    },
                  ),
                ),
                topTitles: const AxisTitles(
                  sideTitles: SideTitles(showTitles: false),
                ),
                rightTitles: const AxisTitles(
                  sideTitles: SideTitles(showTitles: false),
                ),
              ),
              gridData: FlGridData(
                drawVerticalLine: false,
                getDrawingHorizontalLine: (v) => FlLine(
                  color: theme.colorScheme.outline.withValues(alpha: 0.15),
                  strokeWidth: 0.5,
                ),
              ),
              borderData: FlBorderData(show: false),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipColor: (_) =>
                      theme.colorScheme.surfaceContainerHighest,
                  getTooltipItems: (spots) {
                    return spots.map((spot) {
                      final key = seriesKeys[spot.barIndex];
                      final isTotal = key == 'total';
                      final color = isTotal
                          ? _totalColor
                          : _palette[spot.barIndex % _palette.length];
                      return LineTooltipItem(
                        '$key\n${_fmtFull(spot.y)}',
                        TextStyle(
                          color: color,
                          fontSize: 10,
                          fontWeight:
                              isTotal ? FontWeight.bold : FontWeight.normal,
                        ),
                        textAlign: TextAlign.left,
                      );
                    }).toList();
                  },
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Public widget ──────────────────────────────────────────────────────────────

/// Renders a bar or line chart from AI chatbot response data.
class ChatChartWidget extends StatelessWidget {
  final RenderData renderData;

  const ChatChartWidget({super.key, required this.renderData});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final data = renderData.data;
    if (data == null || data is! Map<String, dynamic>) {
      return const SizedBox.shrink();
    }

    Widget? chartContent;

    // ── Bar chart: ranking arrays ────────────────────────────────────────────
    for (final key in [
      'topTokens',
      'topPerformers',
      'bySymbol',
      'byExchange',
    ]) {
      final arr = data[key];
      if (arr is List && arr.isNotEmpty) {
        final items = arr.take(10).whereType<Map<String, dynamic>>().map((i) {
          final name = (i['symbol'] ??
                  i['normalizedSymbol'] ??
                  i['exchange'] ??
                  i['name'] ??
                  'Unknown')
              .toString()
              .split('/')
              .first;
          final pnl =
              ((i['totalPnl'] ?? i['pnl'] ?? 0) as num).toDouble();
          return {'name': name, 'pnl': pnl};
        }).toList();

        chartContent = _BarChartSection(
          items: items,
          title: renderData.title,
        );
        break;
      }
    }

    // ── Line chart: time series ──────────────────────────────────────────────
    if (chartContent == null) {
      final chartDataArr = data['chartData'];
      if (chartDataArr is List && chartDataArr.length > 1) {
        final firstItem = chartDataArr.first;
        if (firstItem is! Map<String, dynamic>) return const SizedBox.shrink();
        final sample = firstItem;
        final exchangeKeys =
            sample.keys.where((k) => k != 'date' && k != 'total').toList();
        final showTotal = exchangeKeys.length > 1;
        final seriesKeys =
            showTotal ? [...exchangeKeys, 'total'] : exchangeKeys;

        // Last 30 points + compute totals
        final sliced = chartDataArr.whereType<Map<String, dynamic>>().toList();
        final last30 = sliced.length > 30
            ? sliced.sublist(sliced.length - 30)
            : sliced;

        final formatted = last30.map((p) {
          final copy = Map<String, dynamic>.from(p);
          copy['date'] = (p['date'] as String?)?.substring(0, 10) ?? '';
          if (showTotal) {
            copy['total'] = exchangeKeys.fold<double>(
              0,
              (sum, k) => sum + ((p[k] as num?)?.toDouble() ?? 0),
            );
          }
          return copy;
        }).toList();

        chartContent = _LineChartSection(
          points: formatted,
          seriesKeys: seriesKeys,
          title: renderData.title,
        );
      }
    }

    if (chartContent == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.2),
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: chartContent,
    );
  }
}
