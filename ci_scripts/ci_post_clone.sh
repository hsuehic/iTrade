# ci_scripts/ci_post_clone.sh
#!/bin/sh
set -e

echo "🚀 Installing Flutter and dependencies"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_APP_DIR="$REPO_ROOT/apps/mobile"
IOS_DIR="$MOBILE_APP_DIR/ios"
RUBY_VERSION_FILE="$IOS_DIR/.ruby-version"

# 安装 Flutter（只 clone 一次）
if [ ! -d "$HOME/flutter" ]; then
    git clone https://github.com/flutter/flutter.git --depth 1 -b stable "$HOME/flutter"
fi
export PATH="$HOME/flutter/bin:$PATH"

flutter --version
flutter precache --ios

cd "$MOBILE_APP_DIR"
flutter pub get

cd "$IOS_DIR"

if [ -f "$RUBY_VERSION_FILE" ]; then
    REQUIRED_RUBY_VERSION="$(tr -d ' \n\r' < "$RUBY_VERSION_FILE")"
    CURRENT_RUBY_VERSION="$(ruby -e 'print RUBY_VERSION')"
    if [ "$CURRENT_RUBY_VERSION" != "$REQUIRED_RUBY_VERSION" ]; then
        echo "❌ Ruby $CURRENT_RUBY_VERSION found, but $REQUIRED_RUBY_VERSION required."
        echo "Please configure Xcode Cloud to use Ruby $REQUIRED_RUBY_VERSION."
        exit 1
    fi
fi

if ! command -v bundle >/dev/null 2>&1; then
    echo "📦 Installing Bundler (user install)"
    gem install bundler --user-install
    export PATH="$HOME/.gem/ruby/$(ruby -e 'print RUBY_VERSION')/bin:$PATH"
fi

bundle config set path "$IOS_DIR/vendor/bundle"
bundle check || bundle install --jobs 4 --retry 3
bundle exec pod install