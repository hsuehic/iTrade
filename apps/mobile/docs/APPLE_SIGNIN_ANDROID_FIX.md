# Android Apple OAuth 登录修复

## 问题描述

在 Android 上使用 Apple Sign-In 时，出现错误：

```
Better Auth: State not found undefined
```

## 根本原因

1. **iOS** - 使用原生的 Apple Sign-In API，直接在应用内完成认证
2. **Android** - 使用 web-based OAuth flow，在浏览器中完成认证

之前的配置将 Android 的 OAuth 回调 URL 设置为：
```
https://itrade.ihsueh.com/api/auth/callback/apple
```

这导致了问题：
- 认证从 **移动应用** 发起
- OAuth 回调在 **浏览器** 中完成
- Better Auth 无法找到原始请求的 state 参数（因为 state 存储在移动应用中，而不是浏览器会话中）

## 解决方案

### 1. 修改移动端代码

修改 `auth_service.dart` 中的 `signInWithApple()` 方法：

```dart
webAuthenticationOptions: Platform.isAndroid
    ? WebAuthenticationOptions(
        clientId: 'com.ihsueh.itrade.web',
        redirectUri: Uri.parse(
          'https://itrade.ihsueh.com/callbacks/sign_in_with_apple',
        ),
      )
    : null, // iOS使用原生API，不需要此参数
```

**关键点：**
- ✅ Android 使用新的回调端点处理 OAuth 重定向
- ✅ iOS 传入 `null`，明确表示使用原生 API（虽然会被自动忽略）
- ✅ 平台检测让代码意图更清晰

### 2. 创建服务端回调端点

创建 `apps/web/app/callbacks/sign_in_with_apple/route.ts`：

```typescript
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  
  // 提取 Apple OAuth 回调参数
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const idToken = searchParams.get('id_token');
  const user = searchParams.get('user');
  
  // 构建 deep link 重定向回移动应用
  const deepLinkUrl = new URL('signinwithapple://callback');
  
  if (code) deepLinkUrl.searchParams.set('code', code);
  if (state) deepLinkUrl.searchParams.set('state', state);
  if (idToken) deepLinkUrl.searchParams.set('id_token', idToken);
  if (user) deepLinkUrl.searchParams.set('user', user);
  
  // 重定向回移动应用
  return Response.redirect(deepLinkUrl.toString(), 302);
}
```

**工作原理：**
1. Apple OAuth 完成后回调到这个端点
2. 端点提取所有 OAuth 参数
3. 使用 `signinwithapple://callback` deep link 重定向回应用
4. `sign_in_with_apple` 包拦截 deep link 并完成认证流程

### 3. AndroidManifest.xml 配置（已存在）

AndroidManifest.xml 中已经配置了 deep link 处理：

```xml
<activity
    android:name="com.aboutyou.dart_packages.sign_in_with_apple.SignInWithAppleCallback"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />

        <data android:scheme="signinwithapple" />
        <data android:path="callback" />
    </intent-filter>
</activity>
```

## 认证流程对比

### iOS（未改变，使用原生API）

```
用户点击 Sign in with Apple
    ↓
调用原生 iOS API (AuthenticationServices.framework)
    ↓
显示原生 Apple 认证界面
    ↓
直接返回 identityToken 和 authorizationCode
    ↓
发送到后端 /api/mobile/sign-in/social
    ↓
✅ 登录成功
```

### Android（已修复）

```
用户点击 Sign in with Apple
    ↓
在浏览器中打开 Apple OAuth
    ↓
用户完成 Apple 认证
    ↓
回调到 https://itrade.ihsueh.com/callbacks/sign_in_with_apple
    ↓
服务端重定向到 signinwithapple://callback (deep link)
    ↓
应用拦截 deep link 并获取认证凭证
    ↓
发送到后端 /api/mobile/sign-in/social
    ↓
✅ 登录成功
```

## 平台兼容性

| 平台 | 认证方式 | webAuthenticationOptions | 影响 |
|------|----------|--------------------------|------|
| **iOS** | 原生 API | `null`（被忽略） | ✅ 无影响 |
| **Android** | Web OAuth | 必需 | ✅ 已修复 |
| **Web** | Web OAuth | 需要（如果支持） | ⚠️ 未测试 |

## 测试验证

### Android 测试
1. 打开应用登录页面
2. 点击 "Sign in with Apple" 按钮
3. 在浏览器中完成 Apple 认证
4. 验证成功重定向回应用
5. 验证登录成功并显示用户信息

### iOS 测试
1. 打开应用登录页面
2. 点击 "Sign in with Apple" 按钮
3. 在原生界面完成 Apple 认证（Face ID/Touch ID）
4. 验证登录成功并显示用户信息

## Apple Developer 配置要求

确保在 Apple Developer 账户中配置：

1. **Service ID**: `com.ihsueh.itrade.web`
2. **Return URLs** 包含:
   - `https://itrade.ihsueh.com/callbacks/sign_in_with_apple`
   - `https://itrade.ihsueh.com/api/auth/callback/apple` (如果 web 端使用)

## 相关文件

- `/apps/mobile/lib/services/auth_service.dart` - 移动端认证服务
- `/apps/web/app/callbacks/sign_in_with_apple/route.ts` - OAuth 回调端点
- `/apps/mobile/android/app/src/main/AndroidManifest.xml` - Android deep link 配置
- `/apps/web/lib/auth.ts` - Better Auth 配置

## 参考资料

- [sign_in_with_apple 包文档](https://pub.dev/packages/sign_in_with_apple)
- [Apple Sign-In REST API](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api)
- [Better Auth 社交登录](https://www.better-auth.com/docs/authentication/social)

---

Author: xiaoweihsueh@gmail.com  
Date: October 29, 2025

