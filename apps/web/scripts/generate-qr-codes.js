#!/usr/bin/env node

/**
 * Generate QR codes with iTrade logo in the center
 *
 * Usage: node apps/web/scripts/generate-qr-codes.js
 *
 * This will generate:
 * - apps/web/public/qr-android.png (Google Play)
 * - apps/web/public/qr-ios.png (App Store)
 * - apps/web/public/qr-apk.png (Direct APK)
 */

const qr = require('qr-image');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const URLS = {
  android: 'https://play.google.com/store/apps/details?id=com.ihsueh.itrade',
  ios: 'https://apps.apple.com/sg/app/itrade-ihsueh/id6753905284',
  apk: 'https://itrade.ihsueh.com/downloads/itrade.apk',
};

const OUTPUT_DIR = path.join(__dirname, '../public');
const LOGO_PATH = path.join(__dirname, '../public/logo.png');

async function generateQRWithLogo(url, outputPath) {
  try {
    // Generate QR code as PNG buffer
    const qrPng = qr.imageSync(url, {
      type: 'png',
      size: 30, // Module size
      margin: 1,
      ec_level: 'H', // High error correction to allow logo overlay
    });

    // Get QR code dimensions
    const qrImage = sharp(qrPng);
    const qrMetadata = await qrImage.metadata();
    const qrSize = qrMetadata.width;

    // Prepare logo - resize and add white background
    const logoSize = Math.floor(qrSize * 0.2); // Logo is 20% of QR code size
    const logoBgSize = logoSize + 20; // Add padding

    // Create white background circle
    const circleSvg = `
      <svg width="${logoBgSize}" height="${logoBgSize}">
        <circle cx="${logoBgSize / 2}" cy="${logoBgSize / 2}" r="${logoBgSize / 2}" fill="white"/>
      </svg>
    `;

    // Resize logo
    const resizedLogo = await sharp(LOGO_PATH)
      .resize(logoSize, logoSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .toBuffer();

    // Composite: QR + white circle + logo
    const finalImage = await sharp(qrPng)
      .composite([
        {
          input: Buffer.from(circleSvg),
          top: Math.floor((qrSize - logoBgSize) / 2),
          left: Math.floor((qrSize - logoBgSize) / 2),
        },
        {
          input: resizedLogo,
          top: Math.floor((qrSize - logoSize) / 2),
          left: Math.floor((qrSize - logoSize) / 2),
        },
      ])
      .png()
      .toFile(outputPath);

    console.log(
      `✅ Generated: ${path.basename(outputPath)} (${finalImage.width}x${finalImage.height}px)`,
    );
  } catch (error) {
    console.error(`❌ Error generating ${path.basename(outputPath)}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🎨 Generating QR codes with iTrade logo...\n');

  // Check if logo exists
  if (!fs.existsSync(LOGO_PATH)) {
    console.error(`❌ Logo not found at: ${LOGO_PATH}`);
    console.log('💡 Please ensure logo.png exists in public/ directory');
    process.exit(1);
  }

  // Generate QR codes
  await generateQRWithLogo(URLS.android, path.join(OUTPUT_DIR, 'qr-android.png'));

  await generateQRWithLogo(URLS.ios, path.join(OUTPUT_DIR, 'qr-ios.png'));

  await generateQRWithLogo(URLS.apk, path.join(OUTPUT_DIR, 'qr-apk.png'));

  console.log('\n✨ All QR codes generated successfully!');
  console.log('\nGenerated files:');
  console.log('  - apps/web/public/qr-android.png (Google Play)');
  console.log('  - apps/web/public/qr-ios.png (App Store)');
  console.log('  - apps/web/public/qr-apk.png (Direct APK)');
  console.log('\n📱 URLs:');
  console.log(`  - Google Play: ${URLS.android}`);
  console.log(`  - App Store: ${URLS.ios}`);
  console.log(`  - Direct APK: ${URLS.apk}`);
}

main().catch((error) => {
  console.error('❌ Failed to generate QR codes:', error);
  process.exit(1);
});
