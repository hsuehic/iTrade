import 'package:flutter/material.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: const Center(child: Text('Dashboard')),

      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final String? result =
              await Navigator.of(context).pushNamed('/scan-qr') as String?;

          if (result != null) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text('QR Code: $result')));
          }
        },

        tooltip: 'Scan QR',
        icon: const Icon(Icons.qr_code_scanner),
        label: const Text('Scan'),
      ), // This trailing comma makes auto-formatting nicer for build methods.
    );
  }
}
