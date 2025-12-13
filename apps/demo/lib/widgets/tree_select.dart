import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'select_shared.dart';
import 'tree_view.dart';

class TreeSelect<T> extends StatefulWidget {
  const TreeSelect({
    super.key,
    required this.data,
    required this.adapter,
    required this.decoration,
    this.selectionMode = TreeSelectionMode.multiple,
    this.fieldHeight = 56,
    this.contentPadding = const EdgeInsets.symmetric(
      horizontal: 12,
      vertical: 12,
    ),
    this.maxMenuHeight = 360,
    this.maxVisibleTags = 3,
    this.searchHintText = 'Search',
    this.searchDebounce = const Duration(milliseconds: 500),
    this.onSingleChanged,
    this.onMultiChanged,
    this.initialSelectedId,
    this.initialSelectedIds,
  });

  final List<T> data;
  final TreeAdapter<T> adapter;
  final InputDecoration decoration;

  final TreeSelectionMode selectionMode;
  final double fieldHeight;
  final EdgeInsetsGeometry contentPadding;
  final double maxMenuHeight;
  final int maxVisibleTags;
  final String searchHintText;
  final Duration searchDebounce;

  final ValueChanged<T?>? onSingleChanged;
  final ValueChanged<Set<T>>? onMultiChanged;

  final String? initialSelectedId;
  final Set<String>? initialSelectedIds;

  @override
  State<TreeSelect<T>> createState() => _TreeSelectState<T>();
}

class _TreeSelectState<T> extends State<TreeSelect<T>> {
  final LayerLink _layerLink = LayerLink();
  final FocusNode _focusNode = FocusNode();
  final TextEditingController _queryController = TextEditingController();
  final ScrollController _tagScrollController = ScrollController();
  final ScrollController _menuScrollController = ScrollController();

  OverlayEntry? _overlayEntry;
  Timer? _searchDebounceTimer;

  String? _selectedId;
  Set<String> _selectedIds = <String>{};

  late Map<String, T> _nodeById;

  @override
  void initState() {
    super.initState();
    _selectedId = widget.initialSelectedId;
    _selectedIds = Set<String>.from(
      widget.initialSelectedIds ?? const <String>{},
    );

    _reindex();

    _focusNode.addListener(() {
      if (_focusNode.hasFocus) {
        _open();
      } else {
        _close();
      }
    });
  }

