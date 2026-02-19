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

      if (response.statusCode == 200) {
        // API returns { orders: [...] }, not directly [...]
        if (response.data is Map<String, dynamic>) {
          final ordersData = response.data['orders'];
          if (ordersData is List) {
            try {
              final orders = ordersData
                  .map((json) => Order.fromJson(json as Map<String, dynamic>))
                  .toList();
              return orders;
            } catch (parseError) {
              rethrow;
            }
          }
        }
        // Fallback: if data is directly a list (for backwards compatibility)
        else if (response.data is List) {
          return (response.data as List)
              .map((json) => Order.fromJson(json as Map<String, dynamic>))
              .toList();
        }
      }
      return [];
    } catch (e) {
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
            return null;
    }
  }

  /// Place a manual order
  Future<Order?> placeOrder({
    required String exchange,
    required String symbol,
    required String side,
    required String type,
    required double quantity,
    double? price,
  }) async {
    try {
      final Response response = await _apiClient.postJson(
        '/api/orders',
        data: {
          'exchange': exchange,
          'symbol': symbol,
          'side': side,
          'type': type,
          'quantity': quantity.toString(),
          if (price != null) 'price': price.toString(),
        },
      );

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final orderData = response.data['order'];
        if (orderData is Map<String, dynamic>) {
          return Order.fromJson(orderData);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// Cancel an open order by ID
  Future<Order?> cancelOrder(String id) async {
    try {
      final Response response = await _apiClient.delete(
        '/api/orders/$id',
      );

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final orderData = response.data['order'];
        if (orderData is Map<String, dynamic>) {
          return Order.fromJson(orderData);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// Update an open order by ID (price/quantity)
  Future<Order?> updateOrder(
    String id, {
    double? quantity,
    double? price,
  }) async {
    try {
      final Map<String, dynamic> payload = {};
      if (quantity != null) payload['quantity'] = quantity.toString();
      if (price != null) payload['price'] = price.toString();

      final Response response = await _apiClient.putJson(
        '/api/orders/$id',
        data: payload,
      );

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final orderData = response.data['order'];
        if (orderData is Map<String, dynamic>) {
          return Order.fromJson(orderData);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}

