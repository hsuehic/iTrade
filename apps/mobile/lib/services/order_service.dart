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

      print('📥 Orders API Response:');
      print('  Status: ${response.statusCode}');
      print('  Data type: ${response.data.runtimeType}');
      print('  Data keys: ${response.data is Map ? (response.data as Map).keys.toList() : "not a map"}');

      if (response.statusCode == 200) {
        // API returns { orders: [...] }, not directly [...]
        if (response.data is Map<String, dynamic>) {
          final ordersData = response.data['orders'];
          print('  Found orders key: ${ordersData != null}');
          print('  Orders type: ${ordersData.runtimeType}');
          if (ordersData is List) {
            print('  ✅ Orders count: ${ordersData.length}');
            try {
              final orders = ordersData
                  .map((json) => Order.fromJson(json as Map<String, dynamic>))
                  .toList();
              print('  ✅ Successfully parsed ${orders.length} orders');
              return orders;
            } catch (parseError) {
              print('  ❌ Error parsing orders: $parseError');
              print('  First order data: ${ordersData.isNotEmpty ? ordersData[0] : "empty"}');
              rethrow;
            }
          }
        }
        // Fallback: if data is directly a list (for backwards compatibility)
        else if (response.data is List) {
          print('  ✅ Direct list, count: ${(response.data as List).length}');
          return (response.data as List)
              .map((json) => Order.fromJson(json as Map<String, dynamic>))
              .toList();
        }
      }
      print('  ❌ Returning empty list');
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

