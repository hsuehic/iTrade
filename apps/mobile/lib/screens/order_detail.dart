import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../models/order.dart';
import '../services/order_service.dart';
import '../services/copy_service.dart';
import '../utils/number_format_utils.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/copy_text.dart';

class OrderDetailScreen extends StatefulWidget {
  final Order order;

  const OrderDetailScreen({super.key, required this.order});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  final OrderService _orderService = OrderService.instance;
  late Order _order;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _order = widget.order;
  }

  Color _statusColor(String status) {
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
    return side.toUpperCase() == 'BUY' ? 'Buy' : 'Sell';
  }

  bool _isOrderOpen(Order order) => order.isNew || order.isPartiallyFilled;

  bool _canEditOrder(Order order) {
    return _isOrderOpen(order) && order.type.toUpperCase() == 'LIMIT';
  }

  Future<void> _confirmCancelOrder(Order order) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: CopyText('screen.strategy_detail.cancel_order', fallback: "Cancel order"),
        content: CopyText(
          'screen.strategy_detail.cancel_order_confirm',
          params: {
            'symbol': order.symbol,
            'side': order.side,
          },
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
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final updated = await _orderService.cancelOrder(order.id);
      if (updated == null) {
        throw Exception('Cancel failed');
      }
      if (!mounted) return;
      setState(() => _order = updated);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: CopyText('screen.strategy_detail.order_cancelled', fallback: "Order cancelled"),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!mounted) return;
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
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
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
            title: CopyText('screen.strategy_detail.edit_order', fallback: "Edit order"),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: quantityController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
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
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
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
                          if (!mounted) return;
                          setState(() => _order = updated);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: CopyText('screen.strategy_detail.order_updated', fallback: "Order updated"),
                              backgroundColor: Colors.green,
                            ),
                          );
                          Navigator.of(context).pop();
                        } catch (e) {
                          if (!mounted) return;
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
                          setDialogState(() => submitting = false);
                        }
                      }
                    : null,
                child: submitting
                    ? const SizedBox(
                        height: 18,
                        width: 18,
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
  }

  String _formatDateTime(DateTime? time) {
    if (time == null) return '-';
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    final second = time.second.toString().padLeft(2, '0');
    return '${time.year}-${time.month.toString().padLeft(2, '0')}-'
        '${time.day.toString().padLeft(2, '0')} $hour:$minute:$second';
  }

  String _formatPrice(double? value) {
    if (value == null || value == 0) return '-';
    return formatPriceExact(value);
  }

  String _formatCurrency(double? value) {
    if (value == null || value == 0) return '-';
    return formatCurrency(value);
  }

  String _formatQuantity(double? value) {
    if (value == null || value == 0) return '-';
    return formatQuantity(value);
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final sideColor = order.side.toUpperCase() == 'BUY' ? Colors.green : Colors.red;
    final statusColor = _statusColor(order.status);
    final exchangeLabel = (order.exchange ?? '').trim().isEmpty
        ? 'Unknown'
        : order.exchange!.toUpperCase();
    final orderValue = order.cummulativeQuoteQuantity != null &&
            order.cummulativeQuoteQuantity! > 0
        ? order.cummulativeQuoteQuantity!
        : (order.price ?? order.averagePrice ?? 0) * order.quantity;

    final content = SingleChildScrollView(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: EdgeInsets.all(14.w),
            decoration: BoxDecoration(
              color:
                  isDark ? Colors.grey[900] : Colors.white.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isDark
                    ? Colors.grey[850]!
                    : Colors.grey.withValues(alpha: 0.12),
              ),
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    'https://www.okx.com/cdn/oksupport/asset/currency/icon/'
                    '${order.baseCurrency.toLowerCase()}.png'
                    '?x-oss-process=image/format,webp/ignore-error,1',
                    width: 36.w,
                    height: 36.w,
                    errorBuilder: (context, error, stackTrace) =>
                        Icon(Icons.monetization_on, size: 36.w),
                  ),
                ),
                SizedBox(width: 12.w),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        order.displaySymbol,
                        style: TextStyle(
                          fontSize: 16.sp,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(height: 4.w),
                      Row(
                        children: [
                          _buildChip(
                            label: exchangeLabel,
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest,
                            textColor: Theme.of(context).hintColor,
                          ),
                          SizedBox(width: 8.w),
                          _buildChip(
                            label: order.type,
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest,
                            textColor: Theme.of(context).hintColor,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    _buildChip(
                      label: _sideLabel(order.side),
                      color: sideColor.withValues(alpha: 0.12),
                      textColor: sideColor,
                      icon: order.side.toUpperCase() == 'BUY'
                          ? Icons.arrow_upward
                          : Icons.arrow_downward,
                    ),
                    SizedBox(height: 6.w),
                    _buildChip(
                      label: _statusLabel(order.status),
                      color: statusColor.withValues(alpha: 0.12),
                      textColor: statusColor,
                    ),
                  ],
                ),
              ],
            ),
          ),
          SizedBox(height: 16.w),
          _buildSectionTitle('Summary'),
          _buildInfoRow('Quantity', _formatQuantity(order.quantity)),
          _buildInfoRow('Executed', _formatQuantity(order.executedQuantity)),
          _buildInfoRow('Price', _formatPrice(order.price)),
          _buildInfoRow('Avg Price', _formatPrice(order.averagePrice)),
          _buildInfoRow('Order Value', _formatCurrency(orderValue)),
          SizedBox(height: 12.w),
          _buildSectionTitle('Timing'),
          _buildInfoRow('Created Time', _formatDateTime(order.timestamp)),
          _buildInfoRow('Update Time', _formatDateTime(order.updateTime)),
          _buildInfoRow('Time in Force', order.timeInForce ?? '-'),
          SizedBox(height: 12.w),
          _buildSectionTitle('Fees & PnL'),
          _buildInfoRow('Commission', _formatCurrency(order.commission)),
          _buildInfoRow(
            'Commission Asset',
            order.commissionAsset ?? '-',
          ),
          _buildInfoRow('Realized PnL', _formatCurrency(order.realizedPnl)),
          _buildInfoRow('Unrealized PnL', _formatCurrency(order.unrealizedPnl)),
          SizedBox(height: 12.w),
          _buildSectionTitle('Identifiers'),
          _buildInfoRow('Order ID', order.id),
          _buildInfoRow('Client Order ID', order.clientOrderId ?? '-'),
          _buildInfoRow('Symbol', order.symbol),
        ],
      ),
    );

    final canCancel = _isOrderOpen(order);
    final canEdit = _canEditOrder(order);
    final hasActions = canCancel || canEdit;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: const CustomAppBar(
        titleKey: 'screen.order_detail.title',
        titleFallback: 'Order detail',
        showMenuButton: false,
        showScanner: false,
      ),
      body: content,
      bottomNavigationBar: hasActions
          ? SafeArea(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.w),
                child: Row(
                  children: [
                    if (canEdit)
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _isProcessing
                              ? null
                              : () => _showEditOrderDialog(order),
                          child: CopyText('screen.strategy_detail.edit_order', fallback: "Edit order"),
                        ),
                      ),
                    if (canEdit && canCancel) SizedBox(width: 12.w),
                    if (canCancel)
                      Expanded(
                        child: FilledButton(
                          onPressed: _isProcessing
                              ? null
                              : () => _confirmCancelOrder(order),
                          style: FilledButton.styleFrom(
                            backgroundColor: Colors.red,
                          ),
                          child: CopyText('screen.strategy_detail.cancel_order', fallback: "Cancel order"),
                        ),
                      ),
                  ],
                ),
              ),
            )
          : null,
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: EdgeInsets.only(bottom: 6.w),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 13.sp,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 4.w),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 4,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.sp,
                color: Colors.grey[600],
              ),
            ),
          ),
          Expanded(
            flex: 6,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChip({
    required String label,
    required Color color,
    required Color textColor,
    IconData? icon,
  }) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.w),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12.sp, color: textColor),
            SizedBox(width: 4.w),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 10.sp,
              fontWeight: FontWeight.w600,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }
}
