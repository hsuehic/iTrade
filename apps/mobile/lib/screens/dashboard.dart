import 'package:flutter/material.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: const Center(child: Text('Dashboard')),
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
          messenger.showSnackBar(SnackBar(content: Text('QR Code: $result')));
        },
        icon: const Icon(Icons.qr_code_scanner),
        label: const Text('Scan'),
        tooltip: 'Scan QR',
      ),
    );
  }
}
