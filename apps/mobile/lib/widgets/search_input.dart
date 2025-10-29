import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class SimpleSearchBar extends StatefulWidget {
  final void Function(String)? onChanged;
  final void Function(String)? onSubmitted;
  const SimpleSearchBar({super.key, this.onChanged, this.onSubmitted});
  @override
  State<SimpleSearchBar> createState() => _SimpleSearchBarState();
}

class _SimpleSearchBarState extends State<SimpleSearchBar> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 0),  // ✅ Width-adapted
      // 使用 Theme 小组件包裹，以覆盖父级主题设置
      child: Theme(
        data: ThemeData(
          // 将此处的 ThemeData 设置为空，以避免继承 InputdDecorationTheme
          // 或者在此处定义新的 inputDecorationTheme
          inputDecorationTheme: const InputDecorationTheme(
            isDense: true,
            contentPadding: EdgeInsets.symmetric(vertical: 4),
          ),
        ),
        child: TextField(
          controller: _searchController,
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Search...',
            prefixIcon: const Icon(Icons.search),
            filled: true,
            fillColor: Colors.black12, // 使用一个更明显的颜色来测试
            // 修改未聚焦时的边框
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),  // ✅ Uniform radius
              borderSide: BorderSide(
                color: Theme.of(context).colorScheme.surfaceContainer,
                width: 1.0,
              ),
            ),
            // 修改聚焦时的边框
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),  // ✅ Uniform radius
              borderSide: BorderSide(
                color: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.5),
                width: 2.0,
              ),
            ),
          ),
          onChanged: (query) {
            widget.onChanged?.call(query);
          },
          onSubmitted: (query) {
            widget.onSubmitted?.call(query);
          },
        ),
      ),
    );
  }
}
