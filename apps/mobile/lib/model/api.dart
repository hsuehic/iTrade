class PagedData<T> {
  T data;
  int page;
  int pageSize;
  int total;

  PagedData({
    required this.data,
    required this.page,
    required this.pageSize,
    required this.total,
  });
}

class AssetItem {
  final String symbol;
  final String name;
  final String iconUrl;
  final double price;
  final double amount;
  final double dailyChange; // 例如 +2.5%

  AssetItem({
    required this.symbol,
    required this.name,
    required this.iconUrl,
    required this.price,
    required this.amount,
    required this.dailyChange,
  });

  double get value => price * amount;
}
