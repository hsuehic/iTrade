#!/bin/bash

echo "🔍 Checking SHA-1 Fingerprints for iTrade Android App"
echo "=================================================="
echo ""

# Debug Keystore
echo "📱 DEBUG Keystore SHA-1:"
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android 2>/dev/null | grep "SHA1:" || echo "❌ Debug keystore not found"
echo ""

# Release Keystore
echo "🚀 RELEASE Keystore SHA-1:"
if [ -f "/Users/xiaowei.xue/my-release-key.jks" ]; then
    keytool -list -v -keystore /Users/xiaowei.xue/my-release-key.jks -alias my-key-alias -storepass 1234567890 -keypass 1234567890 2>/dev/null | grep "SHA1:"
else
    echo "❌ Release keystore not found at /Users/xiaowei.xue/my-release-key.jks"
fi
echo ""

# Registered in Firebase
echo "✅ Registered in Firebase (from google-services.json):"
if [ -f "android/app/google-services.json" ]; then
    grep -o '"certificate_hash": "[^"]*"' android/app/google-services.json | sed 's/"certificate_hash": "\(.*\)"/\1/' | while read hash; do
        # Convert to uppercase with colons
        formatted=$(echo $hash | sed 's/\(..\)/\1:/g' | sed 's/:$//' | tr '[:lower:]' '[:upper:]')
        echo "  - $formatted"
    done
else
    echo "❌ google-services.json not found"
fi
echo ""

echo "=================================================="
echo "💡 To add a SHA-1 to Firebase:"
echo "   1. Visit: https://console.firebase.google.com/project/itrade-965d8/settings/general"
echo "   2. Click on your Android app"
echo "   3. Click 'Add fingerprint'"
echo "   4. Paste the SHA-1 (with colons)"
echo "   5. Download new google-services.json"
echo "   6. Replace android/app/google-services.json"
echo "   7. Run: flutter clean && flutter pub get"

