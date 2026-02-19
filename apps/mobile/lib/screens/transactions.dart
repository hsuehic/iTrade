import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_slidable/flutter_slidable.dart';

import '../models/order.dart';
import '../services/order_service.dart';
import '../utils/number_format_utils.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../widgets/tag_list.dart';
import 'order_detail.dart';

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

enum _SortField { createdTime, status, quantity, orderValue }

class _TransactionsScreenState extends State<TransactionsScreen> {
  final OrderService _orderService = OrderService.instance;
  final Set<String> _processingOrders = {};

  List<Order> _orders = [];
  bool _isLoading = true;
  _SortField _sortField = _SortField.createdTime;
  bool _sortAscending = false;
  String _query = '';
  Tag _currentFilter = Tag(name: 'All', value: 'all');

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    if (mounted) {
      setState(() => _isLoading = true);
    }
    try {
      final orders = await _orderService.getOrders();
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  bool _isOrderOpen(Order order) => order.isNew || order.isPartiallyFilled;

  bool _canEditOrder(Order order) {
    return _isOrderOpen(order) && order.type.toUpperCase() == 'LIMIT';
  }

  Future<void> _confirmCancelOrder(Order order) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Order'),
        content: Text('Cancel ${order.symbol} ${order.side} order?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('No'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _handleCancelOrder(order);
    }
  }

  Future<void> _handleCancelOrder(Order order) async {
    if (_processingOrders.contains(order.id)) return;
    setState(() => _processingOrders.add(order.id));

    try {
      final updated = await _orderService.cancelOrder(order.id);
      if (updated == null) {
        throw Exception('Cancel failed');
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Order cancelled'),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadOrders();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cancel failed: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _processingOrders.remove(order.id));
      }
    }
  }

