import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:webview_flutter/webview_flutter.dart';

/// Interactive Kline Chart with Echarts and JavaScript communication
/// Supports partial data updates without full chart recreation
class InteractiveKlineChart extends StatefulWidget {
  final List<Map<String, dynamic>>
  klineData; // [{date, open, close, low, high, volume}]
  final String symbol;
  final String interval;
  final bool isDarkMode;
  final double currentPrice;
  final int pricePrecision; // Number of decimal places for price

  const InteractiveKlineChart({
    super.key,
    required this.klineData,
    required this.symbol,
    required this.interval,
    required this.isDarkMode,
    required this.currentPrice,
    this.pricePrecision = 4, // Default to 4 decimal places
  });

  @override
  State<InteractiveKlineChart> createState() => _InteractiveKlineChartState();
}

class _InteractiveKlineChartState extends State<InteractiveKlineChart> {
  WebViewController? _controller;
  bool _isChartReady = false;
  bool _isInitializing = true;
  String? _echartsBundle;

  @override
  void initState() {
    super.initState();
    _loadEchartsBundle();
  }

  Future<void> _loadEchartsBundle() async {
    try {
      _echartsBundle = await rootBundle.loadString('assets/js/echarts.min.js');
      debugPrint(
        '✅ Echarts bundle loaded (${(_echartsBundle!.length / 1024).toStringAsFixed(0)}KB)',
      );
    } catch (e) {
      debugPrint('⚠️ Failed to load Echarts bundle: $e, using CDN fallback');
    }

    _initializeWebView();

    if (mounted) {
      setState(() {
        _isInitializing = false;
      });
    }
  }

  @override
  void didUpdateWidget(InteractiveKlineChart oldWidget) {
    super.didUpdateWidget(oldWidget);

    debugPrint(
      '🔍 didUpdateWidget called - oldPrice: ${oldWidget.currentPrice}, newPrice: ${widget.currentPrice}, ready: $_isChartReady',
    );

    // Update chart if data or current price changed
    if (_isChartReady) {
      final dataChanged = widget.klineData != oldWidget.klineData;
      final priceChanged = widget.currentPrice != oldWidget.currentPrice;
      final precisionChanged =
          widget.pricePrecision != oldWidget.pricePrecision;
      final dataLengthChanged =
          widget.klineData.length != oldWidget.klineData.length;

      if (priceChanged) {
        debugPrint(
          '💰 PRICE CHANGED: ${oldWidget.currentPrice} → ${widget.currentPrice}',
        );
      } else {
        debugPrint('⚪ Price NOT changed (both: ${widget.currentPrice})');
      }

      // Check if last candle was updated (compare last item if data length same)
      bool lastCandleChanged = false;
      if (!dataLengthChanged &&
          widget.klineData.isNotEmpty &&
          oldWidget.klineData.isNotEmpty) {
        final newLast = widget.klineData.last;
        final oldLast = oldWidget.klineData.last;
        lastCandleChanged =
            newLast['close'] != oldLast['close'] ||
            newLast['high'] != oldLast['high'] ||
            newLast['low'] != oldLast['low'];
      }

      // Update if anything changed
      if (dataChanged ||
          priceChanged ||
          precisionChanged ||
          dataLengthChanged ||
          lastCandleChanged) {
        debugPrint(
          '🔄 Calling _updateChartData - price=$priceChanged, data=$dataChanged, candle=$lastCandleChanged',
        );
        _updateChartData();
      } else {
        debugPrint('⛔ NOT calling _updateChartData - nothing changed');
      }
    }
  }

