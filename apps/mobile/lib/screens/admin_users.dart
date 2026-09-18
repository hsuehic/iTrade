import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../models/admin_user.dart';
import '../services/admin_service.dart';
import '../services/auth_service.dart';
import '../services/copy_service.dart';
import '../widgets/copy_text.dart';

/// Admin screen to manage registered users, their roles, ban status, and to
/// start an impersonation session ("Login as user") — the mobile counterpart
/// of the web console's `/admin/users` page.
///
/// UX:
/// - Search bar (server-side search on email/name) + filter chips
///   (role, status) applied client-side
/// - Per-user actions via a bottom sheet:
///   * Login as user — disabled for admin accounts, the admin themself, or
///     while already impersonating
///   * Promote / Demote — with confirmation, self-demotion blocked server-side
///   * Ban / Unban — with confirmation
/// - Impersonation start swaps the session cookie; the app then runs as the
///   impersonated user. A banner on the Profile screen offers "Exit".
class AdminUsersScreen extends StatefulWidget {
  const AdminUsersScreen({super.key});

  @override
  State<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends State<AdminUsersScreen> {
  final _searchController = TextEditingController();
  Timer? _searchDebounce;

  bool _loading = true;
  bool _refreshing = false;
  List<AdminUser> _users = const [];

  String _roleFilter = 'all'; // 'all' | 'admin' | 'user'
  String _statusFilter = 'all'; // 'all' | 'active' | 'banned'
  String _exchangeFilter = 'all'; // 'all' | 'has' | 'none'
  // The filter/sort menu intentionally exposes only Balance and Name. Other
  // previously supported keys ('role', 'status', 'exchange', 'joined') are
  // dropped from the picker; legacy values fall back to 'balance' below so a
  // stale in-memory state can never render an unsupported label.
  String _sortKey = 'balance'; // name | balance
  bool _sortAscending = false; // null-account users always sink to the bottom
  String? _actingUserId; // user id with an in-flight action

  /// Number of filter groups currently narrowed away from 'all'. Drives the
  /// badge on the 筛选 button so the list state stays visible while the menu
  /// is closed. Search is rendered as its own control, so it is not counted.
  int get _activeFilterCount => [
    _roleFilter,
    _statusFilter,
    _exchangeFilter,
  ].where((v) => v != 'all').length;

  static const _sortKeys = <String>['balance', 'name'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({String search = '', bool isRefresh = false}) async {
    if (!isRefresh) setState(() => _loading = true);
    setState(() => _refreshing = isRefresh);
    // Fetch users and their exchange-account stats concurrently, mirroring the
    // web console's users page (list + `/api/admin/users/exchange-stats`).
    final results = await Future.wait([
      AdminService.instance.fetchUsers(search: search),
      AdminService.instance.fetchExchangeStats(),
    ]);
    final users = (results[0] as List<AdminUser>);
    final stats =
        (results[1] as Map<String, ({int exchangeAccounts, double? balance})>);
    if (!mounted) return;
    setState(() {
      _users = users
          .map(
            (u) => u.withExchangeStats(
              exchangeAccounts: stats[u.id]?.exchangeAccounts,
              balance: stats[u.id]?.balance,
            ),
          )
          .toList();
      _loading = false;
      _refreshing = false;
    });
  }

  List<AdminUser> get _filtered {
    final role = _roleFilter;
    final status = _statusFilter;
    final exchange = _exchangeFilter;
    final filtered = _users.where((user) {
      final matchesRole = role == 'all' || user.hasRole(role);
      final matchesStatus =
          status == 'all' || (status == 'banned' ? user.banned : !user.banned);
      final matchesExchange =
          exchange == 'all' ||
          (exchange == 'has'
              ? user.exchangeAccounts != null
              : user.exchangeAccounts == null);
      return matchesRole && matchesStatus && matchesExchange;
    }).toList();

    // Client-side sort mirroring the web console's users page. Users with no
    // exchange account (null exchangeAccounts/balance) always sink to the
    // bottom regardless of direction, so an explicit "no account" never
    // interleaves into the numeric ordering.
    final key = _sortKeys.contains(_sortKey) ? _sortKey : 'balance';
    final asc = _sortAscending;
    filtered.sort((a, b) {
      final dir = asc ? 1 : -1;
      switch (key) {
        case 'name':
          {
            final av = (a.name.isEmpty ? a.email : a.name).toLowerCase();
            final bv = (b.name.isEmpty ? b.email : b.name).toLowerCase();
            return av.compareTo(bv) * dir;
          }
        case 'balance':
        default:
          {
            return _compareNullable(a.balance, b.balance, dir);
          }
      }
    });
    return filtered;
  }

  /// Compares two nullable numeric field values. `null` always sorts last
  /// (1) regardless of direction; otherwise defer to the direction sign.
  ///
  /// NOTE: do NOT cast `(a - b).sign` to int. `num.sign` is a `num` and is a
  /// `double` for double operands, so `as int` throws
  /// `_TypeError: type 'double' is not a subtype of type 'int'` at runtime.
  /// `num.compareTo` is typed to return `int`, so its sign is safe.
  static int _compareNullable(num? a, num? b, int dir) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a.compareTo(b).sign * dir;
  }

  void _showMessage(String key, String fallback, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: CopyText(key, fallback: fallback),
        backgroundColor: isError
            ? Colors.red
            : Theme.of(context).colorScheme.primary,
      ),
    );
  }

  Future<bool> _confirm({
    required String titleKey,
    required String titleFallback,
    required String bodyKey,
    required String bodyFallback,
    required String confirmKey,
    required String confirmFallback,
    bool destructive = false,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: CopyText(titleKey, fallback: titleFallback),
        content: CopyText(bodyKey, fallback: bodyFallback),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const CopyText('common.cancel', fallback: 'Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: destructive
                ? TextButton.styleFrom(foregroundColor: Colors.red)
                : null,
            child: CopyText(confirmKey, fallback: confirmFallback),
          ),
        ],
      ),
    );
    return confirmed == true;
  }

  Future<void> _runAction(
    AdminUser user,
    Future<AdminOperationResult> Function() action, {
    required String successKey,
    required String successFallback,
    required String failureKey,
    required String failureFallback,
    bool reloadOnSuccess = true,
  }) async {
    setState(() => _actingUserId = user.id);
    final result = await action();
    if (!mounted) return;
    setState(() => _actingUserId = null);
    if (result.success) {
      _showMessage(successKey, successFallback);
      if (reloadOnSuccess) await _load(search: _searchController.text);
    } else {
      _showMessage(
        failureKey,
        result.message ?? failureFallback,
        isError: true,
      );
    }
  }

  Future<void> _setRole(AdminUser user, String role) async {
    final isDemote = role == 'user';
    final confirmed = await _confirm(
      titleKey: isDemote
          ? 'screen.admin_users.demote_title'
          : 'screen.admin_users.promote_title',
      titleFallback: isDemote ? 'Demote to User' : 'Promote to Admin',
      bodyKey: 'screen.admin_users.role_change_body',
      bodyFallback: isDemote
          ? 'This user will lose admin access.'
          : 'This user will gain full admin access.',
      confirmKey: 'common.confirm',
      confirmFallback: 'Confirm',
    );
    if (!confirmed || !mounted) return;
    await _runAction(
      user,
      () => AdminService.instance.setUserRole(user.id, role),
      successKey: 'screen.admin_users.role_updated',
      successFallback: 'User role updated',
      failureKey: 'screen.admin_users.role_update_failed',
      failureFallback: 'Failed to update role',
    );
  }

  Future<void> _setBanned(AdminUser user, bool banned) async {
    final confirmed = await _confirm(
      titleKey: banned
          ? 'screen.admin_users.ban_title'
          : 'screen.admin_users.unban_title',
      titleFallback: banned ? 'Ban user' : 'Unban user',
      bodyKey: banned
          ? 'screen.admin_users.ban_body'
          : 'screen.admin_users.unban_body',
      bodyFallback: banned
          ? 'The user will be signed out and blocked from signing in.'
          : 'The user will be able to sign in again.',
      confirmKey: banned ? 'screen.admin_users.ban_title' : 'common.confirm',
      confirmFallback: banned ? 'Ban user' : 'Confirm',
      destructive: banned,
    );
    if (!confirmed || !mounted) return;
    await _runAction(
      user,
      () => AdminService.instance.setUserBanned(user.id, banned),
      successKey: banned
          ? 'screen.admin_users.banned'
          : 'screen.admin_users.unbanned',
      successFallback: banned
          ? 'User banned successfully'
          : 'User unbanned successfully',
      failureKey: banned
          ? 'screen.admin_users.ban_failed'
          : 'screen.admin_users.unban_failed',
      failureFallback: banned ? 'Failed to ban user' : 'Failed to unban user',
    );
  }

  Future<void> _impersonate(AdminUser user) async {
    final confirmed = await _confirm(
      titleKey: 'screen.admin_users.impersonate_title',
      titleFallback: 'Login as user',
      bodyKey: 'screen.admin_users.impersonate_body',
      bodyFallback:
          'You will be signed in as ${user.email}. All actions will be recorded in the audit log.',
      confirmKey: 'common.continue',
      confirmFallback: 'Continue',
    );
    if (!confirmed || !mounted) return;
    setState(() => _actingUserId = user.id);
    final result = await AdminService.instance.impersonate(user.id);
    if (!mounted) return;
    setState(() => _actingUserId = null);
    if (result.success) {
      // The whole app now runs as the impersonated user; jump home with a
      // clean stack. The Profile screen shows the "viewing as" banner.
      Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
      _showMessage(
        'screen.admin_users.impersonating',
        'Signed in as ${user.email}',
      );
    } else {
      _showMessage(
        'screen.admin_users.impersonate_failed',
        result.message ?? 'Failed to start impersonation',
        isError: true,
      );
    }
  }

  void _openActions(AdminUser user) {
    final currentUserId = AuthService.instance.user?.id;
    final isSelf = user.id == currentUserId;
    final isImpersonating = AuthService.instance.isImpersonating;
    final canImpersonate = !user.isAdmin && !isSelf && !isImpersonating;
    final busy = _actingUserId == user.id;

    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(20.w, 0, 20.w, 8),
              child: Column(
                children: [
                  Text(
                    user.name.isEmpty ? user.email : user.name,
                    style: TextStyle(
                      fontSize: 16.sp,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (user.name.isNotEmpty)
                    Text(
                      user.email,
                      style: TextStyle(
                        fontSize: 13.sp,
                        color: Colors.grey[600],
                      ),
                    ),
                ],
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.login),
              title: CopyText(
                'screen.admin_users.login_as_user',
                fallback: 'Login as user',
              ),
              subtitle: !canImpersonate
                  ? CopyText(
                      'screen.admin_users.login_as_user_unavailable',
                      fallback:
                          'Not available for admins, yourself, or while impersonating',
                    )
                  : null,
              enabled: canImpersonate && !busy,
              onTap: () {
                Navigator.of(sheetContext).pop();
                _impersonate(user);
              },
            ),
            if (user.isAdmin)
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: CopyText(
                  'screen.admin_users.demote_to_user',
                  fallback: 'Demote to User',
                ),
                enabled: !isSelf && !busy,
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _setRole(user, 'user');
                },
              )
            else
              ListTile(
                leading: const Icon(Icons.admin_panel_settings_outlined),
                title: CopyText(
                  'screen.admin_users.promote_to_admin',
                  fallback: 'Promote to Admin',
                ),
                enabled: !busy,
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _setRole(user, 'admin');
                },
              ),
            if (user.banned)
              ListTile(
                leading: const Icon(Icons.check_circle_outline),
                title: CopyText(
                  'screen.admin_users.unban_user',
                  fallback: 'Unban user',
                ),
                enabled: !busy,
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _setBanned(user, false);
                },
              )
            else
              ListTile(
                leading: const Icon(Icons.block, color: Colors.red),
                title: CopyText(
                  'screen.admin_users.ban_user',
                  fallback: 'Ban user',
                  style: const TextStyle(color: Colors.red),
                ),
                enabled: !isSelf && !busy,
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _setBanned(user, true);
                },
              ),
            SizedBox(height: 8.w),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filtered = _filtered;
    return Scaffold(
      appBar: AppBar(
        title: const CopyText(
          'screen.admin_users.title',
          fallback: 'Users & Roles',
        ),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _refreshing
                ? null
                : () => _load(search: _searchController.text, isRefresh: true),
            icon: _refreshing
                ? SizedBox(
                    width: 18.w,
                    height: 18.w,
                    child: const CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
          SizedBox(width: 4.w),
        ],
      ),
      body: Column(
        children: [
          _buildToolbar(isDark),
          const SizedBox(height: 4),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                ? _buildEmptyState()
                : RefreshIndicator(
                    onRefresh: () =>
                        _load(search: _searchController.text, isRefresh: true),
                    child: ListView.separated(
                      padding: EdgeInsets.fromLTRB(16.w, 4, 16.w, 32.w),
                      itemCount: filtered.length,
                      separatorBuilder: (_, index) => SizedBox(height: 8.w),
                      itemBuilder: (context, index) =>
                          _buildUserCard(filtered[index], isDark),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  /// Single compact control strip: a full-width search field flanked by the
  /// `筛选` and `排序` popup buttons. Replaces the previous 4 stacked chip rows
  /// so the user card list keeps its vertical space on phones.
  Widget _buildToolbar(bool isDark) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 8, 12.w, 4),
      child: Row(
        children: [
          Expanded(child: _buildSearchBar(isDark)),
          SizedBox(width: 8.w),
          _buildFilterMenu(isDark),
          SizedBox(width: 4.w),
          _buildSortMenu(isDark),
        ],
      ),
    );
  }

  /// Borderless search field, sized to sit inline with the two popup buttons.
  Widget _buildSearchBar(bool isDark) {
    return SizedBox(
      height: 38.w,
      child: TextField(
        controller: _searchController,
        textInputAction: TextInputAction.search,
        style: TextStyle(fontSize: 13.sp),
        decoration: InputDecoration(
          hintText: CopyService.instance.t(
            'screen.admin_users.search_hint',
            fallback: 'Search users...',
          ),
          hintStyle: TextStyle(fontSize: 13.sp),
          prefixIcon: Icon(Icons.search, size: 18.w),
          prefixIconConstraints: BoxConstraints(minWidth: 34.w),
          suffixIcon: _searchController.text.isEmpty
              ? null
              : IconButton(
                  icon: Icon(Icons.close, size: 16.w),
                  visualDensity: VisualDensity.compact,
                  tooltip: CopyService.instance.t(
                    'common.clear',
                    fallback: 'Clear',
                  ),
                  onPressed: _clearSearch,
                ),
          suffixIconConstraints: BoxConstraints(minWidth: 32.w),
          isDense: true,
          contentPadding: EdgeInsets.symmetric(vertical: 4),
          filled: true,
          fillColor: isDark ? Colors.grey[900] : Colors.grey.withOpacity(0.08),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
        ),
        onChanged: (value) {
          // Repaint immediately so the clear-✕ appears/disappears without
          // waiting for the debounce fire.
          setState(() {});
          _searchDebounce?.cancel();
          _searchDebounce = Timer(const Duration(milliseconds: 350), () {
            _load(search: value);
          });
        },
        onSubmitted: (value) => _load(search: value),
      ),
    );
  }

  void _clearSearch() {
    _searchDebounce?.cancel();
    _searchController.clear();
    setState(() {});
    _load(search: '');
  }

  /// Builds the check-marked row used by both popup menus. Kept as a common
  /// helper so the filter and sort menus render identical selection affordances
  /// (leading tick, bold label) and only differ in their option source.
  ///
  /// `trailingIcon` is rendered at the far right, after an Expanded label, so
  /// the label stays left-aligned while the sort-direction arrow hugs the edge
  /// instead of crowding the leading tick.
  PopupMenuItem<String> _menuItem({
    required String value,
    required String label,
    required bool selected,
    IconData? trailingIcon,
    int height = 44,
  }) {
    final theme = Theme.of(context);
    return PopupMenuItem<String>(
      value: value,
      height: height.toDouble(),
      child: Row(
        children: [
          // Reserved gutter keeps labels aligned whether or not this row is
          // the selected one.
          SizedBox(
            width: 22.w,
            child: selected
                ? Icon(
                    Icons.check,
                    size: 17.w,
                    color: theme.colorScheme.primary,
                  )
                : null,
          ),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13.sp,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (trailingIcon != null)
            Icon(trailingIcon, size: 17.w, color: theme.colorScheme.primary),
        ],
      ),
    );
  }

  /// Non-interactive section heading inside a popup menu.
  PopupMenuItem<String> _menuHeader(String label) {
    return PopupMenuItem<String>(
      enabled: false,
      height: 30,
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 10.sp,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: Colors.grey[600],
        ),
      ),
    );
  }

  PopupMenuEntry<String> _menuDivider() => const PopupMenuDivider(height: 1);

  /// `筛选` button: all three single-select filter groups in one anchored
  /// menu, with a badge showing how many groups are narrowed.
  Widget _buildFilterMenu(bool isDark) {
    final t = CopyService.instance.t;
    final count = _activeFilterCount;
    final primary = Theme.of(context).colorScheme.primary;
    return PopupMenuButton<String>(
      tooltip: t('screen.admin_users.filter', fallback: 'Filter'),
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: Icon(
          count > 0 ? Icons.filter_alt : Icons.filter_alt_outlined,
          size: 20.w,
          color: count > 0 ? primary : Colors.grey[600],
        ),
      ),
      color: isDark ? Colors.grey[900] : Colors.white,
      // Opened from the right edge of a phone: anchor to the button's right
      // edge so the menu grows leftwards and cannot overflow the screen.
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      constraints: BoxConstraints(minWidth: 200.w, maxWidth: 240.w),
      onSelected: _onFilterSelected,
      itemBuilder: (context) => [
        _menuHeader(
          t('screen.admin_users.filter_group_role', fallback: 'Role'),
        ),
        _menuItem(
          value: 'role:all',
          label: t(
            'screen.admin_users.filter_all_roles',
            fallback: 'All roles',
          ),
          selected: _roleFilter == 'all',
        ),
        _menuItem(
          value: 'role:admin',
          label: t('screen.admin_users.role_admin', fallback: 'Admin'),
          selected: _roleFilter == 'admin',
        ),
        _menuItem(
          value: 'role:user',
          label: t('screen.admin_users.role_user', fallback: 'User'),
          selected: _roleFilter == 'user',
        ),
        _menuDivider(),
        _menuHeader(
          t('screen.admin_users.filter_group_status', fallback: 'Status'),
        ),
        _menuItem(
          value: 'status:all',
          label: t(
            'screen.admin_users.filter_all_status',
            fallback: 'All status',
          ),
          selected: _statusFilter == 'all',
        ),
        _menuItem(
          value: 'status:active',
          label: t('screen.admin_users.filter_active', fallback: 'Active'),
          selected: _statusFilter == 'active',
        ),
        _menuItem(
          value: 'status:banned',
          label: t('screen.admin_users.banned_badge', fallback: 'Banned'),
          selected: _statusFilter == 'banned',
        ),
        _menuDivider(),
        _menuHeader(
          t('screen.admin_users.filter_group_exchange', fallback: 'Exchange'),
        ),
        _menuItem(
          value: 'exchange:all',
          label: t(
            'screen.admin_users.filter_exchange_all',
            fallback: 'All exchange',
          ),
          selected: _exchangeFilter == 'all',
        ),
        _menuItem(
          value: 'exchange:has',
          label: t(
            'screen.admin_users.filter_exchange_has',
            fallback: 'Has account',
          ),
          selected: _exchangeFilter == 'has',
        ),
        _menuItem(
          value: 'exchange:none',
          label: t(
            'screen.admin_users.filter_exchange_none',
            fallback: 'No account',
          ),
          selected: _exchangeFilter == 'none',
        ),
        if (count > 0) ...[
          _menuDivider(),
          PopupMenuItem<String>(
            value: 'clear',
            height: 46,
            child: Row(
              children: [
                Icon(
                  Icons.restart_alt,
                  size: 18.w,
                  color: Theme.of(context).colorScheme.primary,
                ),
                SizedBox(width: 8.w),
                Text(
                  t(
                    'screen.admin_users.filter_clear',
                    fallback: 'Clear filters',
                  ),
                  style: TextStyle(
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  /// Menu values are `group:value` pairs so a single popup can drive three
  /// independent filter state fields. The menu stays open on tap is NOT
  /// desired here: one selection closes it, matching how the user picks a
  /// single value per group in separate visits.
  void _onFilterSelected(String value) {
    if (value == 'clear') {
      setState(() {
        _roleFilter = 'all';
        _statusFilter = 'all';
        _exchangeFilter = 'all';
      });
      return;
    }
    final sep = value.indexOf(':');
    if (sep <= 0) return;
    final group = value.substring(0, sep);
    final picked = value.substring(sep + 1);
    setState(() {
      switch (group) {
        case 'role':
          _roleFilter = picked;
        case 'status':
          _statusFilter = picked;
        case 'exchange':
          _exchangeFilter = picked;
      }
    });
  }

  /// `排序` button. Only Balance and Name are offered; tapping the active key
  /// flips the direction, tapping the other switches key and resets to
  /// descending (balance) / ascending (name) as the sensible default.
  Widget _buildSortMenu(bool isDark) {
    final t = CopyService.instance.t;
    final primary = Theme.of(context).colorScheme.primary;
    final options = <({String key, String label})>[
      (
        key: 'balance',
        label: t('screen.admin_users.sort_by_balance', fallback: 'Balance'),
      ),
      (
        key: 'name',
        label: t('screen.admin_users.sort_by_name', fallback: 'Name'),
      ),
    ];
    return PopupMenuButton<String>(
      tooltip: t('screen.admin_users.sort', fallback: 'Sort by'),
      icon: Icon(Icons.swap_vert, size: 22.w, color: primary),
      color: isDark ? Colors.grey[900] : Colors.white,
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      constraints: BoxConstraints(minWidth: 190.w, maxWidth: 230.w),
      onSelected: _onSortSelected,
      itemBuilder: (context) => [
        _menuHeader(t('screen.admin_users.sort', fallback: 'Sort by')),
        for (final option in options)
          _menuItem(
            value: option.key,
            label: option.label,
            selected: _sortKey == option.key,
            // Show the live direction as a trailing hint on the active row so
            // the menu and the rendered list ordering never disagree.
            trailingIcon: _sortKey == option.key
                ? (_sortAscending ? Icons.arrow_upward : Icons.arrow_downward)
                : null,
          ),
        _menuDivider(),
        // Explicit direction rows: pickable without changing the sort key.
        _menuItem(
          value: 'dir:asc',
          label: t('screen.admin_users.sort_ascending', fallback: 'Ascending'),
          selected: _sortAscending,
          height: 40,
        ),
        _menuItem(
          value: 'dir:desc',
          label: t(
            'screen.admin_users.sort_descending',
            fallback: 'Descending',
          ),
          selected: !_sortAscending,
          height: 40,
        ),
      ],
    );
  }

  void _onSortSelected(String value) {
    if (value.startsWith('dir:')) {
      final asc = value.substring(4) == 'asc';
      setState(() => _sortAscending = asc);
      return;
    }
    setState(() {
      if (_sortKey == value) {
        _sortAscending = !_sortAscending;
      } else {
        _sortKey = value;
        // Balance reads best largest-first; names read best A→Z.
        _sortAscending = value == 'name';
      }
    });
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(32.w),
        child: CopyText(
          'screen.admin_users.empty',
          fallback: 'No users match your filters.',
          style: TextStyle(color: Colors.grey[600], fontSize: 14.sp),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildUserCard(AdminUser user, bool isDark) {
    final initials = (user.name.isNotEmpty ? user.name : user.email)
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((part) => part.isEmpty ? '' : part[0].toUpperCase())
        .join();
    final busy = _actingUserId == user.id;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _openActions(user),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? Colors.grey[900] : Colors.white.withOpacity(0.6),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark ? Colors.grey[850]! : Colors.grey.withOpacity(0.1),
          ),
        ),
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 10),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20.w,
              backgroundColor: Theme.of(
                context,
              ).colorScheme.primary.withOpacity(0.15),
              backgroundImage:
                  user.image != null && user.image!.startsWith('http')
                  ? NetworkImage(user.image!)
                  : null,
              child: user.image != null && user.image!.startsWith('http')
                  ? null
                  : Text(
                      initials.isEmpty ? '?' : initials,
                      style: TextStyle(
                        fontSize: 13.sp,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
            ),
            SizedBox(width: 12.w),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user.name.isEmpty ? user.email : user.name,
                    style: TextStyle(
                      fontSize: 15.sp,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (user.name.isNotEmpty)
                    Text(
                      user.email,
                      style: TextStyle(
                        fontSize: 12.sp,
                        color: Colors.grey[600],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      _buildRoleBadge(user),
                      if (user.banned) ...[
                        SizedBox(width: 6.w),
                        _buildBannedBadge(),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  _buildExchangeStats(user),
                  if (user.createdAt != null) ...[
                    const SizedBox(height: 6),
                    _buildJoinedRow(user),
                  ],
                ],
              ),
            ),
            if (busy)
              SizedBox(
                width: 18.w,
                height: 18.w,
                child: const CircularProgressIndicator(strokeWidth: 2),
              )
            else
              Icon(Icons.more_vert, size: 20.w, color: Colors.grey[500]),
          ],
        ),
      ),
    );
  }

  /// Exchange Accounts + Balance summary for a user, mirroring the web
  /// console's users-table columns. Renders N/A when the user has no linked
  /// exchange account (stat is null).
  Widget _buildExchangeStats(AdminUser user) {
    final accounts = user.exchangeAccounts;
    final balance = user.balance;
    final muted = TextStyle(fontSize: 12.sp, color: Colors.grey[600]);
    return Row(
      children: [
        Icon(
          Icons.account_balance_wallet_outlined,
          size: 13.w,
          color: Colors.grey[600],
        ),
        SizedBox(width: 4.w),
        CopyText(
          'screen.admin_users.exchange_accounts',
          fallback: 'Exchange',
          style: muted,
        ),
        SizedBox(width: 6.w),
        Text(
          accounts == null ? 'N/A' : '$accounts',
          style: TextStyle(
            fontSize: 12.sp,
            fontWeight: FontWeight.w600,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
        SizedBox(width: 16.w),
        Icon(Icons.payments_outlined, size: 13.w, color: Colors.grey[600]),
        SizedBox(width: 4.w),
        CopyText(
          'screen.admin_users.balance',
          fallback: 'Balance',
          style: muted,
        ),
        SizedBox(width: 6.w),
        Text(
          balance == null ? 'N/A' : _formatUsd(balance),
          style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  /// Registration date row, mirroring the web console's "Joined" column.
  Widget _buildJoinedRow(AdminUser user) {
    final muted = TextStyle(fontSize: 12.sp, color: Colors.grey[600]);
    return Row(
      children: [
        Icon(Icons.history, size: 13.w, color: Colors.grey[600]),
        SizedBox(width: 4.w),
        CopyText('screen.admin_users.joined', fallback: 'Joined', style: muted),
        SizedBox(width: 6.w),
        Text(
          _formatDate(user.createdAt!),
          style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  /// Formats a registration date as e.g. "Sep 9, 2026".
  String _formatDate(DateTime date) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  /// Formats a USD amount with thousands separators and a leading `$`,
  /// matching the web console's `Intl.NumberFormat` currency output
  /// (e.g. 1234567.89 -> "$1,234,567.89").
  String _formatUsd(double value) {
    final neg = value < 0;
    final parts = value.abs().toStringAsFixed(2).split('.');
    final intPart = parts[0];
    final buf = StringBuffer();
    final len = intPart.length;
    for (var i = 0; i < len; i++) {
      buf.write(intPart[i]);
      final remaining = len - i - 1;
      if (remaining > 0 && remaining % 3 == 0) buf.write(',');
    }
    return '\$${neg ? '-' : ''}$buf.${parts[1]}';
  }

  Widget _buildRoleBadge(AdminUser user) {
    final isAdmin = user.isAdmin;
    final color = isAdmin
        ? Theme.of(context).colorScheme.primary
        : Colors.grey[600]!;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        isAdmin
            ? CopyService.instance.t(
                'screen.admin_users.role_admin',
                fallback: 'Admin',
              )
            : CopyService.instance.t(
                'screen.admin_users.role_user',
                fallback: 'User',
              ),
        style: TextStyle(
          fontSize: 11.sp,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildBannedBadge() {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.red.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        CopyService.instance.t(
          'screen.admin_users.banned_badge',
          fallback: 'Banned',
        ),
        style: TextStyle(
          fontSize: 11.sp,
          color: Colors.red,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
