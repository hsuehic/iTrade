import 'dart:async';
import 'package:flutter/material.dart';

import '../services/notification.dart';
import '../services/preference.dart';
import 'push_notification_detail.dart';

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
  bool _loading = false;
  String _sortKey = 'newest';
  String _categoryFilter = 'all';
  bool _showUnreadOnly = false;
  String _searchInput = '';
  String _searchQuery = '';
  Timer? _searchDebounce;

  int get _unreadCount =>
      _items.where((item) => !_readIds.contains(item.id)).length;
  int get _totalCount => _items.length;
  List<PushNotificationHistoryItem> get _visibleItems {
    Iterable<PushNotificationHistoryItem> filtered = _items;
    if (_categoryFilter != 'all') {
      filtered = filtered.where((item) => item.category == _categoryFilter);
    }
    if (_showUnreadOnly) {
      filtered = filtered.where((item) => !_readIds.contains(item.id));
    }
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      filtered = filtered.where((item) {
        final title = item.title ?? '';
        final body = item.body ?? '';
        final data = item.data ?? <String, dynamic>{};
        final haystack = [
          title,
          body,
          data['symbol']?.toString() ?? '',
          data['orderId']?.toString() ?? '',
          data['strategyName']?.toString() ?? '',
          data['exchange']?.toString() ?? '',
          data['side']?.toString() ?? '',
          data['status']?.toString() ?? '',
        ].join(' ').toLowerCase();
        return haystack.contains(q);
      });
    }
    final list = filtered.toList();
    list.sort((a, b) {
      switch (_sortKey) {
        case 'oldest':
          return a.createdAt.compareTo(b.createdAt);
        case 'symbol':
          return (a.data?['symbol']?.toString() ?? '')
              .compareTo(b.data?['symbol']?.toString() ?? '');
        case 'strategy':
          return (a.data?['strategyName']?.toString() ?? '')
              .compareTo(b.data?['strategyName']?.toString() ?? '');
        case 'newest':
        default:
          return b.createdAt.compareTo(a.createdAt);
      }
    });
    return list;
  }

  @override
  void initState() {
    super.initState();
    _loadReadIds();
    _refresh();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
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
    setState(() {
      _loading = true;
      _items.clear();
    });
    try {
      final stored = await Preference.getPushHistoryMessages();
      final List<PushNotificationHistoryItem> items = stored
          .map((item) => PushNotificationHistoryItem.fromJson(item))
          .toList();
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(items);
      });
      await _syncBadgeCount();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _syncBadgeCount() async {
    if (!mounted) return;
    final unreadCount = _unreadCount;
    await NotificationService.instance.updateBadgeCount(unreadCount);
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

  void _onSearchChanged(String value) {
    setState(() => _searchInput = value);
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 500), () {
      if (!mounted) return;
      setState(() => _searchQuery = _searchInput.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visibleItems = _visibleItems;
    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Push History'),
            const SizedBox(width: 8),
            if (_unreadCount > 0) _buildCountBadge(_unreadCount, theme),
          ],
        ),
        centerTitle: true,
        actions: [
          if (_items.isNotEmpty && _unreadCount > 0)
            IconButton(
              tooltip: 'Mark all as read',
              icon: const Icon(Icons.done_all),
              onPressed: _markAllRead,
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _loading && _items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : Builder(
                builder: (context) {
                  final bool showEmptyState = !_loading && visibleItems.isEmpty;
                  final int itemCount =
                      1 + (showEmptyState ? 1 : visibleItems.length);

                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: itemCount,
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return _buildSummaryHeader(theme);
                      }

                      final int contentIndex = index - 1;

                      if (showEmptyState && contentIndex == 0) {
                        return const Padding(
                          padding: EdgeInsets.only(top: 80),
                          child: Column(
                            children: [
                              Icon(Icons.notifications_none, size: 48),
                              SizedBox(height: 12),
                              Center(child: Text('No push messages yet.')),
                            ],
                          ),
                        );
                      }

                      final int listIndex = showEmptyState
                          ? contentIndex - 1
                          : contentIndex;

                      final item = visibleItems[listIndex];
                      final title = item.title?.trim().isNotEmpty == true
                          ? item.title!
                          : '(No title)';
                      final subtitle = item.body?.trim().isNotEmpty == true
                          ? item.body!
                          : '';
                      final isRead = _readIds.contains(item.id);
                      final timestamp = _formatTimestamp(item.createdAt);
                      final chipColor = _categoryColor(item.category, theme);
                      return _buildNotificationCard(
                        context: context,
                        theme: theme,
                        item: item,
                        title: title,
                        subtitle: subtitle,
                        isRead: isRead,
                        timestamp: timestamp,
                        chipColor: chipColor,
                        onMarkRead: () => _markNotificationRead(item.id),
                        onOpenDetail: (args) async {
                          await Navigator.pushNamed(
                            context,
                            '/push-history/detail',
                            arguments: args,
                          );
                        },
                        onRefreshRead: _loadReadIds,
                      );
                    },
                  );
                },
              ),
      ),
    );
  }

  Widget _buildSortChips(ThemeData theme) {
    final options = [
      (label: 'Newest first', value: 'newest'),
      (label: 'Oldest first', value: 'oldest'),
      (label: 'Symbol (A-Z)', value: 'symbol'),
      (label: 'Strategy (A-Z)', value: 'strategy'),
    ];

    final current = options.firstWhere((opt) => opt.value == _sortKey);
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.sort, color: theme.colorScheme.primary),
          title: const Text('Sort'),
          subtitle: Text(current.label),
          trailing: PopupMenuButton<String>(
            tooltip: 'Sort',
            onSelected: (value) {
              if (_sortKey == value) return;
              setState(() => _sortKey = value);
            },
            itemBuilder: (context) {
              return options
                  .map(
                    (opt) => PopupMenuItem<String>(
                      value: opt.value,
                      child: Text(opt.label),
                    ),
                  )
                  .toList();
            },
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Change',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(Icons.expand_more, color: theme.colorScheme.primary),
              ],
            ),
          ),
        ),
        _buildSoftDivider(theme, indent: 16),
      ],
    );
  }

  Widget _buildSummaryHeader(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildStatsList(theme, total: _totalCount, unread: _unreadCount),
        _buildSearchField(theme),
        _buildFilterChips(
          theme,
          categoryFilter: _categoryFilter,
          showUnreadOnly: _showUnreadOnly,
          onCategoryChanged: (value) => setState(() => _categoryFilter = value),
          onUnreadChanged: (value) => setState(() => _showUnreadOnly = value),
        ),
        _buildSortChips(theme),
      ],
    );
  }

  Widget _buildSearchField(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Search',
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          onChanged: _onSearchChanged,
          decoration: InputDecoration(
            hintText: 'Search by symbol, order ID, strategy',
            prefixIcon: const Icon(Icons.search),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            isDense: true,
          ),
        ),
        _buildSoftDivider(theme, indent: 16),
      ],
    );
  }
}

