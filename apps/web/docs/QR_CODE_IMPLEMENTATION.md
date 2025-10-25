# Mobile App QR Code Implementation

## 📱 Overview

Implemented QR code generation and display for iTrade mobile app downloads (iOS and Android).

## 🎯 Features

### 1. **Pre-generated QR Codes with Logo**
- QR codes generated with iTrade logo embedded in the center
- High error correction level (H) to accommodate logo overlay
- White circular background for logo clarity
- Located at: `public/qr-android.png` and `public/qr-ios.png`

### 2. **Landing Page Integration**
- **Mobile Download Section** (`components/landing/mobile-download.tsx`):
  - Direct download buttons with correct URLs
  - QR code display panel
  - Feature highlights
  - Phone mockup with screenshot

### 3. **Header Integration**
- **Landing Header** (`components/landing/landing-header.tsx`):
  - "Mobile App" button in top navigation
  - Smooth scroll to download section with anchor link (#mobile-download)

## 🔗 URLs

- **Android**: https://play.google.com/store/apps/details?id=com.ihsueh.itrade
- **iOS**: https://apps.apple.com/sg/app/itrade-ihsueh/id6753905284

## 🛠️ Technical Implementation

### QR Code Generation Script

**Location**: `scripts/generate-qr-codes.js`

**Dependencies**:
- `qr-image`: QR code generation
- `sharp`: Image processing and composition

**Usage**:
```bash
pnpm run generate-qr
```

**What it does**:
1. Generates QR codes for both iOS and Android URLs
2. Resizes and centers the iTrade logo (from `public/logo.png`)
3. Adds white circular background behind logo
4. Outputs high-quality PNG files (1000x1000+)

### Components Modified

- `components/landing/mobile-download.tsx` - Added QR codes and updated URLs
- `components/landing/landing-header.tsx` - Added anchor link to download section

### File Structure

```
apps/web/
├── public/
│   ├── qr-android.png          # Generated Android QR code
│   ├── qr-ios.png              # Generated iOS QR code
│   └── logo.png                # Logo used in QR codes
├── scripts/
│   └── generate-qr-codes.js    # QR code generator script
├── components/
│   └── landing/
│       ├── landing-header.tsx  # Updated with anchor link
│       └── mobile-download.tsx # Updated with QR codes
└── docs/
    └── QR_CODE_IMPLEMENTATION.md # This file
```

## 🎨 Design Details

### QR Code Specs:
- **Size**: ~1400x1400px (optimal for scanning)
- **Error Correction**: High (H) - allows 30% damage
- **Logo Size**: 20% of QR code size
- **Background**: White circle with padding
- **Format**: PNG with transparency support

### UI Components:
- **Buttons**: Shadcn UI Button component
- **Icons**: Lucide React (Apple, Play, QrCode)
- **Images**: Next.js Image component (optimized)
- **Navigation**: Anchor links for smooth scrolling

## 📝 Future Enhancements

Potential improvements:
1. Add download analytics/tracking
2. Dynamic QR code generation for user-specific install URLs  
3. Deep linking for better app attribution
4. A/B testing different QR code designs
5. SVG QR codes for better scaling
6. Animated scroll to download section

## 🔄 Regenerating QR Codes

If URLs change or logo updates are needed:

```bash
cd apps/web
pnpm run generate-qr
```

This will regenerate both QR codes with the latest logo and URLs.

## ✅ Testing Checklist

- [x] QR codes scan correctly on iOS devices
- [x] QR codes scan correctly on Android devices
- [x] Direct download buttons work
- [x] Anchor link scrolls to download section
- [x] Responsive design on all screen sizes
- [x] Logo is clearly visible in QR codes
- [x] Build succeeds without errors

---

**Implementation Date**: October 25, 2025  
**Author**: xiaoweihsueh@gmail.com

