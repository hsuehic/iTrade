import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:itrade/screens/dashboard.dart';

void main() {
  group('DashboardScreen', () {
    testWidgets('renders Dashboard text', (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      expect(find.text('Dashboard'), findsOneWidget);
    });

    testWidgets('renders Scan button with QR icon', (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      expect(find.byIcon(Icons.qr_code_scanner), findsOneWidget);
      expect(find.text('Scan'), findsOneWidget);
    });

    testWidgets('navigates to QR scan and shows result', (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // Mock navigation result
      final mockResult = 'test-qr-result';
      Navigator.of(tester.element(find.byType(DashboardScreen))).pop(mockResult);
      await tester.pumpAndSettle();

      expect(find.text('QR Code: $mockResult'), findsOneWidget);
    });

    testWidgets('handles unmounted state after navigation', (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // Simulate unmounted state
      tester.state<State<StatefulWidget>>(find.byType(DashboardScreen)).dispose();
      Navigator.of(tester.element(find.byType(DashboardScreen))).pop('test-qr-result');
      await tester.pumpAndSettle();

      // No error should occur
      expect(find.text('Dashboard'), findsOneWidget);
    });
  });
}
