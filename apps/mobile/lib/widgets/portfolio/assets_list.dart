import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../models/portfolio.dart';

/// Professional assets list with sorting and filtering.
class AssetsList extends StatefulWidget {
  final List<PortfolioAsset> assets;
  final String? selectedAsset;
  final ValueChanged<PortfolioAsset>? onAssetTap;
  final bool showExchange;

  const AssetsList({
    super.key,
    required this.assets,
    this.selectedAsset,
    this.onAssetTap,
    this.showExchange = true,
  });

  @override
  State<AssetsList> createState() => _AssetsListState();
}

enum _SortField { value, name, percentage }

enum _SortOrder { ascending, descending }

class _AssetsListState extends State<AssetsList> {
  _SortField _sortField = _SortField.value;
  _SortOrder _sortOrder = _SortOrder.descending;

  List<PortfolioAsset> get sortedAssets {
    // Filter out dust assets (value below threshold)
    // Show asset if: estimatedValue >= threshold, OR estimatedValue is null but has balance
    // Uses shared threshold constant from PortfolioData for consistency
    final list = widget.assets.where((asset) {
      // If estimatedValue is available, use it for filtering
      if (asset.estimatedValue != null) {
        return asset.estimatedValue! >= PortfolioData.minValueThreshold;
      }
      // If no estimatedValue, show asset if it has meaningful balance or percentage
      return asset.total > 0 || asset.percentage > 0;
    }).toList();

    list.sort((a, b) {
      int result;
      switch (_sortField) {
        case _SortField.value:
          // Sort by estimatedValue if available, otherwise by percentage
          final aValue = a.estimatedValue ?? (a.percentage * 100);
          final bValue = b.estimatedValue ?? (b.percentage * 100);
          result = aValue.compareTo(bValue);
        case _SortField.name:
          result = a.asset.compareTo(b.asset);
        case _SortField.percentage:
          result = a.percentage.compareTo(b.percentage);
      }
      return _sortOrder == _SortOrder.ascending ? result : -result;
    });
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    if (widget.assets.isEmpty) {
      return _buildEmptyState(context);
    }

    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.05),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.08),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Holdings',
                  style: TextStyle(
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.white : Colors.black87,
                  ),
                ),
                // Sort buttons
                Row(
                  children: [
                    _buildSortChip(
                      context,
                      'Value',
                      _SortField.value,
                    ),
                    SizedBox(width: 8.w),
                    _buildSortChip(
                      context,
                      'Name',
                      _SortField.name,
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Column headers
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w),
            child: Row(
              children: [
                SizedBox(width: 48.w), // Icon space
                Expanded(
                  flex: 3,
                  child: Text(
                    'Asset',
                    style: TextStyle(
                      fontSize: 11.sp,
                      fontWeight: FontWeight.w500,
                      color: isDark ? Colors.white38 : Colors.black38,
                    ),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Balance',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      fontSize: 11.sp,
                      fontWeight: FontWeight.w500,
                      color: isDark ? Colors.white38 : Colors.black38,
                    ),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Value',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      fontSize: 11.sp,
                      fontWeight: FontWeight.w500,
                      color: isDark ? Colors.white38 : Colors.black38,
                    ),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: 8),

          // Divider
          Divider(
            height: 1,
            color: isDark
                ? Colors.white.withValues(alpha: 0.08)
                : Colors.black.withValues(alpha: 0.05),
          ),

          // Assets list
          ListView.separated(
            padding: EdgeInsets.zero,
            primary: false,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: sortedAssets.length,
            separatorBuilder: (context, index) => Divider(
              height: 1,
              indent: 16.w,
              endIndent: 16.w,
              color: isDark
                  ? Colors.white.withValues(alpha: 0.05)
                  : Colors.black.withValues(alpha: 0.03),
            ),
            itemBuilder: (context, index) {
              final asset = sortedAssets[index];
              return _AssetItem(
                asset: asset,
                isSelected: widget.selectedAsset == asset.asset,
                showExchange: widget.showExchange,
                onTap: () => widget.onAssetTap?.call(asset),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSortChip(
    BuildContext context,
    String label,
    _SortField field,
  ) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isSelected = _sortField == field;

    return GestureDetector(
      onTap: () {
        setState(() {
          if (_sortField == field) {
            _sortOrder = _sortOrder == _SortOrder.ascending
                ? _SortOrder.descending
                : _SortOrder.ascending;
          } else {
            _sortField = field;
            _sortOrder = _SortOrder.descending;
          }
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected
                ? theme.colorScheme.primary.withValues(alpha: 0.3)
                : isDark
                    ? Colors.white.withValues(alpha: 0.1)
                    : Colors.black.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11.sp,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected
                    ? theme.colorScheme.primary
                    : isDark
                        ? Colors.white60
                        : Colors.black54,
              ),
            ),
            if (isSelected) ...[
              SizedBox(width: 2.w),
              Icon(
                _sortOrder == _SortOrder.ascending
                    ? Icons.arrow_upward_rounded
                    : Icons.arrow_downward_rounded,
                size: 12.w,
                color: theme.colorScheme.primary,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      padding: EdgeInsets.all(32.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.05),
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.account_balance_wallet_outlined,
            size: 48.w,
            color: isDark ? Colors.white30 : Colors.black26,
          ),
          SizedBox(height: 12),
          Text(
            'No Holdings',
            style: TextStyle(
              fontSize: 16.sp,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white60 : Colors.black54,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Your assets will appear here',
            style: TextStyle(
              fontSize: 12.sp,
              color: isDark ? Colors.white38 : Colors.black38,
            ),
          ),
        ],
      ),
    );
  }
}

class _AssetItem extends StatelessWidget {
  final PortfolioAsset asset;
  final bool isSelected;
  final bool showExchange;
  final VoidCallback? onTap;

  const _AssetItem({
    required this.asset,
    this.isSelected = false,
    this.showExchange = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return InkWell(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.08)
              : Colors.transparent,
        ),
        child: Row(
          children: [
            // Icon
            Stack(
              clipBehavior: Clip.none,
              children: [
                Image.network(
                  asset.iconUrl,
                  width: 36.w,
                  height: 36.w,
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, loadingProgress) {
                    if (loadingProgress == null) return child;
                    return Container(
                      width: 36.w,
                      height: 36.w,
                      decoration: BoxDecoration(
                        color: isDark
                            ? Colors.white10
                            : Colors.black.withValues(alpha: 0.05),
                        shape: BoxShape.circle,
                      ),
                    );
                  },
                  errorBuilder: (context, error, stackTrace) => Container(
                    width: 36.w,
                    height: 36.w,
                    decoration: BoxDecoration(
                      color: isDark
                          ? Colors.white10
                          : Colors.black.withValues(alpha: 0.05),
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        asset.asset.substring(0, asset.asset.length > 2 ? 2 : 1),
                        style: TextStyle(
                          fontSize: 12.sp,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white60 : Colors.black54,
                        ),
                      ),
                    ),
                  ),
                ),
                // Stablecoin indicator
                if (asset.isStablecoin)
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Container(
                      padding: EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF22C55E),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: isDark
                              ? const Color(0xFF1A1F2E)
                              : Colors.white,
                          width: 2,
                        ),
                      ),
                      child: Icon(
                        Icons.attach_money_rounded,
                        size: 8.w,
                        color: Colors.white,
                      ),
                    ),
                  ),
              ],
            ),
            SizedBox(width: 12.w),

            // Name and exchange
            Expanded(
              flex: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    asset.asset,
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w600,
                      color: isDark ? Colors.white : Colors.black87,
                    ),
                  ),
                  if (showExchange)
                    Text(
                      asset.exchange.toUpperCase(),
                      style: TextStyle(
                        fontSize: 10.sp,
                        fontWeight: FontWeight.w500,
                        color: isDark ? Colors.white38 : Colors.black38,
                      ),
                    ),
                ],
              ),
            ),

            // Balance
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    _formatBalance(asset.total),
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w500,
                      color: isDark ? Colors.white : Colors.black87,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  if (asset.locked > 0)
                    Text(
                      '🔒 ${_formatBalance(asset.locked)}',
                      style: TextStyle(
                        fontSize: 10.sp,
                        color: Colors.orange.withValues(alpha: 0.8),
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                ],
              ),
            ),

            // Value and percentage
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '\$${_formatValue(asset.estimatedValue ?? 0)}',
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w600,
                      color: isDark ? Colors.white : Colors.black87,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 4.w, vertical: 1),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      '${asset.percentage.toStringAsFixed(1)}%',
                      style: TextStyle(
                        fontSize: 10.sp,
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.primary,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatBalance(double balance) {
    if (balance >= 1000000) {
      return '${(balance / 1000000).toStringAsFixed(2)}M';
    } else if (balance >= 1000) {
      return '${(balance / 1000).toStringAsFixed(2)}K';
    } else if (balance >= 1) {
      return balance.toStringAsFixed(2);
    } else if (balance >= 0.01) {
      return balance.toStringAsFixed(2);
    } else {
      // For very small amounts, show up to 4 decimals but trim trailing zeros
      final formatted = balance.toStringAsFixed(4);
      return formatted.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
    }
  }

  String _formatValue(double value) {
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(2)}M';
    } else if (value >= 1000) {
      return '${(value / 1000).toStringAsFixed(2)}K';
    } else {
      return value.toStringAsFixed(2);
    }
  }
}
