import 'package:dio/dio.dart';

import '../models/admin_strategy.dart';
import '../models/admin_user.dart';
import '../models/admin_roi.dart';
import '../models/strategy.dart';
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

/// Result of an admin strategy clone. `strategyName` is the name actually
/// created by the API — it suffixes `_copy`, `_copy2`, … on a name collision,
/// so it can differ from the name the admin typed.
class AdminCloneResult {
  final bool success;
  final String? message;
  final String? strategyName;

  const AdminCloneResult({
    required this.success,
    this.message,
    this.strategyName,
  });
}

/// Candidate owners for the owner filter / clone dialog, plus whether the list
/// was narrowed to users holding a bound exchange account (`bound`) or had to
/// degrade to every user after the owners lookup failed.
typedef AdminOwnerOptions = ({
  List<AdminStrategyOwnerOption> options,
  bool bound,
});

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

  /// Tolerant integer reader: `count`/`page` metadata can arrive as a JSON
  /// number or (some drivers) a numeric string, and a hard cast would throw and
  /// take the whole page down with it.
  static int? _intOrNull(Object? value) {
    if (value == null) return null;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString());
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

  /// Per-user aggregated exchange-account summary from
  /// `GET /api/admin/users/exchange-stats`: number of active linked accounts +
  /// total live balance (USD) keyed by user id. Users with no linked account
  /// are simply absent from the map; `balance` may be null for an account
  /// whose total is NULL. Non-blocking — returns `{}` on any failure so the
  /// screen falls back to rendering N/A, matching the web console's behaviour.
  Future<Map<String, ({int exchangeAccounts, double? balance})>>
  fetchExchangeStats() async {
    try {
      final res = await ApiClient.instance.getJson(
        '/api/admin/users/exchange-stats',
        options: _tolerant,
      );
      if (res.statusCode != 200 || res.data is! Map) return const {};
      final rawStats = (res.data as Map)['stats'];
      if (rawStats is! Map) return const {};
      final result = <String, ({int exchangeAccounts, double? balance})>{};
      rawStats.forEach((key, value) {
        if (key == null || value is! Map) return;
        final accounts = (value['exchangeAccounts'] as num?)?.toInt();
        if (accounts == null) return;
        final rawBalance = value['balance'];
        double? balance;
        if (rawBalance is num) {
          balance = rawBalance.toDouble();
        } else if (rawBalance != null) {
          balance = double.tryParse(rawBalance.toString());
        }
        result[key.toString()] = (exchangeAccounts: accounts, balance: balance);
      });
      return result;
    } catch (_) {
      return const {};
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
  Future<AdminOperationResult> setUserBanned(String userId, bool banned) async {
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

  // ----------------------------------------------------- ROI Analysis ---

  /// Fetches the aggregated per-user ROI analysis (asset balances +
  /// MtoNowROI / YtoNowROI). Returns `null` on any transport/HTTP/parse
  /// error (so the screen can show its error state), and a `List` (possibly
  /// empty) on success — the screen distinguishes "no users" ([] -> empty
  /// state) from a failed request (null -> error state).
  Future<List<AdminRoiRow>?> fetchRoiAnalysis() async {
    try {
      final res = await ApiClient.instance.getJson(
        '/api/admin/roi-analysis',
        options: _tolerant,
      );
      if (res.statusCode != 200 || res.data is! Map) {
        return null;
      }
      final dynamic rawRows = (res.data as Map)['rows'];
      if (rawRows is! List) return null;
      return rawRows
          .whereType<Map>()
          .map((r) => AdminRoiRow.fromJson(Map<String, dynamic>.from(r)))
          .toList();
    } catch (_) {
      return null;
    }
  }

  // -------------------------------------------- Strategy management ---

  /// One page of the cross-user admin strategy listing from
  /// `GET /api/admin/strategies` — search/token/owner/status/exchange filters,
  /// server-side sort (incl. PnL/ROI) and pagination.
  ///
  /// Returns `null` on any transport/HTTP/parse failure so the screen can show
  /// its error state, and a (possibly empty) [AdminStrategyPage] on success —
  /// mirroring [fetchRoiAnalysis]'s null-means-failure contract.
  Future<AdminStrategyPage?> fetchStrategies({
    String search = '',
    String symbol = '',
    String userId = '',
    String status = '',
    String exchange = '',
    String sortBy = 'createdAt',
    String sortDirection = 'desc',
    int page = 1,
    int pageSize = 50,
  }) async {
    try {
      final query = <String, dynamic>{
        'sortBy': sortBy,
        'sortDirection': sortDirection,
        'page': page,
        'pageSize': pageSize,
      };
      if (search.trim().isNotEmpty) query['search'] = search.trim();
      if (symbol.trim().isNotEmpty) query['symbol'] = symbol.trim();
      if (userId.trim().isNotEmpty) query['userId'] = userId.trim();
      if (status.isNotEmpty && status != 'all') query['status'] = status;
      if (exchange.isNotEmpty && exchange != 'all') {
        query['exchange'] = exchange;
      }
      final res = await ApiClient.instance.getJson(
        '/api/admin/strategies',
        queryParameters: query,
        options: _tolerant,
      );
      if (res.statusCode != 200 || res.data is! Map) return null;
      final data = res.data as Map;
      final rawStrategies = data['strategies'];
      final strategies = rawStrategies is List
          ? rawStrategies
                .whereType<Map>()
                .map(
                  (s) => AdminStrategy.fromJson(Map<String, dynamic>.from(s)),
                )
                .toList()
          : <AdminStrategy>[];
      final total = _intOrNull(data['total']) ?? strategies.length;
      return AdminStrategyPage(strategies: strategies, total: total);
    } catch (_) {
      return null;
    }
  }

  /// Candidate owners for the owner filter and the clone dialog, from
  /// `GET /api/admin/strategies/owners` (only users with an ACTIVE bound
  /// exchange account — a target user without one can only ever receive a dead
  /// STOPPED clone).
  ///
  /// On owners-lookup failure this degrades to the full user list
  /// (`GET /api/admin/users?limit=1000`, `bound: false`) so the filter still
  /// works, with the screen showing a warning — matching the web console. A
  /// `null` return means BOTH lookups failed: the owner filter is unavailable.
  Future<AdminOwnerOptions?> fetchStrategyOwners() async {
    try {
      final res = await ApiClient.instance.getJson(
        '/api/admin/strategies/owners',
        options: _tolerant,
      );
      if (res.statusCode == 200 && res.data is Map) {
        final rawOwners = (res.data as Map)['owners'];
        if (rawOwners is List) {
          final options = rawOwners
              .whereType<Map>()
              .map(
                (o) => AdminStrategyOwnerOption.fromJson(
                  Map<String, dynamic>.from(o),
                ),
              )
              .where((o) => o.id.isNotEmpty)
              .toList();
          return (options: options, bound: true);
        }
      }
    } catch (_) {
      // fall through to the all-users fallback below
    }
    try {
      final users = await fetchUsers(limit: 1000);
      if (users.isEmpty) return null;
      return (
        options: users
            .map(
              (u) => AdminStrategyOwnerOption(
                id: u.id,
                name: u.name.isEmpty ? null : u.name,
                email: u.email.isEmpty ? null : u.email,
              ),
            )
            .toList(),
        bound: false,
      );
    } catch (_) {
      return null;
    }
  }

  /// Starts/stops/pauses any user's strategy via
  /// `POST /api/admin/strategies/{id}/status`.
  Future<AdminOperationResult> changeStrategyStatus(
    int id,
    String status,
  ) async {
    try {
      final res = await ApiClient.instance.postJson(
        '/api/admin/strategies/$id/status',
        data: {'status': status},
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

  /// Single-strategy admin read via `GET /api/admin/strategies/{id}` — the
  /// mobile counterpart of the web detail page's admin fetch base. The route
  /// returns the same live payload shape as the owner-scoped
  /// `GET /api/strategies/{id}` (`{strategy, rebuiltPerformance,
  /// positionSummary}` — both are built by the shared
  /// `buildStrategyLiveDetail` helper), but joins `strategy.user` so the
  /// screen can decide owner-vs-read-only affordances, and works for ANY
  /// user's strategy, not just the admin's own.
  ///
  /// Returns `null` on any transport/HTTP/parse failure so the screen can
  /// render its error state (same contract as [fetchStrategies]).
  Future<AdminStrategyDetail?> fetchStrategyDetail(int id) async {
    try {
      final res = await ApiClient.instance.getJson(
        '/api/admin/strategies/$id',
        options: _tolerant,
      );
      if (res.statusCode != 200 || res.data is! Map) return null;
      final data = Map<String, dynamic>.from(res.data as Map);
      final rawStrategy = data['strategy'];
      if (rawStrategy is! Map) return null;
      return AdminStrategyDetail(
        strategy: Strategy.fromJson(Map<String, dynamic>.from(rawStrategy)),
        owner: _ownerFromStrategyJson(rawStrategy),
        positionSummary: _positionSummaryFromJson(data['positionSummary']),
        rebuiltPerformance: _rebuiltPerformanceFromJson(
          data['rebuiltPerformance'],
        ),
      );
    } catch (_) {
      return null;
    }
  }

  /// `strategy.user` projection (`{id, name, email}`) joined by the admin
  /// detail route via `{includeUser: true}` — absent when the owner row could
  /// not be joined, in which case the screen cannot resolve the owner and
  /// treats the strategy as not-owned (read-only).
  AdminStrategyOwner? _ownerFromStrategyJson(Map<dynamic, dynamic> json) {
    final rawUser = json['user'];
    if (rawUser is! Map) return null;
    return AdminStrategyOwner.fromJson(Map<String, dynamic>.from(rawUser));
  }

  StrategyPositionSummary? _positionSummaryFromJson(Object? json) {
    if (json is! Map) return null;
    return StrategyPositionSummary.fromJson(Map<String, dynamic>.from(json));
  }

  RebuiltPerformance? _rebuiltPerformanceFromJson(Object? json) {
    if (json is! Map) return null;
    return RebuiltPerformance.fromJson(Map<String, dynamic>.from(json));
  }

  /// Applies a partial update to any user's strategy via
  /// `PATCH /api/admin/strategies/{id}`. The caller is responsible for sending
  /// only the changed fields (the web console does the same, to keep the audit
  /// record readable). Active strategies are rejected server-side.
  Future<AdminOperationResult> updateStrategy(
    int id,
    Map<String, dynamic> updates,
  ) async {
    try {
      final res = await ApiClient.instance.patchJson(
        '/api/admin/strategies/$id',
        data: updates,
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

  /// Clones any user's strategy to another user via
  /// `POST /api/admin/strategies/{id}/clone`.
  Future<AdminCloneResult> cloneStrategy(
    int id, {
    required String targetUserId,
    String? name,
    bool start = false,
  }) async {
    try {
      final res = await ApiClient.instance.postJson(
        '/api/admin/strategies/$id/clone',
        data: {
          'targetUserId': targetUserId,
          if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
          'start': start,
        },
        options: _tolerant,
      );
      final data = res.data is Map ? res.data as Map : const {};
      final strategy = data['strategy'];
      final createdName = strategy is Map ? strategy['name']?.toString() : null;
      return AdminCloneResult(
        // The route answers 201 Created on success (not 200) — accepting any
        // 2xx avoids reporting a successful clone as a failure, which would
        // invite a retry and a duplicate `_copy`.
        success: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
        message: _errorMessage(res),
        strategyName: createdName,
      );
    } catch (_) {
      return const AdminCloneResult(success: false);
    }
  }

  /// Deletes any user's strategy (and its performance history, order links and
  /// backtests) via `DELETE /api/admin/strategies/{id}`.
  Future<AdminOperationResult> deleteStrategy(int id) async {
    try {
      final res = await ApiClient.instance.delete(
        '/api/admin/strategies/$id',
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
