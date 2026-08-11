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
  List<AdminUser> _users = const [];

  String _roleFilter = 'all'; // 'all' | 'admin' | 'user'
  String _statusFilter = 'all'; // 'all' | 'active' | 'banned'
  String? _actingUserId; // user id with an in-flight action

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

  Future<void> _load({String search = ''}) async {
    setState(() => _loading = true);
    final users = await AdminService.instance.fetchUsers(search: search);
    if (!mounted) return;
    setState(() {
      _users = users;
      _loading = false;
    });
  }

  List<AdminUser> get _filtered {
    return _users.where((user) {
      final matchesRole = _roleFilter == 'all' || user.hasRole(_roleFilter);
      final matchesStatus =
          _statusFilter == 'all' ||
          (_statusFilter == 'banned' ? user.banned : !user.banned);
      return matchesRole && matchesStatus;
    }).toList();
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
      failureFallback:
          banned ? 'Failed to ban user' : 'Failed to unban user',
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
                      fallback: 'Not available for admins, yourself, or while impersonating',
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
      ),
      body: Column(
        children: [
          _buildSearchBar(isDark),
          _buildFilters(),
          const SizedBox(height: 4),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                ? _buildEmptyState()
                : RefreshIndicator(
                    onRefresh: () => _load(search: _searchController.text),
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

  Widget _buildSearchBar(bool isDark) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 8, 16.w, 4),
      child: TextField(
        controller: _searchController,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: CopyService.instance.t(
            'screen.admin_users.search_hint',
            fallback: 'Search email or name...',
          ),
          prefixIcon: const Icon(Icons.search),
          isDense: true,
          filled: true,
          fillColor: isDark ? Colors.grey[900] : Colors.grey.withOpacity(0.08),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
        ),
        onChanged: (value) {
          _searchDebounce?.cancel();
          _searchDebounce = Timer(const Duration(milliseconds: 350), () {
            _load(search: value);
          });
        },
        onSubmitted: (value) => _load(search: value),
      ),
    );
  }

  Widget _buildFilters() {
    return Column(
      children: [
        _buildChipRow(
          values: const ['all', 'admin', 'user'],
          selected: _roleFilter,
          labelBuilder: (v) => v == 'all' ? 'All roles' : v,
          onSelected: (v) => setState(() => _roleFilter = v),
        ),
        _buildChipRow(
          values: const ['all', 'active', 'banned'],
          selected: _statusFilter,
          labelBuilder: (v) => v == 'all' ? 'All status' : v,
          onSelected: (v) => setState(() => _statusFilter = v),
        ),
      ],
    );
  }

  Widget _buildChipRow({
    required List<String> values,
    required String selected,
    required String Function(String) labelBuilder,
    required ValueChanged<String> onSelected,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 3),
      child: Row(
        children: [
          for (final value in values) ...[
            ChoiceChip(
              label: Text(
                value == 'all'
                    ? labelBuilder(value)
                    : value[0].toUpperCase() + value.substring(1),
                style: TextStyle(fontSize: 12.sp),
              ),
              selected: selected == value,
              onSelected: (_) => onSelected(value),
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            SizedBox(width: 8.w),
          ],
        ],
      ),
    );
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
