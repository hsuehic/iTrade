import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/copy_service.dart';
import '../widgets/copy_text.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: CopyText('screen.dashboard.dashboard', fallback: "Dashboard", style: TextStyle(fontSize: 16.sp),  // ✅ Adaptive font
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          // Capture Navigator and ScaffoldMessenger *before* async
          final navigator = Navigator.of(context);
          final messenger = ScaffoldMessenger.of(context);

          // Now perform the async operation
          final result = await navigator.pushNamed('/scan-qr') as String?;

          // Guard with mounted before using State.context (optional)
          if (!mounted || result == null) return;

          // Safe usage: using captured ScaffoldMessenger
          messenger.showSnackBar(
            SnackBar(
              content: CopyText(
                'screen.dashboard.qr_code_result',
                params: {'code': result.toString()},
                fallback: 'QR Code: {{code}}',
                style: TextStyle(fontSize: 14.sp),  // ✅ Adaptive font
              ),
            ),
          );
        },
        icon: Icon(Icons.qr_code_scanner, size: 24.w),  // ✅ Uniform scaling
        label: CopyText('screen.dashboard.scan', fallback: "Scan", style: TextStyle(fontSize: 14.sp)),  // ✅ Adaptive font
        tooltip: CopyService.instance.t(
          'screen.dashboard.scan_qr',
          fallback: 'Scan QR',
        ),
      ),
    );
  }
}
