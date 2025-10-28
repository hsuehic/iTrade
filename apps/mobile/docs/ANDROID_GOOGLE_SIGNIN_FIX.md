# Android Google Sign-In 修复指南

## 🔍 问题诊断

Android 上 Google 登录失败，但 iOS 上成功。经过检查，发现以下配置问题：

1. ❌ **缺少 `google-services.json` 文件**
2. ❌ **未应用 Google Services Gradle 插件**
3. ⚠️ **可能缺少 SHA-1 指纹配置**（在 Firebase Console）

## ✅ 修复步骤

### 步骤 1：下载并添加 `google-services.json`

#### 1.1 从 Firebase Console 下载

1. 打开 [Firebase Console](https://console.firebase.google.com/)
2. 选择你的项目
3. 点击左侧 **Project Settings**（项目设置）
4. 滚动到 **Your apps**（你的应用）部分
5. 找到 Android 应用（包名：`com.ihsueh.itrade`）
   - 如果没有，点击 **Add app** → **Android** 创建一个
   - 包名必须是：`com.ihsueh.itrade`
6. 点击 **Download google-services.json**

#### 1.2 放置文件

将下载的 `google-services.json` 文件放到：

```
apps/mobile/android/app/google-services.json
```

**重要**：文件必须放在 `android/app/` 目录下，不是 `android/` 根目录！

---

### 步骤 2：配置 SHA-1 指纹（关键！）

Google Sign-In 在 Android 上需要 SHA-1 指纹才能工作。

#### 2.1 生成 SHA-1 指纹

**Debug 版本**（开发调试用）：

```bash
cd apps/mobile/android

# macOS/Linux
./gradlew signingReport

# Windows
gradlew.bat signingReport
```

**Release 版本**（生产发布用）：

如果你有 release keystore（`key.jks`），运行：

```bash
keytool -list -v -keystore android/upload-keystore.jks -alias upload
# 输入密码后会显示 SHA-1 指纹
```

#### 2.2 将 SHA-1 添加到 Firebase

1. 复制 SHA-1 指纹（格式：`AA:BB:CC:DD:...`）
2. 回到 Firebase Console
3. **Project Settings** → 你的 Android 应用
4. 点击 **Add fingerprint**
5. 粘贴 SHA-1 指纹
6. 点击 **Save**

**注意**：你需要添加两个 SHA-1（Debug 和 Release）：
- Debug SHA-1：用于开发调试
- Release SHA-1：用于正式发布

#### 2.3 重新下载 `google-services.json`

添加 SHA-1 后，**必须重新下载** `google-services.json` 并替换旧文件！

---

### 步骤 3：修改 Gradle 配置

#### 3.1 修改根目录 `build.gradle.kts`

编辑 `apps/mobile/android/build.gradle.kts`：

```kotlin
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        // 添加 Google Services 插件
        classpath("com.google.gms:google-services:4.4.2")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
```

#### 3.2 修改 app 级别 `build.gradle.kts`

编辑 `apps/mobile/android/app/build.gradle.kts`，在文件**末尾**添加：

```kotlin
// ... 现有代码 ...

flutter {
    source = "../.."
}

// 添加这一行到文件末尾
apply(plugin = "com.google.gms.google-services")
```

完整的修改后的文件应该是：

```kotlin
import java.util.Properties
import java.io.FileInputStream

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.ihsueh.itrade"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    defaultConfig {
        applicationId = "com.ihsueh.itrade"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["supportsTablet"] = false
    }
    
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.10")
}

flutter {
    source = "../.."
}

// 🔥 添加 Google Services 插件（必须在文件末尾）
apply(plugin = "com.google.gms.google-services")
```

---

### 步骤 4：验证配置

#### 4.1 清理并重新构建

```bash
cd apps/mobile

# 清理构建缓存
flutter clean

# 重新获取依赖
flutter pub get

# 重新构建 Android 应用
flutter build apk --debug
# 或
flutter run
```

#### 4.2 检查 Gradle 同步

在构建时，你应该看到：

```
> Task :app:processDebugGoogleServices
Parsing json file: .../android/app/google-services.json
```

如果看到这个，说明 `google-services.json` 被正确加载了。

#### 4.3 测试 Google 登录

运行应用并尝试 Google 登录：

```bash
flutter run --verbose
```

查看日志，应该看到：

```
✅ Google idToken length: '1234'
✅ Signed in with Google successfully!
```

---

## 🔧 常见问题排查

### 问题 1：`google-services.json` 解析失败

**错误信息**：
```
File google-services.json is missing
```

**解决方法**：
- 确认文件在 `android/app/google-services.json`（不是 `android/google-services.json`）
- 确认文件内容是有效的 JSON
- 重新从 Firebase Console 下载

---

### 问题 2：SHA-1 指纹不匹配

**错误信息**：
```
Google Sign-In failed
PlatformException(sign_in_failed, ...)
```

**解决方法**：
1. 确认你添加了 **Debug SHA-1**（开发时）
2. 确认添加 SHA-1 后**重新下载了** `google-services.json`
3. 运行 `./gradlew signingReport` 确认 SHA-1
4. 在 Firebase Console 检查 SHA-1 是否正确

---

### 问题 3：API 未启用

**错误信息**：
```
API has not been used in project before
```

**解决方法**：
1. 打开 [Google Cloud Console](https://console.cloud.google.com/)
2. 选择你的项目
3. 搜索 "Google Sign-In API" 或 "Android Device Verification API"
4. 点击 **Enable**

---

### 问题 4：OAuth Client ID 配置错误

**检查**：

在 `lib/services/config.dart` 中：

```dart
const String kGoogleAndroidClientId =
    '1007531825407-h73i370sq1r55ipertfircir7n2svqtq.apps.googleusercontent.com';
```

这个 Client ID 应该与 Firebase Console 中的 **Android OAuth Client ID** 一致。

**验证方法**：
1. Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration
2. 找到 **Web client ID**
3. 确保 `kGoogleWebClientId` 与之匹配

---

## 📱 iOS vs Android 配置对比

| 配置项 | iOS | Android |
|--------|-----|---------|
| OAuth Client ID | ✅ 已配置 | ✅ 已配置 |
| 平台配置文件 | `GoogleService-Info.plist` | `google-services.json` ❌ |
| Gradle 插件 | N/A | Google Services Plugin ❌ |
| SHA-1 指纹 | N/A | 必需 ⚠️ |
| Bundle/Package ID | ✅ 正确 | ✅ `com.ihsueh.itrade` |

---

## ✅ 修复清单

完成以下所有步骤后，Google Sign-In 应该可以在 Android 上正常工作：

- [ ] 下载 `google-services.json` 并放到 `android/app/` 目录
- [ ] 生成 Debug 和 Release SHA-1 指纹
- [ ] 在 Firebase Console 添加 SHA-1 指纹
- [ ] 重新下载 `google-services.json`（添加 SHA-1 后）
- [ ] 修改 `android/build.gradle.kts` 添加 Google Services classpath
- [ ] 修改 `android/app/build.gradle.kts` 应用插件
- [ ] 运行 `flutter clean` 和 `flutter pub get`
- [ ] 重新构建并测试 Google 登录

---

## 🎯 快速验证脚本

创建一个测试脚本 `test_google_signin_android.sh`：

```bash
#!/bin/bash

echo "🔍 检查 Android Google Sign-In 配置..."

# 检查 google-services.json
if [ -f "android/app/google-services.json" ]; then
    echo "✅ google-services.json 存在"
else
    echo "❌ google-services.json 缺失"
    echo "   请从 Firebase Console 下载并放到 android/app/"
fi

# 检查 Gradle 配置
if grep -q "com.google.gms.google-services" android/app/build.gradle.kts; then
    echo "✅ Google Services 插件已应用"
else
    echo "❌ Google Services 插件未应用"
    echo "   请在 android/app/build.gradle.kts 末尾添加:"
    echo "   apply(plugin = \"com.google.gms.google-services\")"
fi

# 生成 SHA-1
echo ""
echo "📝 生成 SHA-1 指纹..."
cd android && ./gradlew signingReport | grep SHA1

echo ""
echo "📋 请将上面的 SHA-1 添加到 Firebase Console"
```

运行：

```bash
chmod +x test_google_signin_android.sh
./test_google_signin_android.sh
```

---

## 📞 需要帮助？

如果按照以上步骤操作后仍然无法登录，请提供以下信息：

1. **完整错误日志**（运行 `flutter run --verbose`）
2. **Firebase Console 截图**（显示 SHA-1 配置）
3. **`google-services.json` 是否存在**（`ls -la android/app/google-services.json`）
4. **Gradle 构建日志**（是否显示 "Parsing json file"）

---

Author: xiaoweihsueh@gmail.com  
Date: October 28, 2025

