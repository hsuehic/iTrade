# Responsive Layout Guide

## Overview

The iTrade mobile app now supports **responsive layouts** for phones, tablets, and desktop devices. This guide explains how to use the responsive layout system to create adaptive UIs that work seamlessly across different screen sizes.

## Device Breakpoints

The responsive system uses the following breakpoints:

| Device Type | Width Range | Example Devices |
|-------------|-------------|-----------------|
| **Phone** | < 600dp | iPhone, Android phones |
| **Tablet** | 600-1200dp | iPad, Android tablets |
| **Desktop** | > 1200dp | Web, large screens |

### Design Sizes

- **Phone**: 375x10000 (iPhone SE/8 standard, height disabled)
- **Tablet**: 768x10000 (iPad standard, height disabled)
- **Desktop**: 1440x10000 (Desktop standard, height disabled)

> Note: Height is set to a large value (10000) to effectively disable height scaling, allowing natural vertical scrolling.

---

## Using Responsive Utilities

### 1. Device Type Detection

```dart
import 'package:ihsueh_itrade/utils/responsive_layout.dart';

// Check device type
if (ResponsiveLayout.isPhone(context)) {
  // Phone-specific layout
} else if (ResponsiveLayout.isTablet(context)) {
  // Tablet-specific layout
} else if (ResponsiveLayout.isDesktop(context)) {
  // Desktop-specific layout
}

// Using extension methods (shorter syntax)
if (context.isPhone) {
  // Phone layout
}

if (context.isTablet) {
  // Tablet layout
}

if (context.isTabletOrLarger) {
  // Tablet or desktop layout
}
```

### 2. Responsive Values

Get different values based on device type:

```dart
final columns = ResponsiveLayout.value(
  context: context,
  phone: 1,
  tablet: 2,
  desktop: 3,
);

// Using extension method
final spacing = context.responsiveValue(
  phone: 16.0,
  tablet: 24.0,
  desktop: 32.0,
);
```

### 3. Orientation Detection

```dart
if (ResponsiveLayout.isLandscape(context)) {
  // Landscape layout
}

if (context.isPortrait) {
  // Portrait layout
}
```

---

## Responsive Layout Widgets

### 1. ResponsiveLayoutBuilder

Build completely different layouts for different device types:

```dart
import 'package:ihsueh_itrade/widgets/responsive_layout_builder.dart';

ResponsiveLayoutBuilder(
  phone: (context) => PhoneLayout(),
  tablet: (context) => TabletLayout(),
  desktop: (context) => DesktopLayout(), // Optional
)
```

**Example: Strategy List**

```dart
ResponsiveLayoutBuilder(
  phone: (context) => ListView(
    children: strategies.map((s) => StrategyCard(s)).toList(),
  ),
  tablet: (context) => GridView.count(
    crossAxisCount: 2,
    children: strategies.map((s) => StrategyCard(s)).toList(),
  ),
)
```

### 2. ResponsiveGridView

Create grids with responsive column counts:

```dart
ResponsiveGridView(
  phoneColumns: 1,
  tabletColumns: 2,
  desktopColumns: 3,
  itemCount: items.length,
  itemBuilder: (context, index) {
    return ItemCard(items[index]);
  },
  mainAxisSpacing: 16,
  crossAxisSpacing: 16,
)
```

### 3. ResponsiveTwoColumn

Automatically switches between row and column layouts:

```dart
ResponsiveTwoColumn(
  left: Container(
    child: Text('Left Panel'),
  ),
  right: Container(
    child: Text('Right Panel'),
  ),
  spacing: 16,
  leftFlex: 1,
  rightFlex: 2,
)
```

**On Phone**: Stacks vertically (Column)
**On Tablet/Desktop**: Side by side (Row)

### 4. ResponsiveContainer

Constrains content width on large screens:

```dart
ResponsiveContainer(
  phoneMaxWidth: null, // Full width on phone
  tabletMaxWidth: 800,
  desktopMaxWidth: 1200,
  child: MyContent(),
)
```

### 5. ResponsivePadding

Provides device-specific padding:

