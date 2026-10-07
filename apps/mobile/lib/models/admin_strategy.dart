/// Admin-scope view of a strategy owned by ANY user, as returned by
/// `GET /api/admin/strategies` (the web console's Admin - Strategy Management
/// page). Mirrors the `AdminStrategy` interface in
/// `apps/web/app/(console)/admin/strategies/page.tsx`.
///
/// Unlike the user-scope [Strategy] model this carries the owner (`userId` /
/// `user`) and a trimmed `performance` block — the only fields the admin list
/// renders and sorts on.
class AdminStrategy {
  final int id;
  final String name;
  final String? description;
  final String type;
  final String status;
  final String? exchange;
  final String? symbol;
  final String? marketType;
  final Map<String, dynamic>? parameters;

  /// Owner auth-user id. Always present (strategies are always owned).
  final String userId;

  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Owner projection — only `id`/`name`/`email` are joined server-side (never
  /// the base64 avatar). Null when the owner row could not be joined.
  final AdminStrategyOwner? user;

  /// Trimmed `strategy_performance` row. Null when the strategy has never
  /// traded (no performance record) — the list renders "N/A".
  final AdminStrategyPerformance? performance;

  const AdminStrategy({
    required this.id,
    required this.name,
    this.description,
    required this.type,
    required this.status,
    this.exchange,
    this.symbol,
    this.marketType,
    this.parameters,
    required this.userId,
    this.createdAt,
    this.updatedAt,
    this.user,
    this.performance,
  });

  factory AdminStrategy.fromJson(Map<String, dynamic> json) {
    final rawParameters = json['parameters'];
    final rawUser = json['user'];
    final rawPerformance = json['performance'];
    return AdminStrategy(
      id: _intOrNull(json['id']) ?? 0,
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      type: json['type']?.toString() ?? '',
      status: json['status']?.toString() ?? 'stopped',
      exchange: json['exchange']?.toString(),
      symbol: json['symbol']?.toString(),
      marketType: json['marketType']?.toString(),
      parameters: rawParameters is Map
          ? Map<String, dynamic>.from(rawParameters)
          : null,
      userId: json['userId']?.toString() ?? '',
      createdAt: _parseDate(json['createdAt']),
      updatedAt: _parseDate(json['updatedAt']),
      user: rawUser is Map
          ? AdminStrategyOwner.fromJson(Map<String, dynamic>.from(rawUser))
          : null,
      performance: rawPerformance is Map
          ? AdminStrategyPerformance.fromJson(
              Map<String, dynamic>.from(rawPerformance),
            )
          : null,
    );
  }

  bool get isActive => status == 'active';

  /// Display label for the owner: name, else email, else the raw user id.
  String get ownerLabel {
    final name = user?.name?.trim() ?? '';
    if (name.isNotEmpty) return name;
    final email = user?.email?.trim() ?? '';
    if (email.isNotEmpty) return email;
    return userId.isEmpty ? 'Unknown' : userId;
  }

  /// Secondary owner line (email, else the raw user id) — empty when it would
  /// just repeat [ownerLabel], so the card never prints the same string twice.
  String get ownerSubLabel {
    final email = user?.email?.trim() ?? '';
    final candidate = email.isNotEmpty ? email : userId;
    return candidate == ownerLabel ? '' : candidate;
  }
}

/// Owner projection joined onto an admin strategy row (`id`/`name`/`email`).
class AdminStrategyOwner {
  final String id;
  final String? name;
  final String? email;

  const AdminStrategyOwner({required this.id, this.name, this.email});

  factory AdminStrategyOwner.fromJson(Map<String, dynamic> json) {
    return AdminStrategyOwner(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString(),
      email: json['email']?.toString(),
    );
  }
}

/// Trimmed `strategy_performance` block surfaced in the admin list. Values
/// arrive as strings OR numbers depending on the driver, so every numeric
/// field is parsed tolerantly and kept nullable ("N/A" when absent).
class AdminStrategyPerformance {
  final double? totalPnL;
  final double? netPnL;
  final double? roi;
  final double? winRate;
  final int? totalOrders;

  const AdminStrategyPerformance({
    this.totalPnL,
    this.netPnL,
    this.roi,
    this.winRate,
    this.totalOrders,
  });

  factory AdminStrategyPerformance.fromJson(Map<String, dynamic> json) {
    return AdminStrategyPerformance(
      totalPnL: _doubleOrNull(json['totalPnL']),
      netPnL: _doubleOrNull(json['netPnL']),
      roi: _doubleOrNull(json['roi']),
      winRate: _doubleOrNull(json['winRate']),
      totalOrders: _intOrNull(json['totalOrders']),
    );
  }
}

/// A candidate owner for the owner filter / clone dialog, from
/// `GET /api/admin/strategies/owners` — users holding at least one ACTIVE
/// bound exchange account.
class AdminStrategyOwnerOption {
  final String id;
  final String? name;
  final String? email;

  const AdminStrategyOwnerOption({required this.id, this.name, this.email});

  factory AdminStrategyOwnerOption.fromJson(Map<String, dynamic> json) {
    return AdminStrategyOwnerOption(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString(),
      email: json['email']?.toString(),
    );
  }

  String get label {
    final n = name?.trim() ?? '';
    if (n.isNotEmpty) return n;
    final e = email?.trim() ?? '';
    if (e.isNotEmpty) return e;
    return id;
  }

  String get subLabel => email?.trim() ?? '';

  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return label.toLowerCase().contains(q) ||
        subLabel.toLowerCase().contains(q);
  }
}

/// One page of the admin strategy listing: rows plus the unpaginated total
/// (used to compute the page count and the "N strategies" caption).
class AdminStrategyPage {
  final List<AdminStrategy> strategies;
  final int total;

  const AdminStrategyPage({required this.strategies, required this.total});
}

DateTime? _parseDate(Object? value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString());
}

double? _doubleOrNull(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

/// Tolerant integer reader. Integer columns normally arrive as JSON numbers,
/// but a driver/hand-written payload may send a numeric string — a hard cast
/// would throw and take the entire page down with it.
int? _intOrNull(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString());
}
