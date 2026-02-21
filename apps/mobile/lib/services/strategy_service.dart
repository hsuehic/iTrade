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

      if (response.statusCode == 200) {
        // API returns { strategies: [...] }
        if (response.data is Map<String, dynamic>) {
          final data = response.data as Map<String, dynamic>;
          final strategiesList = data['strategies'] as List?;

          if (strategiesList != null) {
            final strategies = strategiesList
                .map((json) => Strategy.fromJson(json as Map<String, dynamic>))
                .toList();
            return strategies;
          }
        }
        // Fallback: if it's already a list
        else if (response.data is List) {
          final strategies = (response.data as List)
              .map((json) => Strategy.fromJson(json as Map<String, dynamic>))
              .toList();
          return strategies;
        }
      }
      return [];
    } catch (e) {
            rethrow;
    }
  }

  /// Get a single strategy by ID
  Future<Strategy?> getStrategy(int id) async {
    try {
      final Response response = await _apiClient.getJson('/api/strategies/$id');

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final data = response.data as Map<String, dynamic>;
        // Handle both wrapped { strategy: ... } and direct object
        if (data.containsKey('strategy') && data['strategy'] is Map<String, dynamic>) {
            return Strategy.fromJson(data['strategy']);
        }
        return Strategy.fromJson(data);
      }
      return null;
    } catch (e) {
            rethrow;
    }
  }

  /// Get PnL data for strategies
  Future<List<StrategyPnL>> getStrategiesPnL() async {
    try {
      final Response response = await _apiClient.getJson('/api/analytics/pnl');

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final data = response.data as Map<String, dynamic>;
        // API returns { pnl: { strategies: [...] } }
        final pnlData = data['pnl'] as Map<String, dynamic>?;
        final strategies = pnlData?['strategies'] as List?;
        if (strategies != null) {
          return strategies
              .map((json) => StrategyPnL.fromJson(json as Map<String, dynamic>))
              .toList();
        }
      }
      return [];
    } catch (e) {
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
        // API returns { pnl: {...} } for single strategy
        final pnlData = data['pnl'];
        if (pnlData is Map<String, dynamic>) {
          // Add strategyId to the pnl data if not present
          if (!pnlData.containsKey('strategyId')) {
            pnlData['strategyId'] = strategyId;
          }
          // Add strategyName if not present
          if (!pnlData.containsKey('strategyName')) {
            pnlData['strategyName'] = 'Strategy $strategyId';
          }
          return StrategyPnL.fromJson(pnlData);
        }
      }
      return null;
    } catch (e) {
            return null;
    }
  }

  /// Fetch strategy type configurations
  Future<List<Map<String, dynamic>>> getStrategyConfigs() async {
    try {
      final Response response = await _apiClient.getJson('/api/strategies/config');
      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final data = response.data as Map<String, dynamic>;
        final strategies = data['strategies'] as List?;
        if (strategies != null) {
          return strategies
              .whereType<Map<String, dynamic>>()
              .toList();
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  /// Check if strategy name is available
  Future<bool?> checkNameAvailable(String name, {int? excludeId}) async {
    try {
      final Response response = await _apiClient.getJson(
        '/api/strategies/check-name',
        queryParameters: {
          'name': name,
          if (excludeId != null) 'excludeId': excludeId,
        },
      );
      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        final data = response.data as Map<String, dynamic>;
        return data['available'] as bool?;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// Fetch market tickers for symbol picker
  Future<List<Map<String, dynamic>>> getMarketTickers() async {
    try {
      final Response response = await _apiClient.getJson('/api/tickers');
      if (response.statusCode == 200 && response.data is List) {
        return (response.data as List)
            .whereType<Map<String, dynamic>>()
            .toList();
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  /// Update strategy status
  Future<Strategy?> updateStrategyStatus(int id, String status) async {
    try {
      final Response response = await _apiClient.postJson(
        '/api/strategies/$id/status',
        data: {'status': status},
      );

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        return Strategy.fromJson(
          response.data['strategy'] as Map<String, dynamic>,
        );
      }
      return null;
    } catch (e) {
            return null;
    }
  }

  /// Create a new strategy
  Future<Strategy?> createStrategy({
    required String name,
    required String type,
    required String symbol,
    String? description,
    String? exchange,
    Map<String, dynamic>? parameters,
    Map<String, dynamic>? initialDataConfig,
    Map<String, dynamic>? subscription,
  }) async {
    try {
      final Response response = await _apiClient.postJson(
        '/api/strategies',
        data: {
          'name': name,
          'description': description,
          'type': type,
          'exchange': exchange,
          'symbol': symbol,
          'parameters': parameters,
          'initialDataConfig': initialDataConfig,
          'subscription': subscription,
        },
      );

      if (response.statusCode == 201 && response.data is Map<String, dynamic>) {
        final data = response.data as Map<String, dynamic>;
        if (data['strategy'] is Map<String, dynamic>) {
          return Strategy.fromJson(data['strategy'] as Map<String, dynamic>);
        }
      }
      return null;
    } catch (e) {
      rethrow;
    }
  }

  /// Delete a strategy
  Future<bool> deleteStrategy(int id) async {
    try {
      final Response response = await _apiClient.dio.delete(
        '/api/strategies/$id',
      );
      return response.statusCode == 200 && response.data['success'] == true;
    } catch (e) {
            return false;
    }
  }

  /// Fetch analytics data for all strategies
  Future<Map<String, dynamic>> getAnalytics({int limit = 50}) async {
    try {
      final Response response = await _apiClient.getJson(
        '/api/analytics/strategies',
        queryParameters: {'limit': limit.toString()},
      );

      if (response.statusCode == 200 && response.data is Map<String, dynamic>) {
        return response.data as Map<String, dynamic>;
      }

      return {
        'summary': {},
        'topPerformers': [],
        'byExchange': [],
        'bySymbol': [],
        'allStrategies': [],
      };
    } catch (e) {
            return {
        'summary': {},
        'topPerformers': [],
        'byExchange': [],
        'bySymbol': [],
        'allStrategies': [],
      };
    }
  }
}
