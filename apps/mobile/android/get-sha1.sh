#!/bin/bash

# 🔐 生成 Android SHA-1 指纹用于 Google Sign-In 配置
# 使用方法: ./get-sha1.sh

echo "🔍 生成 Android SHA-1 指纹..."
echo ""
echo "================================================"
echo "  iTrade - Android SHA-1 指纹生成工具"
echo "================================================"
echo ""

# Check if we're in the android directory
if [ ! -f "build.gradle.kts" ]; then
    echo "❌ 错误: 请在 android 目录下运行此脚本"
    echo "   cd apps/mobile/android && ./get-sha1.sh"
    exit 1
fi

# Generate signing report
echo "📝 正在生成签名报告..."
echo ""

./gradlew signingReport 2>&1 | grep -A 10 "Variant: debug" | grep "SHA1:"

echo ""
echo "================================================"
echo ""
echo "✅ SHA-1 指纹已生成！"
echo ""
echo "📋 下一步操作:"
echo "   1. 复制上面的 SHA-1 指纹"
echo "   2. 打开 Firebase Console: https://console.firebase.google.com/"
echo "   3. 选择项目 > Project Settings > 你的 Android 应用"
echo "   4. 点击 'Add fingerprint' 并粘贴 SHA-1"
echo "   5. 保存后重新下载 google-services.json"
echo ""
echo "⚠️  重要: 添加 SHA-1 后必须重新下载 google-services.json!"
echo ""

