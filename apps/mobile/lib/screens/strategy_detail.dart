import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'dart:convert';
import '../models/strategy.dart';
import '../models/order.dart';
import '../services/strategy_service.dart';
import '../services/order_service.dart';
import '../utils/crypto_icons.dart';
import '../utils/exchange_config.dart';

class StrategyDetailScreen extends StatefulWidget {
  final Strategy strategy;
  final StrategyPnL? pnl;

  const StrategyDetailScreen({super.key, required this.strategy, this.pnl});

  @override
  State<StrategyDetailScreen> createState() => _StrategyDetailScreenState();
}

class _StrategyDetailScreenState extends State<StrategyDetailScreen> {
  final StrategyService _strategyService = StrategyService.instance;
  final OrderService _orderService = OrderService.instance;
  late Strategy _strategy;
  StrategyPnL? _pnl;
  bool _isUpdating = false;
  List<Order> _orders = [];
  bool _isLoadingOrders = true;
  int _displayedOrdersCount = 20; // Show 20 initially

  @override
  void initState() {
    super.initState();
    _strategy = widget.strategy;
    _pnl = widget.pnl;
    _loadData();
  }

  Future<void> _loadData() async {
    // Load orders and PnL data in parallel
    await Future.wait([
      _loadOrders(),
      _loadPnL(),
    ]);
  }

  Future<void> _loadOrders() async {
    print('🔍 Loading orders for strategy: ${_strategy.id} (${_strategy.name})');
    setState(() => _isLoadingOrders = true);
    try {
      final orders = await _orderService.getOrders(strategyId: _strategy.id);
      print('✅ Received ${orders.length} orders');
      setState(() {
        _orders = orders;
        _isLoadingOrders = false;
      });
    } catch (e) {
      print('❌ Error loading orders: $e');
      setState(() => _isLoadingOrders = false);
    }
  }