```dart
ResponsivePadding(
  phone: EdgeInsets.all(16),
  tablet: EdgeInsets.all(24),
  desktop: EdgeInsets.all(32),
  child: MyWidget(),
)
```

### 6. ResponsiveGap

Creates responsive spacing:

```dart
Column(
  children: [
    Widget1(),
    ResponsiveGap.vertical(phone: 16, tablet: 24, desktop: 32),
    Widget2(),
  ],
)

Row(
  children: [
    Widget1(),
    ResponsiveGap.horizontal(phone: 8, tablet: 12, desktop: 16),
    Widget2(),
  ],
)
```

### 7. ResponsiveWrap

Wrap with responsive spacing:

```dart
ResponsiveWrap(
  phoneSpacing: 8,
  tabletSpacing: 12,
  desktopSpacing: 16,
  children: [
    Chip(label: Text('Tag 1')),
    Chip(label: Text('Tag 2')),
    Chip(label: Text('Tag 3')),
  ],
)
```

### 8. ResponsiveRowColumn

Flexible row/column switching:

```dart
ResponsiveRowColumn(
  useRow: context.isTablet, // Use row on tablet
  children: [
    Expanded(child: Widget1()),
    Expanded(child: Widget2()),
  ],
)
```

### 9. ResponsiveSidebarLayout

Sidebar for tablets, drawer for phones:

```dart
ResponsiveSidebarLayout(
  sidebar: NavigationRail(
    destinations: [...],
  ),
  content: MainContent(),
  sidebarWidth: 250,
)
```

---

## Navigation Patterns

### Phone: Bottom Navigation Bar

```dart
Scaffold(
  body: content,
  bottomNavigationBar: BottomNavigationBar(
    items: [...],
  ),
)
```

### Tablet: Side Navigation Rail

```dart
Row(
  children: [
    NavigationRail(
      destinations: [...],
    ),
    VerticalDivider(thickness: 1, width: 1),
    Expanded(child: content),
  ],
)
```

### Automatic Switching (Like MyHomePage)

The app's main `MyHomePage` automatically switches between:
- **Phone**: Bottom navigation bar
- **Tablet**: Side navigation rail

---

## Best Practices

### 1. Design for Phone First

Start with phone layout, then enhance for tablets:

```dart
Widget build(BuildContext context) {
  // Base phone layout
  Widget phoneLayout = ListView(...);

  // Enhance for tablets
  if (context.isTablet) {
    return Row(
      children: [
        Sidebar(),
        Expanded(child: phoneLayout),
      ],
    );
  }

  return phoneLayout;
}
```

### 2. Use ScreenUtil for Consistent Sizing

The app uses `flutter_screenutil` with responsive design sizes:

```dart
// Width adaptation (use .w)
Container(width: 100.w)

// Font size adaptation (use .sp)
Text('Hello', style: TextStyle(fontSize: 16.sp))

// Radius adaptation (use .r)
BorderRadius.circular(8.r)

// ❌ DON'T use .h for height (use fixed values)
Container(height: 50) // Not 50.h
```

### 3. Test on Multiple Devices

Test your layouts on:
- **iPhone SE** (small phone)
- **iPhone 14 Pro** (standard phone)
- **iPad Mini** (small tablet)
- **iPad Pro** (large tablet)

Use Flutter's device preview tools:

```bash
# Run on iPad simulator
flutter run -d "iPad Air"

# Run on web with tablet size
flutter run -d chrome --web-browser-flag "--window-size=768,1024"
```

### 4. Handle Orientation Changes

```dart
if (context.isLandscape && context.isPhone) {
  // Phone landscape: Consider wider layout
  return WidePhoneLayout();
}

if (context.isPortrait && context.isTablet) {
  // Tablet portrait: More like phone layout
  return TabletPortraitLayout();
}
```

### 5. Use Adaptive Widgets

Flutter provides adaptive widgets that automatically adjust:

```dart
// Adaptive app bar
AppBar(
  leading: context.isPhone
    ? IconButton(icon: Icon(Icons.menu), onPressed: ...)
    : null, // No hamburger on tablet (use navigation rail)
)

// Adaptive dialogs
showDialog vs showModalBottomSheet
```

---

## Common Patterns

