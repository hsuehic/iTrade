import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/auth_service.dart';
import '../services/preference.dart';
import '../services/theme_service.dart';
import '../services/api_client.dart';
import 'user_avatar.dart';

class QuickMenuDrawer extends StatefulWidget {
  const QuickMenuDrawer({super.key});

  @override
  State<QuickMenuDrawer> createState() => _QuickMenuDrawerState();
}

class _QuickMenuDrawerState extends State<QuickMenuDrawer> {
  bool _signingOut = false;
  bool _notificationsEnabled = true;
  bool _darkMode = false;
  final AuthService _authService = AuthService.instance;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    final darkMode = await Preference.getDarkMode();
    setState(() {
      _notificationsEnabled = notificationsEnabled ?? false;
      _darkMode = darkMode ?? false;
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
            Navigator.of(context).pushNamedAndRemoveUntil(
              '/login',
              (route) => false,
            );
          }
        });
      }
      return const Center(child: CircularProgressIndicator());
    }
    final image = user.image;
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
                    Text(
                      'Quick Menu',
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
                _buildSectionHeader('Quick Settings'),
                const SizedBox(height: 8),
                _buildSettingsGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.notifications_outlined,
                      title: 'Notifications',
                      subtitle: 'Push notifications',
                      value: _notificationsEnabled,
                      onChanged: (v) async {
                        setState(() => _notificationsEnabled = v);
                        await Preference.setNotificationsEnabled(v);
                      },
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSwitchTile(
                      icon: Icons.dark_mode_outlined,
                      title: 'Dark Mode',
                      subtitle: 'Switch theme',
                      value: _darkMode,
                      onChanged: (v) async {
                        setState(() => _darkMode = v);
                        await ThemeService.instance.setThemeMode(v);
                      },
                      isDark: isDark,
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Account Actions
                _buildSectionHeader('Account'),
                const SizedBox(height: 8),
                _buildSettingsGroup(
                  isDark: isDark,
                  children: [
                    _buildSettingTile(
                      icon: Icons.person_outline,
                      title: 'Profile',
                      subtitle: 'View full profile',
                      onTap: () {
                        Navigator.pop(context);
                        Navigator.pushNamed(context, '/profile');
                      },
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSettingTile(
                      icon: Icons.settings_outlined,
                      title: 'Settings',
                      subtitle: 'App preferences',
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
            backgroundColor: Colors.white.withOpacity(0.3),
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

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        title,
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
    required String title,
    String? subtitle,
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
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15.sp,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(fontSize: 13.sp, color: Colors.grey[600]),
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
    required String title,
    String? subtitle,
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
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
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
      color: isDark
          ? Colors.grey.withValues(alpha: 0.15)
          : Colors.grey.withValues(alpha: 0.08),
    );
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
          label: Text(_signingOut ? 'Signing out...' : 'Sign Out'),
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
