import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../design/tokens/color.dart';
import '../models/admin_strategy.dart';
import '../models/strategy.dart';
import '../services/admin_service.dart';
import '../services/auth_service.dart';
import '../services/copy_service.dart';
import '../utils/exchange_config.dart';
import '../utils/crypto_icons.dart';
import '../widgets/copy_text.dart';
import 'strategy_detail.dart';

/// Admin screen to search, sort, edit, start/stop, clone and delete ANY user's
/// strategies — the mobile counterpart of the web console's
/// `/admin/strategies` page (Admin - Strategy Management).
///
/// Parity notes with the web console:
/// - Search / token / owner / status / exchange filters, server-side sort
///   (including the PnL and ROI columns) and server-side pagination (25/50/100)
///   all map 1:1 onto `GET /api/admin/strategies`.
/// - The owner filter and the clone dialog share one candidate set: users with
///   a bound exchange account (`GET /api/admin/strategies/owners`). When that
///   lookup fails the list degrades to every user with a visible warning, so an
///   admin can never mistake the fallback for the narrowed list.
/// - Editing and deleting are blocked for ACTIVE strategies (the API rejects
///   both) — the actions are disabled rather than surfacing a raw 400.
class AdminStrategiesScreen extends StatefulWidget {
  const AdminStrategiesScreen({super.key});

  @override
  State<AdminStrategiesScreen> createState() => _AdminStrategiesScreenState();
}

class _AdminStrategiesScreenState extends State<AdminStrategiesScreen> {
  final _searchController = TextEditingController();
  Timer? _debounce;

  bool _loading = true;
  bool _refreshing = false;
  String? _loadError;
  List<AdminStrategy> _strategies = const [];
  int _total = 0;

  /// Monotonic request id: rapid filter/sort changes can resolve out of order
  /// and the slower (stale) response must not overwrite the newer one.
  int _requestId = 0;

  // Filters
  String _symbol = '';
  String _ownerId = 'all';

  /// Label of the selected owner, remembered when it was picked. The
  /// candidate list can shrink afterwards (the degraded all-users fallback
  /// resolving back to bound-only users), and without this the active filter
  /// chip would lose the name and show a generic "Owner".
  String _ownerLabelCache = '';
  String _statusFilter = 'all';
  String _exchangeFilter = 'all';

  // Server-side sort + pagination
  String _sortKey = 'createdAt';
  bool _sortAscending = false;
  int _page = 1;
  int _pageSize = 50;

  // Candidate owners (bound-exchange users), + whether that set was confirmed.
  List<AdminStrategyOwnerOption> _ownerOptions = const [];
  bool _ownersBound = false;
  bool _ownersAvailable = false;

  /// Monotonic request id for the owner lookup, so a slow startup response
  /// cannot overwrite a newer one (see `_loadOwners`).
  int _ownersRequestId = 0;

  /// True while the candidate list is the degraded all-users fallback; drives a
  /// persistent inline banner (a snackbar would be lost behind other messages
  /// and would repeat on every refresh). Re-evaluated on each owner load, so
  /// it clears once the bound list comes back.
  bool _ownersDegraded = false;

  /// Ids with an in-flight action, so their rows show a spinner and ignore
  /// repeat taps. A set rather than a single id: the admin can act on one row
  /// while another request is still settling, and with one shared slot the
  /// first completion would clear the other row's spinner early (and let a
  /// second request be fired for a row that is still in flight).
  final Set<int> _actingIds = <int>{};

  /// Number of filter groups narrowed away from their default. Drives the badge
  /// on the filter button. The search box is its own control, so it is not
  /// counted.
  int get _activeFilterCount =>
      [
        _statusFilter,
        _exchangeFilter,
        _ownerId,
      ].where((v) => v != 'all').length +
      (_symbol.trim().isEmpty ? 0 : 1);

  int get _totalPages =>
      _total <= 0 ? 1 : ((_total + _pageSize - 1) ~/ _pageSize);

