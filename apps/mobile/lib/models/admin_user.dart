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

  const AdminUser({
    required this.id,
    required this.email,
    required this.name,
    this.image,
    this.role = 'user',
    this.banned = false,
    this.banReason,
    this.createdAt,
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
    );
  }

  bool hasRole(String role) =>
      this.role.split(',').map((r) => r.trim()).contains(role);

  bool get isAdmin => hasRole('admin');
}
