import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import '../models/strategy.dart';
import '../models/order.dart';
import '../services/strategy_service.dart';
import '../services/order_service.dart';
import '../services/copy_service.dart';
import '../design/tokens/color.dart';
import '../utils/exchange_config.dart';
import '../utils/number_format_utils.dart';
import '../widgets/copy_text.dart';
import 'order_detail.dart';
import 'strategy_create.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Order filter / sort enums
// ─────────────────────────────────────────────────────────────────────────────

enum _OrderStatusFilter { all, open, filled, cancelled, partial }
enum _OrderSideFilter { all, buy, sell }
enum _OrderSortOption { newestFirst, oldestFirst, priceHigh, priceLow }

extension _OrderStatusFilterLabel on _OrderStatusFilter {
  String get label {
    switch (this) {
      case _OrderStatusFilter.all: return 'All';
      case _OrderStatusFilter.open: return 'Open';
      case _OrderStatusFilter.filled: return 'Filled';
      case _OrderStatusFilter.cancelled: return 'Cancelled';
      case _OrderStatusFilter.partial: return 'Partial';
    }
  }
}

extension _OrderSortOptionLabel on _OrderSortOption {
  String get label {
    switch (this) {
      case _OrderSortOption.newestFirst: return 'Newest';
      case _OrderSortOption.oldestFirst: return 'Oldest';
      case _OrderSortOption.priceHigh: return 'Price ↓';
      case _OrderSortOption.priceLow: return 'Price ↑';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen widget
// ─────────────────────────────────────────────────────────────────────────────

class StrategyDetailScreen extends StatefulWidget {
  final Strategy strategy;
  final StrategyPnL? pnl;

  const StrategyDetailScreen({super.key, required this.strategy, this.pnl});

  @override
  State<StrategyDetailScreen> createState() => _StrategyDetailScreenState();
}

class _StrategyDetailScreenState extends State<StrategyDetailScreen>
    with SingleTickerProviderStateMixin {
  final StrategyService _strategyService = StrategyService.instance;
  final OrderService _orderService = OrderService.instance;

  late Strategy _strategy;
  StrategyPositionSummary? _positionSummary;
  RebuiltPerformance? _rebuiltPerformance;

  bool _isUpdating = false;
  bool _isLoadingData = true;

  // Orders
  List<Order> _orders = [];
  bool _isLoadingOrders = true;
  final Set<String> _processingOrders = {};

  // Order filter / sort state
  _OrderStatusFilter _statusFilter = _OrderStatusFilter.all;
  _OrderSideFilter _sideFilter = _OrderSideFilter.all;
  _OrderSortOption _sortOption = _OrderSortOption.newestFirst;

  late TabController _tabController;

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _strategy = widget.strategy;
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────────────

  Future<void> _loadData() async {
    setState(() => _isLoadingData = true);
    try {
      final detail = await _strategyService.getStrategyDetail(_strategy.id);
      if (mounted) {
        setState(() {
          if (detail.strategy != null) _strategy = detail.strategy!;
          _positionSummary = detail.positionSummary;
          _rebuiltPerformance = detail.rebuiltPerformance;
          _isLoadingData = false;
        });
      }
    } catch (e) {
      debugPrint('Failed to refresh strategy: $e');
      if (mounted) setState(() => _isLoadingData = false);
    }
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    setState(() => _isLoadingOrders = true);
    try {
      final orders = await _orderService.getOrders(strategyId: _strategy.id);
      if (mounted) {
        setState(() {
          _orders = orders;
          _isLoadingOrders = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoadingOrders = false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered + sorted orders
  // ─────────────────────────────────────────────────────────────────────────

  List<Order> get _filteredOrders {
    List<Order> result = List.from(_orders);

    // Status filter
    result = result.where((o) {
      switch (_statusFilter) {
        case _OrderStatusFilter.all:
          return true;
        case _OrderStatusFilter.open:
          return o.isNew;
        case _OrderStatusFilter.filled:
          return o.status.toUpperCase() == 'FILLED';
        case _OrderStatusFilter.cancelled:
          return o.status.toUpperCase() == 'CANCELED' ||
              o.status.toUpperCase() == 'CANCELLED';
        case _OrderStatusFilter.partial:
          return o.isPartiallyFilled;
      }
    }).toList();

    // Side filter
    if (_sideFilter != _OrderSideFilter.all) {
      result = result.where((o) {
        final side = o.side.toUpperCase();
        return _sideFilter == _OrderSideFilter.buy ? side == 'BUY' : side == 'SELL';
      }).toList();
    }

    // Sort
    result.sort((a, b) {
      switch (_sortOption) {
        case _OrderSortOption.newestFirst:
          return b.timestamp.compareTo(a.timestamp);
        case _OrderSortOption.oldestFirst:
          return a.timestamp.compareTo(b.timestamp);
        case _OrderSortOption.priceHigh:
          final ap = a.price ?? a.averagePrice ?? 0;
          final bp = b.price ?? b.averagePrice ?? 0;
          return bp.compareTo(ap);
        case _OrderSortOption.priceLow:
          final ap = a.price ?? a.averagePrice ?? 0;
          final bp = b.price ?? b.averagePrice ?? 0;
          return ap.compareTo(bp);
      }
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  bool _isOrderOpen(Order order) => order.isNew || order.isPartiallyFilled;
  bool _canEditOrder(Order order) =>
      _isOrderOpen(order) && order.type.toUpperCase() == 'LIMIT';

  Future<void> _toggleStatus() async {
    if (_isUpdating) return;
    final newStatus = _strategy.isActive ? 'stopped' : 'active';
    setState(() => _isUpdating = true);
    try {
      final updated = await _strategyService.updateStrategyStatus(_strategy.id, newStatus);
      if (updated != null && mounted) {
        setState(() => _strategy = updated);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_strategy.isActive ? 'Strategy started' : 'Strategy stopped'),
            backgroundColor: _strategy.isActive ? Colors.green : Colors.grey,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  Future<void> _deleteStrategy() async {
    if (_strategy.isActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Stop strategy before deleting')),
      );
      return;
    }
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete strategy'),
        content: Text('Delete "${_strategy.name}"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _isUpdating = true);
    try {
      final success = await _strategyService.deleteStrategy(_strategy.id);
      if (success && mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Strategy deleted'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  Future<void> _editStrategy() async {
    final result = await Navigator.of(context).push<Strategy>(
      MaterialPageRoute(
        builder: (_) => StrategyCreateScreen(editStrategy: _strategy),
      ),
    );
    if (result != null && mounted) {
      setState(() => _strategy = result);
      _loadData();
    }
  }

  Future<void> _confirmCancelOrder(Order order) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const CopyText('screen.strategy_detail.cancel_order', fallback: 'Cancel order'),
        content: CopyText(
          'screen.strategy_detail.cancel_order_confirm',
          params: {'symbol': order.symbol, 'side': order.side},
          fallback: 'Cancel {{symbol}} {{side}} order?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const CopyText('screen.strategy_detail.no', fallback: 'No'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const CopyText('screen.login.cancel', fallback: 'Cancel'),
          ),
        ],
      ),
    );
    if (confirm == true) await _handleCancelOrder(order);
  }

  Future<void> _handleCancelOrder(Order order) async {
    if (_processingOrders.contains(order.id)) return;
    setState(() => _processingOrders.add(order.id));
    try {
      final updated = await _orderService.cancelOrder(order.id);
      if (updated == null) throw Exception('Cancel failed');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: CopyText('screen.strategy_detail.order_cancelled', fallback: 'Order cancelled'),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadOrders();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Cancel failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processingOrders.remove(order.id));
    }
  }

  Future<void> _showEditOrderDialog(Order order) async {
    final quantityController =
        TextEditingController(text: order.quantity.toString());
    final priceController =
        TextEditingController(text: order.price?.toString() ?? '');
    final copy = CopyService.instance;
    Timer? debounce;
    String? quantityError;
    String? priceError;
    bool submitting = false;

    void validate(void Function(void Function()) set) {
      final q = double.tryParse(quantityController.text.trim());
      final p = double.tryParse(priceController.text.trim());
      set(() {
        quantityError = (q == null || q <= 0) ? 'Quantity must be positive' : null;
        priceError = (p == null || p <= 0) ? 'Price must be positive' : null;
      });
    }

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final canSubmit = !submitting && quantityError == null && priceError == null;
          return AlertDialog(
            title: const CopyText('screen.strategy_detail.edit_order', fallback: 'Edit order'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: quantityController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: copy.t('common.quantity_label', fallback: 'Quantity'),
                    errorText: quantityError,
                  ),
                  onChanged: (_) {
                    debounce?.cancel();
                    debounce = Timer(
                      const Duration(milliseconds: 400),
                      () => validate(setDialogState),
                    );
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: priceController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: copy.t('common.price_label', fallback: 'Price'),
                    errorText: priceError,
                  ),
                  onChanged: (_) {
                    debounce?.cancel();
                    debounce = Timer(
                      const Duration(milliseconds: 400),
                      () => validate(setDialogState),
                    );
                  },
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: submitting ? null : () => Navigator.pop(ctx),
                child: const CopyText('screen.login.cancel', fallback: 'Cancel'),
              ),
              TextButton(
                onPressed: canSubmit
                    ? () async {
                        validate(setDialogState);
                        if (quantityError != null || priceError != null) return;
                        setDialogState(() => submitting = true);
                        try {
                          final updated = await _orderService.updateOrder(
                            order.id,
                            quantity:
                                double.parse(quantityController.text.trim()),
                            price: double.parse(priceController.text.trim()),
                          );
                          if (updated == null) throw Exception('Update failed');
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: CopyText(
                                  'screen.strategy_detail.order_updated',
                                  fallback: 'Order updated',
                                ),
                                backgroundColor: Colors.green,
                              ),
                            );
                          }
                          await _loadOrders();
                          if (!mounted) return;
                          Navigator.of(context).pop();
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Update failed: $e'),
                                backgroundColor: Colors.red,
                              ),
                            );
                          }
                          setDialogState(() => submitting = false);
                        }
                      }
                    : null,
                child: submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const CopyText('screen.login.save', fallback: 'Save'),
              ),
            ],
          );
        },
      ),
    );

