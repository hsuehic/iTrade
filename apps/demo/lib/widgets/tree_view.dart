import 'package:flutter/material.dart';

enum TreeSelectionMode { none, single, multiple }

class TreeAdapter<T> {
  const TreeAdapter({
    required this.idOf,
    required this.labelOf,
    required this.childrenOf,
  });

  final String Function(T value) idOf;
  final String Function(T value) labelOf;
  final List<T> Function(T value) childrenOf;
}

class TreeView<T> extends StatefulWidget {
  const TreeView({
    super.key,
    required this.data,
    required this.adapter,
    this.selectionMode = TreeSelectionMode.multiple,
    this.initialExpandedIds,
    this.initialSelectedId,
    this.initialSelectedIds,
    this.initialSelectedValue,
    this.initialSelectedValues,
    this.selectedId,
    this.selectedIds,
    this.searchQuery,
    this.onSingleSelectionChanged,
    this.onMultiSelectionChanged,
    this.searchHintText = 'Search',
    this.showSearch = true,
    this.indent = 20,
    this.rowHeight = 40,
  }) : assert(
         selectionMode != TreeSelectionMode.single ||
             initialSelectedIds == null,
         'initialSelectedIds is only valid for multiple selection mode.',
       ),
       assert(
         selectionMode != TreeSelectionMode.single ||
             initialSelectedValues == null,
         'initialSelectedValues is only valid for multiple selection mode.',
       );

  /// Root nodes.
  final List<T> data;
  final TreeAdapter<T> adapter;

  final TreeSelectionMode selectionMode;

  final Set<String>? initialExpandedIds;
  final String? initialSelectedId;
  final Set<String>? initialSelectedIds;
  final T? initialSelectedValue;
  final Set<T>? initialSelectedValues;

  /// Controlled selection (single). When provided, TreeView will reflect this id.
  final String? selectedId;

  /// Controlled selection (multiple). When provided, TreeView will reflect these ids.
  final Set<String>? selectedIds;

  /// Controlled search query. When provided, TreeView will filter using this text and
  /// won't render the internal search input.
  final String? searchQuery;

  /// Emits the selected typed value (or null).
  final ValueChanged<T?>? onSingleSelectionChanged;

  /// Emits selected typed values (deduped by `Set` semantics of `T`).
  final ValueChanged<Set<T>>? onMultiSelectionChanged;

  final bool showSearch;
  final String searchHintText;

  final double indent;
  final double rowHeight;

  @override
  State<TreeView<T>> createState() => _TreeViewState<T>();
}

class _TreeNode<T> {
  const _TreeNode({
    required this.id,
    required this.label,
    required this.value,
    required this.children,
  });

  final String id;
  final String label;
  final T value;
  final List<_TreeNode<T>> children;
}

class _FilteredNode<T> {
  const _FilteredNode(this.node, this.children);

  final _TreeNode<T> node;
  final List<_FilteredNode<T>> children;
}

class _FlatNode<T> {
  const _FlatNode({
    required this.node,
    required this.depth,
    required this.isExpanded,
    required this.hasChildren,
    required this.filteredChildren,
  });

  final _TreeNode<T> node;
  final int depth;
  final bool isExpanded;
  final bool hasChildren;
  final List<_FilteredNode<T>> filteredChildren;
}

class _TreeViewState<T> extends State<TreeView<T>> {
  final TextEditingController _queryController = TextEditingController();

  List<_TreeNode<T>> _roots = const [];
  final Map<String, _TreeNode<T>> _nodeById = {};
  final Map<String, Set<String>> _subtreeIdsById = {};
  final Map<String, Set<String>> _leafIdsById = {};

  final Set<String> _expandedIds = <String>{};

  String? _singleSelectedId;
  final Set<String> _multiSelectedIds = <String>{};

  String get _queryText => (widget.searchQuery ?? _queryController.text).trim();

