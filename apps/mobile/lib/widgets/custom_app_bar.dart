import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'quick_menu_drawer.dart';

class CustomAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;

  const CustomAppBar({super.key, required this.title, this.actions});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return AppBar(
      title: Text(title, style: TextStyle(fontSize: 18.sp)),  // ✅ Adaptive font
      centerTitle: true, // 统一在所有平台居中显示
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      leading: IconButton(
        icon: const Icon(Icons.menu),
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (context) => const QuickMenuDrawer(),
          );
        },
      ),
      actions: [
        IconButton(
          icon: Icon(
            Icons.qr_code_scanner,
            color: isDark ? Colors.white : Colors.black87,
          ),
          onPressed: () {
            Navigator.pushNamed(context, '/scan-qr');
          },
        ),
        if (actions != null) ...actions!,
      ],
    );
  }
}