Widget _buildStatsList(
  ThemeData theme, {
  required int total,
  required int unread,
}) {
  return Column(
    children: [
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(
          Icons.history,
          color: theme.colorScheme.primary,
        ),
        title: const Text('Total push messages'),
        trailing: Text(
          total.toString(),
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      _buildSoftDivider(theme, indent: 16),
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(
          Icons.mark_email_unread_outlined,
          color: theme.colorScheme.primary,
        ),
        title: const Text('Unread push messages'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (unread > 0) _buildUnreadBadge(unread, theme),
            if (unread > 0) const SizedBox(width: 8),
            Text(
              unread.toString(),
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
      _buildSoftDivider(theme, indent: 16),
    ],
  );
}

Widget _buildFilterChips(
  ThemeData theme, {
  required String categoryFilter,
  required bool showUnreadOnly,
  required ValueChanged<String> onCategoryChanged,
  required ValueChanged<bool> onUnreadChanged,
}) {
  final categories = <String>[
    'all',
    'general',
    'trading',
    'system',
    'security',
    'marketing',
  ];

  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          Switch.adaptive(
            value: showUnreadOnly,
            onChanged: onUnreadChanged,
            activeTrackColor: theme.colorScheme.primary.withValues(alpha: 0.3),
            activeThumbColor: theme.colorScheme.primary,
          ),
          const SizedBox(width: 6),
          Text(
            'Unread only (messages not opened)',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: theme.colorScheme.onSurface,
            ),
          ),
        ],
      ),
      const SizedBox(height: 8),
      Text(
        'Categories',
        style: theme.textTheme.labelMedium?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 6),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          children: categories
              .map(
                (category) => Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: ChoiceChip(
                    label: Text(_capitalize(category)),
                    selected: categoryFilter == category,
                    selectedColor: theme.colorScheme.primary.withValues(
                      alpha: 0.14,
                    ),
                    backgroundColor: theme.colorScheme.surface,
                    labelStyle: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: categoryFilter == category
                          ? FontWeight.w700
                          : FontWeight.w500,
                      color: categoryFilter == category
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                    onSelected: (selected) {
                      if (!selected) return;
                      onCategoryChanged(category);
                    },
                  ),
                ),
              )
              .toList(),
        ),
      ),
    ],
  );
}