    debounce?.cancel();
    quantityController.dispose();
    priceController.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  Color _getStatusColor(String status) {
    switch (status) {
      case 'active': return ColorTokens.profitGreen;
      case 'stopped': return Colors.grey;
      case 'paused': return ColorTokens.warningAmber;
      case 'error': return ColorTokens.lossRed;
      default: return Colors.grey;
    }
  }

  String _formatStrategyStatus(String status) {
    switch (status) {
      case 'active': return 'Active';
      case 'stopped': return 'Stopped';
      case 'paused': return 'Paused';
      case 'error': return 'Error';
      default: return status;
    }
  }

  String _formatSize(double value) {
    if (value == 0) return '0';
    return value.toStringAsFixed(8).replaceAll(RegExp(r'\.?0+$'), '');
  }

  String _formatCurrency(double value) {
    final abs = value.abs();
    final formatted = abs >= 1000
        ? '\$${abs.toStringAsFixed(2)}'
        : '\$${abs.toStringAsFixed(abs < 0.01 ? 6 : 2)}';
    if (value > 0) return '+$formatted';
    if (value < 0) return '-${formatted.substring(1)}';
    return formatted;
  }

  String _formatPercent(double value) => '${value.toStringAsFixed(2)}%';

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final statusColor = _getStatusColor(_strategy.status);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _strategy.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        actions: [
          // Edit button
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Edit',
            onPressed: _isUpdating ? null : _editStrategy,
          ),
          // Start / Stop button
          IconButton(
            icon: _isUpdating
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(
                    _strategy.isActive
                        ? Icons.stop_circle_outlined
                        : Icons.play_circle_outline,
                  ),
            color: _strategy.isActive ? Colors.red : Colors.green,
            tooltip: _strategy.isActive ? 'Stop' : 'Start',
            onPressed: _isUpdating ? null : _toggleStatus,
          ),
          if (!_strategy.isActive)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Delete',
              onPressed: _isUpdating ? null : _deleteStrategy,
            ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: Theme.of(context).colorScheme.primary,
          unselectedLabelColor: Theme.of(context).hintColor,
          indicatorColor: Theme.of(context).colorScheme.primary,
          dividerColor:
              isDark ? Colors.grey[850] : Colors.grey.withValues(alpha: 0.12),
          dividerHeight: 1.w,
          tabs: const [
            Tab(text: 'Orders'),
            Tab(text: 'Performance'),
            Tab(text: 'Configuration'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildOrdersTab(),
          _buildPerformanceTab(),
          _buildConfigTab(),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shared Header (strategy info + PnL summary cards + position summary)
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildStrategyHeader() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final statusColor = _getStatusColor(_strategy.status);
    final displaySymbol =
        _strategy.normalizedSymbol ?? _strategy.symbol ?? 'N/A';
    final baseAsset = (displaySymbol.split('/').firstOrNull ?? displaySymbol)
        .split('-')
        .first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Strategy info card ──────────────────────────────────────────
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ExchangeChip(
                    exchangeId: _strategy.exchange ?? '',
                    showIcon: true,
                    fontSize: 12,
                  ),
                  SizedBox(width: 8.w),
                  Expanded(
                    child: Text(
                      displaySymbol,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15.sp,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  // Market type badge
                  if (_strategy.marketType != 'spot')
                    Container(
                      margin: EdgeInsets.only(right: 6.w),
                      padding:
                          EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.w),
                      decoration: BoxDecoration(
                        color: Colors.purple.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6.w),
                      ),
                      child: Text(
                        _strategy.marketType == 'perpetual' ? '⚡ Perp' : '📈 Futures',
                        style: TextStyle(
                          fontSize: 10.sp,
                          color: Colors.purple,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  // Status badge
                  Container(
                    padding:
                        EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.w),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10.w),
                    ),
                    child: Text(
                      _formatStrategyStatus(_strategy.status),
                      style: TextStyle(
                        color: statusColor,
                        fontWeight: FontWeight.w700,
                        fontSize: 11.sp,
                      ),
                    ),
                  ),
                ],
              ),

