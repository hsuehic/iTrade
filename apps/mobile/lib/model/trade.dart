class Product {
  final String id;
  final String name;
  final DateTime createTime;
  final DateTime updateTime;
  final double bid1;
  final double ask1;
  final double bid2;
  final double ask2;
  final double bid3;
  final double ask3;

  Product({
    required this.id,
    required this.name,
    required this.createTime,
    required this.updateTime,
    required this.bid1,
    required this.ask1,
    required this.bid2,
    required this.ask2,
    required this.bid3,
    required this.ask3,
  });
}

class Order {
  final String orderId;
  final String productId;
  final double size;
  final double price;
  final int orderSide;
  final int marginType;
  final int leverage;
  final DateTime createTime;
  String? clientOrderId;
  int? strategyId;

  Order({
    required this.orderId,
    required this.productId,
    required this.size,
    required this.price,
    required this.orderSide,
    required this.marginType,
    required this.leverage,
    required this.createTime,
    this.clientOrderId,
    this.strategyId,
  });
}

class Strategy {
  final int id;
  final String productId;
  final double basePrice;
  final double gap;
  final double minSize;
  final double maxSize;
  final double leverage;
  final double baseSize;
  final int gridCount;
  final DateTime createTime;
  final DateTime disableTime;
  final int strategyType;
  final bool active;
  final String name;
  final int maxRepeat;
  final int decimals;
  final double boughtSize;
  final double boughtValue;
  final double soldSize;
  final double soldValue;
  final double tradedSize;
  final double tradedValue;

  Strategy({
    required this.id,
    required this.productId,
    required this.basePrice,
    required this.gap,
    required this.minSize,
    required this.maxSize,
    required this.leverage,
    required this.baseSize,
    required this.gridCount,
    required this.createTime,
    required this.disableTime,
    required this.strategyType,
    required this.active,
    required this.name,
    required this.maxRepeat,
    required this.decimals,
    required this.boughtSize,
    required this.boughtValue,
    required this.soldSize,
    required this.soldValue,
    required this.tradedSize,
    required this.tradedValue,
  });
}

class StrategyWithProduct extends Strategy {
  final double productPrice;
  final double realizedProfit;
  final double unrealizedProfit;

  StrategyWithProduct({
    required super.id,
    required super.productId,
    required super.basePrice,
    required super.gap,
    required super.minSize,
    required super.maxSize,
    required super.leverage,
    required super.baseSize,
    required super.gridCount,
    required super.createTime,
    required super.disableTime,
    required super.strategyType,
    required super.active,
    required super.name,
    required super.maxRepeat,
    required super.decimals,
    required super.boughtSize,
    required super.boughtValue,
    required super.soldSize,
    required super.soldValue,
    required super.tradedSize,
    required super.tradedValue,
    required this.productPrice,
    required this.realizedProfit,
    required this.unrealizedProfit,
  });
}