  Future<void> _loadPnL() async {
    try {
      final pnl = await _strategyService.getStrategyPnL(_strategy.id);
      if (pnl != null) {
        setState(() {
          _pnl = pnl;
        });
      }
    } catch (e) {
      print('❌ Error loading PnL: $e');
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'active':
        return Colors.green;
      case 'stopped':
        return Colors.grey;
      case 'paused':
        return Colors.orange;
      case 'error':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Color _getPnLColor(double pnl) {
    if (pnl > 0) return Colors.green;
    if (pnl < 0) return Colors.red;
    return Colors.grey;
  }

  String _formatPnL(double pnl) {
    final sign = pnl >= 0 ? '+' : '';
    return '$sign${pnl.toStringAsFixed(2)}';
  }

  String _formatStatus(String status) {
    switch (status) {
      case 'active':
        return 'Active';
      case 'stopped':
        return 'Stopped';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      default:
        return status;
    }
  }

  String _formatType(String type) {
    return type
        .replaceAll('_', ' ')
        .split(' ')
        .map((word) {
          return word[0].toUpperCase() + word.substring(1);
        })
        .join(' ');
  }

  Future<void> _toggleStatus() async {
    if (_isUpdating) return;

    final newStatus = _strategy.isActive ? 'stopped' : 'active';

    setState(() => _isUpdating = true);

    try {
      final updatedStrategy = await _strategyService.updateStrategyStatus(
        _strategy.id,
        newStatus,
      );

      if (updatedStrategy != null) {
        setState(() {
          _strategy = updatedStrategy;
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Strategy ${_strategy.isActive ? 'started' : 'stopped'}',
              ),
              backgroundColor: Colors.green,
              behavior: SnackBarBehavior.floating, // 让 SnackBar 悬浮而不是贴底
              margin: const EdgeInsets.only(
                bottom: 50,
                left: 16,
                right: 16,
              ), // 距离底部 50px
            ),
          );
        }
      } else {
        throw Exception('Failed to update status');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update strategy: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating, // 让 SnackBar 悬浮而不是贴底
            margin: const EdgeInsets.only(
              bottom: 58,
              left: 16,
              right: 16,
            ), // 距离底部 50px
          ),
        );
      }
    } finally {
      setState(() => _isUpdating = false);
    }
  }

  Future<void> _deleteStrategy() async {
    if (_strategy.isActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cannot delete an active strategy'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Strategy'),
        content: Text('Are you sure you want to delete "${_strategy.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
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
        } else {
          throw Exception('Delete failed');
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to delete strategy: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } finally {
        if (mounted) {
          setState(() => _isUpdating = false);
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final statusColor = _getStatusColor(_strategy.status);
    final pnlValue = _pnl?.totalPnl ?? 0.0;
    final pnlColor = _getPnLColor(pnlValue);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(_strategy.name),
        centerTitle: true,
        actions: [
          if (!_strategy.isActive)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              onPressed: _isUpdating ? null : _deleteStrategy,
            ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header Card
            Container(
              margin: EdgeInsets.all(16.w),
              padding: EdgeInsets.all(20.w),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [statusColor.withValues(alpha: 0.8), statusColor],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: statusColor.withValues(alpha: 0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withAlpha(78),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          _formatStatus(_strategy.status),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      Container(
                        width: 16,
                        height: 16,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _strategy.name,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28.sp,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (_strategy.description != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _strategy.description!,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 14.sp,
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // PnL Card
            if (_pnl != null)
              Container(
                margin: EdgeInsets.symmetric(horizontal: 16.w),
                padding: EdgeInsets.all(20.w),
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.grey[900]
                      : Colors.white.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isDark
                        ? Colors.grey[850]!
                        : Colors.grey.withValues(alpha: 0.08),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Performance',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _PnLItem(
                          label: 'Total PnL',
                          value: _formatPnL(pnlValue),
                          color: pnlColor,
                          isLarge: true,
                        ),
                        _PnLItem(
                          label: 'Realized',
                          value: _formatPnL(_pnl!.realizedPnl),
                          color: _getPnLColor(_pnl!.realizedPnl),
                        ),
                        _PnLItem(
                          label: 'Unrealized',
                          value: _formatPnL(_pnl!.unrealizedPnl),
                          color: _getPnLColor(_pnl!.unrealizedPnl),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const Divider(),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _StatItem(
                          label: 'Total Orders',
                          value: '${_pnl!.totalOrders}',
                          icon: Icons.list_alt,
                        ),
                        _StatItem(
                          label: 'Filled Orders',
                          value: '${_pnl!.filledOrders}',
                          icon: Icons.check_circle_outline,
                        ),
                      ],
                    ),
                  ],
                ),
              ),

            const SizedBox(height: 16),

            // Details Card
            Container(
              margin: EdgeInsets.symmetric(horizontal: 16.w),
              padding: EdgeInsets.all(20.w),
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.grey[900]
                    : Colors.white.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark
                      ? Colors.grey[850]!
                      : Colors.grey.withValues(alpha: 0.08),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Strategy Details',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _DetailRow(label: 'Type', value: _formatType(_strategy.type)),
                  // Exchange row with chip
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Exchange',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[600],
                          ),
                        ),
                        ExchangeChip(
                          exchangeId: _strategy.exchange,
                          showIcon: true,
                          fontSize: 12,
                        ),
                      ],
                    ),
                  ),
                  _DetailRow(
                    label: 'Symbol',
                    value:
                        _strategy.normalizedSymbol ?? _strategy.symbol ?? 'N/A',
                  ),
                  _DetailRow(
                    label: 'Created',
                    value: _formatDate(_strategy.createdAt),
                  ),
                  _DetailRow(
                    label: 'Updated',
                    value: _formatDate(_strategy.updatedAt),
                  ),
                  if (_strategy.lastExecutionTime != null)
                    _DetailRow(
                      label: 'Last Execution',
                      value: _formatDate(_strategy.lastExecutionTime!),
                    ),
                  if (_strategy.errorMessage != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline,
                            color: Colors.red,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _strategy.errorMessage!,
                              style: const TextStyle(color: Colors.red),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Orders Card
            Container(
              margin: EdgeInsets.symmetric(horizontal: 16.w),
              padding: EdgeInsets.all(20.w),
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.grey[900]
                    : Colors.white.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark
                      ? Colors.grey[850]!
                      : Colors.grey.withValues(alpha: 0.08),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Orders',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                        Text(
                          '${_orders.length} total',
                          style: TextStyle(fontSize: 14.sp, color: Colors.grey[600]),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (_isLoadingOrders)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else if (_orders.isEmpty)
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Text(
                          'No orders yet',
                          style: TextStyle(color: Colors.grey[500]),
                        ),
                      ),
                    )
                  else
                    Column(
                      children: [
                        ListView.separated(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: _orders.length > _displayedOrdersCount 
                              ? _displayedOrdersCount 
                              : _orders.length,
                          separatorBuilder: (context, index) =>
                              const Divider(height: 16),
                          itemBuilder: (context, index) {
                            final order = _orders[index];
                            return _OrderItem(order: order);
                          },
                        ),
                        if (_orders.length > _displayedOrdersCount)
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Column(
                              children: [
                                Text(
                                  'Showing $_displayedOrdersCount of ${_orders.length} orders',
                                  style: TextStyle(
                                    fontSize: 12.sp,
                                    color: Colors.grey[500],
                                  ),
                                ),
                                const SizedBox(height: 8),
                                TextButton(
                                  onPressed: () {
                                    setState(() {
                                      _displayedOrdersCount += 20;
                                    });
                                  },
                                  child: const Text('Load More'),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Parameters Card
            if (_strategy.parameters != null &&
                _strategy.parameters!.isNotEmpty)
              Container(
                margin: EdgeInsets.symmetric(horizontal: 16.w),
                padding: EdgeInsets.all(20.w),
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.grey[900]
                      : Colors.white.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isDark
                        ? Colors.grey[850]!
                        : Colors.grey.withValues(alpha: 0.08),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Parameters',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: EdgeInsets.all(12.w),
                      decoration: BoxDecoration(
                        color: isDark
                            ? Colors.grey[850]
                            : Colors.grey.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isDark
                              ? Colors.grey[800]!
                              : Colors.grey.withValues(alpha: 0.12),
                        ),
                      ),
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Text(
                          const JsonEncoder.withIndent(
                            '  ',
                          ).convert(_strategy.parameters),
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12.sp,
                            color: isDark ? Colors.grey[300] : Colors.grey[800],
                            height: 1.5,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            const SizedBox(height: 24),

            // Action Button
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 16.w),
              child: ElevatedButton(
                onPressed: _isUpdating ? null : _toggleStatus,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _strategy.isActive
                      ? Colors.orange
                      : Colors.green,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isUpdating
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            Colors.white,
                          ),
                        ),
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                        Icon(
                          _strategy.isActive ? Icons.stop : Icons.play_arrow,
                          size: 24.w,
                        ),
                          const SizedBox(width: 8),
                          Text(
                            _strategy.isActive
                                ? 'Stop Strategy'
                                : 'Start Strategy',
                            style: TextStyle(
                              fontSize: 16.sp,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')} '
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}

class _OrderItem extends StatelessWidget {
  final Order order;

  const _OrderItem({required this.order});

  Color _getStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'FILLED':
        return Colors.green;
      case 'PARTIALLY_FILLED':
        return Colors.orange;
      case 'CANCELED':
      case 'CANCELLED':
        return Colors.grey;
      case 'REJECTED':
        return Colors.red;
      default:
        return Colors.blue;
    }
  }

  String _formatStatus(String status) {
    switch (status.toUpperCase()) {
      case 'FILLED':
        return 'Filled';
      case 'PARTIALLY_FILLED':
        return 'Partial';
      case 'CANCELED':
      case 'CANCELLED':
        return 'Canceled';
      case 'REJECTED':
        return 'Rejected';
      case 'NEW':
        return 'New';
      default:
        return status;
    }
  }

  String _formatDateTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor(order.status);
    final baseCurrency = order.baseCurrency;

    return Row(
      children: [
        // Crypto Icon
      Image.network(
        CryptoIcons.getIconUrl(baseCurrency),
        width: 36.w,
        height: 36.w,
        errorBuilder: (context, error, stackTrace) => Container(
          width: 36.w,
          height: 36.w,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.monetization_on,
              size: 20.w,
              color: Colors.grey[600],
            ),
          ),
        ),
        const SizedBox(width: 12),
        // Order Info
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Symbol and Side
                  Row(
                    children: [
                  Text(
                    order.baseCurrency, // Show base currency instead of full symbol
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w600,
                          fontFamily: 'monospace',
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 6.w,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: order.isBuy
                              ? Colors.green.withValues(alpha: 0.1)
                              : Colors.red.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          order.side,
                          style: TextStyle(
                            fontSize: 10.sp,
                            fontWeight: FontWeight.bold,
                            color: order.isBuy ? Colors.green : Colors.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                  // Status
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: 8.w,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _formatStatus(order.status),
                      style: TextStyle(
                        fontSize: 11.sp,
                        fontWeight: FontWeight.w600,
                        color: statusColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              // Quantity and Price
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Qty: ${order.executedQuantity.toStringAsFixed(0)}/${order.quantity.toStringAsFixed(0)}',
                    style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
                  ),
                  Builder(
                    builder: (context) {
                      // Calculate average price from executed quantity and quote quantity
                      double? avgPrice;
                      if (order.averagePrice != null && order.averagePrice! > 0) {
                        avgPrice = order.averagePrice;
                      } else if (order.cummulativeQuoteQuantity != null && 
                                 order.cummulativeQuoteQuantity! > 0 && 
                                 order.executedQuantity > 0) {
                        avgPrice = order.cummulativeQuoteQuantity! / order.executedQuantity;
                      } else if (order.price != null) {
                        avgPrice = order.price;
                      }
                      
                      if (avgPrice != null) {
                        return Text(
                          '\$${avgPrice.toStringAsFixed(4)}',
                          style: TextStyle(
                            fontSize: 12.sp,
                            fontWeight: FontWeight.w600,
                          ),
                        );
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                ],
              ),
              const SizedBox(height: 4),
              // Time and PnL
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _formatDateTime(order.timestamp),
                    style: TextStyle(fontSize: 11.sp, color: Colors.grey[500]),
                  ),
                  if (order.realizedPnl != null && order.realizedPnl != 0)
                    Text(
                      '${order.realizedPnl! >= 0 ? '+' : ''}${order.realizedPnl!.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 11.sp,
                        fontWeight: FontWeight.w600,
                        color: order.realizedPnl! >= 0
                            ? Colors.green
                            : Colors.red,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PnLItem extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final bool isLarge;

  const _PnLItem({
    required this.label,
    required this.value,
    required this.color,
    this.isLarge = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: isLarge
          ? CrossAxisAlignment.start
          : CrossAxisAlignment.center,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: isLarge ? 24.sp : 16.sp,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _StatItem({
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 32.w, color: Colors.grey[600]),
        const SizedBox(height: 8),
        Text(
          value,
          style: TextStyle(fontSize: 20.sp, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
        Text(label, style: TextStyle(fontSize: 14.sp, color: Colors.grey[600])),
        Text(
          value,
          style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
        ),
        ],
      ),
    );
  }
}