  @override
  void didUpdateWidget(covariant TreeSelect<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data != widget.data || oldWidget.adapter != widget.adapter) {
      _reindex();
    }
  }

  @override
  void dispose() {
    _close();
    _searchDebounceTimer?.cancel();
    _focusNode.dispose();
    _queryController.dispose();
    _tagScrollController.dispose();
    _menuScrollController.dispose();
    super.dispose();
  }

  RenderBox? _fieldRenderBox() {
    final ro = context.findRenderObject();
    if (ro is! RenderBox) return null;
    if (!ro.hasSize) return null;
    return ro;
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

  bool get _hasQuery => _queryController.text.trim().isNotEmpty;
  bool get _hasSelection => widget.selectionMode == TreeSelectionMode.single
      ? _selectedId != null
      : _selectedIds.isNotEmpty;

  void _clearAll() {
    // antd-like: first clear keyword; if no keyword then clear selection.
    if (_hasQuery) {
      _searchDebounceTimer?.cancel();
      _queryController.clear();
      setState(() {});
      _overlayEntry?.markNeedsBuild();
      return;
    }

    if (!_hasSelection) return;

    if (widget.selectionMode == TreeSelectionMode.single) {
      setState(() => _selectedId = null);
      widget.onSingleChanged?.call(null);
      _overlayEntry?.markNeedsBuild();
      return;
    }

    setState(() => _selectedIds = <String>{});
    widget.onMultiChanged?.call(<T>{});
    _overlayEntry?.markNeedsBuild();
  }

  void _removeSelectedId(String id) {
    if (widget.selectionMode == TreeSelectionMode.single) {
      if (_selectedId == id) {
        setState(() => _selectedId = null);
        widget.onSingleChanged?.call(null);
      }
      _overlayEntry?.markNeedsBuild();
      return;
    }

    setState(() {
      _selectedIds = Set<String>.from(_selectedIds)..remove(id);
    });
    widget.onMultiChanged?.call(_selectedValues());
    _overlayEntry?.markNeedsBuild();
  }

  Map<String, T> _indexById(List<T> roots) {
    final out = <String, T>{};
    void walk(T node) {
      out[widget.adapter.idOf(node)] = node;
      for (final c in widget.adapter.childrenOf(node)) {
        walk(c);
      }
    }

    for (final r in roots) {
      walk(r);
    }
    return out;
  }

  void _reindex() {
    _nodeById = _indexById(widget.data);
  }

  Set<T> _selectedValues() {
    final out = <T>{};
    for (final id in _selectedIds) {
      final v = _nodeById[id];
      if (v != null) out.add(v);
    }
    return out;
  }

  List<T> _selectedForTags() {
    final adapter = widget.adapter;

    if (widget.selectionMode == TreeSelectionMode.single) {
      if (_selectedId == null) return const [];
      final v = _nodeById[_selectedId!];
      return v == null ? const [] : [v];
    }

    final list = <T>[];
    for (final id in _selectedIds) {
      final v = _nodeById[id];
      // Tags should represent actual selected leaf nodes (not half-selected parents).
      if (v != null && adapter.childrenOf(v).isEmpty) list.add(v);
    }
    list.sort((a, b) => adapter.labelOf(a).compareTo(adapter.labelOf(b)));
    return list;
  }

  ({List<T> visible, int overflow}) _visibleTags(List<T> selected) {
    final max = widget.maxVisibleTags.clamp(1, 10);
    if (selected.length <= max) return (visible: selected, overflow: 0);
    if (max == 1) {
      return (visible: <T>[selected.first], overflow: selected.length - 1);
    }
    return (
      visible: selected.take(max - 1).toList(),
      overflow: selected.length - (max - 1),
    );
  }

  Widget _suffix() {
    final showDropdown = !(_hasSelection || _hasQuery);
    return SizedBox(
      width: showDropdown ? 64 : 40,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          if (_hasSelection || _hasQuery)
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (_) => _focusNode.requestFocus(),
              child: InkWell(
                onTap: _clearAll,
                child: Container(
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, size: 12, color: Colors.white),
                ),
              ),
            ),
          if (showDropdown) ...[
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
    if (renderBox == null) return const SizedBox.shrink();
    final fieldSize = renderBox.size;

    return Positioned.fill(
      child: Stack(
        children: [
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
              elevation: 10,
              borderRadius: BorderRadius.circular(12),
              clipBehavior: Clip.antiAlias,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minWidth: fieldSize.width,
                  maxWidth: fieldSize.width,
                  maxHeight: _menuMaxHeight(),
                ),
                child: Padding(
                  // Keep top padding minimal so the first row starts near the top.
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                  child: Scrollbar(
                    controller: _menuScrollController,
                    child: SingleChildScrollView(
                      controller: _menuScrollController,
                      primary: false,
                      child: TreeView<T>(
                        data: widget.data,
                        adapter: widget.adapter,
                        selectionMode: widget.selectionMode,
                        showSearch: false,
                        searchQuery: _queryController.text,
                        selectedId:
                            widget.selectionMode == TreeSelectionMode.single
                            ? _selectedId
                            : null,
                        selectedIds:
                            widget.selectionMode == TreeSelectionMode.multiple
                            ? _selectedIds
                            : null,
                        onSingleSelectionChanged: (v) {
                          if (widget.selectionMode != TreeSelectionMode.single)
                            return;
                          final id = v == null ? null : widget.adapter.idOf(v);
                          setState(() => _selectedId = id);
                          widget.onSingleChanged?.call(v);
                          _overlayEntry?.markNeedsBuild();
                          _focusNode.unfocus();
                        },
                        onMultiSelectionChanged: (values) {
                          if (widget.selectionMode !=
                              TreeSelectionMode.multiple)
                            return;
                          final ids = values
                              .map((e) => widget.adapter.idOf(e))
                              .toSet();
                          setState(() => _selectedIds = ids);
                          widget.onMultiChanged?.call(values);
                          _overlayEntry?.markNeedsBuild();
                        },
                      ),
                    ),
                  ),
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
    final selected = _selectedForTags();
    final packed = _visibleTags(selected);
    final adapter = widget.adapter;

    final hasSelection = _hasSelection;
    final hasQuery = _hasQuery;

    final placeholderText =
        widget.decoration.hintText ??
        widget.decoration.labelText ??
        widget.searchHintText;

    final children = <Widget>[
      for (final v in packed.visible)
        SelectTag(
          text: adapter.labelOf(v),
          onClose: () => _removeSelectedId(adapter.idOf(v)),
        ),
      if (packed.overflow > 0) SelectTag(text: '+${packed.overflow}'),
      ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 40, maxWidth: 240),
        child: IntrinsicWidth(
          child: TextField(
            controller: _queryController,
            focusNode: _focusNode,
            decoration: InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              // Use the inner input's hint for placeholder; `InputDecorator.hintText`
              // is unreliable here because we always provide a child widget.
              hintText: (!hasSelection && !hasQuery) ? placeholderText : null,
            ),
            onChanged: (_) {
              // Important: update suffix (dropdown <-> clear) immediately.
              setState(() {});
              _searchDebounceTimer?.cancel();
              _searchDebounceTimer = Timer(widget.searchDebounce, () {
                if (!mounted) return;
                _overlayEntry?.markNeedsBuild();
              });
            },
          ),
        ),
      ),
    ];

    return Focus(
      onKeyEvent: (_, event) {
        if (event is! KeyDownEvent) return KeyEventResult.ignored;
        if (event.logicalKey == LogicalKeyboardKey.escape) {
          _focusNode.unfocus();
          return KeyEventResult.ignored;
        }
        if (event.logicalKey == LogicalKeyboardKey.tab) {
          if (_hasSelection || _hasQuery) _clearAll();
          return KeyEventResult.ignored;
        }
        return KeyEventResult.ignored;
      },
      child: CompositedTransformTarget(
        link: _layerLink,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => _focusNode.requestFocus(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: widget.fieldHeight),
            child: InputDecorator(
              decoration: widget.decoration.copyWith(
                suffixIcon: _suffix(),
                // Don't show `decoration.labelText` inside the field; it would overlap
                // with the TextField hint (placeholder).
                //
                // Note: `copyWith` can't unset, so we override with empty string.
                labelText: '',
                floatingLabelBehavior: FloatingLabelBehavior.never,
                // Keep a stable input height across empty/typing/with-tags states.
                contentPadding: widget.contentPadding,
                // Placeholder is handled by the inner TextField hint.
                hintText: null,
              ),
              isEmpty: !hasSelection && !hasQuery,
              child: ConstrainedBox(
                // Match `Select`'s sizing model so the field height aligns.
                constraints: const BoxConstraints(minHeight: 28),
                child: hasSelection
                    ? SingleChildScrollView(
                        controller: _tagScrollController,
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
            ),
          ),
        ),
      ),
    );
  }
}