              // Strategy type + runtime
              SizedBox(height: 8.w),
              Row(
                children: [
                  Icon(
                    Icons.tune,
                    size: 12.w,
                    color: Theme.of(context).hintColor,
                  ),
                  SizedBox(width: 4.w),
                  Text(
                    _strategy.type,
                    style: TextStyle(
                      fontSize: 11.sp,
                      color: Theme.of(context).hintColor,
                      fontFamily: 'monospace',
                    ),
                  ),
                  SizedBox(width: 12.w),
                  Icon(
                    Icons.access_time,
                    size: 12.w,
                    color: Theme.of(context).hintColor,
                  ),
                  SizedBox(width: 4.w),
                  Text(
                    _buildRuntimeString(),
                    style: TextStyle(
                      fontSize: 11.sp,
                      color: Theme.of(context).hintColor,
                    ),
                  ),
                ],
              ),

              // Error message
              if (_strategy.errorMessage != null) ...[
                SizedBox(height: 10.w),
                Container(
                  padding: EdgeInsets.all(10.w),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8.w),
                    border:
                        Border.all(color: Colors.red.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline,
                          color: Colors.red, size: 14),
                      SizedBox(width: 6.w),
                      Expanded(
                        child: Text(
                          _strategy.errorMessage!,
                          style:
                              const TextStyle(color: Colors.red, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        SizedBox(height: 10.w),

        // ── Top PnL summary cards (4 cards, always visible) ────────────
        if (_rebuiltPerformance != null) ...[
          _PnlSummaryRow(
            performance: _rebuiltPerformance!,
            formatCurrency: _formatCurrency,
            formatPercent: _formatPercent,
          ),
          SizedBox(height: 10.w),
        ],

        // ── Position summary cards ──────────────────────────────────────
        if (_positionSummary != null) ...[
          _PositionSummarySection(
            summary: _positionSummary!,
            baseAsset: baseAsset,
            formatSize: _formatSize,
          ),
          SizedBox(height: 10.w),
        ],
      ],
    );
  }

  String _buildRuntimeString() {
    final startStr = _strategy.lastExecutionTime ?? _strategy.createdAt;
    final endTime = _strategy.isActive ? DateTime.now() : _strategy.updatedAt;
    final duration = endTime.difference(startStr);
    final d = duration.inDays;
    final h = duration.inHours % 24;
    final m = duration.inMinutes % 60;
    final s = duration.inSeconds % 60;
    final parts = <String>[];
    if (d > 0) parts.add('${d}d');
    if (h > 0 || d > 0) parts.add('${h}h');
    if (m > 0 || h > 0 || d > 0) parts.add('${m}m');
    parts.add('${s}s');
    return parts.join(' ');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Orders
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildOrdersTab() {
    final filtered = _filteredOrders;

    return Column(
      children: [
        // ── Filter / Sort Bar ──────────────────────────────────────────
        _OrderFilterBar(
          statusFilter: _statusFilter,
          sideFilter: _sideFilter,
          sortOption: _sortOption,
          totalCount: _orders.length,
          filteredCount: filtered.length,
          onStatusChanged: (v) => setState(() => _statusFilter = v),
          onSideChanged: (v) => setState(() => _sideFilter = v),
          onSortChanged: (v) => setState(() => _sortOption = v),
        ),

        // ── List ──────────────────────────────────────────────────────
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadData,
            child: _isLoadingOrders
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 24.w),
                    itemCount: filtered.isEmpty ? 2 : filtered.length + 1,
                    itemBuilder: (ctx, idx) {
                      if (idx == 0) {
                        return Padding(
                          padding: EdgeInsets.only(top: 12.w, bottom: 8.w),
                          child: _buildStrategyHeader(),
                        );
                      }

                      if (filtered.isEmpty) {
                        return Padding(
                          padding: EdgeInsets.symmetric(vertical: 32.w),
                          child: Center(
                            child: Text(
                              _orders.isEmpty
                                  ? 'No orders yet'
                                  : 'No orders match the current filter',
                              style: TextStyle(
                                color: Theme.of(context).hintColor,
                                fontSize: 14.sp,
                              ),
                            ),
                          ),
                        );
                      }

                      final order = filtered[idx - 1];
                      final isProcessing = _processingOrders.contains(order.id);
                      final canCancel = _isOrderOpen(order);
                      final canEdit = _canEditOrder(order);

                      final orderItem = _OrderItem(
                        order: order,
                        isProcessing: isProcessing,
                        canCancel: canCancel,
                        canEdit: canEdit,
                        onCancel: () => _confirmCancelOrder(order),
                        onEdit: () => _showEditOrderDialog(order),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => OrderDetailScreen(order: order),
                          ),
                        ),
                      );

                      if (!canCancel && !canEdit) return orderItem;

                      return Slidable(
                        key: ValueKey(order.id),
                        endActionPane: ActionPane(
                          motion: const ScrollMotion(),
                          extentRatio: canEdit && canCancel ? 0.5 : 0.25,
                          children: [
                            if (canEdit)
                              SlidableAction(
                                onPressed: isProcessing
                                    ? null
                                    : (_) => _showEditOrderDialog(order),
                                backgroundColor: Theme.of(context)
                                    .colorScheme
                                    .surfaceContainerHighest,
                                foregroundColor:
                                    Theme.of(context).colorScheme.primary,
                                icon: Icons.edit,
                                label: 'Edit',
                              ),
                            if (canCancel)
                              SlidableAction(
                                onPressed: isProcessing
                                    ? null
                                    : (_) => _confirmCancelOrder(order),
                                backgroundColor: Theme.of(context)
                                    .colorScheme
                                    .surfaceContainerHighest,
                                foregroundColor: Colors.red,
                                icon: Icons.close,
                                label: 'Cancel',
                              ),
                          ],
                        ),
                        child: orderItem,
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Performance
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildPerformanceTab() {
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: EdgeInsets.fromLTRB(16.w, 12.w, 16.w, 24.w),
        children: [
          _buildStrategyHeader(),
          if (_isLoadingData)
            const Center(child: CircularProgressIndicator())
          else if (_rebuiltPerformance == null)
            _buildNoPerformanceData()
          else ...[
            _buildPerformanceMetrics(_rebuiltPerformance!),
          ],
        ],
      ),
    );
  }

  Widget _buildNoPerformanceData() {
    return _Card(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 32.w),
        child: Column(
          children: [
            Icon(
              Icons.bar_chart,
              size: 40.w,
              color: Theme.of(context).hintColor,
            ),
            SizedBox(height: 12.w),
            Text(
              'No performance data yet',
              style: TextStyle(
                color: Theme.of(context).hintColor,
                fontSize: 14.sp,
              ),
            ),
            SizedBox(height: 4.w),
            Text(
              'Performance metrics appear once orders are filled',
              style: TextStyle(
                color: Theme.of(context).hintColor.withValues(alpha: 0.7),
                fontSize: 12.sp,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPerformanceMetrics(RebuiltPerformance perf) {
    final pnl = perf.pnl;
    final activity = perf.activity;
    final orders = perf.orders;
    final risk = perf.risk;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle('PnL Breakdown'),
        SizedBox(height: 8.w),
        _MetricGrid(
          children: [
            _MetricCard(
              label: 'Net PnL',
              value: _formatCurrency(pnl.netPnL),
              valueColor: pnl.netPnL >= 0 ? ColorTokens.profitGreen : ColorTokens.lossRed,
              sub: 'Total - Fees',
              icon: pnl.netPnL >= 0 ? Icons.trending_up : Icons.trending_down,
            ),
            _MetricCard(
              label: 'Total PnL',
              value: _formatCurrency(pnl.totalPnL),
              valueColor:
                  pnl.totalPnL >= 0 ? ColorTokens.profitGreen : ColorTokens.lossRed,
              icon: Icons.attach_money,
            ),
            _MetricCard(
              label: 'Realized PnL',
              value: _formatCurrency(pnl.realizedPnL),
              valueColor:
                  pnl.realizedPnL >= 0 ? ColorTokens.profitGreen : ColorTokens.lossRed,
              icon: Icons.check_circle_outline,
            ),
            _MetricCard(
              label: 'Unrealized PnL',
              value: _formatCurrency(pnl.unrealizedPnL),
              valueColor: pnl.unrealizedPnL >= 0
                  ? ColorTokens.profitGreen
                  : ColorTokens.lossRed,
              icon: Icons.timelapse,
            ),
            _MetricCard(
              label: 'Total Fees',
              value: _formatCurrency(pnl.totalFees),
              icon: Icons.receipt_long_outlined,
            ),
            _MetricCard(
              label: 'ROI',
              value: _formatPercent(pnl.roi),
              valueColor: pnl.roi >= 0 ? ColorTokens.profitGreen : ColorTokens.lossRed,
              icon: Icons.percent,
            ),
          ],
        ),

        SizedBox(height: 16.w),
        _SectionTitle('Trade Statistics'),
        SizedBox(height: 8.w),
        _MetricGrid(
          children: [
            _MetricCard(
              label: 'Win Rate',
              value: _formatPercent(pnl.winRate),
              sub: activity != null
                  ? '${activity.winningTrades}W / ${activity.losingTrades}L'
                  : null,
              icon: Icons.emoji_events_outlined,
            ),
            _MetricCard(
              label: 'Profit Factor',
              value: pnl.profitFactor.toStringAsFixed(2),
              sub: 'Gross profit / loss',
              icon: Icons.balance,
            ),
            if (orders != null) ...[
              _MetricCard(
                label: 'Total Orders',
                value: orders.totalCount.toString(),
                sub: 'Filled: ${orders.totalFilled}',
                icon: Icons.list_alt,
              ),
              _MetricCard(
                label: 'Long / Short',
                value:
                    '${orders.longFilledCount} / ${orders.shortFilledCount}',
                sub: 'Filled orders',
                icon: Icons.compare_arrows,
              ),
            ],
          ],
        ),

        if (risk != null) ...[
          SizedBox(height: 16.w),
          _SectionTitle('Risk Metrics'),
          SizedBox(height: 8.w),
          _MetricGrid(
            children: [
              _MetricCard(
                label: 'Max Drawdown',
                value: _formatPercent(risk.maxDrawdown),
                valueColor: ColorTokens.lossRed,
                icon: Icons.arrow_downward,
              ),
              _MetricCard(
                label: 'Sharpe Ratio',
                value: risk.sharpeRatio.toStringAsFixed(2),
                icon: Icons.show_chart,
              ),
            ],
          ),
        ],
      ],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Configuration
  // ─────────────────────────────────────────────────────────────────────────

  Widget _buildConfigTab() {
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: EdgeInsets.fromLTRB(16.w, 12.w, 16.w, 24.w),
        children: [
          _buildStrategyHeader(),
          _buildConfigSection('Parameters', _strategy.parameters),
          if (_strategy.initialDataConfig != null)
            _buildConfigSection(
                'Initial Data Config', _strategy.initialDataConfig),
          if (_strategy.subscription != null)
            _buildConfigSection('Subscription Config', _strategy.subscription),
          if (_strategy.parameters == null &&
              _strategy.initialDataConfig == null &&
              _strategy.subscription == null)
            _Card(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 24.w),
                child: Center(
                  child: Text(
                    'No configuration available',
                    style: TextStyle(
                      color: Theme.of(context).hintColor,
                      fontSize: 14.sp,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildConfigSection(
    String title,
    Map<String, dynamic>? data,
  ) {
    if (data == null || data.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: EdgeInsets.only(bottom: 12.w),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: BorderRadius.circular(14.w),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(16.w, 14.w, 16.w, 0),
            child: Row(
              children: [
                Icon(
                  _configIcon(title),
                  size: 16.w,
                  color: Theme.of(context).colorScheme.primary,
                ),
                SizedBox(width: 8.w),
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14.sp,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Divider(
              height: 1,
              thickness: 0.5,
              color: isDark
                  ? Colors.grey[850]
                  : Colors.grey.withValues(alpha: 0.2),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 16.w),
            child: SelectableText(
              const JsonEncoder.withIndent('  ').convert(data),
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12.sp,
                color: Theme.of(context).textTheme.bodySmall?.color,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  IconData _configIcon(String title) {
    if (title.toLowerCase().contains('parameter')) return Icons.tune;
    if (title.toLowerCase().contains('initial')) return Icons.download_outlined;
    if (title.toLowerCase().contains('subscription')) return Icons.stream;
    return Icons.settings_outlined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PnL Summary Row (4 compact cards shown above tabs)
// ─────────────────────────────────────────────────────────────────────────────

class _PnlSummaryRow extends StatelessWidget {
  final RebuiltPerformance performance;
  final String Function(double) formatCurrency;
  final String Function(double) formatPercent;

  const _PnlSummaryRow({
    required this.performance,
    required this.formatCurrency,
    required this.formatPercent,
  });

  @override
  Widget build(BuildContext context) {
    final pnl = performance.pnl;
    final activity = performance.activity;
    return Row(
      children: [
        Expanded(
          child: _CompactPnlCard(
            label: 'Total PnL',
            value: formatCurrency(pnl.totalPnL),
            sub: 'ROI: ${formatPercent(pnl.roi)}',
            positive: pnl.totalPnL >= 0,
          ),
        ),
        SizedBox(width: 8.w),
        Expanded(
          child: _CompactPnlCard(
            label: 'Realized',
            value: formatCurrency(pnl.realizedPnL),
            sub: 'Fees: ${formatCurrency(pnl.totalFees).replaceAll('+', '')}',
            positive: pnl.realizedPnL >= 0,
          ),
        ),
        SizedBox(width: 8.w),
        Expanded(
          child: _CompactPnlCard(
            label: 'Unrealized',
            value: formatCurrency(pnl.unrealizedPnL),
            sub: 'PF: ${pnl.profitFactor.toStringAsFixed(2)}',
            positive: pnl.unrealizedPnL >= 0,
          ),
        ),
        SizedBox(width: 8.w),
        Expanded(
          child: _CompactPnlCard(
            label: 'Win Rate',
            value: formatPercent(pnl.winRate),
            sub: activity != null
                ? '${activity.winningTrades}W/${activity.losingTrades}L'
                : null,
            positive: null,
          ),
        ),
      ],
    );
  }
}

class _CompactPnlCard extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final bool? positive;

  const _CompactPnlCard({
    required this.label,
    required this.value,
    this.sub,
    this.positive,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    Color valueColor;
    if (positive == null) {
      valueColor = Theme.of(context).colorScheme.onSurface;
    } else if (positive!) {
      valueColor = ColorTokens.profitGreen;
    } else {
      valueColor = ColorTokens.lossRed;
    }

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 10.w),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: BorderRadius.circular(12.w),
        border: Border.all(
          color:
              isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.12),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.15 : 0.04),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 10.sp,
              color: Theme.of(context).hintColor,
              fontWeight: FontWeight.w500,
            ),
          ),
          SizedBox(height: 4.w),
          Text(
            value,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: FontWeight.w700,
              color: valueColor,
              fontFamily: 'monospace',
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (sub != null) ...[
            SizedBox(height: 2.w),
            Text(
              sub!,
              style: TextStyle(
                fontSize: 9.sp,
                color: Theme.of(context).hintColor,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Position Summary Section
// ─────────────────────────────────────────────────────────────────────────────

class _PositionSummarySection extends StatelessWidget {
  final StrategyPositionSummary summary;
  final String baseAsset;
  final String Function(double) formatSize;

  const _PositionSummarySection({
    required this.summary,
    required this.baseAsset,
    required this.formatSize,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final net = summary.netExecutedPosition;
    final netColor = net > 0
        ? ColorTokens.profitGreen
        : net < 0
            ? ColorTokens.lossRed
            : Theme.of(context).hintColor;

    return Container(
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: BorderRadius.circular(14.w),
        border: Border.all(
          color:
              isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Net position (highlight row)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Net Position',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: Theme.of(context).hintColor,
                    ),
                  ),
                  SizedBox(height: 2.w),
                  Text(
                    'Net filled $baseAsset',
                    style: TextStyle(
                      fontSize: 10.sp,
                      color: Theme.of(context).hintColor.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
              Text(
                '${net > 0 ? '+' : ''}${formatSize(net)}',
                style: TextStyle(
                  fontSize: 22.sp,
                  fontWeight: FontWeight.bold,
                  color: netColor,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
          SizedBox(height: 10.w),
          Divider(
            height: 1,
            color: isDark
                ? Colors.grey[850]
                : Colors.grey.withValues(alpha: 0.15),
          ),
          SizedBox(height: 10.w),
          // 4-column grid
          Row(
            children: [
              Expanded(
                child: _PosItem(
                  label: 'Bought',
                  value: formatSize(summary.totalBoughtSize),
                  color: ColorTokens.profitGreen,
                ),
              ),
              Expanded(
                child: _PosItem(
                  label: 'Sold',
                  value: formatSize(summary.totalSoldSize),
                  color: ColorTokens.lossRed,
                ),
              ),
              Expanded(
                child: _PosItem(
                  label: 'Pend Buy',
                  value: formatSize(summary.pendingBuySize),
                  color: summary.pendingBuySize > 0
                      ? ColorTokens.profitGreen
                      : null,
                ),
              ),
              Expanded(
                child: _PosItem(
                  label: 'Pend Sell',
                  value: formatSize(summary.pendingSellSize),
                  color: summary.pendingSellSize > 0
                      ? ColorTokens.lossRed
                      : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PosItem extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;

  const _PosItem({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10.sp,
            color: Theme.of(context).hintColor,
          ),
        ),
        SizedBox(height: 3.w),
        Text(
          value,
          style: TextStyle(
            fontSize: 12.sp,
            fontWeight: FontWeight.w700,
            color: color ?? Theme.of(context).colorScheme.onSurface,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Filter Bar
// ─────────────────────────────────────────────────────────────────────────────

class _OrderFilterBar extends StatelessWidget {
  final _OrderStatusFilter statusFilter;
  final _OrderSideFilter sideFilter;
  final _OrderSortOption sortOption;
  final int totalCount;
  final int filteredCount;
  final ValueChanged<_OrderStatusFilter> onStatusChanged;
  final ValueChanged<_OrderSideFilter> onSideChanged;
  final ValueChanged<_OrderSortOption> onSortChanged;

  const _OrderFilterBar({
    required this.statusFilter,
    required this.sideFilter,
    required this.sortOption,
    required this.totalCount,
    required this.filteredCount,
    required this.onStatusChanged,
    required this.onSideChanged,
    required this.onSortChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final divColor =
        isDark ? Colors.grey[850]! : Colors.grey.withValues(alpha: 0.12);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        border: Border(bottom: BorderSide(color: divColor)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Status filter pills ──────────────────────────────────────────
          SizedBox(
            height: 44.w,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.fromLTRB(12.w, 8.w, 12.w, 8.w),
              children: _OrderStatusFilter.values.map((f) {
                final selected = statusFilter == f;
                return _FilterPill(
                  label: f.label,
                  selected: selected,
                  onTap: () => onStatusChanged(f),
                );
              }).toList(),
            ),
          ),

          // ── Side pills + Sort action + Count ────────────────────────────
          Padding(
            padding: EdgeInsets.fromLTRB(12.w, 0, 12.w, 8.w),
            child: Row(
              children: [
                _SidePills(value: sideFilter, onChanged: onSideChanged),
                const Spacer(),
                // Sort button — opens action sheet
                GestureDetector(
                  onTap: () => _showSortSheet(context),
                  child: Container(
                    padding:
                        EdgeInsets.symmetric(horizontal: 10.w, vertical: 5.w),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8.w),
                      border: Border.all(
                        color: isDark
                            ? Colors.grey[700]!
                            : Colors.grey.withValues(alpha: 0.25),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.sort_rounded,
                            size: 13.w,
                            color: Theme.of(context).hintColor),
                        SizedBox(width: 4.w),
                        Text(
                          sortOption.label,
                          style: TextStyle(
                            fontSize: 12.sp,
                            fontWeight: FontWeight.w500,
                            color:
                                Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                        SizedBox(width: 2.w),
                        Icon(Icons.keyboard_arrow_down_rounded,
                            size: 14.w,
                            color: Theme.of(context).hintColor),
                      ],
                    ),
                  ),
                ),
                SizedBox(width: 8.w),
                Text(
                  totalCount == filteredCount
                      ? '$totalCount orders'
                      : '$filteredCount / $totalCount',
                  style: TextStyle(
                    fontSize: 11.sp,
                    color: Theme.of(context).hintColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showSortSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _SortActionSheet(
        current: sortOption,
        onSelected: (opt) {
          Navigator.pop(context);
          onSortChanged(opt);
        },
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Pill — solid pill button for status filter row
// ─────────────────────────────────────────────────────────────────────────────

class _FilterPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterPill(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primary = Theme.of(context).colorScheme.primary;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        margin: EdgeInsets.only(right: 6.w),
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 5.w),
        decoration: BoxDecoration(
          color: selected
              ? primary
              : isDark
                  ? Colors.grey[850]
                  : Colors.grey.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20.w),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.sp,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected
                ? Colors.white
                : isDark
                    ? Colors.grey[300]
                    : Colors.grey[700],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Side Pills — inline All / Buy / Sell selector
// ─────────────────────────────────────────────────────────────────────────────

class _SidePills extends StatelessWidget {
  final _OrderSideFilter value;
  final ValueChanged<_OrderSideFilter> onChanged;

  const _SidePills({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: _OrderSideFilter.values.map((side) {
        final selected = value == side;
        Color? accent;
        if (side == _OrderSideFilter.buy) accent = ColorTokens.profitGreen;
        if (side == _OrderSideFilter.sell) accent = ColorTokens.lossRed;
        final active = accent ?? Theme.of(context).colorScheme.primary;

        return GestureDetector(
          onTap: () => onChanged(side),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            margin: EdgeInsets.only(right: 5.w),
            padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.w),
            decoration: BoxDecoration(
              color: selected
                  ? active.withValues(alpha: 0.12)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(7.w),
              border: Border.all(
                color: selected
                    ? active
                    : isDark
                        ? Colors.grey[700]!
                        : Colors.grey.withValues(alpha: 0.25),
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Text(
              side.name[0].toUpperCase() + side.name.substring(1),
              style: TextStyle(
                fontSize: 11.sp,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected
                    ? active
                    : isDark
                        ? Colors.grey[400]
                        : Colors.grey[600],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort Action Sheet — replaces dropdown
// ─────────────────────────────────────────────────────────────────────────────

class _SortActionSheet extends StatelessWidget {
  final _OrderSortOption current;
  final ValueChanged<_OrderSortOption> onSelected;

  const _SortActionSheet(
      {required this.current, required this.onSelected});

  static IconData _sortIcon(_OrderSortOption opt) {
    switch (opt) {
      case _OrderSortOption.newestFirst:
        return Icons.access_time_rounded;
      case _OrderSortOption.oldestFirst:
        return Icons.history_rounded;
      case _OrderSortOption.priceHigh:
        return Icons.arrow_downward_rounded;
      case _OrderSortOption.priceLow:
        return Icons.arrow_upward_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              margin: const EdgeInsets.symmetric(vertical: 10),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(20.w, 4.w, 20.w, 12.w),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Sort Orders',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 17.sp,
                  ),
                ),
              ),
            ),
            ..._OrderSortOption.values.map((opt) {
              final isSelected = current == opt;
              return ListTile(
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 20.w, vertical: 2.w),
                leading: Container(
                  width: 34.w,
                  height: 34.w,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? Theme.of(context)
                            .colorScheme
                            .primary
                            .withValues(alpha: 0.1)
                        : isDark
                            ? Colors.grey[850]
                            : Colors.grey.withValues(alpha: 0.08),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _sortIcon(opt),
                    size: 17.w,
                    color: isSelected
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).hintColor,
                  ),
                ),
                title: Text(
                  opt.label,
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight:
                        isSelected ? FontWeight.w700 : FontWeight.normal,
                    color: isSelected
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                trailing: isSelected
                    ? Icon(
                        Icons.check_rounded,
                        size: 18.w,
                        color: Theme.of(context).colorScheme.primary,
                      )
                    : null,
                onTap: () => onSelected(opt),
              );
            }),
            SizedBox(height: 12.w),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance metric helpers
// ─────────────────────────────────────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle(this.title);

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 13.sp,
        fontWeight: FontWeight.w700,
        color: Theme.of(context).hintColor,
        letterSpacing: 0.5,
      ),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  final List<Widget> children;
  const _MetricGrid({required this.children});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 8.w,
      mainAxisSpacing: 8.w,
      childAspectRatio: 1.7,
      children: children,
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final String? sub;
  final IconData? icon;

  const _MetricCard({
    required this.label,
    required this.value,
    this.valueColor,
    this.sub,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: BorderRadius.circular(12.w),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.12),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.15 : 0.04),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(
                  icon,
                  size: 13.w,
                  color: Theme.of(context).hintColor,
                ),
                SizedBox(width: 4.w),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 11.sp,
                  color: Theme.of(context).hintColor,
                ),
              ),
            ],
          ),
          SizedBox(height: 6.w),
          Text(
            value,
            style: TextStyle(
              fontSize: 18.sp,
              fontWeight: FontWeight.w700,
              color: valueColor ?? Theme.of(context).colorScheme.onSurface,
              fontFamily: 'monospace',
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (sub != null) ...[
            SizedBox(height: 3.w),
            Text(
              sub!,
              style: TextStyle(
                fontSize: 10.sp,
                color: Theme.of(context).hintColor.withValues(alpha: 0.7),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic card container
// ─────────────────────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white,
        borderRadius: BorderRadius.circular(14.w),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.12),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Item
// ─────────────────────────────────────────────────────────────────────────────

class _OrderItem extends StatelessWidget {
  final Order order;
  final bool canCancel;
  final bool canEdit;
  final bool isProcessing;
  final VoidCallback onCancel;
  final VoidCallback onEdit;
  final VoidCallback onTap;

  const _OrderItem({
    required this.order,
    required this.canCancel,
    required this.canEdit,
    required this.isProcessing,
    required this.onCancel,
    required this.onEdit,
    required this.onTap,
  });

  Color _sideColor() =>
      order.side.toUpperCase() == 'BUY' ? ColorTokens.profitGreen : ColorTokens.lossRed;

  Color _statusColor() {
    switch (order.status.toUpperCase()) {
      case 'FILLED': return ColorTokens.profitGreen;
      case 'CANCELED':
      case 'CANCELLED': return ColorTokens.lossRed;
      case 'NEW': return Colors.blue;
      case 'PARTIALLY_FILLED':
      case 'PARTIAL': return Colors.orange;
      default: return Colors.grey;
    }
  }

  String _statusLabel() {
    switch (order.status.toUpperCase()) {
      case 'NEW': return 'Open';
      case 'PARTIALLY_FILLED':
      case 'PARTIAL': return 'Partial';
      case 'FILLED': return 'Filled';
      case 'CANCELED':
      case 'CANCELLED': return 'Cancelled';
      default: return order.status;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final sideColor = _sideColor();
    final statusColor = _statusColor();
    final price = order.price ?? order.averagePrice ?? 0;

    final dateStr = _formatDate(order.timestamp);

    return Padding(
      padding: EdgeInsets.only(bottom: 8.w),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: isProcessing ? null : onTap,
          borderRadius: BorderRadius.circular(14.w),
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 11.w),
            decoration: BoxDecoration(
              color: isDark ? Colors.grey[900] : Colors.white,
              borderRadius: BorderRadius.circular(14.w),
              border: Border.all(
                color: isDark
                    ? Colors.grey[850]!
                    : Colors.grey.withValues(alpha: 0.12),
              ),
              boxShadow: [
                if (!isDark)
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Side badge
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.w),
                  decoration: BoxDecoration(
                    color: sideColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8.w),
                  ),
                  child: Text(
                    order.side.toUpperCase() == 'BUY' ? 'BUY' : 'SELL',
                    style: TextStyle(
                      fontSize: 10.sp,
                      fontWeight: FontWeight.bold,
                      color: sideColor,
                    ),
                  ),
                ),
                SizedBox(width: 10.w),
                // Middle info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${order.symbol}  ·  ${order.type}',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13.sp,
                        ),
                      ),
                      SizedBox(height: 3.w),
                      Row(
                        children: [
                          Text(
                            dateStr,
                            style: TextStyle(
                              fontSize: 11.sp,
                              color: Theme.of(context).hintColor,
                            ),
                          ),
                          SizedBox(width: 8.w),
                          Text(
                            'Price: ${formatPriceExact(price)}',
                            style: TextStyle(
                              fontSize: 11.sp,
                              color: Theme.of(context).hintColor,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                // Right: qty + status
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      order.quantity.toString(),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13.sp,
                      ),
                    ),
                    SizedBox(height: 4.w),
                    Container(
                      padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.w),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8.w),
                      ),
                      child: Text(
                        _statusLabel(),
                        style: TextStyle(
                          fontSize: 10.sp,
                          color: statusColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _formatDate(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final min = dt.minute.toString().padLeft(2, '0');
    return '$h:$min  ${dt.month}/${dt.day}';
  }
}
