import 'package:dio/dio.dart';

import '../models/admin_user.dart';
import '../models/trading_pair.dart';
import 'api_client.dart';
import 'auth_service.dart';

/// Result of an admin operation: success flag plus an optional server error
/// message to surface to the admin.
class AdminOperationResult {
  final bool success;
  final String? message;

  const AdminOperationResult({required this.success, this.message});
}

/// Calls the admin-only `/api/admin/*` endpoints of the web backend.
///
/// Every endpoint is guarded server-side (session user must have the `admin`
/// role), so these methods should only be invoked after checking
/// [AuthService.isAdmin]; failures are returned as `AdminOperationResult` or
/// empty lists instead of throwing.
class AdminService {
  AdminService._internal();
  static final AdminService instance = AdminService._internal();

  Options get _tolerant => Options(
        followRedirects: false,
        validateStatus: (int? s) => s != null && s < 500,
      );

  String? _errorMessage(Response<dynamic> res) {
    final data = res.data;
    if (data is Map && data['error'] != null) {
      return data['error'].toString();
    }
    return null;
  }

  // -------------------------------------------------------------- Users ---

  /// Lists users (most recently registered first). Optionally filters by an
  /// email/name substring via the Better Auth admin search.
  Future<List<AdminUser>> fetchUsers({
    String search = '',
    String searchField = 'email',
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      final query = <String, dynamic>{
        'limit': limit,
        'offset': offset,
        'sortBy': 'createdAt',
        'sortDirection': 'desc',
      };
      if (search.trim().isNotEmpty) {
        query['searchValue'] = search.trim();
        query['searchField'] = searchField == 'name' ? 'name' : 'email';
        query['searchOperator'] = 'contains';
      }
      final res = await ApiClient.instance.getJson(
        '/api/admin/users',
        queryParameters: query,
        options: _tolerant,
      );
      if (res.statusCode != 200 || res.data is! Map) {
        return const [];
      }
      final dynamic rawUsers = (res.data as Map)['users'];
      if (rawUsers is! List) return const [];
      return rawUsers
          .whereType<Map>()
          .map((u) => AdminUser.fromJson(Map<String, dynamic>.from(u)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Promotes/demotes a user. [role] must be 'admin' or 'user'.
  Future<AdminOperationResult> setUserRole(String userId, String role) async {
    try {
      final res = await ApiClient.instance.patchJson(
        '/api/admin/users/$userId',
        data: {'role': role},
        options: _tolerant,
      );
      return AdminOperationResult(
        success: res.statusCode == 200,
        message: _errorMessage(res),
      );
    } catch (_) {
      return const AdminOperationResult(success: false);
    }
  }

  /// Bans or unbans a user.
  Future<AdminOperationResult> setUserBanned(
    String userId,
    bool banned,
  ) async {
    try {
      final res = await ApiClient.instance.patchJson(
        '/api/admin/users/$userId',
        data: {'banned': banned},
        options: _tolerant,
      );
      return AdminOperationResult(
        success: res.statusCode == 200,
        message: _errorMessage(res),
      );
    } catch (_) {
      return const AdminOperationResult(success: false);
    }
  }

  // ------------------------------------------------------ Impersonation ---

  /// Starts impersonating [userId] ("Login as user"). On success the session
  /// cookie is swapped server-side, then the local session is re-fetched so
  /// [AuthService.instance.user] becomes the target user and
  /// [AuthService.instance.impersonatedBy] the calling admin.
  Future<AdminOperationResult> impersonate(String userId) async {
    try {
      final res = await ApiClient.instance.postJson(
        '/api/admin/impersonate',
        data: {'userId': userId},
        options: _tolerant,
      );
      if (res.statusCode == 200) {
        await AuthService.instance.getUser();
        return const AdminOperationResult(success: true);
      }
      return AdminOperationResult(success: false, message: _errorMessage(res));
    } catch (_) {
      return const AdminOperationResult(success: false);
    }
  }

  /// Stops the current impersonation session and returns to the admin's own
  /// session.
  Future<AdminOperationResult> stopImpersonating() async {
    try {
      final res = await ApiClient.instance.delete(
        '/api/admin/impersonate',
        options: _tolerant,
      );
      if (res.statusCode == 200) {
        await AuthService.instance.getUser();
        return const AdminOperationResult(success: true);
      }
      return AdminOperationResult(success: false, message: _errorMessage(res));
    } catch (_) {
      return const AdminOperationResult(success: false);
    }
  }

  // ------------------------------------------------------ Trading pairs ---

  Future<List<TradingPair>> fetchTradingPairs() async {
    try {
      final res = await ApiClient.instance.getJson(
        '/api/admin/trading-pairs',
        options: _tolerant,
      );
      if (res.statusCode != 200 || res.data is! List) {
        return const [];
      }
      return (res.data as List)
          .whereType<Map>()
          .map((p) => TradingPair.fromJson(Map<String, dynamic>.from(p)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<AdminOperationResult> createTradingPair(
    Map<String, dynamic> data,
  ) async {
    try {
      final res = await ApiClient.instance.postJson(
        '/api/admin/trading-pairs',
        data: data,
        options: _tolerant,
      );
      return AdminOperationResult(
        success: res.statusCode == 200,
        message: _errorMessage(res),
      );
    } catch (_) {
      return const AdminOperationResult(success: false);
    }
  }

  Future<AdminOperationResult> updateTradingPair(
    int id,
    Map<String, dynamic> data,
  ) async {
    try {
      final res = await ApiClient.instance.patchJson(
        '/api/admin/trading-pairs/$id',
        data: data,
        options: _tolerant,
      );
      return AdminOperationResult(
        success: res.statusCode == 200,
        message: _errorMessage(res),
      );
    } catch (_) {
      return const AdminOperationResult(success: false);
    }
  }

  Future<AdminOperationResult> deleteTradingPair(int id) async {
    try {
      final res = await ApiClient.instance.delete(
        '/api/admin/trading-pairs/$id',
        options: _tolerant,
      );
      return AdminOperationResult(
        success: res.statusCode == 200,
        message: _errorMessage(res),
      );
    } catch (_) {
      return const AdminOperationResult(success: false);
    }
  }
}
