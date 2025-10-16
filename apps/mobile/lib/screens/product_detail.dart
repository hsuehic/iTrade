import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_echarts/flutter_echarts.dart';
import 'package:intl/intl.dart';
import 'dart:convert';

import '../services/okx_data_service.dart';

class ProductDetailScreen extends StatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  late final OKXDataService _okxService;
  late final Timer _tickerTimer;
  List<OKXKline> _klines = [];
  OKXTicker? _ticker;
  late final Timer _timer;
  @override
  void initState() {
    super.initState();
    _okxService = OKXDataService();
    _loadData();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      _loadData();
    });
    _tickerTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _loadTicker();
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    _tickerTimer.cancel();
    _okxService.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final klines = await _okxService.getHistoricalKlines(
      widget.productId,
      bar: '15m',
      limit: 100,
    );
    setState(() {
      _klines = klines.reversed.toList();
    });
  }

  Future<void> _loadTicker() async {
    final ticker = await _okxService.getTicker(widget.productId);
    if (_klines.isEmpty) {
      return;
    }
    setState(() {
      _ticker = ticker;
      _klines[_klines.length - 1].close = ticker.last;
    });
  }

  @override
  Widget build(BuildContext context) {
    final dates = _klines.map((e) {
      return DateFormat('MM/dd hh:mm').format(e.time);
    }).toList();
    final values = _klines.map((e) {
      return [e.open, e.close, e.low, e.high];
    }).toList();

    // 简单 MA 计算
    List<double?> calcMA(int dayCount) {
      List<double?> result = [];
      for (int i = 0; i < values.length; i++) {
        if (i < dayCount) {
          result.add(null);
          continue;
        }
        double sum = 0;
        for (int j = 0; j < dayCount; j++) {
          sum += (values[i - j][1] as num).toDouble(); // 收盘价
        }
        result.add(sum / dayCount);
      }
      return result;
    }

    final option = {
      'backgroundColor': '#fff',
      'animation': false,

      'tooltip': {
        'trigger': 'axis',
        'axisPointer': {'type': 'cross'},
      },
      'grid': {
        'left': '5%',
        'right': '5%',
        'top': '2%',
        'bottom': '2%',
        'containLabel': true,
      },
      'xAxis': {
        'type': 'category',
        'data': dates,
        'scale': true,
        'boundaryGap': false,
        'axisLine': {'onZero': false},
        'splitLine': {
          'show': true,
          'lineStyle': {'color': '#e0e0e0', 'width': 1, 'type': 'dashed'},
        },
      },
      'yAxis': {
        'scale': true,
        'splitArea': {'show': false},
        'splitLine': {
          'show': true,
          'lineStyle': {'color': '#e0e0e0', 'width': 1, 'type': 'dashed'},
        },
      },
      // Disable interactive panning/zooming
      'dataZoom': [
        {
          'type': 'inside', // optional: show slider at bottom
          'xAxisIndex': 0,
        },
      ],
      'series': [
        {
          'name': 'Candlestick',
          'type': 'candlestick',
          'data': values,
          'itemStyle': {
            'color': '#ef5350',
            'color0': '#26a69a',
            'borderColor': '#ef5350',
            'borderColor0': '#26a69a',
          },
          'barWidth': '70%',
          'barGap': '10%',
          'markLine': {
            'symbol': 'none',
            'label': {
              'show': true,
              'color': '#ffffff',
              'position': 'start',
              'formatter': '{c}',
              'backgroundColor': '#aa0000', // 背景色
              'borderRadius': 4, // 圆角
              'padding': [4, 8], // 边距
              'align': 'left',
              'verticalAlign': 'top',
              'offset': [0, -8],
            },
            'lineStyle': {'color': '#ff9800', 'width': 1, 'type': 'dashed'},
            'data': [
              {'yAxis': _ticker?.last.toDouble() ?? 0},
            ],
          },
        },
        {
          'name': 'MA5',
          'type': 'line',
          'data': calcMA(5),
          'smooth': true,
          'lineStyle': {'opacity': 0.7},
          'showSymbol': false,
        },
        {
          'name': 'MA10',
          'type': 'line',
          'data': calcMA(10),
          'smooth': true,
          'lineStyle': {'opacity': 0.7},
          'showSymbol': false,
        },
      ],
    };

    return Scaffold(
      appBar: AppBar(title: Text(widget.productId)),
      body: Column(
        children: [
          SizedBox(height: 16),
          SizedBox(
            height: 300,
            child: _klines.isEmpty
                ? Container()
                : Echarts(
                    option: jsonEncode(option),
                    // Prevent WebView bounce/overscroll (pull-to-refresh-like) behavior
                    extraScript: '''
                (function(){
                  try {
                    var style = document.createElement('style');
                    style.type = 'text/css';
                    style.innerHTML = `
                      html, body { height: 100%; margin: 0; overscroll-behavior: none; }
                      /* Lock scrolling and rubber-banding */
                      body { position: fixed; overflow: hidden; width: 100%; -webkit-overflow-scrolling: auto; touch-action: manipulation; }
                      #chart { touch-action: manipulation; }
                    `;
                    document.head.appendChild(style);
                  } catch (e) {
                    console.log('style inject failed', e);
                  }
                })();
              ''',
                  ),
          ),
          SizedBox(height: 160),
        ],
      ),
    );
  }
}