### Pattern 1: List vs Grid

```dart
ResponsiveLayoutBuilder(
  phone: (context) => ListView.builder(
    itemCount: items.length,
    itemBuilder: (context, index) => ItemCard(items[index]),
  ),
  tablet: (context) => GridView.builder(
    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      mainAxisSpacing: 16,
      crossAxisSpacing: 16,
    ),
    itemCount: items.length,
    itemBuilder: (context, index) => ItemCard(items[index]),
  ),
)
```

### Pattern 2: Master-Detail

```dart
if (context.isPhone) {
  // Navigate to detail screen
  Navigator.push(
    context,
    MaterialPageRoute(builder: (context) => DetailScreen(item)),
  );
} else {
  // Show detail in split view
  setState(() {
    selectedItem = item;
  });
}
```

### Pattern 3: Responsive Cards

```dart
Container(
  width: context.responsiveValue(
    phone: double.infinity,
    tablet: 300,
  ),
  padding: EdgeInsets.all(
    context.responsiveValue(
      phone: 16,
      tablet: 24,
    ),
  ),
  child: Card(...),
)
```

### Pattern 4: Adaptive Columns

```dart
ResponsiveTwoColumn(
  left: FormFields(),
  right: Preview(),
  spacing: 16,
  leftFlex: 2,
  rightFlex: 1,
)
```

---

## Example: Responsive Portfolio Screen

```dart
class ResponsivePortfolioScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: CustomAppBar(title: 'Portfolio'),
      body: ResponsiveContainer(
        child: CustomScrollView(
          slivers: [
            // Balance Header
            SliverToBoxAdapter(
              child: ResponsivePadding(
                phone: EdgeInsets.all(16),
                tablet: EdgeInsets.all(24),
                child: BalanceHeader(),
              ),
            ),

            // Asset Grid
            SliverPadding(
              padding: ResponsiveLayout.getResponsivePadding(context),
              sliver: SliverGrid(
                delegate: SliverChildBuilderDelegate(
                  (context, index) => AssetCard(assets[index]),
                  childCount: assets.length,
                ),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: ResponsiveLayout.getGridColumns(
                    context,
                    phone: 1,
                    tablet: 2,
                    desktop: 3,
                  ),
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## Debugging

Print device information for debugging:

```dart
// In your widget's build or initState
ResponsiveLayout.printDeviceInfo(context);

// Output:
// === Device Info ===
// Device Type: tablet
// Screen Size: 768x1024
// Orientation: portrait
// Pixel Ratio: 2.00
// Design Size: Size(768.0, 10000.0)
// ==================
```

---

## Migration Guide

### Updating Existing Screens

**Before:**
```dart
Scaffold(
  body: ListView(...),
  bottomNavigationBar: BottomNavigationBar(...),
)
```

**After:**
```dart
ResponsiveLayoutBuilder(
  phone: (context) => Scaffold(
    body: ListView(...),
    bottomNavigationBar: BottomNavigationBar(...),
  ),
  tablet: (context) => Scaffold(
    body: Row(
      children: [
        NavigationRail(...),
        Expanded(child: GridView(...)),
      ],
    ),
  ),
)
```

---

## Resources

- [Flutter Responsive Design](https://docs.flutter.dev/ui/layout/responsive)
- [ScreenUtil Package](https://pub.dev/packages/flutter_screenutil)
- [Material Design - Layout](https://m3.material.io/foundations/layout/understanding-layout/overview)

---

## Summary

✅ **Device Detection**: Use `ResponsiveLayout.isPhone/isTablet/isDesktop(context)`
✅ **Responsive Widgets**: Use `ResponsiveLayoutBuilder`, `ResponsiveGridView`, etc.
✅ **Responsive Values**: Use `ResponsiveLayout.value()` or `context.responsiveValue()`
✅ **Adaptive Navigation**: Bottom bar (phone) → Navigation rail (tablet)
✅ **Test on Multiple Devices**: iPhone, iPad, Android tablet
✅ **Design Sizes**: 375 (phone), 768 (tablet), 1440 (desktop)

---

Author: xiaoweihsueh@gmail.com
Date: November 10, 2025

