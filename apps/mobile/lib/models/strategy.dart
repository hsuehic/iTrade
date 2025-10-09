/// Strategy model representing trading strategies
class Strategy {
  final int id;
  final String name;
  final String? description;
  final String type;
  final String status;
  final String? exchange;
  final String? symbol;
  final Map<String, dynamic>? parameters;
  final String? errorMessage;
  final DateTime? lastExecutionTime;
  final DateTime createdAt;
  final DateTime updatedAt;

  Strategy({
    required this.id,
    required this.name,
    this.description,
    required this.type,
    required this.status,
    this.exchange,
    this.symbol,
    this.parameters,
    this.errorMessage,
    this.lastExecutionTime,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Strategy.fromJson(Map<String, dynamic> json) {
    return Strategy(
      id: json['id'] as int,
      name: json['name'] as String,
      description: json['description'] as String?,
      type: json['type'] as String,
      status: json['status'] as String,
      exchange: json['exchange'] as String?,
      symbol: json['symbol'] as String?,
      parameters: json['parameters'] as Map<String, dynamic>?,
      errorMessage: json['errorMessage'] as String?,
      lastExecutionTime: json['lastExecutionTime'] != null
          ? DateTime.parse(json['lastExecutionTime'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'type': type,
      'status': status,
      'exchange': exchange,
      'symbol': symbol,
      'parameters': parameters,
      'errorMessage': errorMessage,
      'lastExecutionTime': lastExecutionTime?.toIso8601String(),
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  bool get isActive => status == 'active';
  bool get isStopped => status == 'stopped';
  bool get isPaused => status == 'paused';
  bool get isError => status == 'error';
}

/// Strategy PnL data
class StrategyPnL {
  final int strategyId;
  final String strategyName;
  final double totalPnl;
  final double realizedPnl;
  final double unrealizedPnl;
  final int totalOrders;
  final int filledOrders;

  StrategyPnL({
    required this.strategyId,
    required this.strategyName,
    required this.totalPnl,
    required this.realizedPnl,
    required this.unrealizedPnl,
    required this.totalOrders,
    required this.filledOrders,
  });

  factory StrategyPnL.fromJson(Map<String, dynamic> json) {
    return StrategyPnL(
      strategyId: json['strategyId'] as int,
      strategyName: json['strategyName'] as String,
      totalPnl: (json['pnl'] as num).toDouble(),
      realizedPnl: (json['realizedPnl'] as num).toDouble(),
      unrealizedPnl: (json['unrealizedPnl'] as num).toDouble(),
      totalOrders: json['totalOrders'] as int? ?? 0,
      filledOrders: json['filledOrders'] as int? ?? 0,
    );
  }

  bool get isProfitable => totalPnl > 0;
  bool get isLoss => totalPnl < 0;
}
