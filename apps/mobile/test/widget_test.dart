// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'package:ihsueh_itrade/screens/splash.dart';

void main() {
  testWidgets('App renders splash content', (WidgetTester tester) async {
    await tester.pumpWidget(
      ScreenUtilInit(
        designSize: const Size(375, 10000),
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (context, child) {
          return const MaterialApp(
            home: SplashScreen(skipNavigation: true),
          );
        },
      ),
    );
    await tester.pump();

    expect(find.text('iTrade'), findsWidgets);
    expect(find.text('Intelligent & Strategic'), findsWidgets);
  });
}
