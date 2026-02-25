import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../services/notification.dart';
import '../services/preference.dart';
import '../widgets/app_switch.dart';
import '../widgets/copy_text.dart';
import 'push_notification_history.dart';

class PushPreferencesScreen extends StatefulWidget {
  const PushPreferencesScreen({super.key});

  @override
  State<PushPreferencesScreen> createState() => _PushPreferencesScreenState();
}

class _PushPreferencesScreenState extends State<PushPreferencesScreen> {
  bool _isLoading = true;
  bool _isSaving = false;

  bool _notificationsEnabled = true;
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;
  bool _categoryGeneral = true;
  bool _categoryMarketing = false;
  bool _categoryTrading = true;
  bool _categorySecurity = true;
  bool _categorySystem = true;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    setState(() => _isLoading = true);

    try {
      final notificationsEnabled = await Preference.getNotificationsEnabled();
      final soundEnabled = await Preference.getSoundEnabled();
      final vibrationEnabled = await Preference.getVibrationEnabled();
      final cGeneral = await Preference.getPushCategoryEnabled('general');
      final cMarketing = await Preference.getPushCategoryEnabled('marketing');
      final cTrading = await Preference.getPushCategoryEnabled('trading');
      final cSecurity = await Preference.getPushCategoryEnabled('security');
      final cSystem = await Preference.getPushCategoryEnabled('system');

      if (!mounted) return;

      setState(() {
        _notificationsEnabled = notificationsEnabled ?? true;
        _soundEnabled = soundEnabled ?? true;
        _vibrationEnabled = vibrationEnabled ?? true;
        _categoryGeneral = cGeneral;
        _categoryMarketing = cMarketing;
        _categoryTrading = cTrading;
        _categorySecurity = cSecurity;
        _categorySystem = cSystem;
      });
    } catch (_) {
      // Keep defaults on error
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _savePreferences() async {
    setState(() => _isSaving = true);

    try {
      await Preference.setNotificationsEnabled(_notificationsEnabled);
      await Preference.setSoundEnabled(_soundEnabled);
      await Preference.setVibrationEnabled(_vibrationEnabled);

      await Preference.setPushCategoryEnabled('general', _categoryGeneral);
      await Preference.setPushCategoryEnabled('marketing', _categoryMarketing);
      await Preference.setPushCategoryEnabled('trading', _categoryTrading);
      await Preference.setPushCategoryEnabled('security', _categorySecurity);
      await Preference.setPushCategoryEnabled('system', _categorySystem);

      if (_notificationsEnabled) {
        await NotificationService.instance.requestPermissions();
        await NotificationService.instance.syncDeviceTokenToServer(force: true);
        await NotificationService.instance.ensureTopicSubscriptions();
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const CopyText(
            'screen.push_preferences.push_preferences_saved_success',
            fallback: 'Push preferences saved.',
          ),
          backgroundColor: Theme.of(context).colorScheme.primary,
          duration: const Duration(seconds: 3),
          behavior: SnackBarBehavior.floating,
          margin: EdgeInsets.only(
            bottom: 28.w,
            left: 16.w,
            right: 16.w,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: CopyText(
            'screen.push_preferences.save_failed',
            fallback: 'Failed to save preferences',
          ),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 3),
          behavior: SnackBarBehavior.floating,
          margin: EdgeInsets.only(
            bottom: 28.w,
            left: 16.w,
            right: 16.w,
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(
        title: const CopyText(
          'screen.push_preferences.push_preferences',
          fallback: 'Push preferences',
        ),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: EdgeInsets.all(16.w),
              children: [
                // Header Card
                Container(
                  padding: EdgeInsets.all(20.w),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        primaryColor.withValues(alpha: 0.8),
                        primaryColor,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16.w),
                    boxShadow: [
                      BoxShadow(
                        color: primaryColor.withValues(alpha: 0.3),
                        blurRadius: 15.w,
                        spreadRadius: 2.w,
                        offset: Offset(0, 4.w),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.notifications, size: 40.w, color: Colors.white),
                      SizedBox(width: 16.w),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CopyText(
                              'screen.push_preferences.manage_notifications',
                              fallback: 'Manage notifications',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                            ),
                            SizedBox(height: 4.w),
                            CopyText(
                              'screen.push_preferences.choose_which_push_you_want_t',
                              fallback:
                                  'Choose which push notifications you want to receive',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyMedium
                                  ?.copyWith(
                                    color: Colors.white.withValues(alpha: 0.9),
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: 24.w),

                _buildSectionHeader(
                  'screen.push_preferences.section.delivery',
                  'Delivery',
                ),
                SizedBox(height: 8.w),
                _buildPreferencesGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.notifications_outlined,
                      titleKey: 'screen.profile.push_notifications',
                      titleFallback: 'Push notifications',
                      subtitleKey: 'screen.profile.push_notifications_subtitle',
                      subtitleFallback: 'Receive alerts and updates',
                      value: _notificationsEnabled,
                      onChanged: (v) =>
                          setState(() => _notificationsEnabled = v),
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
                      onChanged: (v) => setState(() => _soundEnabled = v),
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
                      onChanged: (v) => setState(() => _vibrationEnabled = v),
                      isDark: isDark,
                    ),
                  ],
                ),
                SizedBox(height: 24.w),

                _buildSectionHeader(
                  'screen.profile.section.push_categories',
                  'Push categories',
                ),
                SizedBox(height: 8.w),
                _buildPreferencesGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.notifications_active_outlined,
                      titleKey: 'screen.profile.push_categories.general',
                      titleFallback: 'General',
                      subtitleKey: 'screen.profile.push_categories.general_subtitle',
                      subtitleFallback: 'General updates',
                      value: _categoryGeneral,
                      onChanged: (v) => setState(() => _categoryGeneral = v),
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSwitchTile(
                      icon: Icons.campaign_outlined,
                      titleKey: 'screen.profile.push_categories.marketing',
                      titleFallback: 'Marketing',
                      subtitleKey:
                          'screen.profile.push_categories.marketing_subtitle',
                      subtitleFallback: 'Promotions and announcements',
                      value: _categoryMarketing,
                      onChanged: (v) => setState(() => _categoryMarketing = v),
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
                      onChanged: (v) => setState(() => _categoryTrading = v),
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSwitchTile(
                      icon: Icons.security,
                      titleKey: 'screen.profile.push_categories.security',
                      titleFallback: 'Security',
                      subtitleKey:
                          'screen.profile.push_categories.security_subtitle',
                      subtitleFallback: 'Login and security alerts',
                      value: _categorySecurity,
                      onChanged: (v) => setState(() => _categorySecurity = v),
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
                      onChanged: (v) => setState(() => _categorySystem = v),
                      isDark: isDark,
                    ),
                  ],
                ),
                SizedBox(height: 24.w),

                _buildSectionHeader(
                  'screen.push_preferences.section.history',
                  'History',
                ),
                SizedBox(height: 8.w),
                _buildPreferencesGroup(
                  isDark: isDark,
                  children: [
                    _buildSettingTile(
                      icon: Icons.history,
                      titleKey: 'screen.profile.push_history',
                      titleFallback: 'Push history',
                      subtitleKey: 'screen.profile.push_history_subtitle',
                      subtitleFallback: 'View recent push messages',
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) =>
                                const PushNotificationHistoryScreen(),
                          ),
                        );
                      },
                      isDark: isDark,
                    ),
                  ],
                ),
                SizedBox(height: 32.w),

                SizedBox(
                  height: 50.w,
                  child: ElevatedButton(
                    onPressed: _isSaving ? null : _savePreferences,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primaryColor,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12.w),
                      ),
                      elevation: 2,
                    ),
                    child: _isSaving
                        ? SizedBox(
                            width: 20.w,
                            height: 20.w,
                            child: const CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : const CopyText(
                            'screen.push_preferences.save_preferences',
                            fallback: 'Save preferences',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                SizedBox(height: 32.w),
              ],
            ),
    );
  }

  Widget _buildSectionHeader(String titleKey, String titleFallback) {
    return Padding(
      padding: EdgeInsets.only(left: 4.w),
      child: CopyText(
        titleKey,
        fallback: titleFallback,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.grey[600],
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildPreferencesGroup({
    required bool isDark,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[900] : Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12.w),
        border: Border.all(
          color: isDark
              ? Colors.grey[850]!
              : Colors.grey.withValues(alpha: 0.08),
        ),
      ),
      child: Column(children: children),
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
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8.w),
      child: Row(
        children: [
          Container(
            width: 40.w,
            height: 40.w,
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.grey[800]
                  : Colors.grey.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10.w),
            ),
            child: Icon(
              icon,
              size: 20.w,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          SizedBox(width: 12.w),
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
                  SizedBox(height: 2.w),
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
      borderRadius: BorderRadius.circular(12.w),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.w),
        child: Row(
          children: [
            Container(
              width: 40.w,
              height: 40.w,
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.grey[800]
                    : Colors.grey.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10.w),
              ),
              child: Icon(
                icon,
                size: 20.w,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            SizedBox(width: 12.w),
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
                    SizedBox(height: 2.w),
                    CopyText(
                      subtitleKey,
                      fallback: subtitleFallback ?? '',
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey[500]),
          ],
        ),
      ),
    );
  }

  Widget _buildDivider(bool isDark) {
    return Divider(
      height: 1.w,
      thickness: 0.5.w,
      indent: 68.w,
      color: isDark ? Colors.grey[850] : Colors.grey.withValues(alpha: 0.15),
    );
  }
}
