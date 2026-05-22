import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../models/chat_message.dart';
import '../../services/api_client.dart';

// ── Label maps ─────────────────────────────────────────────────────────────────

const _strategyLabels = {
  'SpreadGridStrategy': 'Spread Grid',
  'SingleLadderLifoTPStrategy': 'Single Ladder LIFO',
  'MovingAverageStrategy': 'Moving Average',
  'MovingWindowGridsStrategy': 'Moving Window Grids',
  'HammerChannelStrategy': 'Hammer Channel',
};

const _paramLabels = {
  'basePrice': 'Base Price',
  'stepPercent': 'Step %',
  'orderAmount': 'Order Amount',
  'minSize': 'Min Size',
  'maxSize': 'Max Size',
  'leverage': 'Leverage',
  'checkMarketPrice': 'Check Market Price',
  'period': 'MA Period',
  'fastPeriod': 'Fast Period',
  'slowPeriod': 'Slow Period',
  'gridCount': 'Grid Count',
  'upperPrice': 'Upper Price',
  'lowerPrice': 'Lower Price',
};

String _formatParamValue(String key, dynamic value) {
  if (value == null) return '—';
  if (value is bool) return value ? 'Yes' : 'No';
  if (value is num) {
    final k = key.toLowerCase();
    if (k.contains('percent') || k.contains('pct')) return '$value%';
    return value.toString();
  }
  if (value is Map || value is List) {
    return value.toString();
  }
  return value.toString();
}

// ── Exchange chip colours ──────────────────────────────────────────────────────

Color _exchangeBg(String exchange, BuildContext context) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  switch (exchange.toLowerCase()) {
    case 'binance':
      return isDark
          ? const Color(0xFF78350f).withValues(alpha: 0.4)
          : const Color(0xFFfef3c7);
    case 'okx':
      return isDark
          ? Colors.grey.shade800
          : Colors.grey.shade100;
    case 'coinbase':
      return isDark
          ? const Color(0xFF1e3a5f).withValues(alpha: 0.5)
          : const Color(0xFFdbeafe);
    default:
      return Theme.of(context).colorScheme.surfaceContainerHighest;
  }
}

