import 'package:flutter/material.dart';

/// Shared UI bits between `Select` and `TreeSelect`.
///
/// Keep this file intentionally small and dependency-free.
class SelectTagMetrics {
  const SelectTagMetrics._();

  static const double spacing = 6;
  static const double horizontalPadding = 8;
  static const double verticalPadding = 2;
  static const double iconSize = 12;
  static const double iconContainerSize = 16;
  static const double iconGap = 4;
}

class SelectTag extends StatelessWidget {
  const SelectTag({super.key, required this.text, this.onClose});

  final String text;
  final VoidCallback? onClose;

  bool get _closable => onClose != null;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: SelectTagMetrics.horizontalPadding,
        vertical: SelectTagMetrics.verticalPadding,
      ),
      decoration: BoxDecoration(
        // Keep a neutral "chip" look but follow Material theme colors.
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(text),
          if (_closable) ...[
            const SizedBox(width: SelectTagMetrics.iconGap),
            InkWell(
              onTap: onClose,
              child: SizedBox(
                width: SelectTagMetrics.iconContainerSize,
                height: SelectTagMetrics.iconContainerSize,
                child: Icon(
                  Icons.close,
                  size: SelectTagMetrics.iconSize,
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

List<Widget> withHorizontalSpacing(List<Widget> children, double spacing) {
  final out = <Widget>[];
  for (var i = 0; i < children.length; i++) {
    if (i != 0) out.add(SizedBox(width: spacing));
    out.add(children[i]);
  }
  return out;
}