  @override
  void initState() {
    super.initState();
    _loadOwners();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  /// Loads the owner candidates. The owner filter and the clone dialog share
  /// this set; when the owners lookup fails the service falls back to every
  /// user and we surface a persistent inline warning.
  ///
  /// Guarded like `_load`: a request id drops out-of-order responses, and a
  /// transient failure never discards a usable list we already hold (a refresh
  /// racing the startup load must not blank the candidate set).
  Future<void> _loadOwners() async {
    final requestId = ++_ownersRequestId;
    final result = await AdminService.instance.fetchStrategyOwners();
    if (!mounted || requestId != _ownersRequestId) return;
    if (result == null) {
      // Keep whatever we already have; only a cold failure makes the filter
      // genuinely unavailable.
      if (_ownerOptions.isNotEmpty) return;
      setState(() {
        _ownersAvailable = false;
        _ownerOptions = const [];
      });
      return;
    }
    setState(() {
      _ownersAvailable = true;
      _ownerOptions = result.options;
      _ownersBound = result.bound;
      // Tracks the CURRENT state rather than latching: a later refresh that
      // recovers the bound list must take the banner back down, otherwise the
      // screen contradicts itself (banner says "all users" while the clone
      // dialog says "only bound users").
      _ownersDegraded = !result.bound;
    });
  }

  /// Fetches one page. `silent` keeps the rows currently on screen when a
  /// background refresh (pull-to-refresh, post-mutation) fails.
  Future<void> _load({bool silent = false}) async {
    final requestId = ++_requestId;
    final requestedPage = _page;
    if (!silent) setState(() => _loading = true);
    final page = await AdminService.instance.fetchStrategies(
      search: _searchController.text,
      symbol: _symbol,
      userId: _ownerId == 'all' ? '' : _ownerId,
      status: _statusFilter,
      exchange: _exchangeFilter,
      sortBy: _sortKey,
      sortDirection: _sortAscending ? 'asc' : 'desc',
      page: requestedPage,
      pageSize: _pageSize,
    );
    // A newer request has already started — drop this stale response.
    if (requestId != _requestId || !mounted) return;
    if (page == null) {
      setState(() {
        _loading = false;
        _refreshing = false;
        _loadError = CopyService.instance.t(
          'screen.admin_strategies.load_failed',
          fallback: 'Failed to load strategies',
        );
        if (!silent) {
          _strategies = const [];
          _total = 0;
        }
      });
      _showMessage(_loadError!, isError: true);
      return;
    }
    setState(() {
      _loading = false;
      _refreshing = false;
      _strategies = page.strategies;
      _total = page.total;
      _loadError = null;
    });
    // The result set can shrink under us: another admin deletes rows, a status
    // filter stops matching after Start/Stop, or an edit moves the row out of
    // the active filter. Landing past the last page would render an empty list
    // captioned "Page 3 of 2", so jump straight to the last populated page and
    // re-query once. The target is strictly below the requested page, so the
    // recursion always terminates; page 1 is the floor.
    if (page.strategies.isEmpty && page.total > 0 && requestedPage > 1) {
      final lastPage = (page.total + _pageSize - 1) ~/ _pageSize;
      final target = lastPage < 1
          ? 1
          : (lastPage < requestedPage ? lastPage : requestedPage - 1);
      setState(() => _page = target);
      await _load(silent: silent);
    }
  }

  /// Debounced keyword/token inputs: typing re-queries 350ms after the last
  /// keystroke and always resets to page 1 (a filter change invalidates the
  /// current page offset).
  void _onSearchChanged(String _) {
    setState(() {}); // repaint the clear-✕ immediately
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() => _page = 1);
      _load();
    });
  }

  void _clearSearch() {
    _debounce?.cancel();
    _searchController.clear();
    setState(() => _page = 1);
    _load();
  }

  /// Applies a single-select filter change and re-queries from page 1.
  void _applyFilter(void Function() mutate) {
    setState(() {
      mutate();
      _page = 1;
    });
    _load();
  }

  void _clearFilters() {
    setState(() {
      _statusFilter = 'all';
      _exchangeFilter = 'all';
      _ownerId = 'all';
      _ownerLabelCache = '';
      _symbol = '';
      _page = 1;
    });
    _load();
  }

  /// Mirrors the web's `handleSort`: tapping the active key flips the
  /// direction; switching keys resets to the sensible default (A→Z for names,
  /// largest-first for every numeric/date column).
  void _applySort(String key) {
    setState(() {
      if (_sortKey == key) {
        _sortAscending = !_sortAscending;
      } else {
        _sortKey = key;
        _sortAscending = key == 'name';
      }
      _page = 1;
    });
    _load();
  }

  /// Returns a future so pull-to-refresh keeps its indicator up until the
  /// request actually settles (the AppBar button shows its own spinner).
  ///
  /// The owner candidate list is retried here too: its only other load is in
  /// `initState`, so a failure at startup would otherwise leave the owner filter
  /// and the clone dialog unusable for the whole life of the screen even though
  /// the UI tells the admin to refresh.
  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    await Future.wait([
      _load(silent: true),
      if (!_ownersAvailable || !_ownersBound) _loadOwners(),
    ]);
  }

  Future<void> _changeStatus(AdminStrategy strategy, String status) async {
    // Same-row re-entry guard: the action sheet can be reopened while an
    // earlier request for this row is still in flight.
    if (_actingIds.contains(strategy.id)) return;
    setState(() => _actingIds.add(strategy.id));
    final result = await AdminService.instance.changeStrategyStatus(
      strategy.id,
      status,
    );
    if (!mounted) return;
    setState(() => _actingIds.remove(strategy.id));
    if (!result.success) {
      _showMessage(
        result.message ??
            CopyService.instance.t(
              'screen.admin_strategies.status_failed',
              fallback: 'Failed to update strategy status',
            ),
        isError: true,
      );
      return;
    }
    _showMessage(
      status == 'active'
          ? CopyService.instance.t(
              'screen.admin_strategies.started',
              fallback: 'Strategy started',
            )
          : CopyService.instance.t(
              'screen.admin_strategies.stopped',
              fallback: 'Strategy stopped',
            ),
    );
    _load(silent: true);
  }

  Future<void> _openEditDialog(AdminStrategy strategy) async {
    // Same-row re-entry guard: the action sheet can be reopened while an
    // earlier request for this row is still in flight.
    if (_actingIds.contains(strategy.id)) return;
    final updates = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _EditStrategyDialog(strategy: strategy),
    );
    if (updates == null || !mounted) return; // cancelled / no changes
    if (updates.isEmpty) {
      _showMessage(
        CopyService.instance.t(
          'screen.admin_strategies.edit_no_changes',
          fallback: 'No changes to save',
        ),
      );
      return;
    }
    setState(() => _actingIds.add(strategy.id));
    final result = await AdminService.instance.updateStrategy(
      strategy.id,
      updates,
    );
    if (!mounted) return;
    setState(() => _actingIds.remove(strategy.id));
    if (!result.success) {
      _showMessage(
        result.message ??
            CopyService.instance.t(
              'screen.admin_strategies.edit_failed',
              fallback: 'Failed to update strategy',
            ),
        isError: true,
      );
      return;
    }
    _showMessage(
      CopyService.instance.t(
        'screen.admin_strategies.edit_updated',
        fallback: 'Strategy updated',
      ),
    );
    _load(silent: true);
  }

  Future<void> _openCloneDialog(AdminStrategy strategy) async {
    // Same-row re-entry guard: the action sheet can be reopened while an
    // earlier request for this row is still in flight.
    if (_actingIds.contains(strategy.id)) return;
    final submission = await showDialog<_CloneSubmission>(
      context: context,
      builder: (context) => _CloneStrategyDialog(
        strategy: strategy,
        owners: _ownerOptions,
        ownersBound: _ownersBound,
      ),
    );
    if (submission == null || !mounted) return;
    setState(() => _actingIds.add(strategy.id));
    final result = await AdminService.instance.cloneStrategy(
      strategy.id,
      targetUserId: submission.targetUserId,
      name: submission.name,
      start: submission.start,
    );
    if (!mounted) return;
    setState(() => _actingIds.remove(strategy.id));
    if (!result.success) {
      _showMessage(
        result.message ??
            CopyService.instance.t(
              'screen.admin_strategies.clone_failed',
              fallback: 'Failed to clone strategy',
            ),
        isError: true,
      );
      return;
    }
    // The API suffixes `_copy`, `_copy2`, … on a name collision — report the
    // name actually created rather than the one that was typed.
    final createdName = result.strategyName;
    _showMessage(
      createdName != null && createdName.isNotEmpty
          ? CopyService.instance.t(
              'screen.admin_strategies.clone_success',
              params: {'name': createdName},
              fallback: 'Strategy cloned as "$createdName"',
            )
          : CopyService.instance.t(
              'screen.admin_strategies.clone_success_generic',
              fallback: 'Strategy cloned to target user',
            ),
    );
    _load(silent: true);
  }

  Future<void> _openDeleteDialog(AdminStrategy strategy) async {
    // Same-row re-entry guard: the action sheet can be reopened while an
    // earlier request for this row is still in flight.
    if (_actingIds.contains(strategy.id)) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: CopyText(
          'screen.admin_strategies.delete_title',
          fallback: 'Delete strategy',
        ),
        content: CopyText(
          'screen.admin_strategies.delete_body',
          params: {'name': strategy.name, 'owner': strategy.ownerLabel},
          fallback:
              'Delete "{{name}}" owned by {{owner}}? This also removes its '
              'performance history, order links and backtests. This cannot be '
              'undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: CopyText('common.cancel', fallback: 'Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: CopyText(
              'screen.admin_strategies.delete_confirm',
              fallback: 'Delete',
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _actingIds.add(strategy.id));
    final result = await AdminService.instance.deleteStrategy(strategy.id);
    if (!mounted) return;
    setState(() => _actingIds.remove(strategy.id));
    if (!result.success) {
      _showMessage(
        result.message ??
            CopyService.instance.t(
              'screen.admin_strategies.delete_failed',
              fallback: 'Failed to delete strategy',
            ),
        isError: true,
      );
      return;
    }
    _showMessage(
      CopyService.instance.t(
        'screen.admin_strategies.deleted',
        fallback: 'Strategy deleted',
      ),
    );
    // Deleting the last row on a page can strand the admin past the end of the
    // result set; `_load` detects the empty page and steps back automatically.
    _load(silent: true);
  }

  void _showMessage(String text, {bool isError = false}) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    // Replace whatever is currently showing but keep anything queued: the
    // owners-degraded notice is a persistent banner now, so an action toast
    // should be immediate rather than waiting behind earlier messages.
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: isError ? Colors.red.shade700 : null,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  // ---------------------------------------------------------------- UI ---

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: CopyText(
          'screen.admin_strategies.title',
          fallback: 'Strategy Management',
        ),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        actions: [
          IconButton(
            tooltip: CopyService.instance.t(
              'screen.admin_strategies.refresh',
              fallback: 'Refresh',
            ),
            onPressed: _refreshing ? null : () => _refresh(),
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
          if (_ownersDegraded) _buildOwnersDegradedBanner(isDark),
          if (_activeFilterCount > 0) _buildActiveFilterChips(isDark),
          Expanded(child: _buildBody(isDark)),
          // Kept mounted while loading so a page change never makes the footer
          // jump; its controls disable themselves instead.
          _buildPagination(isDark),
        ],
      ),
    );
  }

  Widget _buildBody(bool isDark) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_strategies.isEmpty) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: EdgeInsets.all(32.w),
          children: [
            SizedBox(height: 60.w),
            CopyText(
              _loadError == null
                  ? 'screen.admin_strategies.empty'
                  : 'screen.admin_strategies.load_failed',
              fallback:
                  _loadError ?? 'No strategies found matching your filters.',
              style: TextStyle(
                color: _loadError == null ? Colors.grey[600] : Colors.red,
                fontSize: 14.sp,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.separated(
        padding: EdgeInsets.fromLTRB(16.w, 4, 16.w, 16.w),
        itemCount: _strategies.length,
        separatorBuilder: (_, index) => SizedBox(height: 8.w),
        itemBuilder: (context, index) =>
            _buildStrategyCard(_strategies[index], isDark),
      ),
    );
  }

  /// Single compact control strip: a full-width search field flanked by the
  /// filter and sort popup buttons, mirroring the users admin screen so the
  /// list keeps its vertical space on phones.
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

  Widget _buildSearchBar(bool isDark) {
    return SizedBox(
      height: 38.w,
      child: TextField(
        controller: _searchController,
        textInputAction: TextInputAction.search,
        style: TextStyle(fontSize: 13.sp),
        decoration: InputDecoration(
          hintText: CopyService.instance.t(
            'screen.admin_strategies.search_hint',
            fallback: 'Search name / description / type...',
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
        onChanged: _onSearchChanged,
        onSubmitted: (_) {
          _debounce?.cancel();
          setState(() => _page = 1);
          _load();
        },
      ),
    );
  }

  /// Echoes the non-default owner/token filters as removable chips so the list
  /// state stays visible while the popup menu is closed.
  /// Display name of an owner candidate, or '' when it is not in the current
  /// list (callers fall back to a generic chip label).
  String _ownerLabel(String id) {
    final match = _ownerOptions.where((o) => o.id == id).toList();
    return match.isEmpty ? '' : match.first.label;
  }

  Widget _buildActiveFilterChips(bool isDark) {
    final chips = <Widget>[];
    if (_ownerId != 'all') {
      final owner = _ownerOptions.where((o) => o.id == _ownerId).toList();
      chips.add(
        _chip(
          label: owner.isNotEmpty
              ? owner.first.label
              : (_ownerLabelCache.isNotEmpty
                    ? _ownerLabelCache
                    : CopyService.instance.t(
                        'screen.admin_strategies.filter_owner',
                        fallback: 'Owner',
                      )),
          onDeleted: () => _applyFilter(() {
            _ownerId = 'all';
            _ownerLabelCache = '';
          }),
        ),
      );
    }
    if (_symbol.trim().isNotEmpty) {
      chips.add(
        _chip(
          label: _symbol.trim(),
          onDeleted: () => _applyFilter(() => _symbol = ''),
        ),
      );
    }
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 4, 16.w, 0),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Wrap(spacing: 6.w, runSpacing: 4.w, children: chips),
      ),
    );
  }

  /// Persistent inline notice shown while the owner candidate list is the
  /// degraded all-users fallback, so the admin knows the owner filter is not
  /// authoritative. Deliberately a banner rather than a snackbar: it must stay
  /// visible (the list is wrong for the whole session) and must not compete
  /// with the transient action toasts.
  Widget _buildOwnersDegradedBanner(bool isDark) {
    final theme = Theme.of(context);
    final amber = isDark ? const Color(0xFFFFD54F) : const Color(0xFFB26A00);
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 4, 16.w, 0),
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 8.w),
        decoration: BoxDecoration(
          color: amber.withValues(alpha: isDark ? 0.14 : 0.10),
          borderRadius: BorderRadius.circular(8.r),
          border: Border.all(color: amber.withValues(alpha: 0.45)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.warning_amber_rounded, size: 16.w, color: amber),
            SizedBox(width: 8.w),
            Expanded(
              child: Text(
                CopyService.instance.t(
                  'screen.admin_strategies.owners_degraded',
                  fallback:
                      'Could not load exchange-account owners; showing all users.',
                ),
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 12.sp,
                  color: amber,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip({required String label, required VoidCallback onDeleted}) {
    return InputChip(
      label: Text(label, style: TextStyle(fontSize: 12.sp)),
      onDeleted: onDeleted,
      deleteIcon: Icon(Icons.close, size: 14.w),
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }

  /// Check-marked row shared by both popup menus, so filter and sort render
  /// identical selection affordances and only differ in their option source.
  PopupMenuItem<V> _menuItem<V>({
    required V value,
    required String label,
    required bool selected,
    IconData? trailingIcon,
    int height = 44,
  }) {
    final theme = Theme.of(context);
    return PopupMenuItem<V>(
      value: value,
      height: height.toDouble(),
      child: Row(
        children: [
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

  /// All single-select filter groups in one anchored menu, plus dialogs for the
  /// token and owner pickers (a popup cannot host a text field, and the owner
  /// list is too long to inline).
  Widget _buildFilterMenu(bool isDark) {
    final t = CopyService.instance.t;
    final count = _activeFilterCount;
    final primary = Theme.of(context).colorScheme.primary;
    return PopupMenuButton<String>(
      tooltip: t('screen.admin_strategies.filter', fallback: 'Filter'),
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
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      constraints: BoxConstraints(minWidth: 210.w, maxWidth: 250.w),
      onSelected: _onFilterSelected,
      itemBuilder: (context) => [
        _menuHeader(
          t('screen.admin_strategies.filter_group_status', fallback: 'Status'),
        ),
        _menuItem(
          value: 'status:all',
          label: t(
            'screen.admin_strategies.status_all',
            fallback: 'All Status',
          ),
          selected: _statusFilter == 'all',
        ),
        for (final status in const ['active', 'stopped', 'paused', 'error'])
          _menuItem(
            value: 'status:$status',
            label: t(
              'screen.admin_strategies.status_$status',
              fallback: _statusLabel(status),
            ),
            selected: _statusFilter == status,
          ),
        _menuDivider(),
        _menuHeader(
          t('screen.admin_strategies.filter_group_owner', fallback: 'Owner'),
        ),
        _menuItem(
          value: 'owner:pick',
          label: _ownerId == 'all'
              ? t('screen.admin_strategies.owner_all', fallback: 'All Owners')
              : t(
                  'screen.admin_strategies.owner_change',
                  fallback: 'Change owner...',
                ),
          selected: _ownerId != 'all',
        ),
        if (_ownerId != 'all')
          _menuItem(
            value: 'owner:all',
            label: t(
              'screen.admin_strategies.owner_clear',
              fallback: 'Clear owner',
            ),
            selected: false,
          ),
        _menuDivider(),
        _menuHeader(
          t(
            'screen.admin_strategies.filter_group_exchange',
            fallback: 'Exchange',
          ),
        ),
        _menuItem(
          value: 'exchange:all',
          label: t(
            'screen.admin_strategies.exchange_all',
            fallback: 'All Exchanges',
          ),
          selected: _exchangeFilter == 'all',
        ),
        for (final exchange in SupportedExchanges.all)
          _menuItem(
            value: 'exchange:${exchange.id}',
            label: exchange.name,
            selected: _exchangeFilter == exchange.id,
          ),
        _menuDivider(),
        _menuHeader(
          t('screen.admin_strategies.filter_group_token', fallback: 'Token'),
        ),
        _menuItem(
          value: 'token:pick',
          label: _symbol.trim().isEmpty
              ? t(
                  'screen.admin_strategies.token_set',
                  fallback: 'Filter by token...',
                )
              : t(
                  'screen.admin_strategies.token_change',
                  fallback: 'Token: {{symbol}}',
                ).replaceAll('{{symbol}}', _symbol.trim()),
          selected: _symbol.trim().isNotEmpty,
        ),
        if (_activeFilterCount > 0) ...[
          _menuDivider(),
          PopupMenuItem<String>(
            value: 'clear',
            height: 46,
            child: Row(
              children: [
                Icon(Icons.restart_alt, size: 18.w, color: primary),
                SizedBox(width: 8.w),
                Text(
                  t(
                    'screen.admin_strategies.filter_clear',
                    fallback: 'Clear filters',
                  ),
                  style: TextStyle(
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w600,
                    color: primary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  /// Menu values are `group:value` pairs so one popup can drive the filter
  /// state; `pick` values open a secondary picker instead of selecting.
  void _onFilterSelected(String value) {
    if (value == 'clear') {
      _clearFilters();
      return;
    }
    if (value == 'owner:pick') {
      _pickOwner();
      return;
    }
    if (value == 'token:pick') {
      _promptSymbol();
      return;
    }
    final sep = value.indexOf(':');
    if (sep <= 0) return;
    final group = value.substring(0, sep);
    final picked = value.substring(sep + 1);
    _applyFilter(() {
      switch (group) {
        case 'status':
          _statusFilter = picked;
        case 'exchange':
          _exchangeFilter = picked;
        case 'owner':
          _ownerId = picked;
          _ownerLabelCache = _ownerLabel(picked);
      }
    });
  }

  /// Sort menu: six single-select keys with an explicit direction pair, so the
  /// menu and the rendered ordering can never disagree.
  Widget _buildSortMenu(bool isDark) {
    final t = CopyService.instance.t;
    final primary = Theme.of(context).colorScheme.primary;
    const options = <(String, String)>[
      ('createdAt', 'Created'),
      ('name', 'Strategy'),
      ('symbol', 'Token'),
      ('exchange', 'Exchange'),
      ('status', 'Status'),
      ('totalPnL', 'PnL'),
      ('roi', 'ROI'),
    ];
    return PopupMenuButton<String>(
      tooltip: t('screen.admin_strategies.sort', fallback: 'Sort by'),
      icon: Icon(Icons.swap_vert, size: 22.w, color: primary),
      color: isDark ? Colors.grey[900] : Colors.white,
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      constraints: BoxConstraints(minWidth: 190.w, maxWidth: 230.w),
      onSelected: (value) {
        if (value.startsWith('dir:')) {
          setState(() {
            _sortAscending = value.substring(4) == 'asc';
            _page = 1;
          });
          _load();
          return;
        }
        _applySort(value);
      },
      itemBuilder: (context) => [
        _menuHeader(t('screen.admin_strategies.sort', fallback: 'Sort by')),
        for (final (key, fallback) in options)
          _menuItem(
            value: key,
            label: t(
              'screen.admin_strategies.sort_by_$key',
              fallback: fallback,
            ),
            selected: _sortKey == key,
            trailingIcon: _sortKey == key
                ? (_sortAscending ? Icons.arrow_upward : Icons.arrow_downward)
                : null,
          ),
        _menuDivider(),
        _menuItem(
          value: 'dir:asc',
          label: t(
            'screen.admin_strategies.sort_ascending',
            fallback: 'Ascending',
          ),
          selected: _sortAscending,
          height: 40,
        ),
        _menuItem(
          value: 'dir:desc',
          label: t(
            'screen.admin_strategies.sort_descending',
            fallback: 'Descending',
          ),
          selected: !_sortAscending,
          height: 40,
        ),
      ],
    );
  }

  /// Searchable owner picker (bottom sheet) — a popup menu cannot hold the
  /// thousands of candidate users the endpoint can return.
  Future<void> _pickOwner() async {
    final t = CopyService.instance.t;
    if (!_ownersAvailable || _ownerOptions.isEmpty) {
      _showMessage(
        t(
          'screen.admin_strategies.owners_unavailable',
          fallback: 'Owner list unavailable. Try refreshing.',
        ),
        isError: true,
      );
      return;
    }
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (context) =>
          _OwnerPickerSheet(owners: _ownerOptions, selectedId: _ownerId),
    );
    if (picked == null || !mounted) return;
    _applyFilter(() {
      _ownerId = picked;
      _ownerLabelCache = _ownerLabel(picked);
    });
  }

  /// Token filter prompt — mirrors the web console's inline `Token (e.g. BTC)`
  /// input, which has no room in the mobile toolbar. Owns its controller in a
  /// State so it is released with the route, never while the dialog's exit
  /// transition is still rendering the text field.
  Future<void> _promptSymbol() async {
    final value = await showDialog<String>(
      context: context,
      builder: (context) => _TokenPromptDialog(initial: _symbol),
    );
    if (value == null || !mounted) return;
    final symbol = value.trim();
    _applyFilter(() => _symbol = symbol);
  }

  Widget _buildStrategyCard(AdminStrategy strategy, bool isDark) {
    final busy = _actingIds.contains(strategy.id);
    final pnl = strategy.performance?.totalPnL;
    final roi = strategy.performance?.roi;
    final muted = TextStyle(fontSize: 12.sp, color: Colors.grey[600]);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: busy ? null : () => _openActions(strategy),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? Colors.grey[900] : Colors.white.withOpacity(0.6),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark ? Colors.grey[850]! : Colors.grey.withOpacity(0.1),
          ),
        ),
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Token icon — same network-icon treatment as the user-side
                // strategy list (CryptoIcons serves /crypto-icons/{base}@2x),
                // letter fallback when the asset 404s.
                _buildTokenIcon(strategy),
                SizedBox(width: 10.w),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        strategy.name,
                        style: TextStyle(
                          fontSize: 15.sp,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        strategy.symbol?.isNotEmpty == true
                            ? strategy.symbol!
                            : strategy.type,
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: Colors.grey[600],
                          fontWeight: strategy.symbol?.isNotEmpty == true
                              ? FontWeight.w600
                              : FontWeight.w400,
                          fontFamily: strategy.symbol?.isNotEmpty == true
                              ? 'monospace'
                              : null,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                _buildStatusBadge(strategy.status),
                if (busy) ...[
                  SizedBox(width: 8.w),
                  SizedBox(
                    width: 16.w,
                    height: 16.w,
                    child: const CircularProgressIndicator(strokeWidth: 2),
                  ),
                ] else ...[
                  SizedBox(width: 4.w),
                  Icon(Icons.more_vert, size: 20.w, color: Colors.grey[500]),
                ],
              ],
            ),
            SizedBox(height: 8.w),
            Row(
              children: [
                Icon(Icons.person_outline, size: 13.w, color: Colors.grey[600]),
                SizedBox(width: 4.w),
                Expanded(
                  child: Text(
                    strategy.ownerLabel,
                    style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (strategy.ownerSubLabel.isNotEmpty) ...[
                  SizedBox(width: 6.w),
                  // Flexible (not a bare Text): a Row gives non-flex children
                  // unbounded width, so a long email would overflow the card
                  // instead of ellipsising.
                  Flexible(
                    child: Text(
                      strategy.ownerSubLabel,
                      style: muted,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.end,
                    ),
                  ),
                ],
              ],
            ),
            SizedBox(height: 6.w),
            Row(
              children: [
                // Exchange chip: real logo (network, letter fallback) +
                // exchange name, colored with the exchange brand color.
                _buildExchangeChip(strategy),
                const Spacer(),
                Text(_formatDate(strategy.createdAt), style: muted),
              ],
            ),
            SizedBox(height: 8.w),
            Row(
              children: [
                CopyText(
                  'screen.admin_strategies.pnl',
                  fallback: 'PnL',
                  style: muted,
                ),
                SizedBox(width: 4.w),
                Text(
                  _formatCurrency(pnl),
                  style: TextStyle(
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w700,
                    color: _pnlColor(pnl, isDark),
                  ),
                ),
                SizedBox(width: 16.w),
                CopyText(
                  'screen.admin_strategies.roi',
                  fallback: 'ROI',
                  style: muted,
                ),
                SizedBox(width: 4.w),
                Text(
                  _formatPercent(roi),
                  style: TextStyle(
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w700,
                    color: _pnlColor(roi, isDark),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Circular token icon from the symbol's base currency, mirroring the
  /// user-side strategy list card (`CryptoIcons.getIconUrl`). Falls back to
  /// the first letter on load failure, and to a generic exchange glyph when
  /// there is no symbol at all.
  Widget _buildTokenIcon(AdminStrategy strategy) {
    final symbol = strategy.symbol?.trim() ?? '';
    final baseCurrency = symbol.isEmpty ? '' : _extractBase(symbol);
    final size = 34.w;
    if (baseCurrency.isEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: Colors.grey[300],
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.currency_exchange, size: 16.w, color: Colors.grey),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(size),
      child: Image.network(
        CryptoIcons.getIconUrl(baseCurrency),
        width: size,
        height: size,
        errorBuilder: (context, error, stackTrace) => Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Colors.grey[300],
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              baseCurrency.substring(0, 1).toUpperCase(),
              style: TextStyle(
                fontSize: 14.sp,
                fontWeight: FontWeight.bold,
                color: Colors.grey[700],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// `BTCUSDT` / `BTC-USDT-SWAP` / `BTC/USDT:USDT` → `BTC`. Local mirror of
  /// [CryptoIcons]'s own extractor, kept here so the icon and any future
  /// symbol display always agree.
  String _extractBase(String symbol) {
    var s = symbol;
    if (s.contains(':')) s = s.split(':').first;
    if (s.contains('/')) return s.split('/').first;
    if (s.contains('-')) return s.split('-').first;
    const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB', 'BUSD'];
    for (final quote in quotes) {
      if (s.length > quote.length && s.toUpperCase().endsWith(quote)) {
        return s.substring(0, s.length - quote.length);
      }
    }
    return s;
  }

  /// Exchange pill: real square logo (white box, network image with letter
  /// fallback — same treatment as the user-side list's `_ExchangeLogo`) plus
  /// the exchange name in its brand color.
  Widget _buildExchangeChip(AdminStrategy strategy) {
    final exchangeId = strategy.exchange?.trim() ?? '';
    if (exchangeId.isEmpty) {
      return Text(
        'N/A',
        style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
      );
    }
    final config = SupportedExchanges.getById(exchangeId);
    final logoUrl = config?.getLogoUrl();
    // getName can only be empty if the raw id is empty, which the guard above
    // already excludes — but never substring blind: the letter fallback must
    // not throw RangeError if that contract ever changes.
    final name = SupportedExchanges.getName(exchangeId);
    final color = SupportedExchanges.getColor(exchangeId);
    final letter = name.isNotEmpty
        ? name.substring(0, 1)
        : exchangeId.substring(0, 1);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 18.w,
          height: 18.w,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: Colors.grey[300]!, width: 0.5),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3.5),
            child: logoUrl != null
                ? Image.network(
                    logoUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => Center(
                      child: Text(
                        letter,
                        style: TextStyle(
                          fontSize: 10.sp,
                          fontWeight: FontWeight.bold,
                          color: color,
                        ),
                      ),
                    ),
                  )
                : Center(
                    child: Text(
                      letter,
                      style: TextStyle(
                        fontSize: 10.sp,
                        fontWeight: FontWeight.bold,
                        color: color,
                      ),
                    ),
                  ),
          ),
        ),
        SizedBox(width: 5.w),
        Text(
          name,
          style: TextStyle(
            fontSize: 12.sp,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }

  Color _pnlColor(double? value, bool isDark) {
    if (value == null) return Colors.grey[600]!;
    return value >= 0 ? ColorTokens.profitGreen : ColorTokens.lossRed;
  }

  Widget _buildStatusBadge(String status) {
    final color = switch (status) {
      'active' => ColorTokens.profitGreen,
      'paused' => Colors.amber.shade700,
      'error' => ColorTokens.lossRed,
      _ => Colors.grey[600]!,
    };
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.35), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Leading status dot: makes the state readable at a glance even
          // before the localized label is read (zh/en switch changes the
          // label, the dot never changes meaning).
          Container(
            width: 6.w,
            height: 6.w,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          SizedBox(width: 5.w),
          Text(
            CopyService.instance.t(
              'screen.admin_strategies.status_$status',
              fallback: _statusLabel(status),
            ),
            style: TextStyle(
              fontSize: 11.sp,
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  /// Opens the strategy detail page for any user's strategy — the mobile
  /// counterpart of the web list's strategy-name link to `/strategy/{id}`.
  /// The detail screen decides owner-vs-read-only affordances itself:
  /// when the signed-in admin IS the owner it behaves exactly like the
  /// user-side detail page (full control via the owner-scoped routes);
  /// otherwise it is a strictly read-only admin view.
  ///
  /// The list row is converted to a seed [Strategy] for the initial paint;
  /// the detail screen immediately re-fetches, so the seed only needs the
  /// always-present fields.
  void _openDetail(AdminStrategy strategy) {
    final viewerId = AuthService.instance.user?.id;
    final isOwner =
        viewerId != null && viewerId.isNotEmpty && viewerId == strategy.userId;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StrategyDetailScreen(
          strategy: Strategy(
            id: strategy.id,
            name: strategy.name,
            type: strategy.type,
            status: strategy.status,
            exchange: strategy.exchange,
            symbol: strategy.symbol,
            createdAt:
                strategy.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0),
            updatedAt:
                strategy.updatedAt ?? DateTime.fromMillisecondsSinceEpoch(0),
          ),
          crossOwnerAdmin: !isOwner,
        ),
      ),
    );
  }

  /// Per-strategy actions — the mobile equivalent of the web row's dropdown.
  /// Edit and Delete stay disabled for ACTIVE strategies because the API
  /// rejects both; Stop/Start is the only way to make them editable.
  Future<void> _openActions(AdminStrategy strategy) async {
    final isActive = strategy.isActive;
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(16.w, 14, 16, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      strategy.name,
                      style: TextStyle(
                        fontSize: 15.sp,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  _buildStatusBadge(strategy.status),
                ],
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.visibility_outlined),
              title: CopyText(
                'screen.admin_strategies.action_view',
                fallback: 'View details',
              ),
              onTap: () {
                Navigator.pop(sheetContext);
                _openDetail(strategy);
              },
            ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: CopyText(
                'screen.admin_strategies.action_edit',
                fallback: 'Edit',
              ),
              enabled: !isActive,
              subtitle: isActive
                  ? CopyText(
                      'screen.admin_strategies.action_edit_blocked',
                      fallback: 'Stop the strategy first',
                      style: TextStyle(fontSize: 11.sp),
                    )
                  : null,
              onTap: () {
                Navigator.pop(sheetContext);
                _openEditDialog(strategy);
              },
            ),
            ListTile(
              leading: Icon(
                isActive
                    ? Icons.stop_circle_outlined
                    : Icons.play_circle_outline,
                color: isActive ? ColorTokens.lossRed : ColorTokens.profitGreen,
              ),
              title: CopyText(
                isActive
                    ? 'screen.admin_strategies.action_stop'
                    : 'screen.admin_strategies.action_start',
                fallback: isActive ? 'Stop' : 'Start',
              ),
              onTap: () {
                Navigator.pop(sheetContext);
                _changeStatus(strategy, isActive ? 'stopped' : 'active');
              },
            ),
            ListTile(
              leading: const Icon(Icons.copy_all_outlined),
              title: CopyText(
                'screen.admin_strategies.action_clone',
                fallback: 'Clone to user...',
              ),
              onTap: () {
                Navigator.pop(sheetContext);
                _openCloneDialog(strategy);
              },
            ),
            const Divider(height: 1),
            ListTile(
              leading: Icon(
                Icons.delete_outline,
                color: isActive ? Colors.grey : ColorTokens.lossRed,
              ),
              title: CopyText(
                'screen.admin_strategies.action_delete',
                fallback: 'Delete',
                style: TextStyle(
                  color: isActive ? Colors.grey : ColorTokens.lossRed,
                ),
              ),
              subtitle: isActive
                  ? CopyText(
                      'screen.admin_strategies.action_delete_blocked',
                      fallback: 'Stop the strategy first',
                      style: TextStyle(fontSize: 11.sp),
                    )
                  : null,
              enabled: !isActive,
              onTap: () {
                Navigator.pop(sheetContext);
                _openDeleteDialog(strategy);
              },
            ),
            SizedBox(height: 6.w),
            TextButton(
              onPressed: () => Navigator.pop(sheetContext),
              child: CopyText('common.cancel', fallback: 'Cancel'),
            ),
          ],
        ),
      ),
    );
  }

  /// Rows-per-page picker plus a prev/next pager, mirroring the web console.
  Widget _buildPagination(bool isDark) {
    final t = CopyService.instance.t;
    final totalPages = _totalPages;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 4),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: isDark ? Colors.grey[850]! : Colors.grey.withOpacity(0.15),
          ),
        ),
      ),
      child: Row(
        children: [
          PopupMenuButton<int>(
            enabled: !_loading,
            tooltip: t(
              'screen.admin_strategies.rows_per_page',
              fallback: 'Rows per page',
            ),
            onSelected: (size) {
              setState(() {
                _pageSize = size;
                _page = 1;
              });
              _load();
            },
            itemBuilder: (context) => [
              for (final size in const [25, 50, 100])
                _menuItem<int>(
                  value: size,
                  label: '$size',
                  selected: _pageSize == size,
                  height: 40,
                ),
            ],
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 6),
              child: Row(
                children: [
                  Text(
                    t(
                      'screen.admin_strategies.rows_per_page',
                      fallback: 'Rows per page',
                    ),
                    style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
                  ),
                  SizedBox(width: 6.w),
                  Text(
                    '$_pageSize',
                    style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Icon(
                    Icons.arrow_drop_down,
                    size: 18.w,
                    color: Colors.grey[600],
                  ),
                ],
              ),
            ),
          ),
          const Spacer(),
          Text(
            t(
                  'screen.admin_strategies.page_of',
                  fallback: 'Page {{page}} of {{total}}',
                )
                .replaceAll('{{page}}', '$_page')
                .replaceAll('{{total}}', '$totalPages'),
            style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
          ),
          IconButton(
            iconSize: 20.w,
            visualDensity: VisualDensity.compact,
            onPressed: _loading || _page <= 1
                ? null
                : () {
                    setState(() => _page -= 1);
                    _load();
                  },
            icon: const Icon(Icons.chevron_left),
          ),
          IconButton(
            iconSize: 20.w,
            visualDensity: VisualDensity.compact,
            onPressed: _loading || _page >= totalPages
                ? null
                : () {
                    setState(() => _page += 1);
                    _load();
                  },
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
    );
  }

  static String _statusLabel(String status) {
    switch (status) {
      case 'active':
        return 'Active';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      case 'stopped':
        return 'Stopped';
      default:
        return status.isEmpty ? 'Unknown' : status;
    }
  }

  /// `Sep 9, 2026`, matching the web console's `Intl.DateTimeFormat` output.
  static String _formatDate(DateTime? date) {
    if (date == null) return 'N/A';
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
    final local = date.toLocal();
    return '${months[local.month - 1]} ${local.day}, ${local.year}';
  }

  /// `N/A` or `$1,234,567.89` (negative sign inside the symbol, e.g.
  /// `$-1.00`, which is how the other mobile screens render currency).
  ///
  /// Note: the web console uses `Intl.NumberFormat` currency, which places the
  /// sign before the symbol (`-$1.00`). The digits and grouping are identical;
  /// only the sign placement differs, and this keeps parity with mobile.
  static String _formatCurrency(double? value) {
    if (value == null) return 'N/A';
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

  /// `N/A` or `+1.23%`, matching the web console's percent output.
  static String _formatPercent(double? value) {
    if (value == null) return 'N/A';
    return '${value >= 0 ? '+' : ''}${value.toStringAsFixed(2)}%';
  }
}

/// Single-field prompt for the token filter. Pops the entered text (possibly
/// empty, so the admin can clear the filter) or `null` on cancel.
class _TokenPromptDialog extends StatefulWidget {
  const _TokenPromptDialog({required this.initial});

  final String initial;

  @override
  State<_TokenPromptDialog> createState() => _TokenPromptDialogState();
}

class _TokenPromptDialogState extends State<_TokenPromptDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = CopyService.instance.t;
    return AlertDialog(
      title: CopyText(
        'screen.admin_strategies.token_title',
        fallback: 'Filter by token',
      ),
      content: TextField(
        controller: _controller,
        autofocus: true,
        textCapitalization: TextCapitalization.characters,
        decoration: InputDecoration(
          hintText: t(
            'screen.admin_strategies.token_hint',
            fallback: 'e.g. BTC',
          ),
        ),
        onSubmitted: (v) => Navigator.pop(context, v),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: CopyText('common.cancel', fallback: 'Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: CopyText('common.apply', fallback: 'Apply'),
        ),
      ],
    );
  }
}

/// Submission payload from the clone dialog.
class _CloneSubmission {
  final String targetUserId;
  final String name;
  final bool start;

  const _CloneSubmission({
    required this.targetUserId,
    required this.name,
    required this.start,
  });
}

/// Edit form for a single strategy. Pops the CHANGED-FIELDS-ONLY map so the
/// admin audit record stays readable and untouched legacy fields (e.g. an
/// `exchange` no longer in the supported list) can never fail validation and
/// lock the record. Pops `null` on cancel.
class _EditStrategyDialog extends StatefulWidget {
  const _EditStrategyDialog({required this.strategy});

  final AdminStrategy strategy;

  @override
  State<_EditStrategyDialog> createState() => _EditStrategyDialogState();
}

class _EditStrategyDialogState extends State<_EditStrategyDialog> {
  late final TextEditingController _name;
  late final TextEditingController _description;
  late final TextEditingController _type;
  late final TextEditingController _symbol;
  late final TextEditingController _parameters;
  String _exchange = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    final s = widget.strategy;
    _name = TextEditingController(text: s.name);
    _description = TextEditingController(text: s.description ?? '');
    _type = TextEditingController(text: s.type);
    _symbol = TextEditingController(text: s.symbol ?? '');
    _parameters = TextEditingController(
      text: s.parameters == null || s.parameters!.isEmpty
          ? ''
          : const JsonEncoder.withIndent('  ').convert(s.parameters),
    );
    _exchange = s.exchange ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _type.dispose();
    _symbol.dispose();
    _parameters.dispose();
    super.dispose();
  }

  void _save() {
    final s = widget.strategy;
    final nextName = _name.text.trim();
    if (nextName.isEmpty) {
      setState(
        () => _error = CopyService.instance.t(
          'screen.admin_strategies.edit_name_required',
          fallback: 'Name is required',
        ),
      );
      return;
    }
    final nextType = _type.text.trim();
    if (nextType.isEmpty) {
      setState(
        () => _error = CopyService.instance.t(
          'screen.admin_strategies.edit_type_required',
          fallback: 'Type is required',
        ),
      );
      return;
    }

    Map<String, dynamic>? parsedParameters;
    final rawParameters = _parameters.text.trim();
    if (rawParameters.isNotEmpty) {
      final decoded = _tryDecodeJson(rawParameters);
      if (decoded == null) {
        setState(
          () => _error = CopyService.instance.t(
            'screen.admin_strategies.edit_json_invalid',
            fallback: 'Parameters must be valid JSON',
          ),
        );
        return;
      }
      parsedParameters = decoded;
    }

    final updates = <String, dynamic>{};
    if (nextName != s.name) updates['name'] = nextName;
    final nextDescription = _description.text.trim();
    if (nextDescription != (s.description ?? '')) {
      updates['description'] = nextDescription;
    }
    if (nextType != s.type) updates['type'] = nextType;
    if (_exchange.isNotEmpty && _exchange != (s.exchange ?? '')) {
      updates['exchange'] = _exchange;
    }
    final nextSymbol = _symbol.text.trim();
    if (nextSymbol.isNotEmpty && nextSymbol != (s.symbol ?? '')) {
      updates['symbol'] = nextSymbol;
    }
    if (parsedParameters != null &&
        jsonEncode(parsedParameters) != jsonEncode(s.parameters)) {
      updates['parameters'] = parsedParameters;
    }

    Navigator.pop(context, updates);
  }

  @override
  Widget build(BuildContext context) {
    final t = CopyService.instance.t;
    return AlertDialog(
      title: CopyText(
        'screen.admin_strategies.edit_title',
        fallback: 'Edit strategy',
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t(
                'screen.admin_strategies.edit_subtitle',
                fallback:
                    'Editing a strategy owned by {{owner}}. Active strategies '
                    'must be stopped first.',
              ).replaceAll('{{owner}}', widget.strategy.ownerLabel),
              style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 12.w),
            _field(
              label: t('screen.admin_strategies.field_name', fallback: 'Name'),
              controller: _name,
              maxLength: 255,
            ),
            _field(
              label: t(
                'screen.admin_strategies.field_description',
                fallback: 'Description',
              ),
              controller: _description,
            ),
            Row(
              children: [
                Expanded(
                  child: _field(
                    label: t(
                      'screen.admin_strategies.field_type',
                      fallback: 'Type',
                    ),
                    controller: _type,
                  ),
                ),
                SizedBox(width: 10.w),
                Expanded(
                  child: _field(
                    label: t(
                      'screen.admin_strategies.field_symbol',
                      fallback: 'Token / Symbol',
                    ),
                    controller: _symbol,
                  ),
                ),
              ],
            ),
            Text(
              t('screen.admin_strategies.field_exchange', fallback: 'Exchange'),
              style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 4.w),
            DropdownButtonFormField<String>(
              value: SupportedExchanges.all.any((e) => e.id == _exchange)
                  ? _exchange
                  : null,
              isExpanded: true,
              decoration: const InputDecoration(
                isDense: true,
                border: OutlineInputBorder(),
              ),
              hint: Text(
                t(
                  'screen.admin_strategies.exchange_hint',
                  fallback: 'Select exchange',
                ),
                style: TextStyle(fontSize: 13.sp),
              ),
              items: [
                for (final exchange in SupportedExchanges.all)
                  DropdownMenuItem(
                    value: exchange.id,
                    child: Text(
                      exchange.name,
                      style: TextStyle(fontSize: 13.sp),
                    ),
                  ),
              ],
              onChanged: (value) => setState(() => _exchange = value ?? ''),
            ),
            _field(
              label: t(
                'screen.admin_strategies.field_parameters',
                fallback: 'Parameters (JSON)',
              ),
              controller: _parameters,
              maxLines: 6,
              monospace: true,
            ),
            if (_error != null) ...[
              SizedBox(height: 8.w),
              Text(
                _error!,
                style: TextStyle(fontSize: 12.sp, color: Colors.red),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: CopyText('common.cancel', fallback: 'Cancel'),
        ),
        FilledButton(
          onPressed: _save,
          child: CopyText('common.save', fallback: 'Save'),
        ),
      ],
    );
  }

  Widget _field({
    required String label,
    required TextEditingController controller,
    int maxLines = 1,
    bool monospace = false,
    int? maxLength,
  }) {
    return Padding(
      padding: EdgeInsets.only(bottom: 10.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
          ),
          SizedBox(height: 4.w),
          TextField(
            controller: controller,
            maxLines: maxLines,
            maxLength: maxLength,
            style: TextStyle(
              fontSize: 13.sp,
              fontFamily: monospace ? 'monospace' : null,
            ),
            decoration: InputDecoration(
              isDense: true,
              counterText: '',
              border: const OutlineInputBorder(),
            ),
          ),
        ],
      ),
    );
  }
}

/// Clone dialog: picks a target owner, an (editable) clone name and whether to
/// start it immediately. Pops a [_CloneSubmission]; `null` on cancel.
class _CloneStrategyDialog extends StatefulWidget {
  const _CloneStrategyDialog({
    required this.strategy,
    required this.owners,
    required this.ownersBound,
  });

  final AdminStrategy strategy;
  final List<AdminStrategyOwnerOption> owners;
  final bool ownersBound;

  @override
  State<_CloneStrategyDialog> createState() => _CloneStrategyDialogState();
}

class _CloneStrategyDialogState extends State<_CloneStrategyDialog> {
  late final TextEditingController _name;
  String _targetUserId = '';
  bool _start = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Pre-filled with the SOURCE name (cross-user clones are not renamed); the
    // API suffixes `_copy`, `_copy2`, … on collision.
    _name = TextEditingController(text: widget.strategy.name);
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    final t = CopyService.instance.t;
    if (_targetUserId.isEmpty) {
      setState(
        () => _error = t(
          'screen.admin_strategies.clone_select_target',
          fallback: 'Select a target user',
        ),
      );
      return;
    }
    if (_name.text.trim().isEmpty) {
      setState(
        () => _error = t(
          'screen.admin_strategies.clone_name_required',
          fallback: 'Name is required',
        ),
      );
      return;
    }
    Navigator.pop(
      context,
      _CloneSubmission(
        targetUserId: _targetUserId,
        name: _name.text.trim(),
        start: _start,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = CopyService.instance.t;
    final strategy = widget.strategy;
    final exchangeName = strategy.exchange?.isNotEmpty == true
        ? SupportedExchanges.getName(strategy.exchange)
        : '';
    // Joined with a neutral separator rather than the English word "on",
    // which would read as a language mix inside the zh subtitle.
    final binding = [
      strategy.symbol?.trim() ?? '',
      if (exchangeName.isNotEmpty) exchangeName,
    ].where((p) => p.isNotEmpty).join(' · ');
    return AlertDialog(
      title: CopyText(
        'screen.admin_strategies.clone_title',
        fallback: 'Clone strategy to another user',
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t(
                    'screen.admin_strategies.clone_subtitle',
                    fallback:
                        'Copy "{{name}}"{{binding}} - the clone is created as '
                        'STOPPED unless you start it.',
                  )
                  .replaceAll('{{name}}', strategy.name)
                  .replaceAll(
                    '{{binding}}',
                    binding.isEmpty ? '' : ' ($binding)',
                  ),
              style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 12.w),
            Text(
              t(
                'screen.admin_strategies.clone_target',
                fallback: 'Target user',
              ),
              style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 4.w),
            if (widget.owners.isEmpty)
              Text(
                widget.ownersBound
                    ? t(
                        'screen.admin_strategies.clone_no_bound_users',
                        fallback: 'No users with a bound exchange account',
                      )
                    : t(
                        'screen.admin_strategies.clone_no_users',
                        fallback: 'No users',
                      ),
                style: TextStyle(fontSize: 13.sp, color: Colors.grey[600]),
              )
            else
              // `value:` (not `initialValue:`) is deliberate: the selection lives in
              // this dialog's State and is re-read on every rebuild, whereas
              // FormField honours `initialValue` only on its first build, so a
              // later setState would leave the dropdown stale. The deprecation
              // is informational and the repo does not gate on it.
              DropdownButtonFormField<String>(
                value: _targetUserId.isEmpty ? null : _targetUserId,
                isExpanded: true,
                decoration: const InputDecoration(
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                hint: Text(
                  t(
                    'screen.admin_strategies.clone_select_target_hint',
                    fallback: 'Select target user',
                  ),
                  style: TextStyle(fontSize: 13.sp),
                ),
                items: [
                  for (final owner in widget.owners)
                    DropdownMenuItem(
                      value: owner.id,
                      child: Text(
                        owner.subLabel.isEmpty
                            ? owner.label
                            : '${owner.label} · ${owner.subLabel}',
                        style: TextStyle(fontSize: 13.sp),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (value) =>
                    setState(() => _targetUserId = value ?? ''),
              ),
            SizedBox(height: 4.w),
            Text(
              widget.ownersBound
                  ? t(
                      'screen.admin_strategies.clone_bound_note',
                      fallback:
                          'Only users with a bound exchange account are listed.',
                    )
                  : t(
                      'screen.admin_strategies.clone_all_note',
                      fallback:
                          'Could not verify exchange accounts - showing all users.',
                    ),
              style: TextStyle(fontSize: 11.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 12.w),
            Text(
              t('screen.admin_strategies.clone_name', fallback: 'Clone name'),
              style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 4.w),
            TextField(
              controller: _name,
              maxLength: 255,
              style: TextStyle(fontSize: 13.sp),
              decoration: const InputDecoration(
                isDense: true,
                counterText: '',
                border: OutlineInputBorder(),
              ),
            ),
            Text(
              t(
                'screen.admin_strategies.clone_name_note',
                fallback:
                    'Defaults to the original name. If the target user already '
                    'has a strategy with this name, a _copy suffix is added.',
              ),
              style: TextStyle(fontSize: 11.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 8.w),
            Row(
              children: [
                Switch(
                  value: _start,
                  onChanged: (v) => setState(() => _start = v),
                ),
                Expanded(
                  child: CopyText(
                    'screen.admin_strategies.clone_start',
                    fallback: 'Start the clone immediately',
                    style: TextStyle(fontSize: 13.sp),
                  ),
                ),
              ],
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(fontSize: 12.sp, color: Colors.red),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: CopyText('common.cancel', fallback: 'Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: CopyText(
            'screen.admin_strategies.clone_button',
            fallback: 'Clone',
          ),
        ),
      ],
    );
  }
}

/// Searchable owner list used by the owner filter.
class _OwnerPickerSheet extends StatefulWidget {
  const _OwnerPickerSheet({required this.owners, required this.selectedId});

  final List<AdminStrategyOwnerOption> owners;
  final String selectedId;

  @override
  State<_OwnerPickerSheet> createState() => _OwnerPickerSheetState();
}

class _OwnerPickerSheetState extends State<_OwnerPickerSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = CopyService.instance.t;
    final query = _controller.text;
    final filtered = widget.owners.where((o) => o.matches(query)).toList();
    final media = MediaQuery.of(context);
    // A flat 0.7 * screen height is stacked on top of the keyboard inset, so on
    // a short device the total exceeds the screen and the title/search box get
    // clipped. Cap to what is actually left above the keyboard.
    final available =
        media.size.height - media.viewInsets.bottom - media.padding.top;
    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: SizedBox(
        height: math.min(media.size.height * 0.7, available),
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(16.w, 14, 16.w, 8.w),
              child: CopyText(
                'screen.admin_strategies.owner_picker_title',
                fallback: 'Filter by owner',
                style: TextStyle(fontSize: 15.sp, fontWeight: FontWeight.w700),
              ),
            ),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 16.w),
              child: TextField(
                controller: _controller,
                autofocus: false,
                style: TextStyle(fontSize: 13.sp),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: t(
                    'screen.admin_strategies.owner_search_hint',
                    fallback: 'Search users...',
                  ),
                  prefixIcon: Icon(Icons.search, size: 18.w),
                  border: const OutlineInputBorder(),
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
            SizedBox(height: 6.w),
            Expanded(
              child: ListView.builder(
                itemCount: filtered.length,
                itemBuilder: (context, index) {
                  final owner = filtered[index];
                  return ListTile(
                    dense: true,
                    title: Text(
                      owner.label,
                      style: TextStyle(fontSize: 14.sp),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: owner.subLabel.isEmpty
                        ? null
                        : Text(
                            owner.subLabel,
                            style: TextStyle(fontSize: 11.sp),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                    trailing: owner.id == widget.selectedId
                        ? Icon(
                            Icons.check,
                            size: 18.w,
                            color: Theme.of(context).colorScheme.primary,
                          )
                        : null,
                    onTap: () => Navigator.pop(context, owner.id),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tolerant JSON decoder: returns a `Map` only for a JSON object (the API's
/// `parameters` field is an object, never an array or scalar). `null` signals
/// invalid JSON to the caller.
Map<String, dynamic>? _tryDecodeJson(String raw) {
  try {
    final decoded = jsonDecode(raw);
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
    return null;
  } catch (_) {
    return null;
  }
}
