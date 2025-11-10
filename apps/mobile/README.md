# iTrade Mobile App

AI(i, same pronounce with Chinese character 爱) trade, intelligent trade.

This is the mobile application for iTrade, built with Flutter. It supports **phones, tablets, and desktop** devices with fully responsive layouts.

## Features

✨ **Responsive Design** - Adapts seamlessly to phones, tablets, and desktop screens
📱 **Native Feel** - Platform-specific UI components and navigation patterns
🎨 **Theme Support** - Light and dark themes with smooth transitions
📊 **Real-time Data** - Live portfolio, strategies, and market data
🔐 **Secure Authentication** - Firebase authentication and secure API communication
🌐 **Multi-exchange Support** - Binance, OKX, Coinbase, and more

## Platform Support

| Platform | Status | Layout |
|----------|--------|--------|
| iOS | ✅ Supported | Phone + Tablet (iPad) |
| Android | ✅ Supported | Phone + Tablet |
| Web | ✅ Supported | Desktop responsive |
| macOS | 🚧 Experimental | Desktop responsive |
| Windows | 🚧 Experimental | Desktop responsive |
| Linux | 🚧 Experimental | Desktop responsive |

## Responsive Layouts

The app automatically adapts to different screen sizes:

### Phone (< 600dp)
- **Navigation**: Bottom navigation bar
- **Layout**: Single column, optimized for one-hand use
- **Design**: 375px width standard (iPhone SE/8)

### Tablet (600-1200dp)
- **Navigation**: Side navigation rail
- **Layout**: Multi-column grids, master-detail views
- **Design**: 768px width standard (iPad)

### Desktop (> 1200dp)
- **Navigation**: Side navigation rail with expanded labels
- **Layout**: Multi-column, wide content areas
- **Design**: 1440px width standard

## Getting Started

### Prerequisites

- [Flutter SDK](https://docs.flutter.dev/get-started/install) (3.0+)
- Xcode (for iOS development)
- Android Studio (for Android development)
- CocoaPods (for iOS dependencies)

### Installation

1. **Install dependencies**:
   ```bash
   flutter pub get
   ```

2. **Set up Firebase** (optional, for push notifications):
   - Add `google-services.json` (Android)
   - Add `GoogleService-Info.plist` (iOS)
   - Or use FlutterFire CLI: `flutterfire configure`

3. **Run the app**:
   ```bash
   # Run on connected device
   flutter run

   # Run on specific device
   flutter run -d <device_id>

   # Run on iPad simulator
   flutter run -d "iPad Air"

   # Run on web with tablet size
   flutter run -d chrome --web-browser-flag "--window-size=768,1024"
   ```

### Configuration

Create a `.env` file or configure the API endpoint in `lib/constant/network.dart`:

```dart
class NetworkParameter {
  static const String host = 'YOUR_API_HOST';
  static const String origin = 'YOUR_ORIGIN';
}
```

## Documentation

- **[Responsive Layout Guide](./docs/RESPONSIVE_LAYOUT_GUIDE.md)** - Complete guide for responsive UI development
- **[Google Sign-In Setup](./docs/GOOGLE_SIGNIN_SETUP.md)** - Configure Google authentication
- **[Build Guide](./docs/BUILD_GUIDE.md)** - Build for production

## Project Structure

```
lib/
├── main.dart                 # App entry point with responsive navigation
├── constant/                 # App constants and configuration
├── design/                   # Design system (themes, tokens, spacing)
│   ├── themes/              # Brand, light, and dark themes
│   └── tokens/              # Design tokens (colors, spacing, typography)
├── models/                   # Data models
├── screens/                  # UI screens (Portfolio, Strategy, etc.)
├── services/                 # API clients and services
├── utils/                    # Utilities and helpers
│   ├── responsive_layout.dart    # Responsive utilities
│   └── screen_util.dart          # Screen adaptation
└── widgets/                  # Reusable widgets
    ├── responsive_layout_builder.dart  # Responsive widgets
    └── design_bottom_nav.dart          # Bottom navigation

docs/
├── RESPONSIVE_LAYOUT_GUIDE.md    # Responsive design guide
├── GOOGLE_SIGNIN_SETUP.md        # Google Sign-In setup
└── BUILD_GUIDE.md                # Production build guide
```

## Development

### Running Tests

```bash
flutter test
```

### Building for Production

**iOS:**
```bash
flutter build ios --release
```

**Android:**
```bash
flutter build apk --release      # APK
flutter build appbundle --release # AAB (for Play Store)
```

**Web:**
```bash
flutter build web --release
```

### Testing on Different Devices

Use Flutter's device tools to test responsive layouts:

```bash
# List available devices
flutter devices

# Run on specific device
flutter run -d <device_id>

# Use device preview package (optional)
# Add to pubspec.yaml: device_preview: ^1.1.0
```

## Key Technologies

- **Flutter** - Cross-platform UI framework
- **flutter_screenutil** - Screen adaptation library
- **Firebase** - Authentication and analytics
- **fl_chart** - Beautiful charts and graphs
- **Material Design 3** - Modern UI components

## Responsive Development Guide

When developing new features, follow these guidelines:

1. **Design for phone first** - Start with phone layout, then enhance for tablets
2. **Use responsive utilities** - Use `ResponsiveLayout` helper methods
3. **Test on multiple devices** - Test on phone, tablet, and desktop
4. **Use adaptive widgets** - Use `ResponsiveLayoutBuilder`, `ResponsiveGridView`, etc.
5. **Handle orientation** - Consider landscape and portrait modes

Example:

```dart
import 'package:ihsueh_itrade/utils/responsive_layout.dart';
import 'package:ihsueh_itrade/widgets/responsive_layout_builder.dart';

ResponsiveLayoutBuilder(
  phone: (context) => ListView(children: items),
  tablet: (context) => GridView.count(
    crossAxisCount: 2,
    children: items,
  ),
)
```

See [Responsive Layout Guide](./docs/RESPONSIVE_LAYOUT_GUIDE.md) for detailed examples.

## Resources

- [Flutter Documentation](https://docs.flutter.dev/)
- [Material Design 3](https://m3.material.io/)
- [Flutter ScreenUtil](https://pub.dev/packages/flutter_screenutil)
- [Responsive Design Best Practices](https://docs.flutter.dev/ui/layout/responsive)

## Troubleshooting

### Firebase initialization timeout
- Ensure Firebase config files are properly added
- Check internet connection
- App will continue to work without Firebase (notifications disabled)

### Screen adaptation not working
- Ensure `ScreenUtilInit` wraps your `MaterialApp`
- Use `.w` for width, `.sp` for font size, `.r` for radius
- Don't use `.h` for height (use fixed values instead)

### Navigation rail not showing on tablet
- Check device width: Tablets are detected at 600dp+
- Use `ResponsiveLayout.printDeviceInfo(context)` to debug
- Verify `ResponsiveLayout.isTablet(context)` returns true

## License

Copyright © 2025 iTrade. All rights reserved.

---

Author: xiaoweihsueh@gmail.com
Date: November 10, 2025
