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

      developer.log('📥 Orders API Response:', name: 'OrderService');
      developer.log('  Status: ${response.statusCode}', name: 'OrderService');
      developer.log('  Data type: ${response.data.runtimeType}', name: 'OrderService');
      developer.log('  Data: ${response.data}', name: 'OrderService');

      if (response.statusCode == 200) {
        // API returns { orders: [...] }, not directly [...]
        if (response.data is Map<String, dynamic>) {
          final ordersData = response.data['orders'];
          developer.log('  Found orders key: ${ordersData != null}', name: 'OrderService');
          developer.log('  Orders type: ${ordersData.runtimeType}', name: 'OrderService');
          if (ordersData is List) {
            developer.log('  ✅ Orders count: ${ordersData.length}', name: 'OrderService');
            return ordersData
                .map((json) => Order.fromJson(json as Map<String, dynamic>))
                .toList();
          }
        }
        // Fallback: if data is directly a list (for backwards compatibility)
        else if (response.data is List) {
          developer.log('  ✅ Direct list, count: ${(response.data as List).length}', name: 'OrderService');
          return (response.data as List)
              .map((json) => Order.fromJson(json as Map<String, dynamic>))
              .toList();
        }
      }
      developer.log('  ❌ Returning empty list', name: 'OrderService');
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

