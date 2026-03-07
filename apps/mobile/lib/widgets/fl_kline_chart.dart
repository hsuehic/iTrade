import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../services/copy_service.dart';
import '../utils/number_format_utils.dart';

/// Kline chart built with fl_chart (candles + volume).
class FlKlineChart extends StatefulWidget {
  final List<Map<String, dynamic>> klineData;
  final String symbol;
  final String interval;
  final bool isDarkMode;
  final double currentPrice;
  final int pricePrecision;

  const FlKlineChart({
    super.key,
    required this.klineData,
    required this.symbol,
    required this.interval,
    required this.isDarkMode,
    required this.currentPrice,
    this.pricePrecision = 4,
  });

  @override
  State<FlKlineChart> createState() => _FlKlineChartState();
}

class _FlKlineChartState extends State<FlKlineChart> {
  int? _touchedIndex;

  void reinitializeChart() {
    if (!mounted) return;
    setState(() {
      _touchedIndex = null;
    });
  }

  void hideTooltips() {
    if (!mounted) return;
    setState(() {
      _touchedIndex = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final candles = _buildCandles(widget.klineData);
    if (candles.isEmpty) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final isDark = widget.isDarkMode || theme.brightness == Brightness.dark;
    final upColor = const Color(0xFF22C55E);
    final downColor = const Color(0xFFEF5350);
    final gridColor = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : Colors.black.withValues(alpha: 0.06);
    final textColor = isDark ? Colors.white70 : Colors.black54;
    final titleColor = isDark ? Colors.white : Colors.black87;
    final wickWidth = 2.w;
    final bodyWidth = 6.w;
    final chartPadding = 12.w;

    final minPrice = candles.map((c) => c.low).reduce(_minDouble);
    final maxPrice = candles.map((c) => c.high).reduce(_maxDouble);
    final priceRange = (maxPrice - minPrice).abs();
    final pricePadding = priceRange == 0
        ? (maxPrice == 0 ? 1 : maxPrice * 0.02)
        : priceRange * 0.08;
    final minY = minPrice - pricePadding;
    final maxY = maxPrice + pricePadding;

    final maxVolume = candles.map((c) => c.volume).fold(0.0, _maxDouble);
    final double volumeMaxY = maxVolume == 0 ? 1 : maxVolume * 1.2;

    return Column(
      children: [
        Expanded(
          flex: 5,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: chartPadding),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final axisInterval = _resolveAxisInterval(
                  priceRange: priceRange,
                  height: constraints.maxHeight,
                );

                return Stack(
                  children: [
                    BarChart(
                      BarChartData(
                        minY: minY,
                        maxY: maxY,
                        barGroups: _buildCandleGroups(
                          candles,
                          wickWidth,
                          bodyWidth,
                          upColor,
                          downColor,
                        ),
                        alignment: BarChartAlignment.spaceBetween,
                        gridData: FlGridData(
                          drawVerticalLine: false,
                          horizontalInterval: priceRange == 0
                              ? null
                              : axisInterval,
                          getDrawingHorizontalLine: (value) =>
                              FlLine(color: gridColor, strokeWidth: 1),
                        ),
                        borderData: FlBorderData(show: false),
                        titlesData: FlTitlesData(
                          topTitles: const AxisTitles(),
                          rightTitles: const AxisTitles(),
                          bottomTitles: const AxisTitles(),
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              interval: axisInterval,
                              reservedSize: 44.w,
                              getTitlesWidget: (value, meta) {
                              final topLabel =
                                  ((maxY / axisInterval).floorToDouble() *
                                      axisInterval) +
                                  axisInterval;
                              if ((value - topLabel).abs() <
                                  (axisInterval * 0.001)) {
                                  return const SizedBox.shrink();
                                }
                                return SideTitleWidget(
                                  axisSide: meta.axisSide,
                                  child: Text(
                                    _formatAxisPrice(
                                      value.toDouble(),
                                      axisInterval,
                                    ),
                                    style: TextStyle(
                                      fontSize: 10.sp,
                                      color: textColor,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                        barTouchData: BarTouchData(
                          handleBuiltInTouches: true,
                          touchCallback: (event, response) {
                            if (!event.isInterestedForInteractions ||
                                response?.spot == null) {
                              setState(() {
                                _touchedIndex = null;
                              });
                              return;
                            }

                            setState(() {
                              _touchedIndex =
                                  response!.spot!.touchedBarGroupIndex;
                            });
                          },
                          touchTooltipData: BarTouchTooltipData(
                            tooltipRoundedRadius: 6,
                            tooltipPadding: EdgeInsets.symmetric(
                              horizontal: 10.w,
                              vertical: 6.w,
                            ),
                            tooltipMargin: 6.w,
                            fitInsideHorizontally: true,
                            fitInsideVertically: true,
                            getTooltipColor: (group) =>
                                isDark ? const Color(0xFF1E1E1E) : Colors.white,
                            getTooltipItem: (group, groupIndex, rod, rodIndex) {
                              if (rodIndex != 1) return null;
                              final candle = candles[groupIndex];
                              final copy = CopyService.instance;
                              final openLabel = copy.t(
                                'widget.kline.tooltip.open',
                                fallback: 'Open',
                              );
                              final highLabel = copy.t(
                                'widget.kline.tooltip.high',
                                fallback: 'High',
                              );
                              final lowLabel = copy.t(
                                'widget.kline.tooltip.low',
                                fallback: 'Low',
                              );
                              final closeLabel = copy.t(
                                'widget.kline.tooltip.close',
                                fallback: 'Close',
                              );
                              final rangeLabel = copy.t(
                                'widget.kline.tooltip.range',
                                fallback: 'Range',
                              );
                              final volumeLabel = copy.t(
                                'widget.kline.tooltip.volume',
                                fallback: 'Vol',
                              );
                              final rangePercent = candle.open == 0
                                  ? 0
                                  : (candle.high - candle.low) /
                                        candle.open *
                                        100;
                              final buffer = StringBuffer()
                                ..writeln(candle.label)
                                ..writeln(
                                  '$openLabel ${formatPriceExact(candle.open, precision: widget.pricePrecision)}',
                                )
                                ..writeln(
                                  '$highLabel ${formatPriceExact(candle.high, precision: widget.pricePrecision)}',
                                )
                                ..writeln(
                                  '$lowLabel ${formatPriceExact(candle.low, precision: widget.pricePrecision)}',
                                )
                                ..writeln(
                                  '$closeLabel ${formatPriceExact(candle.close, precision: widget.pricePrecision)}',
                                )
                                ..writeln(
                                  '$rangeLabel ${rangePercent.toStringAsFixed(2)}%',
                                )
                                ..write(
                                  '$volumeLabel ${formatVolume(candle.volume)}',
                                );
                              return BarTooltipItem(
                                buffer.toString(),
                                TextStyle(
                                  color: titleColor,
                                  fontSize: 10.sp,
                                  height: 1.4,
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ),
                    IgnorePointer(
                      child: LineChart(
                        LineChartData(
                          minX: 0,
                          maxX: (candles.length - 1).toDouble(),
                          minY: minY,
                          maxY: maxY,
                          gridData: FlGridData(show: false),
                          titlesData: const FlTitlesData(show: false),
                          borderData: FlBorderData(show: false),
                          lineTouchData: LineTouchData(enabled: false),
                          lineBarsData: [
                            LineChartBarData(
                              spots: _buildMaSpots(candles, 5),
                              isCurved: true,
                              color: const Color(0xFFFFA726),
                              barWidth: 1.w,
                              dotData: FlDotData(show: false),
                            ),
                            LineChartBarData(
                              spots: _buildMaSpots(candles, 10),
                              isCurved: true,
                              color: const Color(0xFF42A5F5),
                              barWidth: 1.w,
                              dotData: FlDotData(show: false),
                            ),
                          ],
                        ),
                      ),
                    ),
                    IgnorePointer(
                      child: CustomPaint(
                        size: constraints.biggest,
                        painter: _KlineOverlayPainter(
                          candles: candles,
                          minY: minY,
                          maxY: maxY,
                          currentPrice: widget.currentPrice,
                          currentPriceText: formatPriceExact(
                            widget.currentPrice,
                            precision: widget.pricePrecision,
                          ),
                          labelTextStyle: TextStyle(
                            color: titleColor,
                            fontSize: 10.sp,
                            fontWeight: FontWeight.w500,
                          ),
                          labelBackground: isDark
                              ? const Color(0x991A1A1A)
                              : const Color(0x99FFFFFF),
                          labelBorder: isDark
                              ? const Color(0xFF666666)
                              : const Color(0xFF999999),
                          lineColor: isDark
                              ? Colors.white.withValues(alpha: 0.35)
                              : Colors.black.withValues(alpha: 0.35),
                          crosshairColor: isDark
                              ? Colors.white.withValues(alpha: 0.25)
                              : Colors.black.withValues(alpha: 0.25),
                          touchedIndex: _touchedIndex,
                          labelPadding: EdgeInsets.symmetric(
                            horizontal: 6.w,
                            vertical: 2.w,
                          ),
                          labelOffset: 2.w,
                          lineGap: 4.w,
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
        SizedBox(height: 8.w),
        SizedBox(
          height: 70.w,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: chartPadding),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final xLabelStep = _resolveXLabelStep(
                  length: candles.length,
                  width: constraints.maxWidth,
                );

                return BarChart(
                  BarChartData(
                    minY: 0,
                    maxY: volumeMaxY,
                    barGroups: _buildVolumeGroups(
                      candles,
                      bodyWidth,
                      upColor,
                      downColor,
                    ),
                    alignment: BarChartAlignment.spaceBetween,
                    gridData: FlGridData(
                      drawVerticalLine: false,
                      drawHorizontalLine: true,
                      getDrawingHorizontalLine: (value) =>
                          FlLine(color: gridColor, strokeWidth: 1),
                    ),
                    borderData: FlBorderData(show: false),
                    titlesData: FlTitlesData(
                      topTitles: const AxisTitles(),
                      rightTitles: const AxisTitles(),
                      leftTitles: const AxisTitles(),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          interval: xLabelStep.toDouble(),
                          reservedSize: 20.w,
                          getTitlesWidget: (value, meta) => _buildBottomTitle(
                            value,
                            meta,
                            candles,
                            textColor,
                            xLabelStep,
                          ),
                        ),
                      ),
                    ),
                    barTouchData: BarTouchData(enabled: false),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  List<_CandleEntry> _buildCandles(List<Map<String, dynamic>> rawData) {
    return rawData.map((item) {
      return _CandleEntry(
        label: item['date']?.toString() ?? '--',
        open: _parseDouble(item['open']),
        close: _parseDouble(item['close']),
        low: _parseDouble(item['low']),
        high: _parseDouble(item['high']),
        volume: _parseDouble(item['volume']),
      );
    }).toList();
  }

  List<FlSpot> _buildMaSpots(List<_CandleEntry> candles, int period) {
    if (candles.isEmpty) return const [];
    final spots = <FlSpot>[];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        spots.add(FlSpot.nullSpot);
        continue;
      }
      var sum = 0.0;
      for (var j = i - period + 1; j <= i; j++) {
        sum += candles[j].close;
      }
      spots.add(FlSpot(i.toDouble(), sum / period));
    }
    return spots;
  }

  List<BarChartGroupData> _buildCandleGroups(
    List<_CandleEntry> candles,
    double wickWidth,
    double bodyWidth,
    Color upColor,
    Color downColor,
  ) {
    return candles.asMap().entries.map((entry) {
      final index = entry.key;
      final candle = entry.value;
      final isUp = candle.close >= candle.open;
      final bodyTop = isUp ? candle.close : candle.open;
      final bodyBottom = isUp ? candle.open : candle.close;
      final candleColor = isUp ? upColor : downColor;

      return BarChartGroupData(
        x: index,
        groupVertically: true,
        showingTooltipIndicators: _touchedIndex == index ? [1] : [],
        barRods: [
          BarChartRodData(
            fromY: candle.low,
            toY: candle.high,
            width: wickWidth,
            color: candleColor.withValues(alpha: 0.7),
            borderRadius: BorderRadius.zero,
          ),
          BarChartRodData(
            fromY: bodyBottom,
            toY: bodyTop,
            width: bodyWidth,
            color: candleColor,
            borderRadius: BorderRadius.circular(1.w),
          ),
        ],
      );
    }).toList();
  }

  List<BarChartGroupData> _buildVolumeGroups(
    List<_CandleEntry> candles,
    double bodyWidth,
    Color upColor,
    Color downColor,
  ) {
    return candles.asMap().entries.map((entry) {
      final index = entry.key;
      final candle = entry.value;
      final isUp = candle.close >= candle.open;
      return BarChartGroupData(
        x: index,
        barRods: [
          BarChartRodData(
            fromY: 0,
            toY: candle.volume,
            width: bodyWidth,
            color: (isUp ? upColor : downColor).withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(1.w),
          ),
        ],
      );
    }).toList();
  }

  Widget _buildBottomTitle(
    double value,
    TitleMeta meta,
    List<_CandleEntry> candles,
    Color textColor,
    int step,
  ) {
    final index = value.round();
    if (index < 0 || index >= candles.length) {
      return const SizedBox.shrink();
    }

    final totalLabels = candles.length;
    final safeStep = step <= 0 ? 1 : step;
    final shouldShow =
        index == 0 || index == totalLabels - 1 || index % safeStep == 0;
    if (!shouldShow) {
      return const SizedBox.shrink();
    }

    return SideTitleWidget(
      axisSide: meta.axisSide,
      child: Text(
        candles[index].label,
        style: TextStyle(color: textColor, fontSize: 9.sp),
      ),
    );
  }

  double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  double _minDouble(double a, double b) => a < b ? a : b;

  double _maxDouble(double a, double b) => a > b ? a : b;

  double _resolveAxisInterval({
    required double priceRange,
    required double height,
  }) {
    if (priceRange == 0) return 1;
    final targetCount = (height / 48.w).floor().clamp(3, 6);
    final intervals = math.max(1, targetCount - 1);
    return priceRange / intervals;
  }

  int _resolveXLabelStep({required int length, required double width}) {
    if (length <= 1) return 1;
    final targetCount = (width / 70.w).floor().clamp(3, 7);
    final step = (length / (targetCount - 1)).round();
    return step <= 0 ? 1 : step;
  }

  String _formatAxisPrice(double value, double interval) {
    final safeInterval = interval.abs();
    if (value >= 10000) {
      final decimals = _decimalsFromInterval(
        safeInterval == 0 ? 1 : safeInterval / 1000,
      );
      return '${(value / 1000).toStringAsFixed(decimals)}K';
    }

    if (value >= 1000) {
      final decimals = _decimalsFromInterval(safeInterval);
      return value.toStringAsFixed(decimals);
    }

    if (value >= 1) {
      final decimals = math.max(2, _decimalsFromInterval(safeInterval));
      return value.toStringAsFixed(decimals);
    }

    if (value >= 0.01) {
      final decimals = math.max(4, _decimalsFromInterval(safeInterval));
      return value.toStringAsFixed(decimals);
    }

    if (value >= 0.0001) {
      final decimals = math.max(6, _decimalsFromInterval(safeInterval));
      return value.toStringAsFixed(decimals);
    }

    return value.toStringAsExponential(2);
  }

  int _decimalsFromInterval(double interval) {
    if (interval <= 0) return 2;
    final target = interval / 2;
    if (target >= 1) return 0;
    final raw = (-math.log(target) / math.ln10).ceil();
    return raw.clamp(0, 6);
  }
}

class _KlineOverlayPainter extends CustomPainter {
  final List<_CandleEntry> candles;
  final double minY;
  final double maxY;
  final double currentPrice;
  final String currentPriceText;
  final TextStyle labelTextStyle;
  final Color labelBackground;
  final Color labelBorder;
  final Color lineColor;
  final Color crosshairColor;
  final int? touchedIndex;
  final EdgeInsets labelPadding;
  final double labelOffset;
  final double lineGap;

  _KlineOverlayPainter({
    required this.candles,
    required this.minY,
    required this.maxY,
    required this.currentPrice,
    required this.currentPriceText,
    required this.labelTextStyle,
    required this.labelBackground,
    required this.labelBorder,
    required this.lineColor,
    required this.crosshairColor,
    required this.touchedIndex,
    required this.labelPadding,
    required this.labelOffset,
    required this.lineGap,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty || maxY == minY) return;

    final priceY = _priceToY(currentPrice, size);
    _drawCurrentPriceLine(canvas, size, priceY);

    if (touchedIndex != null &&
        touchedIndex! >= 0 &&
        touchedIndex! < candles.length) {
      _drawCrosshair(canvas, size, touchedIndex!, candles[touchedIndex!].close);
    }
  }

  void _drawCurrentPriceLine(Canvas canvas, Size size, double y) {
    final textPainter = TextPainter(
      text: TextSpan(text: currentPriceText, style: labelTextStyle),
      textDirection: TextDirection.ltr,
    )..layout();

    final labelWidth = textPainter.width + labelPadding.horizontal;
    final labelHeight = textPainter.height + labelPadding.vertical;
    final labelRect = Rect.fromLTWH(
      labelOffset,
      y - labelHeight / 2,
      labelWidth,
      labelHeight,
    );

    final rrect = RRect.fromRectAndRadius(labelRect, Radius.circular(3.w));
    canvas.drawRRect(rrect, Paint()..color = labelBackground);
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = labelBorder
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    final textOffset = Offset(
      labelRect.left + labelPadding.left,
      labelRect.top + labelPadding.top,
    );
    textPainter.paint(canvas, textOffset);

    final lineStartX = labelRect.right + lineGap;
    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    _drawDashedLine(
      canvas,
      Offset(lineStartX, y),
      Offset(size.width, y),
      paint,
      dashLength: 4.w,
      gapLength: 4.w,
    );
  }

  void _drawCrosshair(Canvas canvas, Size size, int index, double price) {
    final paint = Paint()
      ..color = crosshairColor
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    final x = _indexToX(index, size);
    final y = _priceToY(price, size);

    _drawDashedLine(
      canvas,
      Offset(x, 0),
      Offset(x, size.height),
      paint,
      dashLength: 4.w,
      gapLength: 4.w,
    );
    _drawDashedLine(
      canvas,
      Offset(0, y),
      Offset(size.width, y),
      paint,
      dashLength: 4.w,
      gapLength: 4.w,
    );
  }

  double _priceToY(double price, Size size) {
    final clamped = price.clamp(minY, maxY);
    final ratio = (maxY - clamped) / (maxY - minY);
    return ratio * size.height;
  }

  double _indexToX(int index, Size size) {
    if (candles.length <= 1) return size.width / 2;
    return index / (candles.length - 1) * size.width;
  }

  void _drawDashedLine(
    Canvas canvas,
    Offset start,
    Offset end,
    Paint paint, {
    required double dashLength,
    required double gapLength,
  }) {
    final totalLength = (end - start).distance;
    if (totalLength == 0) return;

    final direction = (end - start) / totalLength;
    var distance = 0.0;
    while (distance < totalLength) {
      final currentStart = start + direction * distance;
      final currentEnd =
          start + direction * (distance + dashLength).clamp(0, totalLength);
      canvas.drawLine(currentStart, currentEnd, paint);
      distance += dashLength + gapLength;
    }
  }

  @override
  bool shouldRepaint(covariant _KlineOverlayPainter oldDelegate) {
    return oldDelegate.currentPrice != currentPrice ||
        oldDelegate.touchedIndex != touchedIndex ||
        oldDelegate.minY != minY ||
        oldDelegate.maxY != maxY ||
        oldDelegate.currentPriceText != currentPriceText ||
        oldDelegate.candles != candles;
  }
}

class _CandleEntry {
  final String label;
  final double open;
  final double close;
  final double low;
  final double high;
  final double volume;

  _CandleEntry({
    required this.label,
    required this.open,
    required this.close,
    required this.low,
    required this.high,
    required this.volume,
  });
}