  @override
  void initState() {
    super.initState();
    _expandedIds.addAll(widget.initialExpandedIds ?? const <String>{});

    _singleSelectedId =
        widget.selectedId ??
        widget.initialSelectedId ??
        _tryIdOf(widget.initialSelectedValue);

    if (widget.selectedIds != null) {
      _multiSelectedIds.addAll(widget.selectedIds!);
    } else {
      _multiSelectedIds.addAll(widget.initialSelectedIds ?? const <String>{});
    }
    if (widget.initialSelectedValues != null) {
      for (final v in widget.initialSelectedValues!) {
        final id = _tryIdOf(v);
        if (id != null) _multiSelectedIds.add(id);
      }
    }

    _parseAndIndex();
  }

  @override
  void didUpdateWidget(covariant TreeView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data != widget.data || oldWidget.adapter != widget.adapter) {
      _parseAndIndex();
    }

    // Controlled selection sync (doesn't require reparsing).
    if (widget.selectionMode == TreeSelectionMode.single) {
      if (oldWidget.selectedId != widget.selectedId &&
          widget.selectedId != null) {
        setState(() => _singleSelectedId = widget.selectedId);
      }
      if (oldWidget.selectedId != widget.selectedId &&
          widget.selectedId == null) {
        setState(() => _singleSelectedId = null);
      }
    }

