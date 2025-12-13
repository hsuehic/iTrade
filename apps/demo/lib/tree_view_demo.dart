import 'package:flutter/material.dart';

import 'widgets/select.dart';
import 'widgets/tree_select.dart';
import 'widgets/tree_view.dart';

class DemoNode {
  const DemoNode({
    required this.id,
    required this.label,
    this.children = const [],
  });

  final String id;
  final String label;
  final List<DemoNode> children;

  @override
  String toString() => '$label($id)';
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(useMaterial3: true),
      home: const TreeDemo(),
    );
  }
}

class TreeDemo extends StatefulWidget {
  const TreeDemo({super.key});

  @override
  State<TreeDemo> createState() => _TreeDemoState();
}

class _TreeDemoState extends State<TreeDemo> {
  Set<DemoNode> _selected = <DemoNode>{};
  DemoNode? _singleSelected;
  Set<DemoNode> _treeSelectSelected = <DemoNode>{};
  List<DemoNode> _selectSelected = <DemoNode>[];
  DemoNode? _clickedNodeNonSelectable;
  List<DemoNode> _clickedAncestorsNonSelectable = const <DemoNode>[];
  DemoNode? _clickedNodeSelectable;
  List<DemoNode> _clickedAncestorsSelectable = const <DemoNode>[];

  @override
  Widget build(BuildContext context) {
    final data = <DemoNode>[
      const DemoNode(
        id: 'root-1',
        label: '交易所',
        children: [
          DemoNode(
            id: 'binance',
            label: 'Binance',
            children: [
              DemoNode(id: 'binance-spot', label: 'Spot'),
              DemoNode(id: 'binance-futures', label: 'Futures'),
            ],
          ),
          DemoNode(
            id: 'okx',
            label: 'OKX',
            children: [
              DemoNode(id: 'okx-spot', label: 'Spot'),
              DemoNode(id: 'okx-swap', label: 'Swap'),
            ],
          ),
        ],
      ),
      const DemoNode(
        id: 'root-2',
        label: '策略',
        children: [
          DemoNode(
            id: 'grid',
            label: 'Grid',
            children: [
              DemoNode(id: 'grid-fixed', label: 'Fixed'),
              DemoNode(id: 'grid-moving', label: 'Moving Window'),
            ],
          ),
          DemoNode(id: 'dca', label: 'DCA'),
        ],
      ),
    ];

    final adapter = TreeAdapter<DemoNode>(
      idOf: (n) => n.id,
      labelOf: (n) => n.label,
      childrenOf: (n) => n.children,
    );

    final leafNodes = <DemoNode>[];
    void collectLeaves(DemoNode n) {
      if (n.children.isEmpty) {
        leafNodes.add(n);
        return;
      }
      for (final c in n.children) {
        collectLeaves(c);
      }
    }

    for (final r in data) {
      collectLeaves(r);
    }
    leafNodes.sort((a, b) => a.id.compareTo(b.id));

    return Scaffold(
      appBar: AppBar(title: const Text('半选状态测试')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'TreeSelect（下拉 Tree + Tag）',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          TreeSelect<DemoNode>(
            data: data,
            adapter: adapter,
            selectionMode: TreeSelectionMode.multiple,
            decoration: const InputDecoration(
              labelText: 'Select',
              border: OutlineInputBorder(),
            ),
            onMultiChanged: (v) => setState(() => _treeSelectSelected = v),
          ),
          const SizedBox(height: 8),
          Text(
            'TreeSelect 已选: ${(_treeSelectSelected.toList()..sort((a, b) => a.id.compareTo(b.id))).map((e) => e.id).toList()}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 24),
          Text(
            'TreeView（默认：非可选模式 TreeSelectionMode.none）',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          TreeView<DemoNode>(
            data: data,
            adapter: adapter,
            // No selectionMode specified => defaults to TreeSelectionMode.none
            onNodeClick: (node, ancestors) {
              setState(() {
                _clickedNodeNonSelectable = node;
                _clickedAncestorsNonSelectable = ancestors;
              });
            },
          ),
          const SizedBox(height: 8),
          Text(
            '点击回调: node=${_clickedNodeNonSelectable?.id ?? '-'}, path=${_clickedAncestorsNonSelectable.map((e) => e.id).toList()}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Text(
            'Select（下拉 List + Tag，对齐 TreeSelect 的输入框/Tag 样式）',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Select<DemoNode>(
            items: leafNodes,
            values: _selectSelected,
            mode: SelectMode.multiple,
            decoration: const InputDecoration(
              labelText: 'Select',
              border: OutlineInputBorder(),
            ),
            itemAsString: (n) => n.label,
            searchTextForItem: (n) => n.label,
            onChanged: (v) => setState(() => _selectSelected = v),
          ),
          const SizedBox(height: 8),
          Text(
            'Select 已选: ${(_selectSelected.toList()..sort((a, b) => a.id.compareTo(b.id))).map((e) => e.id).toList()}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 24),
          Text(
            'TreeView（可选 + Node Click Callback）',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          TreeView<DemoNode>(
            data: data,
            adapter: adapter,
            selectionMode: TreeSelectionMode.multiple,
            onNodeClick: (node, ancestors) {
              setState(() {
                _clickedNodeSelectable = node;
                _clickedAncestorsSelectable = ancestors;
              });
            },
            onMultiSelectionChanged: (v) => setState(() => _selected = v),
          ),
          const SizedBox(height: 8),
          Text(
            '点击回调: node=${_clickedNodeSelectable?.id ?? '-'}, path=${_clickedAncestorsSelectable.map((e) => e.id).toList()}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          Text(
            '复选（支持半选 + 搜索过滤）',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          TreeView<DemoNode>(
            data: data,
            adapter: adapter,
            selectionMode: TreeSelectionMode.multiple,
            onMultiSelectionChanged: (v) => setState(() => _selected = v),
          ),
          const SizedBox(height: 8),
          Text(
            '已选: ${(_selected.toList()..sort((a, b) => a.id.compareTo(b.id))).map((e) => e.id).toList()}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 24),
          Text('单选（Radio）', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TreeView<DemoNode>(
            data: data,
            adapter: adapter,
            selectionMode: TreeSelectionMode.single,
            onSingleSelectionChanged: (v) =>
                setState(() => _singleSelected = v),
          ),
          const SizedBox(height: 8),
          Text(
            '单选: ${_singleSelected?.id ?? '-'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