Color _exchangeFg(String exchange, BuildContext context) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  switch (exchange.toLowerCase()) {
    case 'binance':
      return isDark ? const Color(0xFFfde68a) : const Color(0xFF92400e);
    case 'okx':
      return Theme.of(context).colorScheme.onSurfaceVariant;
    case 'coinbase':
      return isDark ? const Color(0xFF93c5fd) : const Color(0xFF1d4ed8);
    default:
      return Theme.of(context).colorScheme.onSurfaceVariant;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

enum _CreateStatus { idle, loading, success, error }

class StrategyProposalCard extends StatefulWidget {
  final RenderData renderData;

  const StrategyProposalCard({super.key, required this.renderData});

  @override
  State<StrategyProposalCard> createState() => _StrategyProposalCardState();
}

class _StrategyProposalCardState extends State<StrategyProposalCard> {
  _CreateStatus _status = _CreateStatus.idle;
  String _errorMsg = '';
  int? _createdId;
  bool _showAdvanced = false;
  late TextEditingController _nameController;

  Map<String, dynamic> get _proposal {
    final d = widget.renderData.data;
    return (d is Map<String, dynamic>) ? d : {};
  }

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: (_proposal['name'] as String?) ?? '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  /// Convert a [DioException] to a short, user-friendly message.
  String _friendlyDioError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Request timed out. Please try again.';
      case DioExceptionType.connectionError:
        return 'No connection. Please check your network.';
      case DioExceptionType.badResponse:
        final code = e.response?.statusCode ?? 0;
        if (code == 409) return 'A strategy with this name already exists.';
        if (code == 401) return 'Session expired. Please log in again.';
        if (code >= 500) return 'Server error. Please try again later.';
        return 'Request failed (HTTP $code).';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  Future<void> _handleCreate() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    setState(() {
      _status = _CreateStatus.loading;
      _errorMsg = '';
    });

    try {
      final response = await ApiClient.instance.postJson(
        '/api/strategies',
        data: {
          'name': name,
          'description': _proposal['description'],
          'type': _proposal['type'],
          'exchange': _proposal['exchange'],
          'symbol': _proposal['symbol'],
          'parameters': _proposal['parameters'],
          'subscription': _proposal['subscription'],
          'initialDataConfig': _proposal['initialDataConfig'],
        },
      );

      final body = response.data as Map<String, dynamic>?;
      final strategy = body?['strategy'] as Map<String, dynamic>?;
      setState(() {
        _createdId = strategy?['id'] as int?;
        _status = _CreateStatus.success;
      });
    } on DioException catch (e) {
      // Dio throws for 4xx/5xx — extract the server's JSON error message.
      final body = e.response?.data;
      final serverMsg = (body is Map ? body['error'] : null) as String?;
      setState(() {
        _errorMsg = serverMsg ?? _friendlyDioError(e);
        _status = _CreateStatus.error;
      });
    } catch (e) {
      setState(() {
        _errorMsg = e.toString().replaceFirst('Exception: ', '');
        _status = _CreateStatus.error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final proposal = _proposal;

    final type = (proposal['type'] as String?) ?? '';
    final exchange = (proposal['exchange'] as String?) ?? '';
    final symbol = (proposal['symbol'] as String?) ?? '';
    final rationale = proposal['rationale'] as String?;
    final parameters =
        (proposal['parameters'] as Map<String, dynamic>?) ?? {};
    final subscription = proposal['subscription'];
    final initialDataConfig = proposal['initialDataConfig'];
    final strategyLabel = _strategyLabels[type] ?? type;

    if (_status == _CreateStatus.success) {
      return Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF10b981).withValues(alpha: 0.12),
          border: Border.all(
            color: const Color(0xFF10b981).withValues(alpha: 0.35),
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.check_circle, color: Color(0xFF10b981), size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Strategy created!',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF065f46),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${_nameController.text} ($strategyLabel · $symbol)',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: const Color(0xFF065f46),
                    ),
                  ),
                  if (_createdId != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Strategy #$_createdId — view it in the Strategies tab.',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: const Color(0xFF059669),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.25),
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Header ──────────────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            color: theme.colorScheme.surfaceContainerHighest
                .withValues(alpha: 0.5),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    strategyLabel,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                if (exchange.isNotEmpty)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: _exchangeBg(exchange, context),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      exchange.toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: _exchangeFg(exchange, context),
                      ),
                    ),
                  ),
                const SizedBox(width: 6),
                Text(
                  symbol,
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontFamily: 'monospace',
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),

          // ── Rationale ───────────────────────────────────────────────────────
          if (rationale != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Text(
                rationale,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.4,
                ),
              ),
            ),

          // ── Parameters ──────────────────────────────────────────────────────
          if (parameters.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Text(
                'PARAMETERS',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Wrap(
                spacing: 24,
                runSpacing: 4,
                children: parameters.entries.map((e) {
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _paramLabels[e.key] ?? e.key,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _formatParamValue(e.key, e.value),
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSurface,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  );
                }).toList(),
              ),
            ),
          ],

          // ── Advanced section ─────────────────────────────────────────────
          if (subscription != null || initialDataConfig != null) ...[
            const Divider(height: 1, thickness: 0.5),
            InkWell(
              onTap: () =>
                  setState(() => _showAdvanced = !_showAdvanced),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    Icon(
                      _showAdvanced
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 16,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${_showAdvanced ? 'Hide' : 'Show'} subscription & data config',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_showAdvanced) ...[
              if (subscription != null)
                _AdvancedBlock(
                  label: 'SUBSCRIPTION',
                  content: subscription.toString(),
                ),
              if (initialDataConfig != null)
                _AdvancedBlock(
                  label: 'INITIAL DATA',
                  content: initialDataConfig.toString(),
                ),
            ],
          ],

          // ── Name input + Create button ───────────────────────────────────
          const Divider(height: 1, thickness: 0.5),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'STRATEGY NAME',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _nameController,
                  enabled: _status != _CreateStatus.loading,
                  style: theme.textTheme.bodySmall,
                  decoration: InputDecoration(
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(
                        color: theme.colorScheme.outline.withValues(alpha: 0.4),
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(
                        color: theme.colorScheme.outline.withValues(alpha: 0.4),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ),
                ),
                if (_status == _CreateStatus.error) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 14,
                        color: Color(0xFFef4444),
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          _errorMsg,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: const Color(0xFFef4444),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _status == _CreateStatus.loading
                        ? null
                        : _handleCreate,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: _status == _CreateStatus.loading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text(
                            'Create Strategy',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AdvancedBlock extends StatelessWidget {
  final String label;
  final String content;

  const _AdvancedBlock({required this.label, required this.content});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              fontSize: 9,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              content,
              style: theme.textTheme.labelSmall?.copyWith(
                fontFamily: 'monospace',
                fontSize: 10,
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
