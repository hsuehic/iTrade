#!/bin/bash

# 🔍 检查 Android Google Sign-In 配置
# 使用方法: ./check-google-signin-config.sh

echo "🔍 检查 Android Google Sign-In 配置..."
echo ""
echo "================================================"
echo "  iTrade - Google Sign-In 配置检查"
echo "================================================"
echo ""

ERRORS=0

# Check 1: google-services.json
echo "📋 检查 1/4: google-services.json 文件"
if [ -f "android/app/google-services.json" ]; then
    echo "   ✅ google-services.json 存在"
    
    # Check if it's valid JSON
    if cat android/app/google-services.json | python3 -m json.tool > /dev/null 2>&1; then
        echo "   ✅ JSON 格式有效"
        
        # Extract package name
        PACKAGE=$(cat android/app/google-services.json | grep -o '"package_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ "$PACKAGE" = "com.ihsueh.itrade" ]; then
            echo "   ✅ 包名匹配: $PACKAGE"
        else
            echo "   ⚠️  包名不匹配: $PACKAGE (应该是 com.ihsueh.itrade)"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo "   ❌ JSON 格式无效"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "   ❌ google-services.json 不存在"
    echo "      → 请从 Firebase Console 下载并放到: android/app/google-services.json"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 2: Google Services plugin in root build.gradle
echo "📋 检查 2/4: 根 build.gradle.kts 配置"
if grep -q "com.google.gms:google-services" android/build.gradle.kts; then
    echo "   ✅ Google Services classpath 已添加"
else
    echo "   ❌ Google Services classpath 缺失"
    echo "      → 需要在 android/build.gradle.kts 的 buildscript.dependencies 中添加:"
    echo "         classpath(\"com.google.gms:google-services:4.4.2\")"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 3: Google Services plugin in app build.gradle
echo "📋 检查 3/4: app build.gradle.kts 配置"
if grep -q "com.google.gms.google-services" android/app/build.gradle.kts; then
    echo "   ✅ Google Services 插件已应用"
else
    echo "   ❌ Google Services 插件未应用"
    echo "      → 需要在 android/app/build.gradle.kts 末尾添加:"
    echo "         apply(plugin = \"com.google.gms.google-services\")"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 4: Client IDs in config.dart
echo "📋 检查 4/4: OAuth Client ID 配置"
if [ -f "lib/services/config.dart" ]; then
    echo "   ✅ config.dart 存在"
    
    ANDROID_CLIENT=$(grep "kGoogleAndroidClientId" lib/services/config.dart | grep -o '[0-9]\+-[a-z0-9]\+\.apps\.googleusercontent\.com')
    WEB_CLIENT=$(grep "kGoogleWebClientId" lib/services/config.dart | grep -o '[0-9]\+-[a-z0-9]\+\.apps\.googleusercontent\.com')
    
    if [ ! -z "$ANDROID_CLIENT" ]; then
        echo "   ✅ Android Client ID: $ANDROID_CLIENT"
    else
        echo "   ⚠️  Android Client ID 格式可能不正确"
    fi
    
    if [ ! -z "$WEB_CLIENT" ]; then
        echo "   ✅ Web Client ID: $WEB_CLIENT"
    else
        echo "   ⚠️  Web Client ID 格式可能不正确"
    fi
else
    echo "   ❌ config.dart 不存在"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Summary
echo "================================================"
echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ 所有配置检查通过！"
    echo ""
    echo "🚀 下一步:"
    echo "   1. 运行 SHA-1 生成脚本:"
    echo "      cd android && ./get-sha1.sh"
    echo ""
    echo "   2. 将 SHA-1 添加到 Firebase Console"
    echo ""
    echo "   3. 重新下载 google-services.json (添加 SHA-1 后)"
    echo ""
    echo "   4. 清理并重新构建:"
    echo "      flutter clean && flutter pub get"
    echo "      flutter run"
else
    echo "❌ 发现 $ERRORS 个配置问题"
    echo ""
    echo "📖 请查看详细修复指南:"
    echo "   docs/ANDROID_GOOGLE_SIGNIN_FIX.md"
fi
echo ""

