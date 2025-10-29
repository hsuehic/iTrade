import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/preference.dart';
import '../services/theme_service.dart';
import 'change_password.dart';
import 'delete_account.dart';
import 'edit_profile.dart';
import 'email_preferences.dart';
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
  bool _darkMode = false;
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;
  final AuthService _authService = AuthService.instance;

  Future<void> _loadSetting() async {
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    final biometricEnabled = await Preference.getBiometricEnabled();
    final darkMode = await Preference.getDarkMode();
    setState(() {
      _notificationsEnabled = notificationsEnabled ?? false;
      _enableFaceId = biometricEnabled ?? false;
      _darkMode = darkMode ?? false;
    });
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
  }

  @override
  Widget build(BuildContext context) {
    final user = _authService.user!;
    final image = user.image;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: ListView(
        padding: EdgeInsets.all(16.w),  // ✅ Width-adapted
        children: [
          // User Profile Card
          _buildUserCard(user, image, isDark),
          const SizedBox(height: 24),

          // Account Settings
          _buildSectionHeader('Account'),
          const SizedBox(height: 8),
          _buildSettingsGroup(
            isDark: isDark,
            children: [
              _buildSettingTile(
                icon: Icons.person_outline,
                title: 'Edit Profile',
                subtitle: 'Update your personal information',
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
                title: 'Change Password',
                subtitle: 'Update your password',
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
                title: 'Email Preferences',
                subtitle: 'Manage email notifications',
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
                icon: Icons.delete_forever,
                title: 'Delete Account',
                subtitle: 'Delete your account and all data',
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
                                content: Text(
                                  'Delete account success! It\'s our honour to serve you. Hope to see you again.',
                                ),
                                backgroundColor: Theme.of(
                                  context,
                                ).colorScheme.primary,

                                duration: const Duration(seconds: 3),
                                behavior: SnackBarBehavior.floating,
                                margin: EdgeInsets.only(
                                  bottom: 28,       // ✅ Fixed vertical
                                  left: 16.w,       // ✅ Width-adapted
                                  right: 16.w,      // ✅ Width-adapted
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
                                  content: Text(
                                    'Delete account failed: ${result.message}!',
                                  ),
                                  backgroundColor: Colors.red,
                                  duration: const Duration(seconds: 3),
                                ),
                              );
                            } else {
                              messenger.showSnackBar(
                                SnackBar(
                                  content: Text('Delete account failed!'),
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
          _buildSectionHeader('App Settings'),
          const SizedBox(height: 8),
          _buildSettingsGroup(
            isDark: isDark,
            children: [
              _buildSwitchTile(
                icon: Icons.dark_mode_outlined,
                title: 'Dark Mode',
                subtitle: 'Switch between light and dark theme',
                value: _darkMode,
                onChanged: (v) async {
                  setState(() => _darkMode = v);
                  await ThemeService.instance.setThemeMode(v);
                },
                isDark: isDark,
              ),
              _buildDivider(isDark),
              _buildSwitchTile(
                icon: Icons.notifications_outlined,
                title: 'Push Notifications',
                subtitle: 'Receive alerts and updates',
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
                title: 'Sound',
                subtitle: 'Enable sound effects',
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
                title: 'Vibration',
                subtitle: 'Enable haptic feedback',
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
          _buildSectionHeader('Security'),
          const SizedBox(height: 8),
          _buildSettingsGroup(
            isDark: isDark,
            children: [
              _buildSwitchTile(
                icon: Icons.fingerprint,
                title: 'Biometric Authentication',
                subtitle: 'Use Face ID or Touch ID',
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
                title: 'Privacy Settings',
                subtitle: 'Manage your data and privacy',
                onTap: () {
                  // TODO: Navigate to privacy settings
                },
                isDark: isDark,
              ),
              _buildDivider(isDark),
              _buildSettingTile(
                icon: Icons.security,
                title: 'Two-Factor Authentication',
                subtitle: 'Add extra security to your account',
                onTap: () {
                  // TODO: Navigate to 2FA setup
                },
                isDark: isDark,
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Trading Preferences
          _buildSectionHeader('Trading'),
          const SizedBox(height: 8),
          _buildSettingsGroup(
            isDark: isDark,
            children: [
              _buildSettingTile(
                icon: Icons.currency_bitcoin,
                title: 'Default Exchange',
                subtitle: 'OKX',
                trailing: Icons.chevron_right,
                onTap: () {
                  // TODO: Navigate to exchange selection
                },
                isDark: isDark,
              ),
              _buildDivider(isDark),
              _buildSettingTile(
                icon: Icons.attach_money,
                title: 'Default Currency',
                subtitle: 'USDT',
                trailing: Icons.chevron_right,
                onTap: () {
                  // TODO: Navigate to currency selection
                },
                isDark: isDark,
              ),
              _buildDivider(isDark),
              _buildSettingTile(
                icon: Icons.speed,
                title: 'Trading Mode',
                subtitle: 'Conservative',
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
          _buildSectionHeader('Support'),
          const SizedBox(height: 8),
          _buildSettingsGroup(
            isDark: isDark,
            children: [
              _buildSettingTile(
                icon: Icons.help_outline,
                title: 'Help Center',
                subtitle: 'Get help and support',
                onTap: () {
                  // TODO: Navigate to help
                },
                isDark: isDark,
              ),
              _buildDivider(isDark),
              _buildSettingTile(
                icon: Icons.bug_report_outlined,
                title: 'Report a Problem',
                subtitle: 'Let us know about issues',
                onTap: () {
                  // TODO: Navigate to bug report
                },
                isDark: isDark,
              ),
              _buildDivider(isDark),
              _buildSettingTile(
                icon: Icons.star_outline,
                title: 'Rate App',
                subtitle: 'Share your feedback',
                onTap: () {
                  // TODO: Open app store
                },
                isDark: isDark,
              ),
              _buildDivider(isDark),
              _buildSettingTile(
                icon: Icons.info_outline,
                title: 'About',
                subtitle: 'iTrade v1.0.0',
                onTap: () => showAboutDialog(
                  context: context,
                  applicationName: 'iTrade',
                  applicationVersion: '1.0.0',
                  applicationLegalese: '© 2025 iTrade. All rights reserved.',
                ),
                isDark: isDark,
              ),
            ],
          ),
          const SizedBox(height: 32),

          // Sign Out Button
          _buildSignOutButton(),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildUserCard(User user, String? image, bool isDark) {
    return Container(
      padding: EdgeInsets.all(20.w),  // ✅ Width-adapted
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Theme.of(context).colorScheme.primary.withOpacity(0.8),
            Theme.of(context).colorScheme.primary,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),  // ✅ Uniform radius
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
            radius: 40,  // ✅ Fixed size for better visibility
            backgroundColor: Colors.white.withOpacity(0.3),
            icon: Icons.person,
            iconColor: Colors.white.withOpacity(0.9),
            iconSize: 48,  // ✅ Fixed size
          ),
          SizedBox(width: 16.w),  // ✅ Width-adapted
          // User info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontSize: 20.sp,  // ✅ Adaptive font
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  user.email,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontSize: 14.sp,  // ✅ Adaptive font
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

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: EdgeInsets.only(left: 4.w),  // ✅ Width-adapted
      child: Text(
        title,
        style: TextStyle(
          fontSize: 13.sp,  // ✅ Adaptive font
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
        borderRadius: BorderRadius.circular(12),  // ✅ Uniform radius
        border: Border.all(
          color: isDark ? Colors.grey[850]! : Colors.grey.withOpacity(0.08),
        ),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String title,
    String? subtitle,
    IconData? trailing,
    VoidCallback? onTap,
    required bool isDark,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12),  // ✅ Width-adapted horizontal
        child: Row(
          children: [
            Container(
              width: 40.w,   // ✅ Uniform scaling
              height: 40.w,  // ✅ Uniform scaling
              decoration: BoxDecoration(
                color: isDark ? Colors.grey[800] : Colors.grey.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),  // ✅ Uniform radius
              ),
              child: Icon(
                icon,
                size: 20.w,  // ✅ Uniform scaling
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            SizedBox(width: 12.w),  // ✅ Width-adapted
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15.sp,  // ✅ Adaptive font
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(fontSize: 13.sp, color: Colors.grey[600]),  // ✅ Adaptive font
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null)
              Icon(trailing, size: 20.w, color: Colors.grey[400]),  // ✅ Uniform scaling
          ],
        ),
      ),
    );
  }

  Widget _buildSwitchTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
    required bool isDark,
  }) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8),  // ✅ Width-adapted horizontal
      child: Row(
        children: [
          Container(
            width: 40.w,   // ✅ Uniform scaling
            height: 40.w,  // ✅ Uniform scaling
            decoration: BoxDecoration(
              color: isDark ? Colors.grey[800] : Colors.grey.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),  // ✅ Uniform radius
            ),
            child: Icon(icon, size: 20.w, color: Theme.of(context).primaryColor),  // ✅ Uniform scaling
          ),
          SizedBox(width: 12.w),  // ✅ Width-adapted
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15.sp,  // ✅ Adaptive font
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 13.sp, color: Colors.grey[600]),  // ✅ Adaptive font
                  ),
                ],
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
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
      padding: EdgeInsets.symmetric(horizontal: 4.w),  // ✅ Width-adapted
      child: SizedBox(
        height: 50,
        child: OutlinedButton.icon(
          onPressed: _signingOut ? null : _signOut,
          icon: _signingOut
              ? SizedBox(
                  width: 16.w,   // ✅ Uniform scaling
                  height: 16.w,  // ✅ Uniform scaling
                  child: const CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.logout),
          label: Text(
            _signingOut ? 'Signing out...' : 'Sign Out',
            style: TextStyle(fontSize: 14.sp),  // ✅ Adaptive font
          ),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            side: const BorderSide(color: Colors.red),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),  // ✅ Uniform radius
            ),
          ),
        ),
      ),
    );
  }
}
