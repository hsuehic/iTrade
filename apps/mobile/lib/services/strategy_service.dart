import 'dart:developer' as developer;
import 'package:dio/dio.dart';
import '../models/strategy.dart';
import 'api_client.dart';

/// Service for managing trading strategies
class StrategyService {
  StrategyService._internal();
  static final StrategyService instance = StrategyService._internal();

  final ApiClient _apiClient = ApiClient.instance;

  /// Fetch all strategies
  Future<List<Strategy>> getStrategies({
    String? status,
    String? exchange,
  }) async {
    try {
      final Map<String, dynamic> queryParams = {};
      if (status != null) queryParams['status'] = status;
      if (exchange != null) queryParams['exchange'] = exchange;

      final Response response = await _apiClient.getJson(
        '/api/strategies',
        queryParameters: queryParams.isNotEmpty ? queryParams : null,
      );

      if (response.statusCode == 200 && response.data is List) {
        return (response.data as List)
            .map((json) => Strategy.fromJson(json as Map<String, dynamic>))
            .toList();
      }
      return [];
    } catch (e) {
      developer.log(
        'Failed to fetch strategies',
        name: 'StrategyService',
        error: e,
      );
      rethrow;
    }
  }

  /// Get a single strategy by ID
  Future<Strategy?> getStrategy(int id) async {
    try {
      final Response response = await _apiClient.getJson('/api/strategies/$id');

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        return Strategy.fromJson(response.data as Map<String, dynamic>);
      }
      return null;
    } catch (e) {
      developer.log(
        'Failed to fetch strategy $id',
        name: 'StrategyService',
        error: e,
      );
      rethrow;
    }
  }

  /// Get PnL data for strategies
  Future<List<StrategyPnL>> getStrategiesPnL() async {
    try {
      final Response response = await _apiClient.getJson('/api/analytics/pnl');

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final data = response.data as Map<String, dynamic>;
        final strategies = data['strategies'] as List?;
        if (strategies != null) {
          return strategies
              .map((json) => StrategyPnL.fromJson(json as Map<String, dynamic>))
              .toList();
        }
      }
      return [];
    } catch (e) {
      developer.log(
        'Failed to fetch strategies PnL',
        name: 'StrategyService',
        error: e,
      );
      // Return empty list on error
      return [];
    }
  }

  /// Get PnL data for a specific strategy
  Future<StrategyPnL?> getStrategyPnL(int strategyId) async {
    try {
      final Response response = await _apiClient.getJson(
        '/api/analytics/pnl',
        queryParameters: {'strategyId': strategyId},
      );

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final data = response.data as Map<String, dynamic>;
        final strategies = data['strategies'] as List?;
        if (strategies != null && strategies.isNotEmpty) {
          return StrategyPnL.fromJson(strategies[0] as Map<String, dynamic>);
        }
      }
      return null;
    } catch (e) {
      developer.log(
        'Failed to fetch strategy PnL',
        name: 'StrategyService',
        error: e,
      );
      return null;
    }
  }

  /// Update strategy status
  Future<bool> updateStrategyStatus(int id, String status) async {
    try {
      final Response response = await _apiClient.postJson(
        '/api/strategies/$id/status',
        data: {'status': status},
      );

      return response.statusCode == 200;
    } catch (e) {
      developer.log(
        'Failed to update strategy status',
        name: 'StrategyService',
        error: e,
      );
      return false;
    }
  }

  /// Delete a strategy
  Future<bool> deleteStrategy(int id) async {
    try {
      final Response response = await _apiClient.dio.delete(
        '/api/strategies/$id',
      );
      return response.statusCode == 200;
    } catch (e) {
      developer.log(
        'Failed to delete strategy',
        name: 'StrategyService',
        error: e,
      );
      return false;
    }
  }
}