Widget _buildNotificationCard({
  required BuildContext context,
  required ThemeData theme,
  required PushNotificationHistoryItem item,
  required String title,
  required String subtitle,
  required bool isRead,
  required String timestamp,
  required Color chipColor,
  required Future<void> Function() onMarkRead,
  required Future<void> Function(PushNotificationDetailArgs args) onOpenDetail,
  required Future<void> Function() onRefreshRead,
}) {
  final statusLabel = isRead ? 'Read' : 'Unread';
  return InkWell(
    borderRadius: BorderRadius.circular(12),
    onTap: () async {
      if (!isRead) {
        await onMarkRead();
      }
      await onOpenDetail(
        PushNotificationDetailArgs.fromHistoryItem(
          item,
          title: title,
          body: subtitle,
        ),
      );
      await onRefreshRead();
    },
    child: Column(
      children: [
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          leading: Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isRead
                  ? theme.colorScheme.outlineVariant
                  : theme.colorScheme.primary,
            ),
          ),
          title: Text(
            title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: isRead ? FontWeight.w600 : FontWeight.w700,
              color: theme.colorScheme.onSurface,
            ),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: chipColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      item.category,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: chipColor,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ),
                  Text(
                    statusLabel,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: isRead
                          ? theme.colorScheme.onSurfaceVariant
                          : theme.colorScheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (!isRead) _buildUnreadBadge(1, theme, label: 'Unread'),
                ],
              ),
              if (subtitle.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                ),
              ],
            ],
          ),
          trailing: Text(
            timestamp,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        _buildSoftDivider(theme, indent: 28),
      ],
    ),
  );
}

Widget _buildSoftDivider(ThemeData theme, {double indent = 0}) {
  return Divider(
    height: 1,
    thickness: 0.5,
    indent: indent,
    color: theme.colorScheme.outlineVariant.withValues(alpha: 0.25),
  );
}

Widget _buildUnreadBadge(int count, ThemeData theme, {String? label}) {
  final displayLabel = label ?? count.toString();
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(
      color: theme.colorScheme.error,
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      displayLabel,
      style: theme.textTheme.labelSmall?.copyWith(
        color: theme.colorScheme.onError,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

Widget _buildCountBadge(int count, ThemeData theme) {
  final text = count > 99 ? '99+' : count.toString();
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(
      color: theme.colorScheme.error,
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      text,
      style: theme.textTheme.labelSmall?.copyWith(
        color: theme.colorScheme.onError,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

String _formatTimestamp(DateTime value) {
  final local = value.toLocal();
  final date =
      '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  final time =
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}:${local.second.toString().padLeft(2, '0')}';
  return '$date $time';
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

String _capitalize(String value) {
  if (value.isEmpty) return value;
  return value[0].toUpperCase() + value.substring(1);
}
