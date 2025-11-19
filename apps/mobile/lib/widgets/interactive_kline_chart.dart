import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:webview_flutter/webview_flutter.dart';

/// Interactive Kline Chart with Echarts and JavaScript communication
/// Supports partial data updates without full chart recreation
class InteractiveKlineChart extends StatefulWidget {
  final List<Map<String, dynamic>>
  klineData; // [{date, open, close, low, high}]
  final String symbol;
  final String interval;
  final bool isDarkMode;
  final double currentPrice;

  const InteractiveKlineChart({
    super.key,
    required this.klineData,
    required this.symbol,
    required this.interval,
    required this.isDarkMode,
    required this.currentPrice,
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

    // Only update data if chart is ready and data changed
    if (_isChartReady && widget.klineData != oldWidget.klineData) {
      _updateChartData();
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
    // Global variable to store original kline data for tooltip access
    window.originalKlineData = null;
    
    // Wait for Echarts to load
    function initWhenReady() {
      if (typeof echarts === 'undefined') {
        console.log('Echarts not loaded yet, retrying...');
        setTimeout(initWhenReady, 100);
        return;
      }
      
      try {
        console.log('🚀 Starting chart initialization...');
        var chartDom = document.getElementById('chart');
        if (!chartDom) {
          console.error('❌ Chart DOM element not found');
          return;
        }
        console.log('✅ Chart DOM found');
        
        window.chart = echarts.init(chartDom, null, {
          renderer: 'canvas',
          devicePixelRatio: window.devicePixelRatio || 1,
          width: 'auto',
          height: 'auto'
        });
        console.log('✅ Echarts instance created');
        
        var currentData = ${jsonEncode(widget.klineData)};
        console.log('📊 Data loaded:', currentData.length, 'candles');
        
        if (currentData.length === 0) {
          console.warn('⚠️ No data to display');
          return;
        }
        
        initChart(currentData, '${widget.symbol}', ${widget.currentPrice}, '${widget.interval}');
        console.log('✅ Chart initialized successfully');
        
        // Notify Flutter that chart is ready
        if (typeof ChartReady !== 'undefined') {
          ChartReady.postMessage('ready');
          console.log('✅ Notified Flutter: chart ready');
        }
        
        // Handle window resize
        window.addEventListener('resize', function() {
          if (window.chart) {
            window.chart.resize();
          }
        });
      } catch (e) {
        console.error('❌ Chart initialization error:', e);
        console.error('Error stack:', e.stack);
      }
    }
    
    // Initialize chart with data
      function initChart(data, symbol, currentPrice, interval) {
        try {
          console.log('🔍 ===== INIT CHART DEBUG =====');
          console.log('📊 Data length:', data.length);
          console.log('📊 Interval:', interval);
          console.log('📦 First RAW item:', JSON.stringify(data[0]));
          console.log('📦 Last RAW item:', JSON.stringify(data[data.length - 1]));
          console.log('   First - date:', data[0].date, 'type:', typeof data[0].date);
          console.log('   First - open:', data[0].open, 'type:', typeof data[0].open);
          console.log('   First - close:', data[0].close, 'type:', typeof data[0].close);
          console.log('   First - low:', data[0].low, 'type:', typeof data[0].low);
          console.log('   First - high:', data[0].high, 'type:', typeof data[0].high);
          
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
      
      console.log('📈 First MAPPED candle [O,C,L,H]:', values[0]);
      console.log('   Open:', values[0][0], 'type:', typeof values[0][0]);
      console.log('   Close:', values[0][1], 'type:', typeof values[0][1]);
      console.log('   Low:', values[0][2], 'type:', typeof values[0][2]);
      console.log('   High:', values[0][3], 'type:', typeof values[0][3]);
      console.log('========================');
      
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

            console.log('🔍 ===== TOOLTIP DEBUG =====');
            console.log('📍 Data Index:', dataIndex);

            // Get the actual data point from the global original data array
            if (!window.originalKlineData || window.originalKlineData.length === 0) {
              console.error('❌ No original data available');
              return '';
            }

            var actualData = window.originalKlineData[dataIndex];
            if (!actualData) {
              console.error('❌ Could not find data at index:', dataIndex);
              return '';
            }

            console.log('📦 Found data object:', JSON.stringify(actualData));

            // Extract OHLC directly from the original data object
            var open = Number(actualData.open);
            var close = Number(actualData.close);
            var low = Number(actualData.low);
            var high = Number(actualData.high);
            var date = actualData.date;

            console.log('   ✅ Final OHLC: O=', open, 'C=', close, 'L=', low, 'H=', high);

            var isUp = close >= open;
            var color = isUp ? '#22c55e' : '#ef5350';
            var bgColor = '$bgColor';
            var isDark = bgColor === '#1a1a1a';

            var formatNum = function(num) {
              return typeof num === 'number' ? num.toFixed(2) : '0.00';
            };

            // Simple clean style - OHLC only
            var html = '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; min-width: 120px;">';

            // Time
            html += '<div style="margin-bottom: 6px; color: ' + (isDark ? '#999' : '#666') + '; font-size: 10px;">' + date + '</div>';

            // Row helper
            var row = function(label, value, valueColor) {
              return '<div style="display: flex; justify-content: space-between; margin-bottom: 3px; line-height: 16px;">' +
                '<span style="color: ' + (isDark ? '#999' : '#666') + '; font-size: 10px;">' + label + '</span>' +
                '<span style="color: ' + (valueColor || (isDark ? '#fff' : '#000')) + '; font-size: 11px; font-weight: 500; margin-left: 16px;">' + value + '</span>' +
                '</div>';
            };

            html += row('Open', formatNum(open));
            html += row('High', formatNum(high));
            html += row('Low', formatNum(low));
            html += row('Close', formatNum(close), color);

            html += '</div>';
            return html;
          }
        },
        grid: { 
          left: '3%', 
          right: '8%', 
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
            interval: function(index, value) {
              // Only show first and last labels
              return index === 0 || index === displayDates.length - 1;
            },
            showMinLabel: true,
            showMaxLabel: true
          },
          splitLine: { 
            show: false
          }
        },
        yAxis: {
          type: 'value',
          scale: true,
          axisLine: { show: false },
          axisLabel: { 
            color: '$textColor', 
            fontSize: 9,
            formatter: function(value) {
              // Format large numbers (e.g., 91890 → 91.9K)
              if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'K';
              }
              return value.toFixed(0);
            }
          },
          splitLine: { 
            show: true,
            lineStyle: { color: '$gridLineColor', opacity: 0.5, type: 'solid', width: 1 } 
          }
        },
        dataZoom: [
          { type: 'inside', disabled: true },
          { type: 'slider', show: false }
        ],
        series: [
          {
            type: 'candlestick',
            data: values,
            itemStyle: {
              color: '#22c55e',
              color0: '#ef5350',
              borderColor: '#22c55e',
              borderColor0: '#ef5350'
            },
            barWidth: '70%',
            markLine: {
              symbol: 'none',
              silent: true,
              label: {
                show: true,
                color: isDark ? '#fff' : '#000',
                fontSize: 10,
                position: 'insideEndTop',
                formatter: '{c}',
                backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)',
                borderRadius: 2,
                padding: [2, 6],
                borderWidth: 1,
                borderColor: isDark ? '#666' : '#999'
              },
              lineStyle: { 
                color: isDark ? '#666' : '#999', 
                width: 1, 
                type: 'dashed',
                opacity: 0.8
              },
              emphasis: {
                lineStyle: { 
                  color: isDark ? '#666' : '#999', 
                  width: 1, 
                  type: 'dashed',
                  opacity: 0.8
                }
              },
              data: [{ yAxis: currentPrice }]
            }
          },
          {
            name: 'MA5',
            type: 'line',
            data: calculateMA(values, 5),
            smooth: true,
            lineStyle: { color: '#ffa726', opacity: 0.7, width: 1 },
            showSymbol: false
          },
          {
            name: 'MA10',
            type: 'line',
            data: calculateMA(values, 10),
            smooth: true,
            lineStyle: { color: '#42a5f5', opacity: 0.7, width: 1 },
            showSymbol: false
          }
        ]
      };
      
      if (window.chart) {
        window.chart.setOption(option, true);
        console.log('✅ Chart option set successfully');
      } else {
        console.error('❌ window.chart is null');
      }
      } catch (error) {
        console.error('❌ Error in initChart:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        throw error;
      }
    }
    
    // Update chart data without full recreation
    function updateChartData(newData, currentPrice, interval) {
      if (!window.chart) {
        console.error('Chart not initialized');
        return false;
      }
      
      try {
        // Update global data for tooltip access
        window.originalKlineData = newData;
        
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
        
        // Use setOption with notMerge: false and lazyUpdate: true
        // This updates data without recreating the chart
        window.chart.setOption({
          xAxis: { data: displayDates },
          series: [
            {
              data: values,
              markLine: {
                silent: true,
                data: [{ yAxis: currentPrice }]
              }
            },
            { data: calculateMA(values, 5) },
            { data: calculateMA(values, 10) }
          ]
        }, { notMerge: false, lazyUpdate: true, silent: true });
        
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
      updateChartData($jsonData, ${widget.currentPrice}, '${widget.interval}');
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
