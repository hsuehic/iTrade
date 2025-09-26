import 'package:flutter/material.dart';
import 'package:flutter_echarts/flutter_echarts.dart';
import 'dart:convert';

class EchartScreen extends StatelessWidget {
  const EchartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // 示例数据（[日期, 开, 收, 低, 高]）
    final rawData = [
      ['2025/09/01', 100, 110, 95, 115],
      ['2025/09/02', 110, 108, 105, 112],
      ['2025/09/03', 108, 120, 107, 125],
      ['2025/09/04', 120, 118, 115, 125],
      ['2025/09/05', 118, 130, 117, 132],
      ['2025/09/06', 130, 125, 123, 133],
      ['2025/09/07', 125, 140, 122, 142],
      ['2025/09/08', 140, 135, 130, 145],
      ['2025/09/09', 135, 138, 133, 142],
      ['2025/09/10', 138, 150, 136, 152],
    ];

    final dates = rawData.map((e) => e[0]).toList();
    final values = rawData.map((e) => e.sublist(1)).toList();

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
      'legend': {
        'data': ['K线', 'MA5', 'MA10'],
        'inactiveColor': '#777',
      },
      'tooltip': {
        'trigger': 'axis',
        'axisPointer': {'type': 'cross'},
      },
      'xAxis': {
        'type': 'category',
        'data': dates,
        'scale': true,
        'boundaryGap': false,
        'axisLine': {'onZero': false},
        'splitLine': {'show': false},
      },
      'yAxis': {
        'scale': true,
        'splitArea': {'show': true},
      },
      'dataZoom': [
        {'type': 'inside', 'start': 50, 'end': 100},
        {'show': true, 'type': 'slider', 'top': '90%'},
      ],
      'series': [
        {
          'name': 'K线',
          'type': 'candlestick',
          'data': values,
          'itemStyle': {
            'color': '#ef5350',
            'color0': '#26a69a',
            'borderColor': '#ef5350',
            'borderColor0': '#26a69a',
          },
        },
        {
          'name': 'MA5',
          'type': 'line',
          'data': calcMA(5),
          'smooth': true,
          'lineStyle': {'opacity': 0.7},
        },
        {
          'name': 'MA10',
          'type': 'line',
          'data': calcMA(10),
          'smooth': true,
          'lineStyle': {'opacity': 0.7},
        },
      ],
    };

    return Scaffold(
      appBar: AppBar(title: const Text('K线图 (flutter_echarts)')),
      body: Column(
        children: [Expanded(child: Echarts(option: jsonEncode(option)))],
      ),
    );
  }
}
