import 'package:flutter/material.dart';

import 'select_shared.dart';

enum SelectMode { single, multiple }

/// Ant Design-like Select for Flutter.
///
/// - Type in the field to search (filters popup list).
/// - Multiple: checkbox-leading list + tag display.
/// - Single: click selects one and closes.
/// - Dropdown icon hidden when there is any selection.
class Select<T> extends StatefulWidget {
  const Select({
    super.key,
    required this.items,
    required this.values,
    required this.onChanged,
    required this.decoration,
    this.mode = SelectMode.multiple,
    this.maxTagRows,
    this.contentPadding = const EdgeInsets.symmetric(
      horizontal: 12,
      vertical: 12,
    ),
    this.maxMenuHeight = 320,
    this.itemAsString,
    this.searchTextForItem,
  });

  final List<T> items;
  final List<T> values;
  final ValueChanged<List<T>> onChanged;
  final InputDecoration decoration;

  final SelectMode mode;
  final int? maxTagRows;
  final EdgeInsetsGeometry contentPadding;
  final double maxMenuHeight;

  final String Function(T value)? itemAsString;
  final String Function(T value)? searchTextForItem;

  @override
  State<Select<T>> createState() => _SelectState<T>();
}

class _SelectState<T> extends State<Select<T>> {
  final LayerLink _layerLink = LayerLink();
  final FocusNode _focusNode = FocusNode();
  final TextEditingController _queryController = TextEditingController();

  OverlayEntry? _overlayEntry;

