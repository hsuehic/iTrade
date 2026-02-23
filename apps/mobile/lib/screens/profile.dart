import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' as firebase_auth;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/copy_service.dart';
import '../services/dynamic_config_service.dart';
import '../services/notification.dart';
import '../services/preference.dart';
import '../services/theme_service.dart';
import '../widgets/app_switch.dart';
import '../widgets/copy_text.dart';
import '../widgets/responsive_layout_builder.dart';
import 'change_password.dart';
import 'delete_account.dart';
import 'edit_profile.dart';
import 'email_preferences.dart';
import 'push_notification_history.dart';
import 'satistics.dart';
import '../widgets/user_avatar.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _signingOut = false;
  bool _notificationsEnabled = true;
  bool _enableFaceId = true;
  ThemeMode _themeMode = ThemeMode.system;
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;
  bool _categoryGeneral = true;
  bool _categoryMarketing = false;
  bool _categoryTrading = true;
  bool _categorySecurity = true;
  bool _categorySystem = true;
  final AuthService _authService = AuthService.instance;
  String _appVersionLabel = 'iTrade';
  String _appVersionDetail = '';

  Future<void> _loadSetting() async {
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    final biometricEnabled = await Preference.getBiometricEnabled();
    final cGeneral = await Preference.getPushCategoryEnabled('general');
    final cMarketing = await Preference.getPushCategoryEnabled('marketing');
    final cTrading = await Preference.getPushCategoryEnabled('trading');
    final cSecurity = await Preference.getPushCategoryEnabled('security');
    final cSystem = await Preference.getPushCategoryEnabled('system');
    setState(() {
      _notificationsEnabled = notificationsEnabled ?? false;
      _enableFaceId = biometricEnabled ?? false;
      _themeMode = ThemeService.instance.themeMode;
      _categoryGeneral = cGeneral;
      _categoryMarketing = cMarketing;
      _categoryTrading = cTrading;
      _categorySecurity = cSecurity;
      _categorySystem = cSystem;
    });
  }

  Future<void> _loadAppInfo() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() {
        _appVersionLabel = info.version.trim().isEmpty
            ? 'iTrade'
            : 'iTrade v${info.version}';
        _appVersionDetail = info.buildNumber.trim().isEmpty
            ? info.version
            : '${info.version} (${info.buildNumber})';
      });
    } catch (err) {
      // Keep defaults if package info is unavailable.
    }
  }

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    try {
      // Best effort: inform server to clear session if endpoint exists
      try {
        await AuthService.instance.signOut();
        await ApiClient.instance.clearCookies();
        await Preference.remove(Preference.keySavedEmail);
        await Preference.remove(Preference.keySavedPassword);
      } catch (err) {
        // Ignore logout errors; proceed to clear local session
      }
      if (!mounted) return;
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _loadSetting();
    unawaited(DynamicConfigService.instance.refresh(force: true));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAppInfo();
    });
  }

  @override
  Widget build(BuildContext context) {
    final copy = CopyService.instance;
    final user = _authService.user;
    if (user == null) {
      if (!_signingOut) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            Navigator.of(
              context,
            ).pushNamedAndRemoveUntil('/login', (route) => false);
          }
        });
      }
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final image = user.image;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return AnimatedBuilder(
      animation: copy,
      builder: (context, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(copy.t('profile_title')),
            centerTitle: true,
            elevation: 0,
            surfaceTintColor: Colors.transparent,
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          ),
          body: ResponsiveLayoutBuilder(
            phone: (context) => _buildPhoneLayout(user, image, isDark),
            tablet: (context) => _buildTabletLayout(user, image, isDark),
          ),
        );
      },
    );
  }

  Widget _buildPhoneLayout(User user, String? image, bool isDark) {
    return ListView(
      padding: EdgeInsets.all(16.w),
      children: [
        // User Profile Card
        _buildUserCard(user, image, isDark),
        const SizedBox(height: 24),

        // Account Settings
        _buildSectionHeader('screen.profile.section.account', 'Account'),
        const SizedBox(height: 8),
        _buildSettingsGroup(
          isDark: isDark,
          children: [
            _buildSettingTile(
              icon: Icons.person_outline,
              titleKey: 'screen.profile.edit_profile',
              titleFallback: 'Edit profile',
              subtitleKey: 'screen.profile.edit_profile_subtitle',
              subtitleFallback: 'Update your personal information',
              trailing: Icons.chevron_right,
              onTap: () async {
                final updated = await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const EditProfileScreen(),
                  ),
                );
                if (updated == true && mounted) {
                  setState(() {}); // rebuild with latest info
                }
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.key_outlined,
              titleKey: 'screen.profile.change_password',
              titleFallback: 'Change password',
              subtitleKey: 'screen.profile.change_password_subtitle',
              subtitleFallback: 'Update your password',
              trailing: Icons.chevron_right,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const ChangePasswordScreen(),
                  ),
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.email_outlined,
              titleKey: 'screen.profile.email_preferences',
              titleFallback: 'Email preferences',
              subtitleKey: 'screen.profile.email_preferences_subtitle',
              subtitleFallback: 'Manage email notifications',
              trailing: Icons.chevron_right,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const EmailPreferencesScreen(),
                  ),
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.account_balance_wallet_outlined,
              titleKey: 'screen.profile.exchange_accounts',
              titleFallback: 'Exchange accounts',
              subtitleKey: 'screen.profile.exchange_accounts_subtitle',
              subtitleFallback: 'Manage your trading accounts',
              trailing: Icons.chevron_right,
              onTap: () {
                Navigator.pushNamed(context, '/exchange-accounts');
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.delete_forever,
              titleKey: 'screen.profile.delete_account',
              titleFallback: 'Delete account',
              subtitleKey: 'screen.profile.delete_account_subtitle',
              subtitleFallback: 'Delete your account and all data',
              trailing: Icons.chevron_right,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => DeleteAccountScreen(
                      userEmail: user.email,
                      onConfirm: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final result = await AuthService.instance
                            .deleteAccount();
                        if (result != null && result.success) {
                          messenger.showSnackBar(
                            SnackBar(
                              content: CopyText('screen.profile.delete_account_success_it_s_ou', fallback: "Account deleted. It was an honor to serve you. Hope to see you again.", ),
                              backgroundColor: Theme.of(
                                context,
                              ).colorScheme.primary,

                              duration: const Duration(seconds: 3),
                              behavior: SnackBarBehavior.floating,
                              margin: EdgeInsets.only(
                                bottom: 28, // ✅ Fixed vertical
                                left: 16.w, // ✅ Width-adapted
                                right: 16.w, // ✅ Width-adapted
                              ),
                            ),
                          );
                          if (!mounted) return;
                          Navigator.of(
                            context,
                          ).pushNamedAndRemoveUntil('/login', (route) => false);
                        } else {
                          if (result != null && result.message != null) {
                            messenger.showSnackBar(
                              SnackBar(
                                content: CopyText(
                                  'screen.profile.delete_account_failed_with_reason',
                                  params: {'error': result.message ?? ''},
                                  fallback: 'Delete account failed: {{error}}',
                                ),
                                backgroundColor: Colors.red,
                                duration: const Duration(seconds: 3),
                              ),
                            );
                          } else {
                            messenger.showSnackBar(
                              SnackBar(
                                content: CopyText('screen.profile.delete_account_failed', fallback: "Account deletion failed."),
                                backgroundColor: Colors.red,
                                duration: const Duration(seconds: 3),
                              ),
                            );
                          }
                        }
                      },
                    ),
                  ),
                );
              },
              isDark: isDark,
            ),
          ],
        ),
        const SizedBox(height: 24),

        // App Settings
        _buildSectionHeader('settings_app', 'App settings'),
        const SizedBox(height: 8),
        _buildSettingsGroup(
          isDark: isDark,
          children: [
            _buildThemeSettingTile(context, isDark),
            _buildDivider(isDark),
            _buildLanguageSettingTile(context, isDark),
            _buildDivider(isDark),
            _buildCopyAdminLoginTile(isDark),
            _buildDivider(isDark),
            _buildCopyKeyToggleTile(isDark),
            _buildDivider(isDark),
            _buildThemeAdminLoginTile(isDark),
            _buildDivider(isDark),
            _buildThemeEditorTile(isDark),
            _buildDivider(isDark),
            _buildSwitchTile(
              icon: Icons.notifications_outlined,
              titleKey: 'screen.profile.push_notifications',
              titleFallback: 'Push notifications',
              subtitleKey: 'screen.profile.push_notifications_subtitle',
              subtitleFallback: 'Receive alerts and updates',
              value: _notificationsEnabled,
              onChanged: (v) {
                setState(() => _notificationsEnabled = v);
                Preference.setNotificationsEnabled(v);
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSectionHeader(
              'screen.profile.section.push_categories',
              'Push categories',
            ),
            const SizedBox(height: 8),
            _buildSwitchTile(
              icon: Icons.notifications_active_outlined,
              titleKey: 'screen.profile.push_categories.general',
              titleFallback: 'General',
              subtitleKey: 'screen.profile.push_categories.general_subtitle',
              subtitleFallback: 'General updates',
              value: _categoryGeneral,
              onChanged: (v) async {
                setState(() => _categoryGeneral = v);
                await NotificationService.instance.setCategoryEnabled(
                  'general',
                  v,
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSwitchTile(
              icon: Icons.campaign_outlined,
              titleKey: 'screen.profile.push_categories.marketing',
              titleFallback: 'Marketing',
              subtitleKey: 'screen.profile.push_categories.marketing_subtitle',
              subtitleFallback: 'Promotions and announcements',
              value: _categoryMarketing,
              onChanged: (v) async {
                setState(() => _categoryMarketing = v);
                await NotificationService.instance.setCategoryEnabled(
                  'marketing',
                  v,
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSwitchTile(
              icon: Icons.show_chart,
              titleKey: 'screen.profile.push_categories.trading',
              titleFallback: 'Trading',
              subtitleKey: 'screen.profile.push_categories.trading_subtitle',
              subtitleFallback: 'Trading alerts and signals',
              value: _categoryTrading,
              onChanged: (v) async {
                setState(() => _categoryTrading = v);
                await NotificationService.instance.setCategoryEnabled(
                  'trading',
                  v,
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSwitchTile(
              icon: Icons.security,
              titleKey: 'screen.profile.push_categories.security',
              titleFallback: 'Security',
              subtitleKey: 'screen.profile.push_categories.security_subtitle',
              subtitleFallback: 'Login and security alerts',
              value: _categorySecurity,
              onChanged: (v) async {
                setState(() => _categorySecurity = v);
                await NotificationService.instance.setCategoryEnabled(
                  'security',
                  v,
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSwitchTile(
              icon: Icons.settings,
              titleKey: 'screen.profile.push_categories.system',
              titleFallback: 'System',
              subtitleKey: 'screen.profile.push_categories.system_subtitle',
              subtitleFallback: 'System notices',
              value: _categorySystem,
              onChanged: (v) async {
                setState(() => _categorySystem = v);
                await NotificationService.instance.setCategoryEnabled(
                  'system',
                  v,
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.history,
              titleKey: 'screen.profile.push_history',
              titleFallback: 'Push history',
              subtitleKey: 'screen.profile.push_history_subtitle',
              subtitleFallback: 'View recent push messages',
              trailing: Icons.chevron_right,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const PushNotificationHistoryScreen(),
                  ),
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSwitchTile(
              icon: Icons.volume_up_outlined,
              titleKey: 'screen.profile.sound',
              titleFallback: 'Sound',
              subtitleKey: 'screen.profile.sound_subtitle',
              subtitleFallback: 'Enable sound effects',
              value: _soundEnabled,
              onChanged: (v) {
                setState(() => _soundEnabled = v);
                // TODO: Save preference
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSwitchTile(
              icon: Icons.vibration,
              titleKey: 'screen.profile.vibration',
              titleFallback: 'Vibration',
              subtitleKey: 'screen.profile.vibration_subtitle',
              subtitleFallback: 'Enable haptic feedback',
              value: _vibrationEnabled,
              onChanged: (v) {
                setState(() => _vibrationEnabled = v);
                // TODO: Save preference
              },
              isDark: isDark,
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Security Settings
        _buildSectionHeader('screen.profile.section.security', 'Security'),
        const SizedBox(height: 8),
        _buildSettingsGroup(
          isDark: isDark,
          children: [
            _buildSwitchTile(
              icon: Icons.fingerprint,
              titleKey: 'screen.profile.biometric_auth',
              titleFallback: 'Biometric authentication',
              subtitleKey: 'screen.profile.biometric_auth_subtitle',
              subtitleFallback: 'Use Face ID or Touch ID',
              value: _enableFaceId,
              onChanged: (v) {
                setState(() => _enableFaceId = v);
                Preference.setBiometricEnabled(v);
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.lock_outline,
              titleKey: 'screen.profile.privacy_settings',
              titleFallback: 'Privacy settings',
              subtitleKey: 'screen.profile.privacy_settings_subtitle',
              subtitleFallback: 'Manage your data and privacy',
              onTap: () {
                // TODO: Navigate to privacy settings
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.security,
              titleKey: 'screen.profile.two_factor_auth',
              titleFallback: 'Two-factor authentication',
              subtitleKey: 'screen.profile.two_factor_auth_subtitle',
              subtitleFallback: 'Add extra security to your account',
              onTap: () {
                // TODO: Navigate to 2FA setup
              },
              isDark: isDark,
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Trading Preferences
        _buildSectionHeader('screen.profile.section.trading', 'Trading'),
        const SizedBox(height: 8),
        _buildSettingsGroup(
          isDark: isDark,
          children: [
            _buildSettingTile(
              icon: Icons.analytics_outlined,
              titleKey: 'screen.profile.statistics',
              titleFallback: 'Statistics',
              subtitleKey: 'screen.profile.statistics_subtitle',
              subtitleFallback: 'View strategy statistics',
              trailing: Icons.chevron_right,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const StatisticsScreen(),
                  ),
                );
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.currency_bitcoin,
              titleKey: 'screen.profile.default_exchange',
              titleFallback: 'Default exchange',
              subtitleKey: 'screen.profile.default_exchange_value',
              subtitleFallback: 'OKX',
              trailing: Icons.chevron_right,
              onTap: () {
                // TODO: Navigate to exchange selection
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.attach_money,
              titleKey: 'screen.profile.default_currency',
              titleFallback: 'Default currency',
              subtitleKey: 'screen.profile.default_currency_value',
              subtitleFallback: 'USDT',
              trailing: Icons.chevron_right,
              onTap: () {
                // TODO: Navigate to currency selection
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.speed,
              titleKey: 'screen.profile.trading_mode',
              titleFallback: 'Trading mode',
              subtitleKey: 'screen.profile.trading_mode_value',
              subtitleFallback: 'Conservative',
              trailing: Icons.chevron_right,
              onTap: () {
                // TODO: Navigate to trading mode selection
              },
              isDark: isDark,
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Support & About
        _buildSectionHeader('screen.profile.section.support', 'Support'),
        const SizedBox(height: 8),
        _buildSettingsGroup(
          isDark: isDark,
          children: [
            _buildSettingTile(
              icon: Icons.help_outline,
              titleKey: 'screen.profile.help_center',
              titleFallback: 'Help center',
              subtitleKey: 'screen.profile.help_center_subtitle',
              subtitleFallback: 'Get help and support',
              onTap: () {
                // TODO: Navigate to help
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.bug_report_outlined,
              titleKey: 'screen.profile.report_problem',
              titleFallback: 'Report a problem',
              subtitleKey: 'screen.profile.report_problem_subtitle',
              subtitleFallback: 'Let us know about issues',
              onTap: () {
                // TODO: Navigate to bug report
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.star_outline,
              titleKey: 'screen.profile.rate_app',
              titleFallback: 'Rate app',
              subtitleKey: 'screen.profile.rate_app_subtitle',
              subtitleFallback: 'Share your feedback',
              onTap: () {
                // TODO: Open app store
              },
              isDark: isDark,
            ),
            _buildDivider(isDark),
            _buildSettingTile(
              icon: Icons.info_outline,
              titleKey: 'screen.profile.about',
              titleFallback: 'About',
              subtitleKey: 'screen.profile.about_subtitle',
              subtitleFallback: _appVersionLabel,
              onTap: () async {
                if (_appVersionDetail.isEmpty) {
                  await _loadAppInfo();
                }
                if (!context.mounted) return;
                showAboutDialog(
                  context: context,
                  applicationName: CopyService.instance.t(
                    'app_title',
                    fallback: 'iTrade',
                  ),
                  applicationVersion: _appVersionDetail,
                  applicationLegalese: CopyService.instance.t(
                    'screen.profile.about_legalese',
                    fallback: '© 2025 iTrade. All rights reserved.',
                  ),
                );
              },
              isDark: isDark,
            ),
          ],
        ),
        const SizedBox(height: 32),

        // Sign Out Button
        _buildSignOutButton(),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildTabletLayout(User user, String? image, bool isDark) {
    return ListView(
      padding: EdgeInsets.all(24.w),
      children: [
        // User Profile Card
        _buildUserCard(user, image, isDark),
        const SizedBox(height: 32),

        // Two-column layout for settings
        ResponsiveTwoColumn(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 24,
          left: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Account Settings
              _buildSectionHeader('screen.profile.section.account', 'Account'),
              const SizedBox(height: 8),
              _buildSettingsGroup(
                isDark: isDark,
                children: [
                  _buildSettingTile(
                    icon: Icons.person_outline,
                    titleKey: 'screen.profile.edit_profile',
                    titleFallback: 'Edit profile',
                    subtitleKey: 'screen.profile.edit_profile_subtitle',
                    subtitleFallback: 'Update your personal information',
                    trailing: Icons.chevron_right,
                    onTap: () async {
                      final updated = await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const EditProfileScreen(),
                        ),
                      );
                      if (updated == true && mounted) {
                        setState(() {});
                      }
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.key_outlined,
                    titleKey: 'screen.profile.change_password',
                    titleFallback: 'Change password',
                    subtitleKey: 'screen.profile.change_password_subtitle',
                    subtitleFallback: 'Update your password',
                    trailing: Icons.chevron_right,
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const ChangePasswordScreen(),
                        ),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.email_outlined,
                    titleKey: 'screen.profile.email_preferences',
                    titleFallback: 'Email preferences',
                    subtitleKey: 'screen.profile.email_preferences_subtitle',
                    subtitleFallback: 'Manage email notifications',
                    trailing: Icons.chevron_right,
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const EmailPreferencesScreen(),
                        ),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.account_balance_wallet_outlined,
                    titleKey: 'screen.profile.exchange_accounts',
                    titleFallback: 'Exchange accounts',
                    subtitleKey: 'screen.profile.exchange_accounts_subtitle',
                    subtitleFallback: 'Manage your trading accounts',
                    trailing: Icons.chevron_right,
                    onTap: () {
                      Navigator.pushNamed(context, '/exchange-accounts');
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.delete_forever,
                    titleKey: 'screen.profile.delete_account',
                    titleFallback: 'Delete account',
                    subtitleKey: 'screen.profile.delete_account_subtitle',
                    subtitleFallback: 'Delete your account and all data',
                    trailing: Icons.chevron_right,
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => DeleteAccountScreen(
                            userEmail: user.email,
                            onConfirm: () async {
                              final messenger = ScaffoldMessenger.of(context);
                              final result = await AuthService.instance
                                  .deleteAccount();
                              if (result != null && result.success) {
                                messenger.showSnackBar(
                                  SnackBar(
                                    content: CopyText('screen.profile.delete_account_success_it_s_ou', fallback: "Account deleted. It was an honor to serve you. Hope to see you again.", ),
                                    backgroundColor: Theme.of(
                                      context,
                                    ).colorScheme.primary,
                                    duration: const Duration(seconds: 3),
                                    behavior: SnackBarBehavior.floating,
                                    margin: EdgeInsets.only(
                                      bottom: 28,
                                      left: 16.w,
                                      right: 16.w,
                                    ),
                                  ),
                                );
                                if (!mounted) return;
                                Navigator.of(context).pushNamedAndRemoveUntil(
                                  '/login',
                                  (route) => false,
                                );
                              } else {
                                if (result != null && result.message != null) {
                                  messenger.showSnackBar(
                                    SnackBar(
                                      content: CopyText(
                                        'screen.profile.delete_account_failed_with_reason',
                                        params: {
                                          'error': result.message ?? '',
                                        },
                                        fallback:
                                            'Delete account failed: {{error}}',
                                      ),
                                      backgroundColor: Colors.red,
                                      duration: const Duration(seconds: 3),
                                    ),
                                  );
                                } else {
                                  messenger.showSnackBar(
                                    SnackBar(
                                      content: CopyText('screen.profile.delete_account_failed', fallback: "Account deletion failed.", ),
                                      backgroundColor: Colors.red,
                                      duration: const Duration(seconds: 3),
                                    ),
                                  );
                                }
                              }
                            },
                          ),
                        ),
                      );
                    },
                    isDark: isDark,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // App Settings
              _buildSectionHeader('settings_app', 'App settings'),
              const SizedBox(height: 8),
              _buildSettingsGroup(
                isDark: isDark,
                children: [
                  _buildThemeSettingTile(context, isDark),
                  _buildDivider(isDark),
                  _buildLanguageSettingTile(context, isDark),
                  _buildDivider(isDark),
                  _buildCopyAdminLoginTile(isDark),
                  _buildDivider(isDark),
                  _buildCopyKeyToggleTile(isDark),
                  _buildDivider(isDark),
                  _buildThemeAdminLoginTile(isDark),
                  _buildDivider(isDark),
                  _buildThemeEditorTile(isDark),
                  _buildDivider(isDark),
                  _buildSwitchTile(
                    icon: Icons.notifications_outlined,
                    titleKey: 'screen.profile.push_notifications',
                    titleFallback: 'Push notifications',
                    subtitleKey: 'screen.profile.push_notifications_subtitle',
                    subtitleFallback: 'Receive alerts and updates',
                    value: _notificationsEnabled,
                    onChanged: (v) {
                      setState(() => _notificationsEnabled = v);
                      Preference.setNotificationsEnabled(v);
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSwitchTile(
                    icon: Icons.volume_up_outlined,
                    titleKey: 'screen.profile.sound',
                    titleFallback: 'Sound',
                    subtitleKey: 'screen.profile.sound_subtitle',
                    subtitleFallback: 'Enable sound effects',
                    value: _soundEnabled,
                    onChanged: (v) {
                      setState(() => _soundEnabled = v);
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSwitchTile(
                    icon: Icons.vibration,
                    titleKey: 'screen.profile.vibration',
                    titleFallback: 'Vibration',
                    subtitleKey: 'screen.profile.vibration_subtitle',
                    subtitleFallback: 'Enable haptic feedback',
                    value: _vibrationEnabled,
                    onChanged: (v) {
                      setState(() => _vibrationEnabled = v);
                    },
                    isDark: isDark,
                  ),
                ],
              ),
            ],
          ),
          right: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Security Settings
              _buildSectionHeader('screen.profile.section.security', 'Security'),
              const SizedBox(height: 8),
              _buildSettingsGroup(
                isDark: isDark,
                children: [
                  _buildSwitchTile(
                    icon: Icons.fingerprint,
                    titleKey: 'screen.profile.biometric_auth',
                    titleFallback: 'Biometric authentication',
                    subtitleKey: 'screen.profile.biometric_auth_subtitle',
                    subtitleFallback: 'Use Face ID or Touch ID',
                    value: _enableFaceId,
                    onChanged: (v) {
                      setState(() => _enableFaceId = v);
                      Preference.setBiometricEnabled(v);
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.lock_outline,
                    titleKey: 'screen.profile.privacy_settings',
                    titleFallback: 'Privacy settings',
                    subtitleKey: 'screen.profile.privacy_settings_subtitle',
                    subtitleFallback: 'Manage your data and privacy',
                    onTap: () {},
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.security,
                    titleKey: 'screen.profile.two_factor_auth',
                    titleFallback: 'Two-factor authentication',
                    subtitleKey: 'screen.profile.two_factor_auth_subtitle',
                    subtitleFallback: 'Add extra security to your account',
                    onTap: () {},
                    isDark: isDark,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Trading Preferences
              _buildSectionHeader('screen.profile.section.trading', 'Trading'),
              const SizedBox(height: 8),
              _buildSettingsGroup(
                isDark: isDark,
                children: [
                  _buildSettingTile(
                    icon: Icons.analytics_outlined,
                    titleKey: 'screen.profile.statistics',
                    titleFallback: 'Statistics',
                    subtitleKey: 'screen.profile.statistics_subtitle',
                    subtitleFallback: 'View strategy statistics',
                    trailing: Icons.chevron_right,
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const StatisticsScreen(),
                        ),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.currency_bitcoin,
                    titleKey: 'screen.profile.default_exchange',
                    titleFallback: 'Default exchange',
                    subtitleKey: 'screen.profile.default_exchange_value',
                    subtitleFallback: 'OKX',
                    trailing: Icons.chevron_right,
                    onTap: () {},
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.attach_money,
                    titleKey: 'screen.profile.default_currency',
                    titleFallback: 'Default currency',
                    subtitleKey: 'screen.profile.default_currency_value',
                    subtitleFallback: 'USDT',
                    trailing: Icons.chevron_right,
                    onTap: () {},
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.speed,
                    titleKey: 'screen.profile.trading_mode',
                    titleFallback: 'Trading mode',
                    subtitleKey: 'screen.profile.trading_mode_value',
                    subtitleFallback: 'Conservative',
                    trailing: Icons.chevron_right,
                    onTap: () {},
                    isDark: isDark,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Support & About
              _buildSectionHeader('screen.profile.section.support', 'Support'),
              const SizedBox(height: 8),
              _buildSettingsGroup(
                isDark: isDark,
                children: [
                  _buildSettingTile(
                    icon: Icons.help_outline,
                    titleKey: 'screen.profile.help_center',
                    titleFallback: 'Help center',
                    subtitleKey: 'screen.profile.help_center_subtitle',
                    subtitleFallback: 'Get help and support',
                    onTap: () {},
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.bug_report_outlined,
                    titleKey: 'screen.profile.report_problem',
                    titleFallback: 'Report a problem',
                    subtitleKey: 'screen.profile.report_problem_subtitle',
                    subtitleFallback: 'Let us know about issues',
                    onTap: () {},
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.star_outline,
                    titleKey: 'screen.profile.rate_app',
                    titleFallback: 'Rate app',
                    subtitleKey: 'screen.profile.rate_app_subtitle',
                    subtitleFallback: 'Share your feedback',
                    onTap: () {},
                    isDark: isDark,
                  ),
                  _buildDivider(isDark),
                  _buildSettingTile(
                    icon: Icons.info_outline,
                    titleKey: 'screen.profile.about',
                    titleFallback: 'About',
                    subtitleKey: 'screen.profile.about_subtitle',
                    subtitleFallback: _appVersionLabel,
                    onTap: () async {
                      if (_appVersionDetail.isEmpty) {
                        await _loadAppInfo();
                      }
                      if (!context.mounted) return;
                      showAboutDialog(
                        context: context,
                        applicationName: CopyService.instance.t(
                          'app_title',
                          fallback: 'iTrade',
                        ),
                        applicationVersion: _appVersionDetail,
                        applicationLegalese: CopyService.instance.t(
                          'screen.profile.about_legalese',
                          fallback: '© 2025 iTrade. All rights reserved.',
                        ),
                      );
                    },
                    isDark: isDark,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),

        // Sign Out Button
        _buildSignOutButton(),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildUserCard(User user, String? image, bool isDark) {
    return Container(
      padding: EdgeInsets.all(20.w), // ✅ Width-adapted
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Theme.of(context).colorScheme.primary.withOpacity(0.8),
            Theme.of(context).colorScheme.primary,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16), // ✅ Uniform radius
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).colorScheme.primary.withOpacity(0.3),
            blurRadius: 15,
            spreadRadius: 2,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          // Avatar
          UserAvatar(
            radius: 40, // ✅ Fixed size for better visibility
            backgroundColor: Colors.white.withOpacity(0.3),
            icon: Icons.person,
            iconColor: Colors.white.withOpacity(0.9),
            iconSize: 48, // ✅ Fixed size
          ),
          SizedBox(width: 16.w), // ✅ Width-adapted
          // User info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontSize: 20.sp, // ✅ Adaptive font
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  user.email,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontSize: 14.sp, // ✅ Adaptive font
                    color: Colors.white.withOpacity(0.9),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String titleKey, String titleFallback) {
    return Padding(
      padding: EdgeInsets.only(left: 4.w), // ✅ Width-adapted
      child: CopyText(
        titleKey,
        fallback: titleFallback,
        style: TextStyle(
          fontSize: 13.sp, // ✅ Adaptive font
          fontWeight: FontWeight.w600,
          color: Colors.grey[600],
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildSettingsGroup({
    required bool isDark,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white.withOpacity(0.5),
        borderRadius: BorderRadius.circular(12), // ✅ Uniform radius
        border: Border.all(
          color: isDark ? Colors.grey[850]! : Colors.grey.withOpacity(0.08),
        ),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildThemeSettingTile(BuildContext context, bool isDark) {
    final copy = CopyService.instance;
    final subtitleKey = _themeModeLabelKey(_themeMode);
    final subtitleFallback = _themeModeLabelFallback(_themeMode, copy);
    return _buildSettingTile(
      icon: Icons.dark_mode_outlined,
      titleKey: 'settings_theme',
      titleFallback: 'Theme',
      subtitleKey: subtitleKey,
      subtitleFallback: subtitleFallback,
      trailing: Icons.chevron_right,
      onTap: () => _showThemeSheet(context),
      isDark: isDark,
    );
  }

  Widget _buildLanguageSettingTile(BuildContext context, bool isDark) {
    final copy = CopyService.instance;
    final localeTag = _resolveLocaleTag(
      copy.localeOverride,
      copy.locale,
    );
    final subtitleKey = _localeLabelKey(localeTag);
    final subtitleFallback = _localeLabelFallback(localeTag, copy);
    return _buildSettingTile(
      icon: Icons.language_outlined,
      titleKey: 'settings_language',
      titleFallback: 'Language',
      subtitleKey: subtitleKey,
      subtitleFallback: subtitleFallback,
      trailing: Icons.chevron_right,
      onTap: () => _showLanguageSheet(context),
      isDark: isDark,
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String titleKey,
    required String titleFallback,
    String? subtitleKey,
    String? subtitleFallback,
    IconData? trailing,
    VoidCallback? onTap,
    required bool isDark,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: 16.w,
          vertical: 12,
        ), // ✅ Width-adapted horizontal
        child: Row(
          children: [
            Container(
              width: 40.w, // ✅ Uniform scaling
              height: 40.w, // ✅ Uniform scaling
              decoration: BoxDecoration(
                color: isDark ? Colors.grey[800] : Colors.grey.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10), // ✅ Uniform radius
              ),
              child: Icon(
                icon,
                size: 20.w, // ✅ Uniform scaling
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            SizedBox(width: 12.w), // ✅ Width-adapted
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CopyText(
                    titleKey,
                    fallback: titleFallback,
                    style: TextStyle(
                      fontSize: 15.sp, // ✅ Adaptive font
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (subtitleKey != null) ...[
                    const SizedBox(height: 2),
                    CopyText(
                      subtitleKey,
                      fallback: subtitleFallback ?? '',
                      style: TextStyle(
                        fontSize: 13.sp,
                        color: Colors.grey[600],
                      ), // ✅ Adaptive font
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null)
              Icon(
                trailing,
                size: 20.w,
                color: Colors.grey[400],
              ), // ✅ Uniform scaling
          ],
        ),
      ),
    );
  }

  Widget _buildSwitchTile({
    required IconData icon,
    required String titleKey,
    required String titleFallback,
    String? subtitleKey,
    String? subtitleFallback,
    required bool value,
    required ValueChanged<bool> onChanged,
    required bool isDark,
  }) {
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: 16.w,
        vertical: 8,
      ), // ✅ Width-adapted horizontal
      child: Row(
        children: [
          Container(
            width: 40.w, // ✅ Uniform scaling
            height: 40.w, // ✅ Uniform scaling
            decoration: BoxDecoration(
              color: isDark ? Colors.grey[800] : Colors.grey.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10), // ✅ Uniform radius
            ),
            child: Icon(
              icon,
              size: 20.w,
              color: Theme.of(context).primaryColor,
            ), // ✅ Uniform scaling
          ),
          SizedBox(width: 12.w), // ✅ Width-adapted
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CopyText(
                  titleKey,
                  fallback: titleFallback,
                  style: TextStyle(
                    fontSize: 15.sp, // ✅ Adaptive font
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (subtitleKey != null) ...[
                  const SizedBox(height: 2),
                  CopyText(
                    subtitleKey,
                    fallback: subtitleFallback ?? '',
                    style: TextStyle(
                      fontSize: 13.sp,
                      color: Colors.grey[600],
                    ), // ✅ Adaptive font
                  ),
                ],
              ],
            ),
          ),
          AppSwitch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }

  Widget _buildActionTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required String actionLabel,
    required VoidCallback onAction,
    required bool isDark,
  }) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8.w),
      child: Row(
        children: [
          Container(
            width: 40.w,
            height: 40.w,
            decoration: BoxDecoration(
              color: isDark ? Colors.grey[800] : Colors.grey.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              icon,
              size: 20.w,
              color: Theme.of(context).primaryColor,
            ),
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (subtitle != null) ...[
                  SizedBox(height: 2.w),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 13.sp, color: Colors.grey[600]),
                  ),
                ],
              ],
            ),
          ),
          TextButton(onPressed: onAction, child: Text(actionLabel)),
        ],
      ),
    );
  }

  Widget _buildCopyAdminLoginTile(bool isDark) {
    final appEmail = AuthService.instance.user?.email;
    if (!DynamicConfigService.instance.isCopyAdmin(appEmail)) {
      return const SizedBox.shrink();
    }
    return StreamBuilder<firebase_auth.User?>(
      stream: firebase_auth.FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;
        final isLoggedIn = user != null;
        final resolvedEmail = user?.email;
        final configService = DynamicConfigService.instance;
        final isAdmin = configService.isCopyAdmin(resolvedEmail);
        final subtitle = isLoggedIn
            ? CopyService.instance.t(
                isAdmin
                    ? 'copy.admin.logged_in_as'
                    : 'copy.admin.logged_in_no_access',
                params: {'email': resolvedEmail ?? ''},
              )
            : CopyService.instance.t('copy.admin.login.subtitle');
        return _buildActionTile(
          icon: Icons.admin_panel_settings,
          title: CopyService.instance.t('copy.admin.login.title'),
          subtitle: subtitle,
          actionLabel: CopyService.instance.t(
            isLoggedIn ? 'common.logout' : 'common.login',
          ),
          onAction: () async {
            if (isLoggedIn) {
              await firebase_auth.FirebaseAuth.instance.signOut();
              return;
            }
            await _showCopyAdminLoginDialog(context);
          },
          isDark: isDark,
        );
      },
    );
  }

  Widget _buildCopyKeyToggleTile(bool isDark) {
    final authUser = firebase_auth.FirebaseAuth.instance.currentUser;
    if (authUser == null) {
      return const SizedBox.shrink();
    }
    final email = authUser.email ?? AuthService.instance.user?.email;
    if (!DynamicConfigService.instance.isCopyAdmin(email)) {
      return const SizedBox.shrink();
    }
    return AnimatedBuilder(
      animation: CopyService.instance,
      builder: (context, child) {
        return _buildSwitchTile(
          icon: Icons.copy,
          titleKey: 'settings.copy_key.title',
          titleFallback: CopyService.instance.t('settings.copy_key.title'),
          subtitleKey: 'settings.copy_key.subtitle',
          subtitleFallback: CopyService.instance.t('settings.copy_key.subtitle'),
          value: CopyService.instance.copyKeyLongPressEnabled,
          onChanged: (value) {
            CopyService.instance.setCopyKeyLongPressEnabled(value);
          },
          isDark: isDark,
        );
      },
    );
  }

  Widget _buildThemeAdminLoginTile(bool isDark) {
    final appEmail = AuthService.instance.user?.email;
    if (!DynamicConfigService.instance.isThemeAdmin(appEmail)) {
      return const SizedBox.shrink();
    }
    return StreamBuilder<firebase_auth.User?>(
      stream: firebase_auth.FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;
        final isLoggedIn = user != null;
        final resolvedEmail = user?.email;
        final configService = DynamicConfigService.instance;
        final isAdmin = configService.isThemeAdmin(resolvedEmail);
        final subtitle = isLoggedIn
            ? CopyService.instance.t(
                isAdmin
                    ? 'theme.admin.logged_in_as'
                    : 'theme.admin.logged_in_no_access',
                params: {'email': resolvedEmail ?? ''},
              )
            : CopyService.instance.t('theme.admin.login.subtitle');
        return _buildActionTile(
          icon: Icons.color_lens_outlined,
          title: CopyService.instance.t('theme.admin.login.title'),
          subtitle: subtitle,
          actionLabel: CopyService.instance.t(
            isLoggedIn ? 'common.logout' : 'common.login',
          ),
          onAction: () async {
            if (isLoggedIn) {
              await firebase_auth.FirebaseAuth.instance.signOut();
              return;
            }
            await _showThemeAdminLoginDialog(context);
          },
          isDark: isDark,
        );
      },
    );
  }

  Widget _buildThemeEditorTile(bool isDark) {
    final authUser = firebase_auth.FirebaseAuth.instance.currentUser;
    if (authUser == null) {
      return const SizedBox.shrink();
    }
    final email = authUser.email ?? AuthService.instance.user?.email;
    if (!DynamicConfigService.instance.isThemeAdmin(email)) {
      return const SizedBox.shrink();
    }
    return _buildSettingTile(
      icon: Icons.palette_outlined,
      titleKey: 'page.theme_editor',
      titleFallback: CopyService.instance.t('page.theme_editor'),
      subtitleKey: 'theme.admin.edit_entry',
      subtitleFallback: CopyService.instance.t('theme.admin.edit_entry'),
      onTap: () {
        Navigator.pushNamed(context, '/theme-editor');
      },
      isDark: isDark,
    );
  }

  Future<void> _showCopyAdminLoginDialog(BuildContext context) async {
    final emailController = TextEditingController(
      text: AuthService.instance.user?.email ?? '',
    );
    final passwordController = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const CopyText('copy.admin.login_dialog.title', fallback: "Copy editor login", ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  label: CopyText('copy.admin.login_dialog.email', fallback: "Email", ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: passwordController,
                obscureText: true,
                decoration: const InputDecoration(
                  label: CopyText('copy.admin.login_dialog.password', fallback: "Password", ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const CopyText('common.cancel', fallback: "Cancel"),
            ),
            TextButton(
              onPressed: () async {
                final email = emailController.text.trim();
                final password = passwordController.text.trim();
                if (email.isEmpty || password.isEmpty) return;
                try {
                  await firebase_auth.FirebaseAuth.instance
                      .signInWithEmailAndPassword(
                        email: email,
                        password: password,
                      );
                  if (!context.mounted) return;
                  Navigator.of(context).pop();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: CopyText('copy.admin.login_success', fallback: "Logged in", ),
                    ),
                  );
                } catch (_) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: CopyText('copy.admin.login_failed', fallback: "Login failed", ),
                    ),
                  );
                }
              },
              child: const CopyText('common.login', fallback: "Login"),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showThemeAdminLoginDialog(BuildContext context) async {
    final emailController = TextEditingController(
      text: AuthService.instance.user?.email ?? '',
    );
    final passwordController = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const CopyText('theme.admin.login_dialog.title', fallback: "Theme editor login", ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  label: CopyText('theme.admin.login_dialog.email', fallback: "Email", ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: passwordController,
                obscureText: true,
                decoration: const InputDecoration(
                  label: CopyText('theme.admin.login_dialog.password', fallback: "Password", ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const CopyText('common.cancel', fallback: "Cancel"),
            ),
            TextButton(
              onPressed: () async {
                final email = emailController.text.trim();
                final password = passwordController.text.trim();
                if (email.isEmpty || password.isEmpty) return;
                try {
                  await firebase_auth.FirebaseAuth.instance
                      .signInWithEmailAndPassword(
                        email: email,
                        password: password,
                      );
                  if (!context.mounted) return;
                  Navigator.of(context).pop();
                } on firebase_auth.FirebaseAuthException catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: CopyText(
                        'theme.admin.login_failed',
                        params: {
                          'error': e.message == null ? '' : ': ${e.message}',
                        },
                        fallback: 'Login failed{{error}}',
                      ),
                    ),
                  );
                } catch (_) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: CopyText('theme.admin.login_failed', fallback: "Login failed{{error}}", ),
                    ),
                  );
                }
              },
              child: const CopyText('common.login', fallback: "Login"),
            ),
          ],
        );
      },
    );
  }

  Widget _buildDivider(bool isDark) {
    return Divider(
      height: 1,
      thickness: 0.5,
      indent: 68,
      color: isDark ? Colors.grey[850] : Colors.grey.withOpacity(0.15),
    );
  }

  Widget _buildSignOutButton() {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 4.w), // ✅ Width-adapted
      child: SizedBox(
        height: 50,
        child: OutlinedButton.icon(
          onPressed: _signingOut ? null : _signOut,
          icon: _signingOut
              ? SizedBox(
                  width: 16.w, // ✅ Uniform scaling
                  height: 16.w, // ✅ Uniform scaling
                  child: const CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.logout),
          label: Text(
            _signingOut ? 'Signing out...' : 'Sign Out',
            style: TextStyle(fontSize: 14.sp), // ✅ Adaptive font
          ),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            side: const BorderSide(color: Colors.red),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12), // ✅ Uniform radius
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showThemeSheet(BuildContext context) async {
    final copy = CopyService.instance;
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (context) {
        return CupertinoActionSheet(
          title: const CopyText('settings_theme', fallback: 'Theme'),
          actions: [
            _buildActionSheetAction(
              selected: _themeMode == ThemeMode.system,
              titleKey: 'theme_mode_system',
              fallback: copy.t('theme_mode_system', fallback: 'System'),
              onPressed: () async {
                await ThemeService.instance.setThemeMode(ThemeMode.system);
                if (!mounted) return;
                setState(() => _themeMode = ThemeMode.system);
                if (context.mounted) Navigator.of(context).pop();
              },
            ),
            _buildActionSheetAction(
              selected: _themeMode == ThemeMode.light,
              titleKey: 'theme_mode_light',
              fallback: copy.t('theme_mode_light', fallback: 'Light'),
              onPressed: () async {
                await ThemeService.instance.setThemeMode(ThemeMode.light);
                if (!mounted) return;
                setState(() => _themeMode = ThemeMode.light);
                if (context.mounted) Navigator.of(context).pop();
              },
            ),
            _buildActionSheetAction(
              selected: _themeMode == ThemeMode.dark,
              titleKey: 'theme_mode_dark',
              fallback: copy.t('theme_mode_dark', fallback: 'Dark'),
              onPressed: () async {
                await ThemeService.instance.setThemeMode(ThemeMode.dark);
                if (!mounted) return;
                setState(() => _themeMode = ThemeMode.dark);
                if (context.mounted) Navigator.of(context).pop();
              },
            ),
          ],
          cancelButton: CupertinoActionSheetAction(
            onPressed: () => Navigator.of(context).pop(),
            child: const CopyText('common.cancel', fallback: 'Cancel'),
          ),
        );
      },
    );
  }

  Future<void> _showLanguageSheet(BuildContext context) async {
    final copy = CopyService.instance;
    final selected = copy.localeOverride == null
        ? 'system'
        : _formatLocaleTag(copy.locale);
    final tags = copy.supportedLocales.map(_formatLocaleTag).toSet().toList()
      ..sort();
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (context) {
        return CupertinoActionSheet(
          title: const CopyText('settings_language', fallback: 'Language'),
          actions: [
            _buildActionSheetAction(
              selected: selected == 'system',
              titleKey: 'language_system_default',
              fallback: copy.t('language_system_default', fallback: 'System'),
              onPressed: () async {
                await CopyService.instance.setLocaleOverride(null);
                unawaited(DynamicConfigService.instance.refresh(force: true));
                if (context.mounted) Navigator.of(context).pop();
              },
            ),
            for (final tag in tags)
              _buildActionSheetAction(
                selected: selected == tag,
                titleKey: _localeLabelKey(tag),
                fallback: _localeLabelFallback(tag, copy),
                onPressed: () async {
                  await CopyService.instance.setLocaleOverride(
                    _parseLocaleTag(tag),
                  );
                  unawaited(DynamicConfigService.instance.refresh(force: true));
                  if (context.mounted) Navigator.of(context).pop();
                },
              ),
          ],
          cancelButton: CupertinoActionSheetAction(
            onPressed: () => Navigator.of(context).pop(),
            child: const CopyText('common.cancel', fallback: 'Cancel'),
          ),
        );
      },
    );
  }

  String _localeLabelKey(String tag) {
    if (tag == 'system') {
      return 'language_system_default';
    }
    if (tag.startsWith('en')) {
      return 'language.name.en';
    }
    if (tag.startsWith('zh')) {
      return 'language.name.zh_hans';
    }
    return 'language.name.$tag';
  }

  String _localeLabelFallback(String tag, CopyService copy) {
    if (tag == 'system') {
      return copy.t('language_system_default', fallback: 'System');
    }
    if (tag.startsWith('en')) {
      return copy.t('language.name.en', fallback: 'English');
    }
    if (tag.startsWith('zh')) {
      return copy.t('language.name.zh_hans', fallback: '中文');
    }
    return tag;
  }

  String _themeModeLabelKey(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.system:
        return 'theme_mode_system';
      case ThemeMode.light:
        return 'theme_mode_light';
      case ThemeMode.dark:
        return 'theme_mode_dark';
    }
  }

  String _themeModeLabelFallback(ThemeMode mode, CopyService copy) {
    switch (mode) {
      case ThemeMode.system:
        return copy.t('theme_mode_system', fallback: 'System');
      case ThemeMode.light:
        return copy.t('theme_mode_light', fallback: 'Light');
      case ThemeMode.dark:
        return copy.t('theme_mode_dark', fallback: 'Dark');
    }
  }

  Widget _buildActionSheetAction({
    required bool selected,
    required String titleKey,
    required String fallback,
    required VoidCallback onPressed,
  }) {
    return CupertinoActionSheetAction(
      onPressed: onPressed,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: CopyText(
              titleKey,
              fallback: fallback,
            ),
          ),
          if (selected) Icon(CupertinoIcons.check_mark, size: 18.w),
        ],
      ),
    );
  }

  String _resolveLocaleTag(Locale? override, Locale fallback) {
    return override == null ? 'system' : _formatLocaleTag(override);
  }

  String _formatLocaleTag(Locale locale) {
    if (locale.countryCode == null || locale.countryCode!.isEmpty) {
      return locale.languageCode;
    }
    return '${locale.languageCode}-${locale.countryCode}';
  }

  Locale _parseLocaleTag(String raw) {
    final normalized = raw.replaceAll('_', '-');
    final parts = normalized.split('-');
    if (parts.isEmpty) return const Locale('en');
    if (parts.length == 1) return Locale(parts[0]);
    return Locale(parts[0], parts[1]);
  }
}
