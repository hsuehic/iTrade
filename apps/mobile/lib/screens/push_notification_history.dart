import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../services/notification.dart';
import '../services/preference.dart';
import '../services/copy_service.dart';
import 'push_notification_detail.dart';
import '../widgets/copy_text.dart';

class PushNotificationHistoryItem {
  final String id;
  final DateTime createdAt;
  final String category;
  final String? title;
  final String? body;
  final Map<String, dynamic>? data;

  PushNotificationHistoryItem({
    required this.id,
    required this.createdAt,
    required this.category,
    required this.title,
    required this.body,
    required this.data,
  });

  factory PushNotificationHistoryItem.fromJson(Map<String, dynamic> json) {
    final notification = json['notification'];
    final notificationMap = notification is Map ? notification : null;
    final data = json['data'];
    final dataMap = data is Map ? Map<String, dynamic>.from(data) : null;

    return PushNotificationHistoryItem(
      id: json['id']?.toString() ?? '',
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      category: json['category']?.toString() ?? 'general',
      title: notificationMap?['title']?.toString(),
      body: notificationMap?['body']?.toString(),
      data: dataMap,
    );
  }
}

class PushNotificationHistoryScreen extends StatefulWidget {
  const PushNotificationHistoryScreen({super.key});

  @override
  State<PushNotificationHistoryScreen> createState() =>
      _PushNotificationHistoryScreenState();
}

