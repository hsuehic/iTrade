import 'package:flutter/material.dart';
import '../model/api.dart';

enum SortField { value, price, dailyChange }

enum SortOrder { ascending, descending }

class PortfolioAssetList extends StatefulWidget {
  final List<AssetItem> assets;
  final void Function(AssetItem asset)? onTap;
  final bool shrinkWrap;
  final String? selectedSymbol;

  const PortfolioAssetList({
    super.key,
    required this.assets,
    this.onTap,
    this.shrinkWrap = false,
    this.selectedSymbol,
  });

  @override
  State<PortfolioAssetList> createState() => _PortfolioAssetListState();
}

class _PortfolioAssetListState extends State<PortfolioAssetList> {
  SortField _sortField = SortField.value;
  SortOrder _sortOrder = SortOrder.descending;

  List<AssetItem> get sortedAssets {
    final list = List<AssetItem>.from(widget.assets);
    list.sort((a, b) {
      double vA = _getSortValue(a);
      double vB = _getSortValue(b);
      return _sortOrder == SortOrder.ascending
          ? vA.compareTo(vB)
          : vB.compareTo(vA);
    });
    return list;
  }

  double _getSortValue(AssetItem item) {
    switch (_sortField) {
      case SortField.value:
        return item.value;
      case SortField.price:
        return item.price;
      case SortField.dailyChange:
        return item.dailyChange;
    }
  }

  void _changeSort(SortField field) {
    setState(() {
      if (_sortField == field) {
        _sortOrder = _sortOrder == SortOrder.ascending
            ? SortOrder.descending
            : SortOrder.ascending;
      } else {
        _sortField = field;
        _sortOrder = SortOrder.descending;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    final list = ListView.separated(
      shrinkWrap: widget.shrinkWrap,
      physics: widget.shrinkWrap ? const NeverScrollableScrollPhysics() : null,
      itemCount: sortedAssets.length,
      separatorBuilder: (_, __) => Divider(
        height: 1,
        color: colorScheme.outline.withValues(alpha: 0.08),
      ),
      itemBuilder: (context, index) {
        final asset = sortedAssets[index];
        final isSelected = widget.selectedSymbol == asset.symbol;
        return AssetListItem(
          asset: asset,
          onTap: () => widget.onTap?.call(asset),
          isSelected: isSelected,
        );
      },
    );

    return Column(
      children: [
        _buildTitleRow(context),
        Divider(height: 1, color: colorScheme.outline.withValues(alpha: 0.12)),
        if (widget.shrinkWrap) list else Expanded(child: list),
      ],
    );
  }

  Widget _buildTitleRow(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.onSurfaceVariant;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          const SizedBox(width: 40), // icon column
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Symbol',
              style: theme.textTheme.bodySmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          SizedBox(
            width: 100,
            child: _buildSortableTitle('Price', SortField.price),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 100,
            child: _buildSortableTitle('Value', SortField.value),
          ),
        ],
      ),
    );
  }

  Widget _buildSortableTitle(String label, SortField field) {
    final isSelected = _sortField == field;
    final icon = _sortOrder == SortOrder.ascending
        ? Icons.arrow_drop_up
        : Icons.arrow_drop_down;
    return InkWell(
      onTap: () => _changeSort(field),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          if (isSelected) Icon(icon, size: 16),
        ],
      ),
    );
  }
}

class AssetListItem extends StatelessWidget {
  final AssetItem asset;
  final VoidCallback? onTap;
  final bool isSelected;

  const AssetListItem({
    super.key,
    required this.asset,
    this.onTap,
    this.isSelected = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final changeColor = asset.dailyChange >= 0
        ? Colors.green
        : colorScheme.error;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: isSelected
              ? Colors.grey.withValues(alpha: 0.05)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Icon
            Image.network(
              asset.iconUrl,
              width: 40,
              height: 40,
              errorBuilder: (context, error, stackTrace) =>
                  Icon(Icons.monetization_on, size: 40),
            ),
            const SizedBox(width: 12),

            // Symbol
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    asset.symbol,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    asset.name,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),

            // Price + Change
            SizedBox(
              width: 100,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '\$${asset.price.toStringAsFixed(2)}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    '${asset.dailyChange >= 0 ? '+' : ''}${asset.dailyChange.toStringAsFixed(2)}%',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: changeColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),

            // Amount + Value
            SizedBox(
              width: 100,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '\$${(asset.price * asset.amount).toStringAsFixed(2)}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    asset.amount.toStringAsFixed(4),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
