import 'package:flutter/material.dart';
import '../../models/chat_message.dart';

/// Formats a raw value from API data into a display string.
String _formatValue(dynamic value) {
  if (value == null) return '—';
  if (value is bool) return value ? 'Yes' : 'No';
  if (value is num) {
    // Currency-like values
    if (value.abs() > 0.001 &&
        (value.toString().contains('.') || value.abs() > 10)) {
      final formatted = value.abs().toStringAsFixed(2);
      final sign = value < 0 ? '-' : '';
      return '${sign}\$${_addThousandsSep(formatted)}';
    }
    return value.toStringAsFixed(2).replaceAll(RegExp(r'\.?0+$'), '');
  }
  if (value is String) {
    // ISO date strings → readable
    if (RegExp(r'^\d{4}-\d{2}-\d{2}T').hasMatch(value)) {
      try {
        final dt = DateTime.parse(value);
        return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
      } catch (_) {}
    }
    return value;
  }
  return value.toString();
}

String _addThousandsSep(String s) {
  final parts = s.split('.');
  final intPart = parts[0].replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'),
    (m) => '${m[1]},',
  );
  return parts.length > 1 ? '$intPart.${parts[1]}' : intPart;
}

bool _isPnlColumn(String key) =>
    key.toLowerCase().contains('pnl') || key.toLowerCase().contains('profit');

String _formatHeader(String key) {
  return key
      .replaceAll('_', ' ')
      .replaceAllMapped(
        RegExp(r'([A-Z])'),
        (m) => ' ${m[1]}',
      )
      .trim()
      .replaceFirstMapped(RegExp(r'^.'), (m) => m[0]!.toUpperCase());
}

const _excludedKeys = {
  'id',
  'userId',
  'normalizedSymbol',
  'marketType',
  'strategyId',
  'createdAt',
  'updatedAt',
  'timestamp',
  'activeCount',
  'fillRate',
  'totalOrders',
  'filledOrders',
  'type',
  'status',
  'count',
};

const _priorityKeys = [
  'name',
  'symbol',
  'exchange',
  'totalPnl',
  'realizedPnl',
  'unrealizedPnl',
  'balance',
  'pnl',
];

/// Renders structured data as a scrollable table.
class ChatTableWidget extends StatelessWidget {
  final RenderData renderData;

  const ChatTableWidget({super.key, required this.renderData});

  List<dynamic> _extractRows() {
    final data = renderData.data;
    if (data == null) return [];
    if (data is List) return data;
    if (data is Map<String, dynamic>) {
      for (final key in [
        'rows',
        'topTokens',
        'topPerformers',
        'bySymbol',
        'byExchange',
        'orders',
        'allStrategies',
      ]) {
        if (data[key] is List) return data[key] as List;
      }
    }
    return [];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = _extractRows();
    if (rows.isEmpty) return const SizedBox.shrink();

    final capped = rows.take(15).toList();
    final firstItem = capped.first;
    if (firstItem is! Map<String, dynamic>) return const SizedBox.shrink();
    final firstRow = firstItem;
    final allKeys = firstRow.keys.where((k) => !_excludedKeys.contains(k)).toList();

    final priority = _priorityKeys.where(allKeys.contains).toList();
    final other = allKeys.where((k) => !_priorityKeys.contains(k)).toList();
    final columns = [...priority, ...other].take(6).toList();

    final borderColor = theme.colorScheme.outline.withValues(alpha: 0.2);
    final headerBg = theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5);
    final altRowBg = theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.15);

    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(12),
        color: theme.colorScheme.surface,
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Title bar
          if (renderData.title != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: headerBg,
              child: Text(
                renderData.title!.toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          // Scrollable table
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 32,
              dataRowMinHeight: 28,
              dataRowMaxHeight: 36,
              horizontalMargin: 12,
              columnSpacing: 16,
              headingRowColor: WidgetStateProperty.all(headerBg),
              dividerThickness: 0.5,
              columns: [
                DataColumn(
                  label: Text(
                    '#',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                ...columns.map(
                  (col) => DataColumn(
                    label: Text(
                      _formatHeader(col),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
              ],
              rows: List.generate(capped.length, (rowIdx) {
                final rowItem = capped[rowIdx];
                if (rowItem is! Map<String, dynamic>) {
                  return DataRow(cells: [DataCell(const SizedBox.shrink())]);
                }
                final row = rowItem;
                return DataRow(
                  color: WidgetStateProperty.resolveWith((states) {
                    return rowIdx.isOdd ? altRowBg : null;
                  }),
                  cells: [
                    DataCell(
                      Text(
                        '${rowIdx + 1}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    ...columns.map((col) {
                      final raw = row[col];
                      final formatted = _formatValue(raw);
                      final isPnl = _isPnlColumn(col);
                      final numVal = raw is num ? raw.toDouble() : null;

                      return DataCell(
                        isPnl && numVal != null
                            ? Text(
                                '${numVal >= 0 ? '+' : ''}$formatted',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: numVal >= 0
                                      ? const Color(0xFF10b981)
                                      : const Color(0xFFef4444),
                                  fontFeatures: const [
                                    FontFeature.tabularFigures()
                                  ],
                                ),
                              )
                            : Text(
                                formatted,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurface,
                                ),
                              ),
                      );
                    }),
                  ],
                );
              }),
            ),
          ),
          if (rows.length > 15)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Text(
                'Showing top 15 of ${rows.length} results',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