  Future<void> _showEditOrderDialog(Order order) async {
    final quantityController = TextEditingController(
      text: order.quantity.toString(),
    );
    final priceController = TextEditingController(
      text: order.price?.toString() ?? '',
    );
    Timer? debounce;
    String? quantityError;
    String? priceError;
    bool submitting = false;

    void validateNow(void Function(void Function()) setDialogState) {
      final quantityText = quantityController.text.trim();
      final priceText = priceController.text.trim();
      final quantity = double.tryParse(quantityText);
      final price = double.tryParse(priceText);

      setDialogState(() {
        quantityError = (quantity == null || quantity <= 0)
            ? 'Quantity must be a positive number'
            : null;
        priceError =
            (price == null || price <= 0) ? 'Price must be a positive number' : null;
      });
    }

    void scheduleValidation(void Function(void Function()) setDialogState) {
      debounce?.cancel();
      debounce = Timer(const Duration(milliseconds: 500), () {
        validateNow(setDialogState);
      });
    }

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final hasErrors = quantityError != null || priceError != null;
          final canSubmit = !submitting && !hasErrors;

          return AlertDialog(
            title: const Text('Edit Order'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: quantityController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Quantity',
                    errorText: quantityError,
                  ),
                  onChanged: (_) => scheduleValidation(setDialogState),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: priceController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Price',
                    errorText: priceError,
                  ),
                  onChanged: (_) => scheduleValidation(setDialogState),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: submitting ? null : () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: canSubmit
                    ? () async {
                        validateNow(setDialogState);
                        if (quantityError != null || priceError != null) return;
                        setDialogState(() => submitting = true);

                        final quantity = double.parse(quantityController.text.trim());
                        final price = double.parse(priceController.text.trim());

                        try {
                          final updated = await _orderService.updateOrder(
                            order.id,
                            quantity: quantity,
                            price: price,
                          );
                          if (updated == null) {
                            throw Exception('Update failed');
                          }
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Order updated'),
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
                    : const Text('Save'),
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

  Color _getStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'FILLED':
        return Colors.green;
      case 'CANCELED':
      case 'CANCELLED':
        return Colors.red;
      case 'NEW':
        return Colors.blue;
      case 'PARTIALLY_FILLED':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  int _statusSortWeight(String status) {
    switch (status.toUpperCase()) {
      case 'NEW':
        return 1;
      case 'PARTIALLY_FILLED':
        return 2;
      case 'FILLED':
        return 3;
      case 'CANCELED':
      case 'CANCELLED':
        return 4;
      default:
        return 5;
    }
  }

  double _getOrderValue(Order order) {
    final valueFromQuote = order.cummulativeQuoteQuantity;
    if (valueFromQuote != null && valueFromQuote > 0) {
      return valueFromQuote;
    }
    final price = order.price ?? order.averagePrice ?? 0;
    return price * order.quantity;
  }

  List<Order> _getSortedOrders() {
    final filtered = _getFilteredOrders(_orders);
    final sorted = [...filtered];
    sorted.sort((a, b) {
      int comparison;
      switch (_sortField) {
        case _SortField.createdTime:
          comparison = a.timestamp.compareTo(b.timestamp);
          break;
        case _SortField.status:
          comparison = _statusSortWeight(a.status)
              .compareTo(_statusSortWeight(b.status));
          break;
        case _SortField.quantity:
          comparison = a.quantity.compareTo(b.quantity);
          break;
        case _SortField.orderValue:
          comparison = _getOrderValue(a).compareTo(_getOrderValue(b));
          break;
      }
      return _sortAscending ? comparison : -comparison;
    });
    return sorted;
  }

  List<Order> _getFilteredOrders(List<Order> orders) {
    final query = _query.trim().toLowerCase();
    return orders.where((order) {
      final matchesQuery = query.isEmpty ||
          order.displaySymbol.toLowerCase().contains(query) ||
          order.symbol.toLowerCase().contains(query) ||
          order.side.toLowerCase().contains(query) ||
          order.status.toLowerCase().contains(query) ||
          order.type.toLowerCase().contains(query);

      if (!matchesQuery) return false;

      switch (_currentFilter.value) {
        case 'open':
          return _isOrderOpen(order);
        case 'filled':
          return order.status.toUpperCase() == 'FILLED';
        case 'cancelled':
          return order.status.toUpperCase() == 'CANCELED' ||
              order.status.toUpperCase() == 'CANCELLED';
        default:
          return true;
      }
    }).toList();
  }

  String _sortFieldLabel(_SortField field) {
    switch (field) {
      case _SortField.createdTime:
        return 'Created Time';
      case _SortField.status:
        return 'Status';
      case _SortField.quantity:
        return 'Quantity';
      case _SortField.orderValue:
        return 'Order Value';
    }
  }

  Widget _buildSortMenu(BuildContext context) {
    final theme = Theme.of(context);
    return PopupMenuButton<_SortMenuAction>(
      icon: Icon(
        Icons.sort,
        color: theme.brightness == Brightness.dark ? Colors.white : Colors.black87,
      ),
      tooltip: 'Sort orders',
      onSelected: (action) {
        setState(() {
          if (action == _SortMenuAction.toggleDirection) {
            _sortAscending = !_sortAscending;
            return;
          }
          switch (action) {
            case _SortMenuAction.createdTime:
              _sortField = _SortField.createdTime;
              break;
            case _SortMenuAction.status:
              _sortField = _SortField.status;
              break;
            case _SortMenuAction.quantity:
              _sortField = _SortField.quantity;
              break;
            case _SortMenuAction.orderValue:
              _sortField = _SortField.orderValue;
              break;
            case _SortMenuAction.toggleDirection:
              break;
          }
          _sortAscending = false;
        });
      },
      itemBuilder: (context) => [
        PopupMenuItem(
          value: _SortMenuAction.createdTime,
          child: Text(_sortFieldLabel(_SortField.createdTime)),
        ),
        PopupMenuItem(
          value: _SortMenuAction.status,
          child: Text(_sortFieldLabel(_SortField.status)),
        ),
        PopupMenuItem(
          value: _SortMenuAction.quantity,
          child: Text(_sortFieldLabel(_SortField.quantity)),
        ),
        PopupMenuItem(
          value: _SortMenuAction.orderValue,
          child: Text(_sortFieldLabel(_SortField.orderValue)),
        ),
        const PopupMenuDivider(),
        PopupMenuItem(
          value: _SortMenuAction.toggleDirection,
          child: Row(
            children: [
              Icon(
                _sortAscending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 16,
              ),
              SizedBox(width: 8.w),
              Text(_sortAscending ? 'Ascending' : 'Descending'),
            ],
          ),
        ),
      ],
    );
  }

  void _handleQuery(String query) {
    final lowerQuery = query.trim().toLowerCase();
    if (_query != lowerQuery) {
      setState(() => _query = lowerQuery);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final filterTags = [
      Tag(name: 'All', value: 'all'),
      Tag(name: 'Open', value: 'open'),
      Tag(name: 'Filled', value: 'filled'),
      Tag(name: 'Cancelled', value: 'cancelled'),
    ];

    final sortedOrders = _getSortedOrders();
    final hasOrders = _orders.isNotEmpty;
    final hasResults = sortedOrders.isNotEmpty;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: CustomAppBar(
        title: 'Orders',
        showScanner: false,
        actions: [
          _buildSortMenu(context),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadOrders,
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SimpleSearchBar(
            onChanged: _handleQuery,
            onSubmitted: _handleQuery,
          ),
          const SizedBox(height: 16),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w),
            child: TagList(
              tags: filterTags,
              currentTag: _currentFilter,
              onTap: (tag) {
                if (_currentFilter.value != tag.value) {
                  setState(() => _currentFilter = tag);
                }
              },
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _loadOrders,
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : !hasResults
                      ? ListView(
                          children: [
                            SizedBox(height: 120.h),
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  hasOrders ? Icons.search_off : Icons.receipt_long,
                                  size: 48.w,
                                  color: Colors.grey[400],
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  hasOrders ? 'No matching orders' : 'No orders yet',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.grey[600],
                                    fontSize: 14.sp,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        )
                      : ListView.builder(
                          padding: EdgeInsets.symmetric(horizontal: 16.w),
                          itemCount: sortedOrders.length,
                          itemBuilder: (context, index) {
                            final order = sortedOrders[index];
                            final isProcessing =
                                _processingOrders.contains(order.id);
                            final canCancel = _isOrderOpen(order);
                            final canEdit = _canEditOrder(order);
                            final hasActions = canCancel || canEdit;
                            final orderItem = _OrderItem(
                              order: order,
                              isProcessing: isProcessing,
                              canCancel: canCancel,
                              canEdit: canEdit,
                              onCancel: () => _confirmCancelOrder(order),
                              onEdit: () => _showEditOrderDialog(order),
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (context) => OrderDetailScreen(
                                      order: order,
                                    ),
                                  ),
                                );
                              },
                              statusColor: _getStatusColor(order.status),
                            );

                            final actionPane = hasActions
                                ? ActionPane(
                                    motion: const ScrollMotion(),
                                    extentRatio: canEdit && canCancel ? 0.5 : 0.25,
                                    children: [
                                      if (canEdit)
                                        SlidableAction(
                                          onPressed: isProcessing
                                              ? null
                                              : (_) => _showEditOrderDialog(order),
                                          backgroundColor: theme
                                              .colorScheme
                                              .surfaceContainerHighest,
                                          foregroundColor: theme.colorScheme.primary,
                                          icon: Icons.edit,
                                          label: 'Edit',
                                        ),
                                      if (canCancel)
                                        SlidableAction(
                                          onPressed: isProcessing
                                              ? null
                                              : (_) => _confirmCancelOrder(order),
                                          backgroundColor: theme
                                              .colorScheme
                                              .surfaceContainerHighest,
                                          foregroundColor: Colors.red,
                                          icon: Icons.close,
                                          label: 'Cancel',
                                        ),
                                    ],
                                  )
                                : null;

                            return Column(
                              children: [
                                if (hasActions)
                                  Slidable(
                                    key: ValueKey(order.id),
                                    endActionPane: actionPane,
                                    child: orderItem,
                                  )
                                else
                                  orderItem,
                                if (index != sortedOrders.length - 1)
                                  Divider(
                                    height: 16.h,
                                    thickness: 0.5,
                                    indent: 40.w,
                                    color: isDark
                                        ? Colors.grey[850]
                                        : Colors.grey.withValues(alpha: 0.15),
                                  ),
                              ],
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }
}

enum _SortMenuAction { createdTime, status, quantity, orderValue, toggleDirection }

class _OrderItem extends StatelessWidget {
  final Order order;
  final bool canCancel;
  final bool canEdit;
  final bool isProcessing;
  final VoidCallback onCancel;
  final VoidCallback onEdit;
  final VoidCallback onTap;
  final Color statusColor;

  const _OrderItem({
    required this.order,
    required this.canCancel,
    required this.canEdit,
    required this.isProcessing,
    required this.onCancel,
    required this.onEdit,
    required this.onTap,
    required this.statusColor,
  });

  String _statusLabel(String status) {
    switch (status.toUpperCase()) {
      case 'NEW':
        return 'New';
      case 'PARTIALLY_FILLED':
        return 'Partial';
      case 'FILLED':
        return 'Filled';
      case 'CANCELED':
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  }

  String _sideLabel(String side) {
    return side.toUpperCase() == 'BUY' ? 'Buy' : 'Sell';
  }

  @override
  Widget build(BuildContext context) {
    final dateStr =
        '${order.timestamp.hour}:${order.timestamp.minute.toString().padLeft(2, '0')} '
        '${order.timestamp.month}/${order.timestamp.day}';

    final sideColor = order.side.toUpperCase() == 'BUY' ? Colors.green : Colors.red;
    final orderValue = order.cummulativeQuoteQuantity != null &&
            order.cummulativeQuoteQuantity! > 0
        ? order.cummulativeQuoteQuantity!
        : (order.price ?? order.averagePrice ?? 0) * order.quantity;
    final price = order.price ?? order.averagePrice ?? 0;
    final exchangeLabel = (order.exchange ?? '').trim().isEmpty
        ? 'Unknown'
        : order.exchange!.toUpperCase();

    final iconUrl =
        'https://www.okx.com/cdn/oksupport/asset/currency/icon/'
        '${order.baseCurrency.toLowerCase()}.png?x-oss-process=image/format,webp/ignore-error,1';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 8.h),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(
                iconUrl,
                width: 28.w,
                height: 28.w,
                errorBuilder: (context, error, stackTrace) =>
                    Icon(Icons.monetization_on, size: 28.w),
              ),
            ),
            SizedBox(width: 12.w),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
                        decoration: BoxDecoration(
                          color: sideColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              order.side.toUpperCase() == 'BUY'
                                  ? Icons.arrow_upward
                                  : Icons.arrow_downward,
                              size: 12.sp,
                              color: sideColor,
                            ),
                            SizedBox(width: 4.w),
                            Text(
                              _sideLabel(order.side),
                              style: TextStyle(
                                fontSize: 10.sp,
                                fontWeight: FontWeight.bold,
                                color: sideColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(width: 8.w),
                      Expanded(
                        child: Text(
                          order.displaySymbol,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13.sp,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      SizedBox(width: 6.w),
                      Container(
                        padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
                        decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest
                              .withValues(alpha: 0.6),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          exchangeLabel,
                          style: TextStyle(
                            fontSize: 9.sp,
                            color: Theme.of(context).hintColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 4.h),
                  Row(
                    children: [
                      Container(
                        padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          _statusLabel(order.status),
                          style: TextStyle(
                            fontSize: 10.sp,
                            color: statusColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      SizedBox(width: 8.w),
                      Text(
                        order.type,
                        style: TextStyle(fontSize: 11.sp, color: Colors.grey[600]),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      SizedBox(width: 8.w),
                      Text(
                        dateStr,
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
            Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatQuantity(order.quantity),
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12.sp),
                ),
                SizedBox(height: 2.h),
                Text(
                  formatCurrency(orderValue),
                  style: TextStyle(
                    fontSize: 11.sp,
                    color: Theme.of(context).textTheme.bodySmall?.color,
                  ),
                ),
                SizedBox(height: 2.h),
                Text(
                  formatPriceExact(price),
                  style: TextStyle(fontSize: 10.sp, color: Colors.grey[600]),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