class _PushNotificationHistoryScreenState
    extends State<PushNotificationHistoryScreen> {
  final List<PushNotificationHistoryItem> _items = [];
  final Set<String> _readIds = <String>{};
  bool _loading = true;
  int _lastSyncedBadgeCount = -1;
  bool _refreshInFlight = false;
  bool _refreshQueued = false;
  late final VoidCallback _historyUpdateListener;
  String _statusFilter = 'all';
  String _selectedDayKey = _dayKey(DateTime.now());
  String _dayScope = _dateDaysScope;
  final Map<String, GlobalKey> _dayItemKeys = <String, GlobalKey>{};

  static const String _allDaysKey = 'all';
  static const String _allDaysScope = 'all';
  static const String _dateDaysScope = 'date';
  static const int _selectorDaysWindow = 30;

  int get _unreadCount =>
      _items.where((item) => !_readIds.contains(item.id)).length;

  List<_DayBucket> get _dayBuckets {
    final map = <String, _DayBucket>{};
    for (final item in _items) {
      final dayDate = _normalizeDay(item.createdAt);
      final key = _dayKey(dayDate);
      final existing = map[key];
      if (existing == null) {
        map[key] = _DayBucket(
          key: key,
          date: dayDate,
          total: 1,
          unread: _readIds.contains(item.id) ? 0 : 1,
        );
      } else {
        map[key] = existing.copyWith(
          total: existing.total + 1,
          unread: existing.unread + (_readIds.contains(item.id) ? 0 : 1),
        );
      }
    }
    final list = map.values.toList()..sort((a, b) => b.date.compareTo(a.date));
    return list;
  }

  List<_DayBucket> get _selectorDayBuckets {
    final dayMap = <String, _DayBucket>{
      for (final day in _dayBuckets) day.key: day,
    };
    final today = _normalizeDay(DateTime.now());
    final list = <_DayBucket>[];
    for (var i = 0; i < _selectorDaysWindow; i++) {
      final date = today.subtract(Duration(days: i));
      final key = _dayKey(date);
      final existing = dayMap[key];
      list.add(
        existing ?? _DayBucket(key: key, date: date, total: 0, unread: 0),
      );
    }
    return list;
  }

  List<PushNotificationHistoryItem> get _visibleItems {
    Iterable<PushNotificationHistoryItem> filtered = _items;

    if (_dayScope == _dateDaysScope && _selectedDayKey != _allDaysKey) {
      filtered = filtered.where(
        (item) => _dayKey(_normalizeDay(item.createdAt)) == _selectedDayKey,
      );
    }

    if (_statusFilter == 'unread') {
      filtered = filtered.where((item) => !_readIds.contains(item.id));
    } else if (_statusFilter == 'read') {
      filtered = filtered.where((item) => _readIds.contains(item.id));
    }

    final list = filtered.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return list;
  }

  Iterable<PushNotificationHistoryItem> get _itemsInDayScope {
    if (_dayScope != _dateDaysScope || _selectedDayKey == _allDaysKey) {
      return _items;
    }

    return _items.where(
      (item) => _dayKey(_normalizeDay(item.createdAt)) == _selectedDayKey,
    );
  }

  int _statusCount(String status) {
    final scoped = _itemsInDayScope;
    if (status == 'unread') {
      return scoped.where((item) => !_readIds.contains(item.id)).length;
    }
    if (status == 'read') {
      return scoped.where((item) => _readIds.contains(item.id)).length;
    }
    return scoped.length;
  }

  Map<String, List<PushNotificationHistoryItem>> get _groupedItems {
    final groups = <String, List<PushNotificationHistoryItem>>{};
    for (final item in _visibleItems) {
      final key = _dayKey(_normalizeDay(item.createdAt));
      groups.putIfAbsent(key, () => <PushNotificationHistoryItem>[]).add(item);
    }
    return groups;
  }

  @override
  void initState() {
    super.initState();
    _historyUpdateListener = () {
      if (!mounted) return;
      _refresh();
    };
    NotificationService.instance.historyVersionNotifier.addListener(
      _historyUpdateListener,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refresh();
    });
  }

  @override
  void dispose() {
    NotificationService.instance.historyVersionNotifier.removeListener(
      _historyUpdateListener,
    );
    super.dispose();
  }

  Future<void> _loadReadIds() async {
    final ids = await Preference.getPushReadIds();
    if (!mounted) return;
    setState(() {
      _readIds
        ..clear()
        ..addAll(ids);
    });
    await _syncBadgeCount();
  }

  Future<void> _refresh() async {
    if (_refreshInFlight) {
      _refreshQueued = true;
      return;
    }
    _refreshInFlight = true;
    if (mounted && !_loading) {
      setState(() => _loading = true);
    }
    try {
      final readIdsFuture = Preference.getPushReadIds();
      final historyFuture = Preference.getPushHistoryMessages();
      final readIds = await readIdsFuture;
      final stored = await historyFuture;
      final List<PushNotificationHistoryItem> items = stored
          .map((item) => PushNotificationHistoryItem.fromJson(item))
          .toList();
      if (!mounted) return;
      setState(() {
        _readIds
          ..clear()
          ..addAll(readIds);
        _items
          ..clear()
          ..addAll(items);
        if (_dayScope == _dateDaysScope) {
          final hasSelected = _items.any(
            (item) => _dayKey(_normalizeDay(item.createdAt)) == _selectedDayKey,
          );
          if (!hasSelected) {
            _selectedDayKey = _preferredDayKey(_selectorDayBuckets);
          }
        }
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _ensureSelectedDayVisible();
      });
      await _syncBadgeCount();
    } finally {
      _refreshInFlight = false;
      if (mounted) setState(() => _loading = false);
      if (_refreshQueued) {
        _refreshQueued = false;
        _refresh();
      }
    }
  }

  Future<void> _syncBadgeCount() async {
    if (!mounted) return;
    final unreadCount = _unreadCount;
    if (_lastSyncedBadgeCount == unreadCount) return;
    await NotificationService.instance.updateBadgeCount(unreadCount);
    _lastSyncedBadgeCount = unreadCount;
  }

  Future<void> _markNotificationRead(String id) async {
    if (id.isEmpty || _readIds.contains(id)) return;
    await Preference.markPushRead(id);
    if (!mounted) return;
    setState(() => _readIds.add(id));
    await _syncBadgeCount();
  }

  Future<void> _markAllRead() async {
    final ids = _items.map((item) => item.id).toSet();
    await Preference.setPushReadIds(ids);
    if (!mounted) return;
    setState(
      () => _readIds
        ..clear()
        ..addAll(ids),
    );
    await _syncBadgeCount();
  }

  Future<void> _markDayRead(String dayKey) async {
    final ids = _items
        .where((item) => _dayKey(_normalizeDay(item.createdAt)) == dayKey)
        .map((item) => item.id)
        .where((id) => id.isNotEmpty)
        .toSet();
    if (ids.isEmpty) return;
    final next = <String>{..._readIds, ...ids};
    await Preference.setPushReadIds(next);
    if (!mounted) return;
    setState(
      () => _readIds
        ..clear()
        ..addAll(next),
    );
    await _syncBadgeCount();
  }

  void _ensureSelectedDayVisible() {
    if (_dayScope != _dateDaysScope) return;
    final key = _dayItemKeys[_selectedDayKey];
    final context = key?.currentContext;
    if (context == null) return;
    Scrollable.ensureVisible(
      context,
      alignment: 0.5,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
    );
  }

  String _preferredDayKey(List<_DayBucket> days) {
    for (final day in days) {
      if (day.total > 0) {
        return day.key;
      }
    }
    if (days.isNotEmpty) {
      return days.first.key;
    }
    return _dayKey(_normalizeDay(DateTime.now()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visibleItems = _visibleItems;
    final groupedItems = _groupedItems;
    final showEmptyState = !_loading && visibleItems.isEmpty;

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CopyText(
              'screen.push_notification_history.push_history',
              fallback: "Push history",
            ),
            const SizedBox(width: 8),
            if (_unreadCount > 0) _buildCountBadge(_unreadCount, theme),
          ],
        ),
        centerTitle: true,
        actions: [
          if (_items.isNotEmpty && _unreadCount > 0)
            IconButton(
              tooltip: CopyService.instance.t(
                'screen.push_notification_history.mark_all_read',
                fallback: 'Mark all as read',
              ),
              icon: const Icon(Icons.done_all),
              onPressed: _markAllRead,
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _loading && _items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: EdgeInsets.fromLTRB(16.w, 14.w, 16.w, 24.w),
                children: [
                  _buildDaySelector(theme),
                  SizedBox(height: 14.w),
                  _buildStatusTabs(theme),
                  SizedBox(height: 18.w),
                  if (showEmptyState)
                    Padding(
                      padding: EdgeInsets.only(top: 90.w),
                      child: Column(
                        children: [
                          Icon(
                            Icons.notifications_none,
                            size: 48.w,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          SizedBox(height: 12.w),
                          const Center(
                            child: CopyText(
                              'screen.push_notification_history.no_push_messages_yet',
                              fallback: 'No push messages yet.',
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    ...groupedItems.entries.map((entry) {
                      final dayKey = entry.key;
                      final dayItems = entry.value;
                      final bucket = _dayBuckets.firstWhere(
                        (it) => it.key == dayKey,
                        orElse: () => _DayBucket(
                          key: dayKey,
                          date: _parseDayKey(dayKey),
                          total: dayItems.length,
                          unread: dayItems
                              .where((item) => !_readIds.contains(item.id))
                              .length,
                        ),
                      );
                      return _buildDayGroup(theme, bucket, dayItems);
                    }),
                ],
              ),
      ),
    );
  }

  Widget _buildDaySelector(ThemeData theme) {
    final days = _selectorDayBuckets;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _buildScopeTag(
              theme: theme,
              selected: _dayScope == _allDaysScope,
              label: 'All',
              onTap: () {
                setState(() {
                  _dayScope = _allDaysScope;
                  _selectedDayKey = _allDaysKey;
                });
              },
            ),
            SizedBox(width: 8.w),
            _buildScopeTag(
              theme: theme,
              selected: _dayScope == _dateDaysScope,
              label: 'Date',
              onTap: () {
                setState(() {
                  _dayScope = _dateDaysScope;
                  if (_selectedDayKey == _allDaysKey && days.isNotEmpty) {
                    _selectedDayKey = _preferredDayKey(days);
                  }
                });
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  _ensureSelectedDayVisible();
                });
              },
            ),
          ],
        ),
        if (_dayScope == _dateDaysScope) ...[
          SizedBox(height: 10.w),
          SizedBox(
            height: 88.w,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              reverse: true,
              padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 8.w),
              itemCount: days.length,
              separatorBuilder: (context, index) => SizedBox(width: 8.w),
              itemBuilder: (context, index) {
                final bucket = days[index];
                final selected = _selectedDayKey == bucket.key;
                return _buildShortDateCard(
                  key: _dayItemKeys.putIfAbsent(bucket.key, () => GlobalKey()),
                  theme: theme,
                  selected: selected,
                  month: _monthLabel(bucket.date),
                  day: bucket.date.day.toString(),
                  unreadCount: bucket.unread,
                  readCount: bucket.total - bucket.unread,
                  totalCount: bucket.total,
                  onTap: () {
                    setState(() => _selectedDayKey = bucket.key);
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      _ensureSelectedDayVisible();
                    });
                  },
                );
              },
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildScopeTag({
    required ThemeData theme,
    required bool selected,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(999.w),
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 5.w),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999.w),
          color: selected
              ? theme.colorScheme.primaryContainer
              : theme.colorScheme.surfaceContainerHigh,
          border: Border.all(
            color: selected
                ? theme.colorScheme.primary.withValues(alpha: 0.28)
                : theme.colorScheme.outlineVariant.withValues(alpha: 0.24),
          ),
        ),
        child: Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: selected
                ? theme.colorScheme.onPrimaryContainer
                : theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _buildShortDateCard({
    required Key key,
    required ThemeData theme,
    required bool selected,
    required String month,
    required String day,
    required int unreadCount,
    required int readCount,
    required int totalCount,
    required VoidCallback onTap,
  }) {
    final dateCard = InkWell(
      key: key,
      borderRadius: BorderRadius.circular(12.w),
      onTap: onTap,
      child: Container(
        width: 74.w,
        padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 8.w),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12.w),
          color: selected
              ? theme.colorScheme.primaryContainer
              : theme.colorScheme.surfaceContainerHigh,
          border: Border.all(
            color: selected
                ? theme.colorScheme.primary.withValues(alpha: 0.28)
                : theme.colorScheme.outlineVariant.withValues(alpha: 0.24),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              month,
              style: theme.textTheme.labelSmall?.copyWith(
                color: selected
                    ? theme.colorScheme.onPrimaryContainer
                    : theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w500,
              ),
            ),
            SizedBox(height: 2.w),
            Text(
              day,
              style: theme.textTheme.titleSmall?.copyWith(
                color: selected
                    ? theme.colorScheme.onPrimaryContainer
                    : theme.colorScheme.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 2.w),
            RichText(
              text: TextSpan(
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
                children: [
                  TextSpan(
                    text: '$unreadCount',
                    style: TextStyle(
                      color: unreadCount > 0
                          ? theme.colorScheme.error
                          : theme.colorScheme.outlineVariant,
                    ),
                  ),
                  TextSpan(
                    text: '/',
                    style: TextStyle(
                      color: selected
                          ? theme.colorScheme.onPrimaryContainer.withValues(
                              alpha: 0.72,
                            )
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  TextSpan(
                    text: '$totalCount',
                    style: TextStyle(
                      color: selected
                          ? theme.colorScheme.onPrimaryContainer.withValues(
                              alpha: 0.88,
                            )
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );

    if (unreadCount <= 0) {
      return dateCard;
    }

    return Stack(
      clipBehavior: Clip.none,
      children: [
        dateCard,
        Positioned(
          top: -5.w,
          right: -5.w,
          child: _buildCountBadge(unreadCount, theme, compact: true),
        ),
      ],
    );
  }

  Widget _buildFilterTag({
    required ThemeData theme,
    required bool selected,
    required String label,
    required int count,
    required String status,
    required VoidCallback onTap,
  }) {
    final tag = InkWell(
      borderRadius: BorderRadius.circular(999.w),
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 11.w, vertical: 5.w),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999.w),
          color: selected
              ? theme.colorScheme.primaryContainer
              : theme.colorScheme.surfaceContainerHigh,
          border: Border.all(
            color: selected
                ? theme.colorScheme.primary.withValues(alpha: 0.3)
                : theme.colorScheme.outlineVariant.withValues(alpha: 0.24),
          ),
        ),
        child: Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: selected
                ? theme.colorScheme.onPrimaryContainer
                : theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );

    if (count <= 0) {
      return tag;
    }

    return Stack(
      clipBehavior: Clip.none,
      children: [
        tag,
        Positioned(
          top: -5.w,
          right: -5.w,
          child: _buildCountBadge(
            count,
            theme,
            compact: true,
            backgroundColor: _statusBadgeBackgroundColor(status, theme),
            textColor: _statusBadgeTextColor(status, theme),
          ),
        ),
      ],
    );
  }

  Widget _buildStatusTabs(ThemeData theme) {
    final tabs = <(String value, String label)>[
      ('all', 'All'),
      ('unread', 'Unread'),
      ('read', 'Read'),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 6.w),
        child: Row(
          children: tabs.map((tab) {
            final selected = _statusFilter == tab.$1;
            final count = _statusCount(tab.$1);
            return Padding(
              padding: EdgeInsets.only(right: 8.w),
              child: _buildFilterTag(
                theme: theme,
                selected: selected,
                label: tab.$2,
                count: count,
                status: tab.$1,
                onTap: () => setState(() => _statusFilter = tab.$1),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildDayGroup(
    ThemeData theme,
    _DayBucket bucket,
    List<PushNotificationHistoryItem> items,
  ) {
    return Padding(
      padding: EdgeInsets.only(bottom: 16.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _formatDayHeader(bucket.date),
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (bucket.unread > 0)
                TextButton(
                  onPressed: () => _markDayRead(bucket.key),
                  child: const Text('Mark day read'),
                ),
            ],
          ),
          ...List.generate(items.length, (index) {
            final item = items[index];
            return _buildNotificationListItem(
              theme,
              item,
              showDivider: index != items.length - 1,
            );
          }),
        ],
      ),
    );
  }

  Widget _buildNotificationListItem(
    ThemeData theme,
    PushNotificationHistoryItem item, {
    required bool showDivider,
  }) {
    final title = item.title?.trim().isNotEmpty == true
        ? item.title!
        : '(No title)';
    final subtitle = item.body?.trim().isNotEmpty == true ? item.body! : '';
    final isRead = _readIds.contains(item.id);
    final chipColor = _categoryColor(item.category, theme);
    return Column(
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(12.w),
          onTap: () async {
            if (!isRead) {
              await _markNotificationRead(item.id);
            }
            if (!mounted) return;
            await Navigator.pushNamed(
              context,
              '/push-history/detail',
              arguments: PushNotificationDetailArgs.fromHistoryItem(
                item,
                title: title,
                body: subtitle,
              ),
            );
            await _loadReadIds();
          },
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 12.w),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 34.w,
                            height: 34.w,
                            decoration: BoxDecoration(
                              color: chipColor.withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(10.w),
                            ),
                            child: Icon(
                              _categoryIcon(item.category),
                              color: chipColor,
                              size: 18.w,
                            ),
                          ),
                          SizedBox(width: 10.w),
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleMedium?.copyWith(
                                color: isRead
                                    ? theme.colorScheme.onSurfaceVariant
                                          .withValues(alpha: 0.5)
                                    : theme.colorScheme.onSurface,
                                fontWeight: isRead
                                    ? FontWeight.w500
                                    : FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (subtitle.isNotEmpty) ...[
                        SizedBox(height: 8.w),
                        Text(
                          subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            height: 1.35,
                          ),
                        ),
                      ],
                      SizedBox(height: 8.w),
                      Row(
                        children: [
                          Icon(
                            Icons.schedule,
                            size: 14.w,
                            color: theme.colorScheme.primary,
                          ),
                          SizedBox(width: 4.w),
                          Text(
                            _formatTime(item.createdAt),
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(width: 10.w),
                          Container(
                            padding: EdgeInsets.symmetric(
                              horizontal: 10.w,
                              vertical: 3.w,
                            ),
                            decoration: BoxDecoration(
                              color: chipColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(999.w),
                            ),
                            child: Text(
                              item.category,
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: chipColor,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                Icon(
                  Icons.chevron_right,
                  size: 16.w,
                  color: theme.colorScheme.outline,
                ),
              ],
            ),
          ),
        ),
        if (showDivider)
          Divider(
            height: 1.w,
            thickness: 1.w,
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.2),
          ),
      ],
    );
  }
}

Widget _buildCountBadge(
  int count,
  ThemeData theme, {
  bool compact = false,
  Color? backgroundColor,
  Color? textColor,
}) {
  final text = count > 99 ? '99+' : count.toString();
  final horizontal = compact ? 4.w : 8.w;
  final vertical = compact ? 1.w : 2.w;
  final minHeight = compact ? 14.w : 18.w;
  final minWidth = compact ? 14.w : 20.w;
  final bgColor = backgroundColor ?? theme.colorScheme.error;
  final fgColor = textColor ?? theme.colorScheme.onError;
  return Container(
    constraints: BoxConstraints(minWidth: minWidth, minHeight: minHeight),
    padding: EdgeInsets.symmetric(horizontal: horizontal, vertical: vertical),
    decoration: BoxDecoration(
      color: bgColor,
      borderRadius: BorderRadius.circular(999.w),
      border: Border.all(
        color: theme.colorScheme.surface,
        width: compact ? 1.w : 0,
      ),
    ),
    child: Text(
      text,
      textAlign: TextAlign.center,
      style: theme.textTheme.labelSmall?.copyWith(
        color: fgColor,
        fontWeight: FontWeight.w700,
        fontSize: compact ? 9.w : null,
        height: 1.0,
      ),
    ),
  );
}

Color _statusBadgeBackgroundColor(String status, ThemeData theme) {
  if (status == 'unread') {
    return theme.colorScheme.error;
  }
  if (status == 'read') {
    return theme.colorScheme.primary;
  }
  return theme.colorScheme.tertiary;
}

Color _statusBadgeTextColor(String status, ThemeData theme) {
  if (status == 'unread') {
    return theme.colorScheme.onError;
  }
  if (status == 'read') {
    return theme.colorScheme.onPrimary;
  }
  return theme.colorScheme.onTertiary;
}

DateTime _normalizeDay(DateTime value) {
  final local = value.toLocal();
  return DateTime(local.year, local.month, local.day);
}

String _dayKey(DateTime value) {
  final local = value.toLocal();
  final date =
      '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  return date;
}

DateTime _parseDayKey(String key) {
  final split = key.split('-');
  if (split.length != 3) return DateTime.now();
  final y = int.tryParse(split[0]) ?? DateTime.now().year;
  final m = int.tryParse(split[1]) ?? DateTime.now().month;
  final d = int.tryParse(split[2]) ?? DateTime.now().day;
  return DateTime(y, m, d);
}

String _formatDayHeader(DateTime value) {
  final local = value.toLocal();
  final date =
      '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  return '$date (${_weekdayLabel(local)})';
}

String _monthLabel(DateTime value) {
  const months = <String>[
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
  return months[(value.toLocal().month - 1).clamp(0, 11)];
}

String _weekdayLabel(DateTime value) {
  const weekdays = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return weekdays[(value.toLocal().weekday - 1).clamp(0, 6)];
}

String _formatTime(DateTime value) {
  final local = value.toLocal();
  final time =
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  return time;
}

IconData _categoryIcon(String category) {
  switch (category) {
    case 'trading':
      return Icons.show_chart;
    case 'security':
      return Icons.verified_user_outlined;
    case 'system':
      return Icons.settings_outlined;
    case 'marketing':
      return Icons.campaign_outlined;
    default:
      return Icons.notifications_none;
  }
}

Color _categoryColor(String category, ThemeData theme) {
  switch (category) {
    case 'trading':
      return theme.colorScheme.primary;
    case 'security':
      return Colors.orange;
    case 'system':
      return theme.colorScheme.secondary;
    case 'marketing':
      return Colors.teal;
    default:
      return theme.colorScheme.outline;
  }
}

class _DayBucket {
  final String key;
  final DateTime date;
  final int total;
  final int unread;

  const _DayBucket({
    required this.key,
    required this.date,
    required this.total,
    required this.unread,
  });

  _DayBucket copyWith({String? key, DateTime? date, int? total, int? unread}) {
    return _DayBucket(
      key: key ?? this.key,
      date: date ?? this.date,
      total: total ?? this.total,
      unread: unread ?? this.unread,
    );
  }
}