  static const double _queryMinWidth = 40;
  static const double _contentHorizontalFudge = 16;
  static const double _popupItemHeight = 48;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      if (_focusNode.hasFocus) {
        _open();
      } else {
        _close();
      }
    });
  }

  @override
  void didUpdateWidget(covariant Select<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_listEquals(oldWidget.values, widget.values)) {
      // Avoid triggering overlay rebuild during the current build phase.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _overlayEntry?.markNeedsBuild();
      });
    }
  }

  @override
  void dispose() {
    _close();
    _focusNode.dispose();
    _queryController.dispose();
    super.dispose();
  }

  bool _listEquals(List<T> a, List<T> b) {
    if (identical(a, b)) return true;
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  RenderBox? _fieldRenderBox() {
    final ro = context.findRenderObject();
    if (ro is! RenderBox) return null;
    if (!ro.hasSize) return null;
    return ro;
  }

  void _open() {
    if (_overlayEntry != null) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_focusNode.hasFocus || _overlayEntry != null) return;
      final overlay = Overlay.of(context);
      _overlayEntry = OverlayEntry(builder: (ctx) => _buildOverlay(ctx));
      overlay.insert(_overlayEntry!);
    });
  }

  void _close() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  void _toggle() {
    if (_overlayEntry == null) {
      _focusNode.requestFocus();
      _open();
    } else {
      _focusNode.unfocus();
      _close();
    }
  }

  void _clearAll() {
    // antd-like: first clear keyword; if no keyword then clear selection.
    if (_queryController.text.trim().isNotEmpty) {
      _queryController.clear();
      setState(() {});
      _overlayEntry?.markNeedsBuild();
      return;
    }
    if (widget.values.isNotEmpty) {
      widget.onChanged(<T>[]);
      setState(() {});
      _overlayEntry?.markNeedsBuild();
    }
  }

  String _asString(T value) {
    if (widget.itemAsString != null) return widget.itemAsString!(value);
    return value.toString();
  }

  String _searchText(T value) {
    if (widget.searchTextForItem != null) {
      return widget.searchTextForItem!(value);
    }
    return _asString(value);
  }

  List<T> _filteredItems() {
    final keyword = _queryController.text.trim().toLowerCase();
    if (keyword.isEmpty) return widget.items;
    return widget.items
        .where((e) => _searchText(e).toLowerCase().contains(keyword))
        .toList();
  }

  double _menuMaxHeight() {
    final renderBox = _fieldRenderBox();
    if (renderBox == null) return widget.maxMenuHeight;

    final offset = renderBox.localToGlobal(Offset.zero);
    final size = renderBox.size;
    final mediaQuery = MediaQuery.of(context);

    final availableBelow =
        mediaQuery.size.height -
        offset.dy -
        size.height -
        mediaQuery.padding.bottom -
        8;

    return widget.maxMenuHeight
        .clamp(56.0, availableBelow <= 0 ? 56.0 : availableBelow)
        .toDouble();
  }

  double _measureTextWidth(String text, TextStyle style) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout();
    return tp.width;
  }

  double _measureTagWidth({
    required String text,
    required TextStyle style,
    required bool closable,
  }) {
    final textWidth = _measureTextWidth(text, style);
    final base = (SelectTagMetrics.horizontalPadding * 2) + textWidth;
    if (!closable) return base;
    return base + SelectTagMetrics.iconGap + SelectTagMetrics.iconContainerSize;
  }

  ({List<T> visible, int hidden}) _computeVisibleTags({
    required double maxWidth,
    required TextStyle tagTextStyle,
    required List<T> values,
    required int maxRows,
  }) {
    int hidden = 0;

    for (var iter = 0; iter < 4; iter++) {
      final hasOverflow = hidden > 0;
      final overflowText = hasOverflow ? '+$hidden' : '';
      final overflowWidth = hasOverflow
          ? _measureTagWidth(
              text: overflowText,
              style: tagTextStyle,
              closable: false,
            )
          : 0;

      final visible = <T>[];
      var row = 1;
      var lineWidth = 0.0;

      double reservedOnLastRow() {
        return _queryMinWidth +
            (hasOverflow ? (SelectTagMetrics.spacing + overflowWidth) : 0);
      }

      for (final v in values) {
        final w = _measureTagWidth(
          text: _asString(v),
          style: tagTextStyle,
          closable: true,
        );
        final add = (lineWidth == 0 ? 0 : SelectTagMetrics.spacing) + w;

        final limit = row == maxRows
            ? (maxWidth - reservedOnLastRow())
            : maxWidth;

        if (lineWidth + add <= limit) {
          lineWidth += add;
          visible.add(v);
          continue;
        }

        if (row >= maxRows) break;
        row += 1;
        lineWidth = w;
        visible.add(v);
      }

      final nextHidden = values.length - visible.length;
      if (nextHidden == hidden) return (visible: visible, hidden: hidden);
      hidden = nextHidden;
    }

    final visible = values.isEmpty ? <T>[] : <T>[values.first];
    return (visible: visible, hidden: values.length - visible.length);
  }

  Widget _suffix() {
    final hasSelection = widget.values.isNotEmpty;
    final hasQuery = _queryController.text.trim().isNotEmpty;
    // When searching, show only clear icon (no dropdown icon), same as when tags exist.
    final showDropdownIcon = !(hasSelection || hasQuery);

    return SizedBox(
      width: showDropdownIcon ? 64 : 40,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          if (hasSelection || hasQuery)
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (_) => _focusNode.requestFocus(),
              child: InkWell(
                onTap: _clearAll,
                child: Container(
                  width: 16,
                  height: 16,
                  decoration: const BoxDecoration(
                    color: Color(0xFF9E9E9E),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, size: 12, color: Colors.white),
                ),
              ),
            ),
          if (showDropdownIcon) ...[
            const SizedBox(width: 8),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (_) => _focusNode.requestFocus(),
              child: InkWell(
                onTap: _toggle,
                child: const Icon(Icons.arrow_drop_down),
              ),
            ),
          ],
          const SizedBox(width: 8),
        ],
      ),
    );
  }

  Widget _buildOverlay(BuildContext overlayContext) {
    final renderBox = _fieldRenderBox();
    if (renderBox == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _overlayEntry?.markNeedsBuild();
      });
      return const SizedBox.shrink();
    }

    final fieldSize = renderBox.size;
    final items = _filteredItems();
    final menuMaxHeight = _menuMaxHeight();
    final selectedSet = widget.values.toSet();

    return Positioned.fill(
      child: Stack(
        children: [
          // Tap-outside-to-close layer BEHIND the popup (so it won't steal taps).
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: () => _focusNode.unfocus(),
            ),
          ),
          CompositedTransformFollower(
            link: _layerLink,
            showWhenUnlinked: false,
            offset: Offset(0, fieldSize.height + 4),
            child: Material(
              elevation: 8,
              borderRadius: BorderRadius.circular(8),
              clipBehavior: Clip.antiAlias,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: menuMaxHeight,
                  minWidth: fieldSize.width,
                ),
                child: items.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text('No results'),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.zero,
                        itemCount: items.length,
                        itemBuilder: (context, index) {
                          final item = items[index];
                          final selected = selectedSet.contains(item);

                          void toggle() {
                            if (widget.mode == SelectMode.single) {
                              widget.onChanged(<T>[item]);
                              _queryController.clear();
                              setState(() {});
                              _focusNode.unfocus();
                              return;
                            }

                            final next = List<T>.from(widget.values);
                            if (selected) {
                              next.remove(item);
                            } else {
                              next.add(item);
                              _queryController.clear();
                            }
                            widget.onChanged(next);
                            setState(() {});
                            _overlayEntry?.markNeedsBuild();
                          }

                          Widget checkboxLeading() {
                            // Align checkbox square with the field cursor (decoration contentPadding.start == 8).
                            return Transform.translate(
                              // Checkbox paints slightly inset; nudge it right a bit.
                              offset: const Offset(2, 0),
                              child: SizedBox(
                                width: 24,
                                height: 24,
                                child: Checkbox(
                                  value: selected,
                                  onChanged: (_) => toggle(),
                                  materialTapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                  visualDensity: VisualDensity.compact,
                                ),
                              ),
                            );
                          }

                          return InkWell(
                            onTap: toggle,
                            child: SizedBox(
                              height: _popupItemHeight,
                              child: Padding(
                                padding: const EdgeInsetsDirectional.only(
                                  start: 8,
                                  end: 8,
                                ),
                                child: Row(
                                  children: [
                                    if (widget.mode == SelectMode.multiple)
                                      checkboxLeading(),
                                    if (widget.mode == SelectMode.multiple)
                                      const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        _asString(item),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    if (widget.mode == SelectMode.single &&
                                        selected)
                                      const Icon(Icons.check, size: 18),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasSelection = widget.values.isNotEmpty;

    return CompositedTransformTarget(
      link: _layerLink,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => _focusNode.requestFocus(),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final tagStyle = DefaultTextStyle.of(context).style;
            final maxRows = widget.maxTagRows;
            final maxWidth = (constraints.maxWidth - _contentHorizontalFudge)
                .clamp(0.0, constraints.maxWidth)
                .toDouble();

            final values = widget.values;
            final packed = maxRows == null
                ? (visible: values, hidden: 0)
                : _computeVisibleTags(
                    maxWidth: maxWidth,
                    tagTextStyle: tagStyle,
                    values: values,
                    maxRows: maxRows,
                  );

            final children = <Widget>[
              for (final v in packed.visible)
                SelectTag(
                  text: _asString(v),
                  onClose: () {
                    final next = List<T>.from(widget.values)..remove(v);
                    widget.onChanged(next);
                    setState(() {});
                    _overlayEntry?.markNeedsBuild();
                  },
                ),
              if (packed.hidden > 0) SelectTag(text: '+${packed.hidden}'),
              ConstrainedBox(
                constraints: const BoxConstraints(
                  minWidth: _queryMinWidth,
                  maxWidth: 200,
                ),
                child: IntrinsicWidth(
                  child: TextField(
                    controller: _queryController,
                    focusNode: _focusNode,
                    onChanged: (_) {
                      setState(() {});
                      _overlayEntry?.markNeedsBuild();
                    },
                    decoration: InputDecoration(
                      isCollapsed: true,
                      border: InputBorder.none,
                      // Show placeholder when empty. We prefer `decoration.hintText`,
                      // and fall back to `decoration.labelText` because the demo uses
                      // `labelText: 'Select'` as placeholder-style text.
                      hintText:
                          (widget.values.isEmpty &&
                              _queryController.text.isEmpty)
                          ? (widget.decoration.hintText ??
                                widget.decoration.labelText)
                          : null,
                    ),
                  ),
                ),
              ),
            ];

            return InputDecorator(
              decoration: widget.decoration.copyWith(
                suffixIcon: _suffix(),
                // Hide floating label inside the outline border.
                // Note: `InputDecoration.copyWith` can't "unset" labelText (it uses `??`),
                // so we override with an empty string.
                //
                // IMPORTANT: Do NOT set both `label` and `labelText` (Flutter asserts).
                labelText: '',
                floatingLabelBehavior: FloatingLabelBehavior.never,
                // Keep a stable input height across empty/typing/with-tags states.
                contentPadding: widget.contentPadding,
              ),
              isEmpty: widget.values.isEmpty && _queryController.text.isEmpty,
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: 28),
                child: hasSelection
                    ? SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: withHorizontalSpacing(
                            children,
                            SelectTagMetrics.spacing,
                          ),
                        ),
                      )
                    : Wrap(
                        spacing: SelectTagMetrics.spacing,
                        runSpacing: SelectTagMetrics.spacing,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: children,
                      ),
              ),
            );
          },
        ),
      ),
    );
  }
}
