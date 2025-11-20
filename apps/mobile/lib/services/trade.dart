import 'dart:async';

import 'package:dio/dio.dart';

import 'api_client.dart';

class TradeService {
  TradeService._internal();
  static final TradeService instance = TradeService._internal();

  Future<void> getStrategy(Map<String, dynamic> queryParameters) async {
    final Response<dynamic> res = await ApiClient.instance.getJson(
      '/api/strategy',
      queryParameters: queryParameters,
    );
        return res.data;
  }
}
