#!/bin/bash
set -e

# -------------------------------
# 配置区
# -------------------------------
# keystore 文件路径
KEYSTORE_PATH="$HOME/my-release-key.jks"
# keystore 别名
KEY_ALIAS="my-key-alias"
# keystore 密码
STORE_PASSWORD="1234567890"
KEY_PASSWORD="1234567890"

# Flutter 项目根目录（如果脚本在项目根目录可以不用改）
PROJECT_DIR=$(pwd)

# -------------------------------
# 生成 key.properties 文件
# -------------------------------
echo "生成 key.properties ..."
cat > "$PROJECT_DIR/android/key.properties" <<EOL
storePassword=$STORE_PASSWORD
keyPassword=$KEY_PASSWORD
keyAlias=$KEY_ALIAS
storeFile=$KEYSTORE_PATH
EOL

# -------------------------------
# 清理旧的构建文件
# -------------------------------
echo "清理旧的构建 ..."
flutter clean

# -------------------------------
# 获取依赖
# -------------------------------
echo "获取依赖 ..."
flutter pub get

# -------------------------------
# 构建 release app bundle
# -------------------------------
echo "构建 release AAB ..."
flutter build appbundle --release

# -------------------------------
# 输出路径
# -------------------------------
AAB_PATH="$PROJECT_DIR/build/app/outputs/bundle/release/app-release.aab"
if [ -f "$AAB_PATH" ]; then
    echo "✅ 构建成功！AAB 文件路径："
    echo "$AAB_PATH"
else
    echo "❌ 构建失败，请检查日志"
    exit 1
fi
