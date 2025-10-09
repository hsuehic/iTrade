import 'dart:developer' as developer;
import 'package:dio/dio.dart';
import '../models/order.dart';
import 'api_client.dart';

/// Service for managing orders
class OrderService {
  OrderService._internal();
  static final OrderService instance = OrderService._internal();

  final ApiClient _apiClient = ApiClient.instance;

  /// Fetch orders with optional filters
  Future<List<Order>> getOrders({
    int? strategyId,
    String? symbol,
    String? status,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final Map<String, dynamic> queryParams = {};
      if (strategyId != null) queryParams['strategyId'] = strategyId;
      if (symbol != null) queryParams['symbol'] = symbol;
      if (status != null) queryParams['status'] = status;
      if (startDate != null) {
        queryParams['startDate'] = startDate.toIso8601String();
      }
      if (endDate != null) {
        queryParams['endDate'] = endDate.toIso8601String();
      }

      final Response response = await _apiClient.getJson(
        '/api/orders',
        queryParameters: queryParams.isNotEmpty ? queryParams : null,
      );

      if (response.statusCode == 200 && response.data is List) {
        return (response.data as List)
            .map((json) => Order.fromJson(json as Map<String, dynamic>))
            .toList();
      }
      return [];
    } catch (e) {
      developer.log(
        'Failed to fetch orders',
        name: 'OrderService',
        error: e,
      );
      // Return empty list on error
      return [];
    }
  }

  /// Get a single order by ID
  Future<Order?> getOrder(String id) async {
    try {
      final Response response = await _apiClient.getJson('/api/orders/$id');

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        return Order.fromJson(response.data as Map<String, dynamic>);
      }
      return null;
    } catch (e) {
      developer.log(
        'Failed to fetch order $id',
        name: 'OrderService',
        error: e,
      );
      return null;
    }
  }
}