    if (widget.selectionMode == TreeSelectionMode.multiple &&
        oldWidget.selectedIds != widget.selectedIds &&
        widget.selectedIds != null) {
      setState(() {
        _multiSelectedIds
          ..clear()
          ..addAll(widget.selectedIds!);
      });
    }
  }

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  void _parseAndIndex() {
    _nodeById.clear();
    _subtreeIdsById.clear();
    _leafIdsById.clear();

    final roots = <_TreeNode<T>>[];
    for (var i = 0; i < widget.data.length; i++) {
      roots.add(_buildNode(widget.data[i], parentPath: 'root/$i'));
    }
    _roots = roots;

    for (final r in _roots) {
      _computeSubtreeIds(r);
      _computeLeafIds(r);
    }

    // Clean selection if ids disappeared.
    _multiSelectedIds.removeWhere((id) => !_nodeById.containsKey(id));
    if (_singleSelectedId != null &&
        !_nodeById.containsKey(_singleSelectedId)) {
      _singleSelectedId = null;
    }

    // If nothing expanded, expand top-level by default.
    if (_expandedIds.isEmpty) {
      for (final r in _roots) {
        if (r.children.isNotEmpty) _expandedIds.add(r.id);
      }
    }

    if (mounted) setState(() {});
  }

  String? _tryIdOf(T? value) {
    if (value == null) return null;
    final id = widget.adapter.idOf(value).trim();
    if (id.isEmpty) return null;
    return id;
  }

  _TreeNode<T> _buildNode(T value, {required String parentPath}) {
    final idRaw = widget.adapter.idOf(value).trim();
    final id = idRaw.isEmpty ? parentPath : idRaw;
    final label = widget.adapter.labelOf(value);
    final childrenValues = widget.adapter.childrenOf(value);
    final children = <_TreeNode<T>>[];
    for (var i = 0; i < childrenValues.length; i++) {
      children.add(_buildNode(childrenValues[i], parentPath: '$id/$i'));
    }

    final node = _TreeNode<T>(
      id: id,
      label: label,
      value: value,
      children: children,
    );
    _nodeById[id] = node;
    return node;
  }

  Set<String> _computeSubtreeIds(_TreeNode<T> node) {
    final cached = _subtreeIdsById[node.id];
    if (cached != null) return cached;

    final out = <String>{node.id};
    for (final c in node.children) {
      out.addAll(_computeSubtreeIds(c));
    }
    _subtreeIdsById[node.id] = out;
    return out;
  }

  Set<String> _computeLeafIds(_TreeNode<T> node) {
    final cached = _leafIdsById[node.id];
    if (cached != null) return cached;

    if (node.children.isEmpty) {
      final out = <String>{node.id};
      _leafIdsById[node.id] = out;
      return out;
    }

    final out = <String>{};
    for (final c in node.children) {
      out.addAll(_computeLeafIds(c));
    }
    _leafIdsById[node.id] = out;
    return out;
  }

  Set<T> _selectedValues() {
    final out = <T>{};
    for (final id in _multiSelectedIds) {
      final node = _nodeById[id];
      // Only emit leaf selections (so half-selected parents won't appear as tags).
      if (node != null && node.children.isEmpty) out.add(node.value);
    }
    return out;
  }

  void _toggleExpanded(String id) {
    setState(() {
      if (_expandedIds.contains(id)) {
        _expandedIds.remove(id);
      } else {
        _expandedIds.add(id);
      }
    });
  }

  void _setSingleSelected(String? id) {
    if (widget.selectionMode != TreeSelectionMode.single) return;
    setState(() => _singleSelectedId = id);
    widget.onSingleSelectionChanged?.call(
      id == null ? null : _nodeById[id]?.value,
    );
  }

  void _toggleMultiSelected(_TreeNode<T> node, bool targetChecked) {
    if (widget.selectionMode != TreeSelectionMode.multiple) return;
    // Selection is tracked by LEAF ids only.
    final ids = _leafIdsById[node.id] ?? _computeLeafIds(node);
    setState(() {
      if (targetChecked) {
        _multiSelectedIds.addAll(ids);
      } else {
        _multiSelectedIds.removeAll(ids);
      }
    });
    widget.onMultiSelectionChanged?.call(_selectedValues());
  }

  bool? _checkboxValueForNode(_TreeNode<T> node) {
    if (node.children.isEmpty) return _multiSelectedIds.contains(node.id);
    var any = false;
    var all = true;
    for (final c in node.children) {
      final v = _checkboxValueForNode(c);
      if (v == true) any = true;
      if (v != true) all = false;
      if (v == null) {
        any = true;
        all = false;
      }
    }
    if (!any) return false;
    if (all) return true;
    return null;
  }

  bool _matches(_TreeNode<T> node, String q) {
    return node.label.toLowerCase().contains(q);
  }

  _FilteredNode<T> _asFiltered(_TreeNode<T> node) {
    return _FilteredNode<T>(node, node.children.map(_asFiltered).toList());
  }

  _FilteredNode<T>? _filterNode(_TreeNode<T> node, String q) {
    final selfMatch = _matches(node, q);
    final children = <_FilteredNode<T>>[];
    for (final c in node.children) {
      final fc = _filterNode(c, q);
      if (fc != null) children.add(fc);
    }
    if (selfMatch || children.isNotEmpty)
      return _FilteredNode<T>(node, children);
    return null;
  }

  List<_FilteredNode<T>> _filteredRoots() {
    final q = _queryText.toLowerCase();
    if (q.isEmpty) return _roots.map(_asFiltered).toList();

    final out = <_FilteredNode<T>>[];
    for (final r in _roots) {
      final fr = _filterNode(r, q);
      if (fr != null) out.add(fr);
    }
    return out;
  }

  void _flattenInto(
    List<_FlatNode<T>> out,
    List<_FilteredNode<T>> nodes, {
    required int depth,
    required bool forceExpand,
  }) {
    for (final fn in nodes) {
      final node = fn.node;
      final hasChildren = fn.children.isNotEmpty;
      final isExpanded = forceExpand ? true : _expandedIds.contains(node.id);
      out.add(
        _FlatNode<T>(
          node: node,
          depth: depth,
          isExpanded: isExpanded,
          hasChildren: hasChildren,
          filteredChildren: fn.children,
        ),
      );
      if (hasChildren && isExpanded) {
        _flattenInto(
          out,
          fn.children,
          depth: depth + 1,
          forceExpand: forceExpand,
        );
      }
    }
  }

  List<_FlatNode<T>> _flatNodes() {
    final filtered = _filteredRoots();
    final q = _queryText;
    final forceExpand = q.isNotEmpty;
    final out = <_FlatNode<T>>[];
    _flattenInto(out, filtered, depth: 0, forceExpand: forceExpand);
    return out;
  }

  Widget _buildLabel(BuildContext context, _TreeNode<T> node) {
    final q = _queryText;
    final textStyle = Theme.of(context).textTheme.bodyMedium;
    if (q.isEmpty) {
      return Text(
        node.label,
        style: textStyle,
        overflow: TextOverflow.ellipsis,
      );
    }

    final lower = node.label.toLowerCase();
    final qLower = q.toLowerCase();
    final idx = lower.indexOf(qLower);
    if (idx < 0) {
      return Text(
        node.label,
        style: textStyle,
        overflow: TextOverflow.ellipsis,
      );
    }

    final before = node.label.substring(0, idx);
    final match = node.label.substring(idx, idx + q.length);
    final after = node.label.substring(idx + q.length);
    final colorScheme = Theme.of(context).colorScheme;

    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: before),
          TextSpan(
            text: match,
            style: TextStyle(
              color: colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
          TextSpan(text: after),
        ],
      ),
      style: textStyle,
      overflow: TextOverflow.ellipsis,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final q = _queryText;
    final rows = _flatNodes();

    final showInternalSearch = widget.showSearch && widget.searchQuery == null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showInternalSearch)
          TextField(
            controller: _queryController,
            decoration: InputDecoration(
              hintText: widget.searchHintText,
              prefixIcon: const Icon(Icons.search),
              suffixIcon: q.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear',
                      onPressed: () => setState(() => _queryController.clear()),
                      icon: const Icon(Icons.close),
                    ),
            ),
            onChanged: (_) => setState(() {}),
          ),
        if (showInternalSearch) const SizedBox(height: 8),
        Container(
          // TreeView should be usable standalone without forcing a border box.
          // The parent can wrap this widget to add borders if needed.
          color: colorScheme.surface,
          child: rows.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    q.isEmpty ? 'No data' : 'No results',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                )
              : ListView.builder(
                  // In overlay (dropdown) contexts, ListView may apply MediaQuery
                  // padding by default, which creates a large blank area at the top.
                  // Force zero padding to keep the first row aligned to the top.
                  padding: EdgeInsets.zero,
                  primary: false,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: rows.length,
                  itemBuilder: (context, index) {
                    final row = rows[index];
                    final node = row.node;
                    final depth = row.depth;
                    final isSearching = q.isNotEmpty;
                    final canExpand = row.hasChildren && !isSearching;

                    Widget? selectionWidget;
                    if (widget.selectionMode == TreeSelectionMode.multiple) {
                      final value = _checkboxValueForNode(node);
                      final targetChecked = value == true ? false : true;
                      selectionWidget = Checkbox(
                        tristate: true,
                        value: value,
                        onChanged: (_) =>
                            _toggleMultiSelected(node, targetChecked),
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      );
                    } else if (widget.selectionMode ==
                        TreeSelectionMode.single) {
                      selectionWidget = Radio<String?>(
                        value: node.id,
                        groupValue: _singleSelectedId,
                        onChanged: (_) => _setSingleSelected(node.id),
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      );
                    }

                    return InkWell(
                      onTap: widget.selectionMode == TreeSelectionMode.none
                          ? null
                          : () {
                              if (widget.selectionMode ==
                                  TreeSelectionMode.single) {
                                _setSingleSelected(node.id);
                                return;
                              }
                              if (widget.selectionMode ==
                                  TreeSelectionMode.multiple) {
                                final v = _checkboxValueForNode(node);
                                _toggleMultiSelected(node, v != true);
                              }
                            },
                      child: SizedBox(
                        height: widget.rowHeight,
                        child: Row(
                          children: [
                            SizedBox(width: widget.indent * depth),
                            SizedBox(
                              width: 36,
                              child: row.hasChildren
                                  ? (isSearching
                                        ? Icon(
                                            Icons.keyboard_arrow_down,
                                            color: Theme.of(
                                              context,
                                            ).colorScheme.onSurfaceVariant,
                                          )
                                        : IconButton(
                                            tooltip: row.isExpanded
                                                ? 'Collapse'
                                                : 'Expand',
                                            onPressed: canExpand
                                                ? () => _toggleExpanded(node.id)
                                                : null,
                                            icon: Icon(
                                              row.isExpanded
                                                  ? Icons.keyboard_arrow_down
                                                  : Icons.keyboard_arrow_right,
                                            ),
                                          ))
                                  : const SizedBox.shrink(),
                            ),
                            if (selectionWidget != null) selectionWidget,
                            Expanded(child: _buildLabel(context, node)),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
