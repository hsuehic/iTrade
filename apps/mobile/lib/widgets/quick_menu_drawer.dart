import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/auth_service.dart';
import '../services/copy_service.dart';
import '../services/dynamic_config_service.dart';
import '../services/preference.dart';
import '../services/theme_service.dart';
import '../services/api_client.dart';
import 'app_switch.dart';
import 'user_avatar.dart';
import 'copy_text.dart';

class QuickMenuDrawer extends StatefulWidget {
  const QuickMenuDrawer({super.key});

  @override
  State<QuickMenuDrawer> createState() => _QuickMenuDrawerState();
}

class _QuickMenuDrawerState extends State<QuickMenuDrawer> {
  bool _signingOut = false;
  bool _notificationsEnabled = true;
  ThemeMode _themeMode = ThemeMode.system;
  final AuthService _authService = AuthService.instance;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    final themeMode = ThemeService.instance.themeMode;
    setState(() {
      _notificationsEnabled = notificationsEnabled ?? false;
      _themeMode = themeMode;
    });
  }

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    try {
      try {
        await AuthService.instance.signOut();
        await ApiClient.instance.clearCookies();
        await Preference.remove(Preference.keySavedEmail);
        await Preference.remove(Preference.keySavedPassword);
      } catch (err) {
        // Ignore logout errors
      }
      if (!mounted) return;
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
      return const Center(child: CircularProgressIndicator());
    }
    final image = user.image;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final copy = CopyService.instance;
    final selectedLocaleTag = copy.localeOverride == null
        ? 'system'
        : _formatLocale(copy.locale);
    final languageSubtitleKey = _localeLabelKey(selectedLocaleTag);
    final languageSubtitleFallback =
        _localeLabelFallback(selectedLocaleTag, copy);
    final themeSubtitleKey = _themeModeLabelKey(_themeMode);
    final themeSubtitleFallback = _themeModeLabelFallback(_themeMode, copy);

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: 0.5)
                : Colors.black.withValues(alpha: 0.1),
            blurRadius: 20,
            offset: const Offset(0, -5),
          ),
        ],
      ),
      child: Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.grey.withValues(alpha: 0.5)
                  : Colors.grey[400],
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    // Logo
                    Container(
                      width: 32.w,
                      height: 32.w,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [
                            Theme.of(
                              context,
                            ).colorScheme.primary.withValues(alpha: 0.8),
                            Theme.of(context).colorScheme.primary,
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Theme.of(
                              context,
                            ).colorScheme.primary.withValues(alpha: 0.3),
                            blurRadius: 8,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                      child: ClipOval(
                        child: Image.asset(
                          'assets/images/logo-512x512.png',
                          fit: BoxFit.cover,
                          cacheWidth: 64, // 2x resolution for 32px display
                          cacheHeight: 64,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    CopyText(
                      'widget.quick_menu_drawer.quick_menu',
                      fallback: "Quick menu",
                      style: TextStyle(
                        fontSize: 20.sp,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),

          Divider(
            height: 1,
            thickness: 0.5,
            color: isDark
                ? Colors.grey.withValues(alpha: 0.2)
                : Colors.grey.withValues(alpha: 0.15),
          ),

          // Content
          Expanded(
            child: ListView(
              padding: EdgeInsets.all(16.w),
              children: [
                // User Card
                _buildUserCard(user, image, isDark),
                const SizedBox(height: 24),

                // Quick Settings
                _buildSectionHeader(
                  titleKey: 'widget.quick_menu_drawer.quick_settings',
                  fallback: 'Quick settings',
                ),
                const SizedBox(height: 8),
                _buildSettingsGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.notifications_outlined,
                      titleKey: 'widget.quick_menu_drawer.notifications',
                      titleFallback: 'Notifications',
                      subtitleKey:
                          'widget.quick_menu_drawer.push_notifications',
                      subtitleFallback: 'Push notifications',
                      value: _notificationsEnabled,
                      onChanged: (v) async {
                        setState(() => _notificationsEnabled = v);
                        await Preference.setNotificationsEnabled(v);
                      },
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSettingTile(
                      icon: Icons.dark_mode_outlined,
                      titleKey: 'settings_theme',
                      titleFallback: 'Theme',
                      subtitleKey: themeSubtitleKey,
                      subtitleFallback: themeSubtitleFallback,
                      onTap: () => _showThemeSheet(context),
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSettingTile(
                      icon: Icons.language_outlined,
                      titleKey: 'settings_language',
                      titleFallback: 'Language',
                      subtitleKey: languageSubtitleKey,
                      subtitleFallback: languageSubtitleFallback,
                      onTap: () => _showLanguageSheet(context),
                      isDark: isDark,
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Account Actions
                _buildSectionHeader(
                  titleKey: 'widget.quick_menu_drawer.account',
                  fallback: 'Account',
                ),
                const SizedBox(height: 8),
                _buildSettingsGroup(
                  isDark: isDark,
                  children: [
                    _buildSettingTile(
                      icon: Icons.person_outline,
                      titleKey: 'widget.quick_menu_drawer.profile',
                      titleFallback: 'Profile',
                      subtitleKey: 'widget.quick_menu_drawer.view_full_profile',
                      subtitleFallback: 'View full profile',
                      onTap: () {
                        Navigator.pop(context);
                        Navigator.pushNamed(context, '/profile');
                      },
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSettingTile(
                      icon: Icons.settings_outlined,
                      titleKey: 'widget.quick_menu_drawer.settings',
                      titleFallback: 'Settings',
                      subtitleKey: 'widget.quick_menu_drawer.app_preferences',
                      subtitleFallback: 'App preferences',
                      onTap: () {
                        Navigator.pop(context);
                        Navigator.pushNamed(context, '/profile');
                      },
                      isDark: isDark,
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Sign Out
                _buildSignOutButton(),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUserCard(dynamic user, String? image, bool isDark) {
    final primaryColor = Theme.of(context).colorScheme.primary;

    return Container(
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [primaryColor.withValues(alpha: 0.8), primaryColor],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          UserAvatar(
            radius: 28,
            backgroundColor: Colors.white.withValues(alpha: 0.3),
            icon: Icons.person,
            iconColor: Colors.white,
            iconSize: 32,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name,
                  style: TextStyle(
                    fontSize: 18.sp,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  user.email,
                  style: TextStyle(
                    fontSize: 14.sp,
                    color: Colors.white.withValues(alpha: 0.9),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader({
    required String titleKey,
    required String fallback,
  }) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: CopyText(
        titleKey,
        fallback: fallback,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: Colors.grey[600],
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
        color: isDark ? Colors.grey[900] : Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.08),
        ),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String titleKey,
    required String titleFallback,
    String? subtitleKey,
    String? subtitleFallback,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40.w,
              height: 40.w,
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.grey[800]
                    : Colors.grey.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                icon,
                size: 20.w,
                color: Theme.of(context).primaryColor,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CopyText(
                    titleKey,
                    fallback: titleFallback,
                    style: TextStyle(
                      fontSize: 15.sp,
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
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey[400]),
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
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.grey[800]
                  : Colors.grey.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: Theme.of(context).primaryColor),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CopyText(
                  titleKey,
                  fallback: titleFallback,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (subtitleKey != null) ...[
                  const SizedBox(height: 2),
                  CopyText(
                    subtitleKey,
                    fallback: subtitleFallback ?? '',
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
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

  Widget _buildDivider(bool isDark) {
    return Divider(
      height: 1,
      thickness: 0.5,
      indent: 68,
      color: isDark
          ? Colors.grey.withValues(alpha: 0.15)
          : Colors.grey.withValues(alpha: 0.08),
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
        : _formatLocale(copy.locale);
    final locales = copy.supportedLocales.map(_formatLocale).toSet().toList()
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
            for (final tag in locales)
              _buildActionSheetAction(
                selected: selected == tag,
                titleKey: _localeLabelKey(tag),
                fallback: _localeLabelFallback(tag, copy),
                onPressed: () async {
                  await CopyService.instance.setLocaleOverride(
                    _parseLocale(tag),
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

  String _formatLocale(Locale locale) {
    if (locale.countryCode == null || locale.countryCode!.isEmpty) {
      return locale.languageCode;
    }
    return '${locale.languageCode}-${locale.countryCode}';
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
      return copy.t('language_system_default', fallback: 'System default');
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

  Locale _parseLocale(String raw) {
    final normalized = raw.replaceAll('_', '-');
    final parts = normalized.split('-');
    if (parts.isEmpty) return const Locale('en');
    if (parts.length == 1) return Locale(parts[0]);
    return Locale(parts[0], parts[1]);
  }

  Widget _buildSignOutButton() {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 4.w),
      child: SizedBox(
        height: 50,
        child: OutlinedButton.icon(
          onPressed: _signingOut ? null : _signOut,
          icon: _signingOut
              ? SizedBox(
                  width: 16.w,
                  height: 16.w,
                  child: const CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(Icons.logout, size: 24.w),
          label: CopyText(
            _signingOut
                ? 'widget.quick_menu_drawer.signing_out'
                : 'widget.quick_menu_drawer.sign_out',
            fallback: _signingOut ? 'Signing out...' : 'Sign out',
          ),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            side: const BorderSide(color: Colors.red),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
    );
  }
}