  void _initializeWebView() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..addJavaScriptChannel(
        'ChartReady',
        onMessageReceived: (JavaScriptMessage message) {
          setState(() {
            _isChartReady = true;
          });
          debugPrint('✅ Chart ready!');
        },
      )
      ..loadHtmlString(_generateHtml());
  }

  /// Generate HTML with Echarts and custom update logic
  String _generateHtml() {
    final bgColor = widget.isDarkMode ? '#1a1a1a' : '#ffffff';
    final textColor = widget.isDarkMode ? '#e0e0e0' : '#333333';
    final gridLineColor = widget.isDarkMode ? '#333333' : '#e0e0e0';

    // Use embedded Echarts bundle if available, otherwise fallback to CDN
    final echartsScript = _echartsBundle != null
        ? '<script>$_echartsBundle</script>'
        : '<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>';

    return '''
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta charset="utf-8">
  $echartsScript
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      height: 100%; 
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: manipulation;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
    }
    #chart { 
      width: 100%; 
      height: 100%; 
      touch-action: manipulation;
    }
  </style>
</head>
<body>
  <div id="chart"></div>
  <script>
    // Global variables to store data for tooltip and axis formatting
    window.originalKlineData = null;
    window.currentCandleValues = null;
    window.latestPriceValue = null;
    window.latestPriceText = null;
    window.isDarkTheme = false;
    
    // Wait for Echarts to load
    function initWhenReady() {
      if (typeof echarts === 'undefined') {
        console.log('Echarts not loaded yet, retrying...');
        setTimeout(initWhenReady, 100);
        return;
      }
      
      try {
        var chartDom = document.getElementById('chart');
        if (!chartDom) {
          console.error('Chart DOM element not found');
          return;
        }
        
        window.chart = echarts.init(chartDom, null, {
          renderer: 'canvas',
          devicePixelRatio: window.devicePixelRatio || 1,
          width: 'auto',
          height: 'auto'
        });

        // Add click listener to hide tooltips and crosshair when clicking outside chart
        document.addEventListener('click', function(event) {
          var chartRect = chartDom.getBoundingClientRect();
          var clickX = event.clientX;
          var clickY = event.clientY;

          // Check if click is outside the chart area
          if (clickX < chartRect.left || clickX > chartRect.right ||
              clickY < chartRect.top || clickY > chartRect.bottom) {
            // Hide tooltips and crosshair completely
            if (window.chart && typeof window.chart.dispatchAction === 'function') {
              // Hide tooltip
              window.chart.dispatchAction({
                type: 'hideTip'
              });
              // Disable axisPointer temporarily to hide crosshair lines
              window.chart.setOption({
                tooltip: {
                  axisPointer: {
                    type: 'cross',
                    show: false
                  }
                }
              }, false);
              // Re-enable axisPointer after a brief moment for next interaction
              setTimeout(function() {
                if (window.chart) {
                  window.chart.setOption({
                    tooltip: {
                      axisPointer: {
                        type: 'cross',
                        show: true
                      }
                    }
                  }, false);
                }
              }, 100);
            }
          }
        });
        
        var currentData = ${jsonEncode(widget.klineData)};
        
        if (currentData.length === 0) {
          console.warn('No data to display');
          return;
        }
        
        // Initialize precision before creating chart using Flutter-provided value
        window.pricePrecision = ${widget.pricePrecision};
        if (typeof window.pricePrecision !== 'number' || isNaN(window.pricePrecision)) {
          window.pricePrecision = 4;
        }
        console.log('🎯 Initialized price precision to', window.pricePrecision);
        
        window.latestPriceValue = ${widget.currentPrice};
        if (typeof window.latestPriceValue !== 'number' || isNaN(window.latestPriceValue)) {
          window.latestPriceValue = 0;
        }
        window.latestPriceText = formatPriceLabel(window.latestPriceValue);
        initChart(currentData, '${widget.symbol}', ${widget.currentPrice}, '${widget.interval}');
        
        // Notify Flutter that chart is ready
        if (typeof ChartReady !== 'undefined') {
          ChartReady.postMessage('ready');
        }
        
        // Handle window resize
        window.addEventListener('resize', function() {
          if (window.chart) {
            window.chart.resize();
            renderPriceIndicator(window.latestPriceValue, window.isDarkTheme);
          }
        });
      } catch (e) {
        console.error('❌ Chart initialization error:', e);
        console.error('Error stack:', e.stack);
      }
    }
    
    function formatPriceLabel(price) {
      if (typeof price !== 'number' || isNaN(price)) {
        return '--';
      }
      var precision = window.pricePrecision || 4;
      var absPrice = Math.abs(price);
      if (absPrice < 0.0001) {
        return price.toExponential(2);
      }
      return price.toFixed(precision);
    }

    function renderPriceIndicator(price, isDark) {
      if (!window.chart) {
        return;
      }
      if (typeof price !== 'number' || isNaN(price)) {
        window.chart.setOption({ graphic: [] }, false);
        return;
      }

      var yPixel = window.chart.convertToPixel({ yAxisIndex: 0 }, price);
      if (!isFinite(yPixel)) {
        return;
      }

      var chartWidth = window.chart.getWidth();
      var chartHeight = window.chart.getHeight();
      yPixel = Math.min(Math.max(yPixel, 0), chartHeight);

      var labelText = formatPriceLabel(price);
      var labelWidth = Math.max(labelText.length * 6.5 + 2, 45); // Minimal horizontal padding
      var labelHeight = 18;
      var lineColor = isDark ? '#666' : '#999';
      var labelBgTransparent = isDark ? 'rgba(26, 26, 26, 0.6)' : 'rgba(255, 255, 255, 0.6)'; // Semi-transparent background (0.6 opacity)
      var textColor = isDark ? '#fff' : '#000';

      // Get grid area to position label after first x-axis gridline
      var grid = window.chart.getModel().getComponent('grid', 0);
      var gridRect = grid.coordinateSystem.getRect();
      var gridLeft = gridRect.x;
      
      // Calculate position for first candlestick (after first vertical gridline)
      var xPixel = window.chart.convertToPixel({ xAxisIndex: 0 }, 0);
      if (!isFinite(xPixel)) {
        xPixel = gridLeft + 10;
      }
      
      var labelX = xPixel - 10; // Moved left to overlap y-axis slightly (changed from +6 to -10)
      var lineEndX = labelX + labelWidth + 4;

      window.chart.setOption({
        graphic: [
          {
            id: 'price-line',
            type: 'line',
            silent: true,
            z: 998, // High z-index for line
            shape: { x1: lineEndX, y1: yPixel, x2: chartWidth, y2: yPixel },
            style: {
              stroke: lineColor,
              lineWidth: 1,
              lineDash: [4, 4],
              opacity: 1.0 // Fully opaque line
            }
          },
          {
            id: 'price-label',
            type: 'group',
            silent: true,
            z: 1000, // Highest z-index - ensures label is always on top
            z2: 1000, // Fine-grained z-index control
            position: [labelX, yPixel - labelHeight / 2],
            children: [
              {
                type: 'rect',
                z: 1001, // High z-index for background rect
                z2: 1001,
                shape: { x: 0, y: 0, width: labelWidth, height: labelHeight, r: 3 },
                style: {
                  fill: labelBgTransparent, // Semi-transparent background (0.6 opacity)
                  stroke: lineColor,
                  lineWidth: 1
                }
              },
              {
                type: 'text',
                z: 1002, // Highest z-index for text - always on top
                z2: 1002,
                style: {
                  x: labelWidth / 2,
                  y: labelHeight / 2,
                  text: labelText,
                  fill: textColor,
                  fontSize: 11,
                  fontWeight: 500,
                  textAlign: 'center',
                  textVerticalAlign: 'middle'
                }
              }
            ]
          }
        ]
      }, false);
    }

    // Initialize chart with data
      function initChart(data, symbol, currentPrice, interval) {
        try {
          // Clear any existing graphic elements (price indicators) when reinitializing
          if (window.chart) {
            window.chart.setOption({ graphic: [] }, false);
          }
          
          // Store original data globally for tooltip access
          window.originalKlineData = data;
      
      // Check if interval is intraday (not 1D, 1W, 1M)
      var isIntraday = interval && !interval.match(/^(1D|1W|1M|1d|1w|1m)\$/i);
      console.log('📅 Is intraday:', isIntraday);
      
      // Format dates for display
      var formatDateLabel = function(dateStr, index, isFirst, isLast) {
        try {
          var date = new Date(dateStr);
          if (isNaN(date.getTime())) return dateStr;
          
          if (isIntraday) {
            // For intraday: show date+time for first, time for last
            var timeStr = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
            if (isFirst) {
              var monthStr = ('0' + (date.getMonth() + 1)).slice(-2);
              var dayStr = ('0' + date.getDate()).slice(-2);
              return monthStr + '/' + dayStr + ' ' + timeStr;
            }
            return timeStr;
          } else {
            // For daily+: show date only
            return dateStr;
          }
        } catch (e) {
          console.error('Error formatting date:', e);
          return dateStr;
        }
      };
      
      var dates = data.map(function(item) { return item.date; });
      var displayDates = dates.map(function(date, index) {
        return formatDateLabel(date, index, index === 0, index === dates.length - 1);
      });
      // Echarts candlestick expects: [open, close, low, high]
      var values = data.map(function(item) { 
        return [
          Number(item.open),
          Number(item.close),
          Number(item.low),
          Number(item.high)
        ]; 
      });
      
      // Extract volume data
      var volumes = data.map(function(item) { 
        return Number(item.volume || 0); 
      });
      
      // Store values globally for y-axis formatter access
      window.currentCandleValues = values;
      
      // Define isDark for use in tooltip config
      var isDark = '$bgColor' === '#1a1a1a';
      
      var option = {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          trigger: 'axis',
          triggerOn: 'click',
          axisPointer: {
            type: 'cross',
            lineStyle: { color: '$gridLineColor', width: 1, type: 'solid', opacity: 0.5 },
            label: {
              show: false
            }
          },
          backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
          borderWidth: 1,
          borderColor: isDark ? '#333333' : '#e5e5e5',
          borderRadius: 4,
          padding: [8, 10],
          textStyle: { color: '$textColor', fontSize: 11, lineHeight: 18 },
          confine: true,
          transitionDuration: 0,
          position: function(point, params, dom, rect, size) {
            // Auto position to avoid going off screen
            var x = point[0];
            var y = point[1];
            var viewWidth = size.viewSize[0];
            var viewHeight = size.viewSize[1];
            var boxWidth = size.contentSize[0];
            var boxHeight = size.contentSize[1];

            // Position to the right if there's space, otherwise to the left
            var posX = x + 20;
            if (posX + boxWidth > viewWidth) {
              posX = x - boxWidth - 20;
            }

            // Keep vertical position near cursor but ensure visibility
            var posY = y - boxHeight / 2;
            if (posY < 0) posY = 10;
            if (posY + boxHeight > viewHeight) posY = viewHeight - boxHeight - 10;

            return [posX, posY];
          },
          formatter: function(params) {
            if (!params || params.length === 0) return '';

            // Find candlestick data (series index 0)
            var candleData = null;
            for (var i = 0; i < params.length; i++) {
              if (params[i].seriesType === 'candlestick') {
                candleData = params[i];
                break;
              }
            }

            if (!candleData) return '';

            var dataIndex = candleData.dataIndex;

            // Get the actual data point from the global original data array
            if (!window.originalKlineData || window.originalKlineData.length === 0) {
              return '';
            }

            var actualData = window.originalKlineData[dataIndex];
            if (!actualData) {
              return '';
            }

            // Extract OHLC and volume directly from the original data object
            var open = Number(actualData.open);
            var close = Number(actualData.close);
            var low = Number(actualData.low);
            var high = Number(actualData.high);
            var volume = Number(actualData.volume || 0);
            var date = actualData.date;
            
            // Debug: Log volume data
            console.log('📊 Tooltip volume:', volume, 'from data:', actualData.volume);

            var isUp = close >= open;
            var color = isUp ? '#22c55e' : '#ef5350';
            var bgColor = '$bgColor';
            var isDark = bgColor === '#1a1a1a';

            // Format number using API-provided precision
            var formatNum = function(num) {
              if (typeof num !== 'number') return '--';
              if (num === 0) return '0';
              
              var absNum = Math.abs(num);
              var precision = window.pricePrecision || 4;
              
              // Very small numbers - scientific notation
              if (absNum < 0.0001) {
                return num.toExponential(2);
              }
              
              // Use API-provided precision - keep all digits for consistency
              return num.toFixed(precision);
            };
            
            // Format volume with K/M/B suffix
            var formatVol = function(vol) {
              if (typeof vol !== 'number' || vol === 0) return '--';
              if (vol >= 1000000000) {
                return (vol / 1000000000).toFixed(2) + 'B';
              } else if (vol >= 1000000) {
                return (vol / 1000000).toFixed(2) + 'M';
              } else if (vol >= 1000) {
                return (vol / 1000).toFixed(2) + 'K';
              }
              return vol.toFixed(2);
            };
            
            // Calculate range as percentage of open price
            var rangePercent = open !== 0 ? ((high - low) / open * 100) : 0;

            // Compact style - OHLCR + Volume
            var html = '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; min-width: 95px;">';

            // Time
            html += '<div style="margin-bottom: 4px; color: ' + (isDark ? '#999' : '#666') + '; font-size: 10px;">' + date + '</div>';

            // Row helper
            var row = function(label, value, valueColor) {
              return '<div style="display: flex; justify-content: space-between; margin-bottom: 2px; line-height: 14px;">' +
                '<span style="color: ' + (isDark ? '#999' : '#666') + '; font-size: 9px;">' + label + '</span>' +
                '<span style="color: ' + (valueColor || (isDark ? '#fff' : '#000')) + '; font-size: 10px; font-weight: 500; margin-left: 12px;">' + value + '</span>' +
                '</div>';
            };

            html += row('Open', formatNum(open));
            html += row('High', formatNum(high));
            html += row('Low', formatNum(low));
            html += row('Close', formatNum(close), color);
            html += row('Range', rangePercent.toFixed(2) + '%', isDark ? '#999' : '#666');
            html += row('Vol', formatVol(volume), isDark ? '#999' : '#666');

            html += '</div>';
            return html;
          }
        },
        grid: { 
          left: '3%', 
          right: '3%', 
          top: '3%', 
          bottom: '8%', 
          containLabel: true,
          borderWidth: 0
        },
        xAxis: {
          type: 'category',
          data: displayDates,
          boundaryGap: true,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { 
            color: '$textColor', 
            fontSize: 9,
            rotate: 0,
            showMinLabel: true,
            showMaxLabel: true,
            interval: function(index, value) {
              var totalLabels = displayDates.length;
              if (totalLabels <= 6) {
                return true;
              }
              if (index === 0 || index === totalLabels - 1) {
                return true;
              }
              var step = Math.floor(totalLabels / 6);
              if (step < 1) step = 1;
              return index % step === 0;
            }
          },
          splitLine: { 
            show: true,
            interval: function(index, value) {
              var totalBoundaries = displayDates.length + 1;
              if (totalBoundaries <= 7) {
                return true;
              }
              if (index === 0 || index === totalBoundaries - 1) {
                return true;
              }
              var step = Math.floor(totalBoundaries / 6);
              if (step < 1) step = 1;
              return index % step === 0;
            },
            lineStyle: { color: '$gridLineColor', opacity: 0.2, type: 'solid', width: 1 }
          }
        },
        yAxis: [
          {
            type: 'value',
            scale: true,
            position: 'left',
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { 
              color: '$textColor', 
              fontSize: 9,
              formatter: function(value) {
                var currentValues = window.currentCandleValues || values;
                var allPrices = currentValues.map(function(v) { return v[1]; });
                var minPrice = Math.min.apply(null, allPrices);
                var maxPrice = Math.max.apply(null, allPrices);
                var priceRange = maxPrice - minPrice;
                var avgPrice = (minPrice + maxPrice) / 2;
                
                if (avgPrice >= 10000) {
                  return (value / 1000).toFixed(1) + 'K';
                }
                if (avgPrice >= 1000) {
                  return value.toFixed(1);
                }
                if (avgPrice >= 1) {
                  if (priceRange < 1) {
                    return value.toFixed(3);
                  } else if (priceRange < 10) {
                    return value.toFixed(2);
                  } else if (priceRange < 100) {
                    return value.toFixed(1);
                  }
                  return value.toFixed(0);
                }
                if (avgPrice >= 0.01) {
                  return value.toFixed(4);
                }
                if (avgPrice >= 0.0001) {
                  return value.toFixed(6);
                }
                return value.toExponential(2);
              }
            },
            splitNumber: 6,
            minInterval: 0,
            splitLine: { 
              show: true,
              lineStyle: { color: '$gridLineColor', opacity: 0.5, type: 'solid', width: 1 } 
            }
          },
          {
            type: 'value',
            scale: true,
            position: 'right',
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { 
              show: false
            },
            splitNumber: 3,
            splitLine: { 
              show: false
            },
            max: function(value) {
              // Make volume bars take up only bottom 25% of chart
              return value.max * 4;
            }
          }
        ],
        dataZoom: [
          { type: 'inside', disabled: true },
          { type: 'slider', show: false }
        ],
        series: [
          {
            name: 'Candlestick',
            type: 'candlestick',
            data: values,
            yAxisIndex: 0,
            itemStyle: {
              color: '#22c55e',
              color0: '#ef5350',
              borderColor: '#22c55e',
              borderColor0: '#ef5350'
            },
            barWidth: '70%'
          },
          {
            name: 'MA5',
            type: 'line',
            data: calculateMA(values, 5),
            yAxisIndex: 0,
            smooth: true,
            lineStyle: { color: '#ffa726', opacity: 0.7, width: 1 },
            showSymbol: false
          },
          {
            name: 'MA10',
            type: 'line',
            data: calculateMA(values, 10),
            yAxisIndex: 0,
            smooth: true,
            lineStyle: { color: '#42a5f5', opacity: 0.7, width: 1 },
            showSymbol: false
          },
          {
            name: 'Volume',
            type: 'bar',
            data: volumes.map(function(vol, idx) {
              var candle = values[idx];
              var isUp = candle[1] >= candle[0]; // close >= open
              return {
                value: vol,
                itemStyle: {
                  color: isUp ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 83, 80, 0.4)'
                }
              };
            }),
            yAxisIndex: 1,
            barWidth: '70%',
            z: 0
          }
        ]
      };
      
      if (window.chart) {
        window.chart.setOption(option, true);
        window.latestPriceValue = currentPrice;
        window.latestPriceText = formatPriceLabel(currentPrice);
        window.isDarkTheme = isDark;
        renderPriceIndicator(currentPrice, isDark);
      } else {
        console.error('window.chart is null');
      }
      } catch (error) {
        console.error('❌ Error in initChart:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        throw error;
      }
    }
    
    // Update chart data without full recreation
    function updateChartData(newData, currentPrice, interval, pricePrecision) {
      console.log('🟠 updateChartData called - currentPrice:', currentPrice);
      
      if (!window.chart) {
        console.error('Chart not initialized');
        return false;
      }
      
      try {
        // Store precision globally for formatters using the latest value from Flutter
        if (typeof pricePrecision === 'number' && !isNaN(pricePrecision)) {
          window.pricePrecision = pricePrecision;
        } else if (typeof pricePrecision === 'string' && pricePrecision.trim() !== '') {
          var parsedPrecision = parseInt(pricePrecision, 10);
          window.pricePrecision = isNaN(parsedPrecision) ? (window.pricePrecision || 4) : parsedPrecision;
        } else if (!window.pricePrecision) {
          window.pricePrecision = 4;
        }
        
        // Update global data for tooltip access
        window.originalKlineData = newData;
        if (typeof currentPrice === 'number' && !isNaN(currentPrice)) {
          window.latestPriceValue = currentPrice;
          window.latestPriceText = formatPriceLabel(currentPrice);
        } else if (!window.latestPriceText && window.originalKlineData.length > 0) {
          var lastClose = Number(window.originalKlineData[window.originalKlineData.length - 1].close);
          if (!isNaN(lastClose)) {
            window.latestPriceValue = lastClose;
            window.latestPriceText = formatPriceLabel(lastClose);
          }
        }
        
        // Check if interval is intraday
        var isIntraday = interval && !interval.match(/^(1D|1W|1M|1d|1w|1m)\$/i);
        
        // Format dates for display
        var formatDateLabel = function(dateStr, index, isFirst, isLast) {
          try {
            var date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            
            if (isIntraday) {
              var timeStr = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
              if (isFirst) {
                var monthStr = ('0' + (date.getMonth() + 1)).slice(-2);
                var dayStr = ('0' + date.getDate()).slice(-2);
                return monthStr + '/' + dayStr + ' ' + timeStr;
              }
              return timeStr;
            } else {
              return dateStr;
            }
          } catch (e) {
            return dateStr;
          }
        };
        
        var dates = newData.map(function(item) { return item.date; });
        var displayDates = dates.map(function(date, index) {
          return formatDateLabel(date, index, index === 0, index === dates.length - 1);
        });
        var values = newData.map(function(item) { 
          return [item.open, item.close, item.low, item.high]; 
        });
        
        // Extract volume data
        var volumes = newData.map(function(item) { 
          return Number(item.volume || 0); 
        });
        
        // Update global values for y-axis formatter
        window.currentCandleValues = values;
        
        // Use setOption with notMerge: false and lazyUpdate: true
        // This updates data without recreating the chart
        var isDark = '$bgColor' === '#1a1a1a';
        
        window.chart.setOption({
          xAxis: { data: displayDates },
          series: [
            {
              data: values
            },
            { data: calculateMA(values, 5) },
            { data: calculateMA(values, 10) },
            {
              data: volumes.map(function(vol, idx) {
                var candle = values[idx];
                var isUp = candle[1] >= candle[0];
                return {
                  value: vol,
                  itemStyle: {
                    color: isUp ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 83, 80, 0.4)'
                  }
                };
              })
            }
          ]
        }, { notMerge: false, lazyUpdate: true, silent: true });
        window.latestPriceValue = currentPrice;
        window.latestPriceText = formatPriceLabel(currentPrice);
        window.isDarkTheme = isDark;
        renderPriceIndicator(currentPrice, isDark);
        
        return true;
      } catch (e) {
        console.error('updateChartData error:', e);
        return false;
      }
    }
    
    // Calculate moving average
    function calculateMA(data, dayCount) {
      var result = [];
      for (var i = 0; i < data.length; i++) {
        if (i < dayCount) {
          result.push(null);
        } else {
          var sum = 0;
          for (var j = 0; j < dayCount; j++) {
            sum += data[i - j][1]; // close price
          }
          result.push(sum / dayCount);
        }
      }
      return result;
    }
    
    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initWhenReady);
    } else {
      initWhenReady();
    }
  </script>
</body>
</html>
    ''';
  }

  /// Update chart data via JavaScript
  void _updateChartData() {
    if (!_isChartReady || _controller == null) return;

    final jsonData = jsonEncode(widget.klineData);
    final jsCode =
        '''
      updateChartData($jsonData, ${widget.currentPrice}, '${widget.interval}', ${widget.pricePrecision});
    ''';

    _controller!.runJavaScript(jsCode);
  }

  /// Hide tooltips via JavaScript (public method)
  void hideTooltips() {
    if (!_isChartReady || _controller == null) return;

    const jsCode = '''
      if (window.chart && typeof window.chart.dispatchAction === 'function') {
        window.chart.dispatchAction({
          type: 'hideTip'
        });
      }
    ''';

    _controller!.runJavaScript(jsCode);
  }

  @override
  Widget build(BuildContext context) {
    if (_isInitializing || _controller == null) {
      return Center(
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: widget.isDarkMode ? Colors.blue[300] : Colors.blue[700],
        ),
      );
    }

    return WebViewWidget(controller: _controller!);
  }
}
