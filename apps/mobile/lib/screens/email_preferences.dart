import 'package:flutter/material.dart';
import '../widgets/app_switch.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/api_client.dart';
import '../widgets/copy_text.dart';

class EmailPreferencesScreen extends StatefulWidget {
  const EmailPreferencesScreen({super.key});

  @override
  State<EmailPreferencesScreen> createState() => _EmailPreferencesScreenState();
}

class _EmailPreferencesScreenState extends State<EmailPreferencesScreen> {
  bool _isLoading = true;
  bool _isSaving = false;

  // Email notification preferences
  bool _marketingEmails = true;
  bool _tradingAlerts = true;
  bool _priceAlerts = true;
  bool _orderUpdates = true;
  bool _accountActivity = true;
  bool _weeklyReports = true;
  bool _productUpdates = false;
  bool _newsAndTips = true;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    setState(() => _isLoading = true);

    try {
      final response = await ApiClient.instance.getJson(
        '/api/mobile/email-preferences',
      );

      if (!mounted) return;

      final data = response.data;
      if (data['success'] == true && data['preferences'] != null) {
        final prefs = data['preferences'];
        setState(() {
          _marketingEmails = prefs['marketingEmails'] ?? true;
          _tradingAlerts = prefs['tradingAlerts'] ?? true;
          _priceAlerts = prefs['priceAlerts'] ?? true;
          _orderUpdates = prefs['orderUpdates'] ?? true;
          _accountActivity = prefs['accountActivity'] ?? true;
          _weeklyReports = prefs['weeklyReports'] ?? true;
          _productUpdates = prefs['productUpdates'] ?? false;
          _newsAndTips = prefs['newsAndTips'] ?? true;
        });
      }
    } catch (e) {
      // Keep default values on error
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _savePreferences() async {
    setState(() => _isSaving = true);

    try {
      final response = await ApiClient.instance.postJson(
        '/api/mobile/email-preferences',
        data: {
          'marketingEmails': _marketingEmails,
          'tradingAlerts': _tradingAlerts,
          'priceAlerts': _priceAlerts,
          'orderUpdates': _orderUpdates,
          'accountActivity': _accountActivity,
          'weeklyReports': _weeklyReports,
          'productUpdates': _productUpdates,
          'newsAndTips': _newsAndTips,
        },
      );

      if (!mounted) return;

      final data = response.data;
      final success = data['success'] ?? false;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CopyText('screen.email_preferences.email_preferences_saved_succes', fallback: "Email preferences saved."),
            backgroundColor: Theme.of(context).colorScheme.primary,
            duration: const Duration(seconds: 3),
            behavior: SnackBarBehavior.floating,
            margin: EdgeInsets.only(
              bottom: 28,
              left: 16.w,
              right: 16.w,
            ),
          ),
        );
      } else {
        final message = data['message'];
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: message == null
                ? const CopyText(
                    'screen.email_preferences.save_failed',
                    fallback: 'Failed to save preferences',
                  )
                : Text(message),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
            behavior: SnackBarBehavior.floating,
            margin: EdgeInsets.only(
              bottom: 28,
              left: 16.w,
              right: 16.w,
            ),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: CopyText(
            'common.error_with_detail',
            params: {'error': e.toString()},
            fallback: 'Error: {{error}}',
          ),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 3),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.only(bottom: 28.0, left: 16.0, right: 16.0),
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
        title: CopyText('screen.email_preferences.email_preferences', fallback: "Email preferences"),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header Card
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        primaryColor.withValues(alpha: 0.8),
                        primaryColor,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: primaryColor.withValues(alpha: 0.3),
                        blurRadius: 15,
                        spreadRadius: 2,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.email, size: 40, color: Colors.white),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CopyText('screen.email_preferences.manage_notifications', fallback: "Manage notifications", style: Theme.of(context).textTheme.titleLarge
                                  ?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                            ),
                            const SizedBox(height: 4),
                            CopyText('screen.email_preferences.choose_which_emails_you_want_t', fallback: "Choose which emails you want to receive", style: Theme.of(context).textTheme.bodyMedium
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
                const SizedBox(height: 24),

                // Trading Notifications
                _buildSectionHeader(
                  'screen.email_preferences.section.trading',
                  'Trading notifications',
                ),
                const SizedBox(height: 8),
                _buildPreferencesGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.trending_up,
                      titleKey: 'screen.email_preferences.trading_alerts',
                      titleFallback: 'Trading alerts',
                      subtitleKey:
                          'screen.email_preferences.trading_alerts_subtitle',
                      subtitleFallback:
                          'Get notified about trading opportunities',
                      value: _tradingAlerts,
                      onChanged: (v) => setState(() => _tradingAlerts = v),
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSwitchTile(
                      icon: Icons.price_change,
                      titleKey: 'screen.email_preferences.price_alerts',
                      titleFallback: 'Price alerts',
                      subtitleKey:
                          'screen.email_preferences.price_alerts_subtitle',
                      subtitleFallback:
                          'Receive alerts when prices reach your targets',
                      value: _priceAlerts,
                      onChanged: (v) => setState(() => _priceAlerts = v),
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSwitchTile(
                      icon: Icons.receipt_long,
                      titleKey: 'screen.email_preferences.order_updates',
                      titleFallback: 'Order updates',
                      subtitleKey:
                          'screen.email_preferences.order_updates_subtitle',
                      subtitleFallback: 'Get updates on your order status',
                      value: _orderUpdates,
                      onChanged: (v) => setState(() => _orderUpdates = v),
                      isDark: isDark,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Account & Security
                _buildSectionHeader(
                  'screen.email_preferences.section.account_security',
                  'Account & security',
                ),
                const SizedBox(height: 8),
                _buildPreferencesGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.security,
                      titleKey: 'screen.email_preferences.account_activity',
                      titleFallback: 'Account activity',
                      subtitleKey:
                          'screen.email_preferences.account_activity_subtitle',
                      subtitleFallback:
                          'Important security and account notifications',
                      value: _accountActivity,
                      onChanged: (v) => setState(() => _accountActivity = v),
                      isDark: isDark,
                      important: true,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Reports & Updates
                _buildSectionHeader(
                  'screen.email_preferences.section.reports_updates',
                  'Reports & updates',
                ),
                const SizedBox(height: 8),
                _buildPreferencesGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.analytics,
                      titleKey: 'screen.email_preferences.weekly_reports',
                      titleFallback: 'Weekly reports',
                      subtitleKey:
                          'screen.email_preferences.weekly_reports_subtitle',
                      subtitleFallback:
                          'Receive weekly trading performance reports',
                      value: _weeklyReports,
                      onChanged: (v) => setState(() => _weeklyReports = v),
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSwitchTile(
                      icon: Icons.new_releases,
                      titleKey: 'screen.email_preferences.product_updates',
                      titleFallback: 'Product updates',
                      subtitleKey:
                          'screen.email_preferences.product_updates_subtitle',
                      subtitleFallback:
                          'Learn about new features and improvements',
                      value: _productUpdates,
                      onChanged: (v) => setState(() => _productUpdates = v),
                      isDark: isDark,
                    ),
                    _buildDivider(isDark),
                    _buildSwitchTile(
                      icon: Icons.lightbulb_outline,
                      titleKey: 'screen.email_preferences.news_tips',
                      titleFallback: 'News & tips',
                      subtitleKey:
                          'screen.email_preferences.news_tips_subtitle',
                      subtitleFallback: 'Market insights and trading tips',
                      value: _newsAndTips,
                      onChanged: (v) => setState(() => _newsAndTips = v),
                      isDark: isDark,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Marketing
                _buildSectionHeader(
                  'screen.email_preferences.section.marketing',
                  'Marketing',
                ),
                const SizedBox(height: 8),
                _buildPreferencesGroup(
                  isDark: isDark,
                  children: [
                    _buildSwitchTile(
                      icon: Icons.campaign,
                      titleKey: 'screen.email_preferences.marketing_emails',
                      titleFallback: 'Marketing emails',
                      subtitleKey:
                          'screen.email_preferences.marketing_emails_subtitle',
                      subtitleFallback: 'Promotional offers and special deals',
                      value: _marketingEmails,
                      onChanged: (v) => setState(() => _marketingEmails = v),
                      isDark: isDark,
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Save Button
                SizedBox(
                  height: 50,
                  child: ElevatedButton(
                    onPressed: _isSaving ? null : _savePreferences,
                    style: ElevatedButton.styleFrom(
                        backgroundColor: primaryColor,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 2,
                    ),
                    child:                       _isSaving
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
                        : CopyText('screen.email_preferences.save_preferences', fallback: "Save preferences", style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
    );
  }

  Widget _buildSectionHeader(String titleKey, String titleFallback) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
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

  Widget _buildSwitchTile({
    required IconData icon,
    required String titleKey,
    required String titleFallback,
    String? subtitleKey,
    String? subtitleFallback,
    required bool value,
    required ValueChanged<bool> onChanged,
    required bool isDark,
    bool important = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
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
            child: Icon(
              icon,
              size: 20,
              color: important
                  ? Colors.orange
                  : Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CopyText(
                      titleKey,
                      fallback: titleFallback,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (important) ...[
                      const SizedBox(width: 4),
                      Icon(Icons.star, size: 14, color: Colors.orange),
                    ],
                  ],
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
      color: isDark ? Colors.grey[850] : Colors.grey.withValues(alpha: 0.15),
    );
  }
}
