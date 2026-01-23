import 'dart:async';
import 'package:logger/logger.dart';
import 'api_client.dart';
import '../models/portfolio.dart';

/// Service for fetching and managing portfolio data from the API.
class PortfolioService {
  static final PortfolioService instance = PortfolioService._internal();
  PortfolioService._internal();

  final Logger _logger = Logger();

  // Stream controllers for real-time updates
  final StreamController<PortfolioData> _portfolioController =
      StreamController<PortfolioData>.broadcast();
  final StreamController<List<Position>> _positionsController =
      StreamController<List<Position>>.broadcast();

  Stream<PortfolioData> get portfolioStream => _portfolioController.stream;
  Stream<List<Position>> get positionsStream => _positionsController.stream;

  Timer? _refreshTimer;
  bool _isRefreshing = false;

  /// Fetch portfolio assets from the API
  Future<PortfolioData> fetchPortfolioAssets({
    String exchange = 'all',
    double minValue = 0,
  }) async {
    try {
      final response = await ApiClient.instance.getJson<Map<String, dynamic>>(
        '/api/portfolio/assets',
        queryParameters: {
          'exchange': exchange,
          if (minValue > 0) 'minValue': minValue.toString(),
        },
      );

      if (response.data == null) {
        throw Exception('No data received from portfolio API');
      }

      final data = response.data!;
      final portfolioData = PortfolioData.fromJson(data);

      // Emit to stream
      _portfolioController.add(portfolioData);

      return portfolioData;
    } catch (e, stackTrace) {
      _logger.e('Failed to fetch portfolio assets', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Fetch positions from the API
  Future<PositionsData> fetchPositions({
    String? exchange,
    String? symbol,
    String? side,
    double? minQuantity,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (exchange != null && exchange != 'all') {
        queryParams['exchange'] = exchange;
      }
      if (symbol != null) {
        queryParams['symbol'] = symbol;
      }
      if (side != null) {
        queryParams['side'] = side;
      }
      if (minQuantity != null) {
        queryParams['minQuantity'] = minQuantity.toString();
      }

      final response = await ApiClient.instance.getJson<Map<String, dynamic>>(
        '/api/portfolio/positions',
        queryParameters: queryParams.isNotEmpty ? queryParams : null,
      );

      if (response.data == null) {
        throw Exception('No data received from positions API');
      }

      final positionsData = PositionsData.fromJson(response.data!);

      // Emit to stream
      _positionsController.add(positionsData.positions);

      return positionsData;
    } catch (e, stackTrace) {
      _logger.e('Failed to fetch positions', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Fetch PnL analytics from the API
  Future<PnLData> fetchPnL({int? strategyId}) async {
    try {
      final queryParams = <String, dynamic>{};
      if (strategyId != null) {
        queryParams['strategyId'] = strategyId.toString();
      }

      final response = await ApiClient.instance.getJson<Map<String, dynamic>>(
        '/api/analytics/pnl',
        queryParameters: queryParams.isNotEmpty ? queryParams : null,
      );

      if (response.data == null) {
        throw Exception('No data received from PnL API');
      }

      return PnLData.fromJson(response.data!['pnl'] ?? {});
    } catch (e, stackTrace) {
      _logger.e('Failed to fetch PnL', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Fetch complete portfolio overview (assets, positions, PnL)
  Future<PortfolioOverview> fetchPortfolioOverview({
    String exchange = 'all',
  }) async {
    try {
      // Fetch all data in parallel
      final results = await Future.wait([
        fetchPortfolioAssets(exchange: exchange),
        fetchPositions(exchange: exchange),
        fetchPnL(),
      ]);

      return PortfolioOverview(
        portfolio: results[0] as PortfolioData,
        positions: results[1] as PositionsData,
        pnl: results[2] as PnLData,
        lastUpdated: DateTime.now(),
      );
    } catch (e, stackTrace) {
      _logger.e('Failed to fetch portfolio overview', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Start auto-refresh (every 30 seconds)
  void startAutoRefresh({
    Duration interval = const Duration(seconds: 30),
    String exchange = 'all',
  }) {
    stopAutoRefresh();
    _refreshTimer = Timer.periodic(interval, (_) async {
      if (!_isRefreshing) {
        _isRefreshing = true;
        try {
          await fetchPortfolioAssets(exchange: exchange);
          await fetchPositions(exchange: exchange);
        } finally {
          _isRefreshing = false;
        }
      }
    });
  }

  /// Stop auto-refresh
  void stopAutoRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  /// Dispose resources
  void dispose() {
    stopAutoRefresh();
    _portfolioController.close();
    _positionsController.close();
  }
}
