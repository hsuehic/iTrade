import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

class PushNotificationDetailArgs {
  final String title;
  final String body;
  final String category;
  final DateTime timestamp;
  final Map<String, dynamic>? data;

  /// When true, indicates the screen was opened directly from a notification tap
  /// (not from the history list). This affects back navigation behavior.
  final bool fromNotificationTap;

  PushNotificationDetailArgs({
    required this.title,
    required this.body,
    required this.category,
    required this.timestamp,
    required this.data,
    this.fromNotificationTap = false,
  });

  factory PushNotificationDetailArgs.fromHistoryItem(
    dynamic item, {
    required String title,
    required String body,
  }) {
    return PushNotificationDetailArgs(
      title: title,
      body: body,
      category: item.category?.toString() ?? 'general',
      timestamp: item.createdAt as DateTime,
      data: item.data as Map<String, dynamic>?,
      fromNotificationTap: false,
    );
  }

  factory PushNotificationDetailArgs.fromRemoteMessage(
    RemoteMessage message, {
    bool fromNotificationTap = false,
  }) {
    final data = Map<String, dynamic>.from(message.data);
    final event = data['event']?.toString() ?? '';
    final category = data['category']?.toString() ??
        (event.startsWith('order') ? 'trading' : 'general');
    final title = message.notification?.title ??
        data['title']?.toString() ??
        'Push Message';
    final body =
        message.notification?.body ?? data['body']?.toString() ?? '';
    final timestamp = _parseTimestamp(data['updateTime']?.toString()) ??
        DateTime.now();
    return PushNotificationDetailArgs(
      title: title,
      body: body,
      category: category,
      timestamp: timestamp,
      data: data.isEmpty ? null : data,
      fromNotificationTap: fromNotificationTap,
    );
  }
}

class PushNotificationDetailScreen extends StatelessWidget {
  const PushNotificationDetailScreen({super.key});

  static const List<String> _orderedKeys = <String>[
    'event',
    'orderId',
    'symbol',
    'exchange',
    'side',
    'status',
    'type',
    'timeInForce',
    'quantity',
    'executedQuantity',
    'price',
    'averagePrice',
    'stopPrice',
    'cummulativeQuoteQuantity',
    'commission',
    'commissionAsset',
    'realizedPnl',
    'unrealizedPnl',
    'strategyId',
    'strategyName',
    'updateTime',
  ];

  void _handleBackNavigation(BuildContext context, bool fromNotificationTap) {
    if (fromNotificationTap) {
      // Opened from notification tap: go to notification history, then user can go to home
      Navigator.pushNamedAndRemoveUntil(
        context,
        '/push-history',
        (route) => route.settings.name == '/home' || route.isFirst,
      );
    } else {
      // Opened from history list: normal back navigation
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final args =
        ModalRoute.of(context)?.settings.arguments as PushNotificationDetailArgs?;
    if (args == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Push Message'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.pushNamedAndRemoveUntil(
              context,
              '/home',
              (route) => false,
            ),
          ),
        ),
        body: const Center(child: Text('No notification details available.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Push Message Detail'),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => _handleBackNavigation(context, args.fromNotificationTap),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        children: [
          _buildHeaderCard(theme, args),
          const SizedBox(height: 16),
          _buildBodyCard(theme, args),
          const SizedBox(height: 16),
          if (args.data != null) _buildDataCard(theme, args.data!),
        ],
      ),
    );
  }

  Widget _buildHeaderCard(ThemeData theme, PushNotificationDetailArgs args) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: _categoryColor(args.category, theme),
            child: Icon(
              _categoryIcon(args.category),
              color: theme.colorScheme.onPrimary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  args.title,
                  style: theme.textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    _buildChip(theme, args.category),
                    const SizedBox(width: 8),
                    Text(
                      _formatTimestamp(args.timestamp),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBodyCard(ThemeData theme, PushNotificationDetailArgs args) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.2),
        ),
      ),
      child: Text(
        args.body.isEmpty ? '(No message body)' : args.body,
        style: theme.textTheme.bodyMedium,
      ),
    );
  }

  Widget _buildDataCard(ThemeData theme, Map<String, dynamic> data) {
    final entries = <MapEntry<String, dynamic>>[];
    final usedKeys = <String>{};
    for (final key in _orderedKeys) {
      if (!data.containsKey(key)) continue;
      entries.add(MapEntry<String, dynamic>(key, data[key]));
      usedKeys.add(key);
    }
    final rest = data.entries
        .where((entry) => !usedKeys.contains(entry.key))
        .toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    entries.addAll(rest);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Details',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          ...entries.map(
            (entry) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: Text(
                      _labelForKey(entry.key),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 5,
                    child: Text(
                      _formatValue(entry.key, entry.value),
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChip(ThemeData theme, String label) {
    final color = _categoryColor(label, theme);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  String _labelForKey(String key) {
    switch (key) {
      case 'event':
        return 'Event';
      case 'orderId':
        return 'Order ID';
      case 'symbol':
        return 'Symbol';
      case 'exchange':
        return 'Exchange';
      case 'side':
        return 'Side';
      case 'status':
        return 'Status';
      case 'type':
        return 'Type';
      case 'timeInForce':
        return 'Time in force';
      case 'quantity':
        return 'Quantity';
      case 'executedQuantity':
        return 'Executed quantity';
      case 'price':
        return 'Price';
      case 'averagePrice':
        return 'Average price';
      case 'stopPrice':
        return 'Stop price';
      case 'cummulativeQuoteQuantity':
        return 'Cumulative quote qty';
      case 'commission':
        return 'Commission';
      case 'commissionAsset':
        return 'Commission asset';
      case 'realizedPnl':
        return 'Realized PnL';
      case 'unrealizedPnl':
        return 'Unrealized PnL';
      case 'strategyId':
        return 'Strategy ID';
      case 'strategyName':
        return 'Strategy';
      case 'updateTime':
        return 'Update time';
      default:
        return key;
    }
  }

  String _formatValue(String key, dynamic value) {
    if (value == null) return '';
    final raw = value.toString();
    if (key == 'event') {
      switch (raw) {
        case 'order_filled':
          return 'Order filled';
        case 'order_partially_filled':
          return 'Order partially filled';
        default:
          return raw;
      }
    }
    if (key == 'updateTime') {
      final parsed = _parseTimestamp(raw);
      if (parsed != null) {
        return _formatTimestamp(parsed);
      }
    }
    return raw;
  }

  DateTime? _parseTimestamp(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final parsed = DateTime.tryParse(raw);
    if (parsed != null) return parsed;
    final numeric = int.tryParse(raw);
    if (numeric == null) return null;
    final millis = numeric > 1000000000000 ? numeric : numeric * 1000;
    return DateTime.fromMillisecondsSinceEpoch(millis);
  }
}

DateTime? _parseTimestamp(String? value) {
  if (value == null || value.isEmpty) return null;
  return DateTime.tryParse(value);
}

String _formatTimestamp(DateTime value) {
  final local = value.toLocal();
  final date =
      '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  final time =
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}:${local.second.toString().padLeft(2, '0')}';
  return '$date $time';
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
