import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:ihsueh_itrade/utils/responsive_layout.dart';
import 'quick_menu_drawer.dart';
import 'copy_text.dart';

class CustomAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String? title;
  final String? titleKey;
  final String? titleFallback;
  final List<Widget>? actions;
  final bool showMenuButton;
  final bool showScanner;

  const CustomAppBar({
    super.key,
    this.title,
    this.titleKey,
    this.titleFallback,
    this.actions,
    this.showMenuButton = true,
    this.showScanner = true,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isTablet = ResponsiveLayout.isTablet(context);

    final titleWidget = titleKey != null
        ? CopyText(
            titleKey!,
            fallback: titleFallback ?? title ?? '',
            style: TextStyle(fontSize: 18.sp),
          )
        : Text(
            title ?? '',
            style: TextStyle(fontSize: 18.sp),
          );

    return AppBar(
      title: titleWidget,  // ✅ Adaptive font
      centerTitle: true, // 统一在所有平台居中显示
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      // Hide hamburger menu on tablet (we have sidebar instead)
      leading: (showMenuButton && !isTablet)
          ? IconButton(
              icon: const Icon(Icons.menu),
              onPressed: () {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (context) => const QuickMenuDrawer(),
                );
              },
            )
          : null,
      // Auto-imply leading: false when no leading widget on tablet
      automaticallyImplyLeading: !isTablet,
      actions: [
        if (showScanner)
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
