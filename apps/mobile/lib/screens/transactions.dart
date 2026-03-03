import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_slidable/flutter_slidable.dart';

import '../models/order.dart';
import '../services/order_service.dart';
import '../services/copy_service.dart';
import '../utils/number_format_utils.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../widgets/tag_list.dart';
import 'order_detail.dart';
import 'place_order_screen.dart';
import '../widgets/copy_text.dart';

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
  bool _isLoading = false;
  _SortField _sortField = _SortField.createdTime;
  bool _sortAscending = false;
  String _query = '';
  Tag _currentFilter = Tag(name: 'All', value: 'all');

  // Pagination state
  int _currentPage = 1;
  static const int _pageSize = 20;
  int _totalCount = 0;
  bool _hasMore = false;
  bool _isMoreLoading = false;
  ScrollController? _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController?.addListener(_onScroll);
    _loadOrders();
  }

  @override
  void dispose() {
    _scrollController?.removeListener(_onScroll);
    _scrollController?.dispose();
    super.dispose();
  }

  void _onScroll() {
    final controller = _scrollController;
    if (controller == null || !controller.hasClients) return;
    final maxScroll = controller.position.maxScrollExtent;
    final currentScroll = controller.position.pixels;
    if (currentScroll >= maxScroll - 200) {
      _loadMore();
    }
  }

  Future<void> _loadOrders({bool refresh = true}) async {
    if (!mounted) return;

    if (refresh) {
      setState(() {
        _isLoading = true;
        _currentPage = 1;
        _orders = [];
        _hasMore = false;
        _isMoreLoading = false;
      });
    } else {
      if (_isMoreLoading) return;
      setState(() => _isMoreLoading = true);
    }

    try {
      String? statusFilter;
      if (_currentFilter.value == 'cancelled') {
        statusFilter = 'CANCELED';
      } else if (_currentFilter.value != 'all') {
        statusFilter = _currentFilter.value.toUpperCase();
      }

      String sortBy = 'timestamp';
      switch (_sortField) {
        case _SortField.createdTime:
          sortBy = 'timestamp';
          break;
        case _SortField.status:
          sortBy = 'status';
          break;
        case _SortField.quantity:
          sortBy = 'quantity';
          break;
        case _SortField.orderValue:
          sortBy = 'cummulativeQuoteQuantity';
          break;
      }

      final paginated = await _orderService.getPaginatedOrders(
        page: _currentPage,
        pageSize: _pageSize,
        status: statusFilter,
        symbol: _query.isNotEmpty ? _query : null,
        sortBy: sortBy,
        sortOrder: _sortAscending ? 'ASC' : 'DESC',
      );

      if (!mounted) return;

      if (paginated != null) {
        setState(() {
          if (refresh) {
            _orders = paginated.orders;
          } else {
            _orders.addAll(paginated.orders);
          }
          _totalCount = paginated.total;
          _hasMore = _orders.length < _totalCount;
        });
      }
    } catch (_) {
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isMoreLoading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_isLoading || _isMoreLoading || !_hasMore) return;
    _currentPage++;
    await _loadOrders(refresh: false);
  }

  bool _isOrderOpen(Order order) => order.isNew || order.isPartiallyFilled;

  bool _canEditOrder(Order order) {
    return _isOrderOpen(order) && order.type.toUpperCase() == 'LIMIT';
  }

  Future<void> _confirmCancelOrder(Order order) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: CopyText(
          'screen.strategy_detail.cancel_order',
          fallback: "Cancel order",
        ),
        content: CopyText(
          'screen.strategy_detail.cancel_order_confirm',
          params: {'symbol': order.symbol, 'side': order.side},
          fallback: 'Cancel {{symbol}} {{side}} order?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: CopyText('screen.strategy_detail.no', fallback: "No"),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: CopyText('screen.login.cancel', fallback: "Cancel"),
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
            content: CopyText(
              'screen.strategy_detail.order_cancelled',
              fallback: "Order cancelled",
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadOrders();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CopyText(
              'screen.strategy_detail.cancel_failed',
              params: {'error': e.toString()},
              fallback: 'Cancel failed: {{error}}',
            ),
            backgroundColor: Colors.red,
          ),
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
        priceError = (price == null || price <= 0)
            ? 'Price must be a positive number'
            : null;
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
            title: CopyText(
              'screen.strategy_detail.edit_order',
              fallback: "Edit order",
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: quantityController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText: CopyService.instance.t(
                      'common.quantity_label',
                      fallback: 'Quantity',
                    ),
                    errorText: quantityError,
                  ),
                  onChanged: (_) => scheduleValidation(setDialogState),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: priceController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText: CopyService.instance.t(
                      'common.price_label',
                      fallback: 'Price',
                    ),
                    errorText: priceError,
                  ),
                  onChanged: (_) => scheduleValidation(setDialogState),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: submitting ? null : () => Navigator.pop(ctx),
                child: CopyText('screen.login.cancel', fallback: "Cancel"),
              ),
              TextButton(
                onPressed: canSubmit
                    ? () async {
                        validateNow(setDialogState);
                        if (quantityError != null || priceError != null) return;
                        setDialogState(() => submitting = true);

                        final quantity = double.parse(
                          quantityController.text.trim(),
                        );
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
                                content: CopyText(
                                  'screen.strategy_detail.order_updated',
                                  fallback: "Order updated",
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
                                content: CopyText(
                                  'screen.strategy_detail.update_failed',
                                  params: {'error': e.toString()},
                                  fallback: 'Update failed: {{error}}',
                                ),
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
                    : CopyText('screen.login.save', fallback: "Save"),
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

  Future<void> _showPlaceOrderDialog() async {
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => PlaceOrderScreen(
          onSubmit: (payload) async {
            final created = await _orderService.placeOrder(
              exchange: payload.exchange,
              symbol: payload.symbol,
              side: payload.side,
              type: payload.type,
              quantity: payload.quantity,
              price: payload.price,
            );
            if (created == null) {
              throw Exception('Submit failed');
            }
            await _loadOrders();
          },
        ),
        fullscreenDialog: true,
      ),
    );
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

  List<Order> _getSortedOrders() {
    return _getFilteredOrders(_orders);
  }

  List<Order> _getFilteredOrders(List<Order> orders) {
    final query = _query.trim().toLowerCase();
    return orders.where((order) {
      final matchesQuery =
          query.isEmpty ||
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
    return IconButton(
      icon: Icon(
        Icons.sort,
        color: theme.brightness == Brightness.dark
            ? Colors.white
            : Colors.black87,
      ),
      tooltip: CopyService.instance.t(
        'screen.orders.sort_tooltip',
        fallback: 'Sort orders',
      ),
      onPressed: () => _showSortActionSheet(context),
    );
  }

  Future<void> _showSortActionSheet(BuildContext context) async {
    final renderBox = context.findRenderObject() as RenderBox?;
    final fieldWidth = renderBox?.size.width ?? 320.w;
    final result = await showDialog<_SortDialogResult>(
      context: context,
      builder: (context) {
        _SortField tempField = _sortField;
        bool tempAscending = _sortAscending;
        final surface = Theme.of(context).colorScheme.surface;
        final screenWidth = MediaQuery.of(context).size.width;
        final inset = (screenWidth - fieldWidth) / 2;
        final insetPadding = EdgeInsets.symmetric(
          horizontal: inset > 16 ? inset : 16.w,
        );
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return Dialog(
              insetPadding: insetPadding,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14.r),
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints.tightFor(width: fieldWidth),
                child: Container(
                  decoration: BoxDecoration(
                    color: surface,
                    borderRadius: BorderRadius.circular(14.r),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 16.w,
                          vertical: 12.w,
                        ),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: CopyText(
                            'screen.orders.sort_tooltip',
                            fallback: 'Sort orders',
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                      Divider(
                        height: 1,
                        color: Colors.grey.withValues(alpha: 0.2),
                      ),
                      Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 16.w,
                          vertical: 8.w,
                        ),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'Sort field',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: Theme.of(context).hintColor),
                          ),
                        ),
                      ),
                      RadioGroup<_SortField>(
                        groupValue: tempField,
                        onChanged: (value) {
                          if (value == null) return;
                          setDialogState(() => tempField = value);
                        },
                        child: Column(
                          children: [
                            RadioListTile<_SortField>(
                              value: _SortField.createdTime,
                              dense: true,
                              title: Text(
                                _sortFieldLabel(_SortField.createdTime),
                              ),
                            ),
                            RadioListTile<_SortField>(
                              value: _SortField.status,
                              dense: true,
                              title: Text(_sortFieldLabel(_SortField.status)),
                            ),
                            RadioListTile<_SortField>(
                              value: _SortField.quantity,
                              dense: true,
                              title: Text(_sortFieldLabel(_SortField.quantity)),
                            ),
                            RadioListTile<_SortField>(
                              value: _SortField.orderValue,
                              dense: true,
                              title: Text(
                                _sortFieldLabel(_SortField.orderValue),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Divider(
                        height: 1,
                        color: Colors.grey.withValues(alpha: 0.2),
                      ),
                      Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 16.w,
                          vertical: 8.w,
                        ),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'Sort order',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: Theme.of(context).hintColor),
                          ),
                        ),
                      ),
                      RadioGroup<bool>(
                        groupValue: tempAscending,
                        onChanged: (value) {
                          if (value == null) return;
                          setDialogState(() => tempAscending = value);
                        },
                        child: Column(
                          children: [
                            RadioListTile<bool>(
                              value: true,
                              dense: true,
                              title: const Text('Ascending'),
                            ),
                            RadioListTile<bool>(
                              value: false,
                              dense: true,
                              title: const Text('Descending'),
                            ),
                          ],
                        ),
                      ),
                      Divider(
                        height: 1,
                        color: Colors.grey.withValues(alpha: 0.2),
                      ),
                      Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 12.w,
                          vertical: 8.w,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text('Cancel'),
                              ),
                            ),
                            SizedBox(width: 8.w),
                            Expanded(
                              child: FilledButton(
                                onPressed: () => Navigator.pop(
                                  context,
                                  _SortDialogResult(
                                    field: tempField,
                                    ascending: tempAscending,
                                  ),
                                ),
                                child: const Text('Apply'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    if (result == null || !mounted) return;
    setState(() {
      _sortField = result.field;
      _sortAscending = result.ascending;
    });
    _loadOrders();
  }

  void _handleQuery(String query) {
    final lowerQuery = query.trim().toLowerCase();
    if (_query != lowerQuery) {
      setState(() => _query = lowerQuery);
      _loadOrders();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final copy = CopyService.instance;

    final filterTags = [
      Tag(
        name: copy.t('screen.orders.filter.all', fallback: 'All'),
        value: 'all',
      ),
      Tag(
        name: copy.t('screen.orders.filter.open', fallback: 'Open'),
        value: 'open',
      ),
      Tag(
        name: copy.t('screen.orders.filter.filled', fallback: 'Filled'),
        value: 'filled',
      ),
      Tag(
        name: copy.t('screen.orders.filter.cancelled', fallback: 'Cancelled'),
        value: 'cancelled',
      ),
    ];
    final currentTag = filterTags.firstWhere(
      (tag) => tag.value == _currentFilter.value,
      orElse: () => filterTags.first,
    );

    final sortedOrders = _getSortedOrders();
    final hasOrders = _orders.isNotEmpty;
    final hasResults = sortedOrders.isNotEmpty;

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: CustomAppBar(
        titleKey: 'screen.orders.title',
        titleFallback: 'Orders',
        showScanner: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: CopyService.instance.t(
              'screen.orders.place_order.title',
              fallback: 'Place order',
            ),
            onPressed: _showPlaceOrderDialog,
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SimpleSearchBar(onChanged: _handleQuery, onSubmitted: _handleQuery),
          const SizedBox(height: 16),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w),
            child: Row(
              children: [
                Expanded(
                  child: TagList(
                    tags: filterTags,
                    currentTag: currentTag,
                    onTap: (tag) {
                      if (_currentFilter.value != tag.value) {
                        setState(() => _currentFilter = tag);
                        _loadOrders();
                      }
                    },
                  ),
                ),
                SizedBox(width: 8.w),
                _buildSortMenu(context),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _loadOrders,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _loadOrders,
              child: (_isLoading && _orders.isEmpty)
                  ? const Center(child: CircularProgressIndicator())
                  : !hasResults
                  ? ListView(
                      children: [
                        SizedBox(height: 120.w),
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
                              hasOrders
                                  ? 'No matching orders'
                                  : 'No orders yet',
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
                      controller: _scrollController,
                      padding: EdgeInsets.symmetric(horizontal: 16.w),
                      itemCount: sortedOrders.length + (_hasMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == sortedOrders.length) {
                          return Padding(
                            padding: EdgeInsets.symmetric(vertical: 24.w),
                            child: Center(
                              child: _isMoreLoading
                                  ? const CircularProgressIndicator(
                                      strokeWidth: 2,
                                    )
                                  : const SizedBox.shrink(),
                            ),
                          );
                        }
                        final order = sortedOrders[index];
                        final isProcessing = _processingOrders.contains(
                          order.id,
                        );
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
                                builder: (context) =>
                                    OrderDetailScreen(order: order),
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
                                      foregroundColor:
                                          theme.colorScheme.primary,
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
                                height: 16.w,
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

class _SortDialogResult {
  final _SortField field;
  final bool ascending;

  const _SortDialogResult({required this.field, required this.ascending});
}

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
    final copy = CopyService.instance;
    switch (status.toUpperCase()) {
      case 'NEW':
        return copy.t('screen.orders.status.new', fallback: 'New');
      case 'PARTIALLY_FILLED':
        return copy.t('screen.orders.status.partial', fallback: 'Partial');
      case 'FILLED':
        return copy.t('screen.orders.status.filled', fallback: 'Filled');
      case 'CANCELED':
      case 'CANCELLED':
        return copy.t('screen.orders.status.cancelled', fallback: 'Cancelled');
      default:
        return status;
    }
  }

  String _sideLabel(String side) {
    final copy = CopyService.instance;
    return side.toUpperCase() == 'BUY'
        ? copy.t('screen.orders.side.buy', fallback: 'Buy')
        : copy.t('screen.orders.side.sell', fallback: 'Sell');
  }

  @override
  Widget build(BuildContext context) {
    final dateStr =
        '${order.timestamp.hour}:${order.timestamp.minute.toString().padLeft(2, '0')} '
        '${order.timestamp.month}/${order.timestamp.day}';

    final sideColor = order.side.toUpperCase() == 'BUY'
        ? Colors.green
        : Colors.red;
    final orderValue =
        order.cummulativeQuoteQuantity != null &&
            order.cummulativeQuoteQuantity! > 0
        ? order.cummulativeQuoteQuantity!
        : (order.price ?? order.averagePrice ?? 0) * order.quantity;
    final price = order.price ?? order.averagePrice ?? 0;
    final exchangeLabel = (order.exchange ?? '').trim().isEmpty
        ? CopyService.instance.t('common.unknown', fallback: 'Unknown')
        : order.exchange!.toUpperCase();

    final iconUrl =
        'https://www.okx.com/cdn/oksupport/asset/currency/icon/'
        '${order.baseCurrency.toLowerCase()}.png?x-oss-process=image/format,webp/ignore-error,1';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 8.w),
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
                        padding: EdgeInsets.symmetric(
                          horizontal: 8.w,
                          vertical: 4.w,
                        ),
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
                        padding: EdgeInsets.symmetric(
                          horizontal: 6.w,
                          vertical: 2.w,
                        ),
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
                  SizedBox(height: 4.w),
                  Row(
                    children: [
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 6.w,
                          vertical: 2.w,
                        ),
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
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: Colors.grey[600],
                        ),
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
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 12.sp,
                    height: 1,
                  ),
                ),
                SizedBox(height: 1.w),
                Text(
                  formatCurrency(orderValue),
                  style: TextStyle(
                    fontSize: 11.sp,
                    color: Theme.of(context).textTheme.bodySmall?.color,
                    height: 1,
                  ),
                ),
                SizedBox(height: 1.w),
                Text(
                  formatPriceExact(price),
                  style: TextStyle(
                    fontSize: 10.sp,
                    color: Colors.grey[600],
                    height: 1,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
