/// Admin view of a registered user, as returned by
/// `GET /api/admin/users` (Better Auth admin plugin, projected by our route).
class AdminUser {
  final String id;
  final String email;
  final String name;
  final String? image;

  /// Better Auth admin-plugin role; may be comma-separated when multiple
  /// roles are assigned (e.g. 'admin,user').
  final String role;

  final bool banned;
  final String? banReason;
  final DateTime? createdAt;

  /// Number of active linked exchange accounts (from `/api/admin/users/
  /// exchange-stats`). `null` when the user has no linked account.
  final int? exchangeAccounts;

  /// Sum of live exchange-account balances in USD (from `/api/admin/users/
  /// exchange-stats`). `null` when the user has no linked account.
  final double? balance;

  const AdminUser({
    required this.id,
    required this.email,
    required this.name,
    this.image,
    this.role = 'user',
    this.banned = false,
    this.banReason,
    this.createdAt,
    this.exchangeAccounts,
    this.balance,
  });

  factory AdminUser.fromJson(Map<String, dynamic> json) {
    DateTime? createdAt;
    final rawCreatedAt = json['createdAt'];
    if (rawCreatedAt != null) {
      createdAt = DateTime.tryParse(rawCreatedAt.toString());
    }
    return AdminUser(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      image: json['image']?.toString(),
      role: json['role']?.toString() ?? 'user',
      banned: json['banned'] == true,
      banReason: json['banReason']?.toString(),
      createdAt: createdAt,
      exchangeAccounts: (json['exchangeAccounts'] as num?)?.toInt(),
      balance: _doubleOrNull(json['balance']),
    );
  }

  static double? _doubleOrNull(Object? v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  bool hasRole(String role) =>
      this.role.split(',').map((r) => r.trim()).contains(role);

  bool get isAdmin => hasRole('admin');

  /// Returns a copy with per-user exchange stats merged in. `null` stats keep
  /// an existing value and are otherwise left null (renders N/A).
  AdminUser withExchangeStats({
    int? exchangeAccounts,
    double? balance,
  }) {
    return AdminUser(
      id: id,
      email: email,
      name: name,
      image: image,
      role: role,
      banned: banned,
      banReason: banReason,
      createdAt: createdAt,
      exchangeAccounts: exchangeAccounts ?? this.exchangeAccounts,
      balance: balance ?? this.balance,
    );
  }
}
