# ci_scripts/ci_post_clone.sh
#!/bin/sh
set -e

echo "🚀 Installing Flutter and dependencies"

# 安装 Flutter（只 clone 一次）
if [ ! -d "$HOME/flutter" ]; then
    git clone https://github.com/flutter/flutter.git --depth 1 -b stable $HOME/flutter
fi
export PATH="$HOME/flutter/bin:$PATH"

flutter --version
flutter pub get