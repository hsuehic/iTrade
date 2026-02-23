import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../design/tokens/color.dart';

class AppSwitch extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool enabled;

  const AppSwitch({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final activeTrackColor = ColorTokens.darkPrimary;
    final inactiveTrackColor = Colors.grey[700]!;
    final activeThumbColor = Colors.white;
    final inactiveThumbColor = Colors.grey[400]!;
    final trackColor = value ? activeTrackColor : inactiveTrackColor;
    final thumbColor = value ? activeThumbColor : inactiveThumbColor;

    return Semantics(
      toggled: value,
      enabled: enabled,
      child: SizedBox(
        width: 46.w,
        height: 26.w,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(13.w),
            onTap: enabled ? () => onChanged(!value) : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              padding: EdgeInsets.all(2.w),
              decoration: BoxDecoration(
                color: enabled ? trackColor : inactiveTrackColor,
                borderRadius: BorderRadius.circular(13.w),
              ),
              child: AnimatedAlign(
                duration: const Duration(milliseconds: 160),
                alignment: value ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: 22.w,
                  height: 22.w,
                  decoration: BoxDecoration(
                    color: thumbColor,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
