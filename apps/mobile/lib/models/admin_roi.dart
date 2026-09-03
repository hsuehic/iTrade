/// Admin ROI analysis row, as returned by
/// `GET /api/admin/roi-analysis`. Mirrors the web console's
/// `/admin/roi-analysis` payload.
class AdminRoiRow {
  final String userId;
  final String name;
  final String email;
  final int accountCount;

  /// Live aggregated exchange balance (sum of account_info.totalBalance).
  final double balance;

  /// Available / free balance (sum of account_info.availableBalance).
  final double feeBalance;

  /// Locked balance (sum of account_info.lockedBalance).
  final double lockedBalance;

  /// Return on investment from start of month to now (percent).
  final double mtoNowRoi;

  /// Equity baseline at month start (latest snapshot at-or-before that date).
  final double mtoNowBaseline;

  /// Return on investment from start of year to now (percent).
  final double ytoNowRoi;

  /// Equity baseline at year start (latest snapshot at-or-before that date).
  final double ytoNowBaseline;

  final DateTime? createdAt;

  const AdminRoiRow({
    required this.userId,
    required this.name,
    required this.email,
    required this.accountCount,
    required this.balance,
    required this.feeBalance,
    required this.lockedBalance,
    required this.mtoNowRoi,
    required this.mtoNowBaseline,
    required this.ytoNowRoi,
    required this.ytoNowBaseline,
    this.createdAt,
  });

  factory AdminRoiRow.fromJson(Map<String, dynamic> json) {
    DateTime? createdAt;
    final rawCreatedAt = json['createdAt'];
    if (rawCreatedAt != null) {
      createdAt = DateTime.tryParse(rawCreatedAt.toString());
    }
    double toDoubleSafe(Object? v) =>
        (v is num) ? v.toDouble() : double.tryParse(v.toString()) ?? 0;
    return AdminRoiRow(
      userId: json['userId']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      accountCount: (json['accountCount'] as num?)?.toInt() ?? 0,
      balance: toDoubleSafe(json['balance']),
      feeBalance: toDoubleSafe(json['feeBalance']),
      lockedBalance: toDoubleSafe(json['lockedBalance']),
      mtoNowRoi: toDoubleSafe(json['mtoNowRoi']),
      mtoNowBaseline: toDoubleSafe(json['mtoNowBaseline']),
      ytoNowRoi: toDoubleSafe(json['ytoNowRoi']),
      ytoNowBaseline: toDoubleSafe(json['ytoNowBaseline']),
      createdAt: createdAt,
    );
  }
}