import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/api_client.dart';
import '../services/copy_service.dart';
import '../widgets/copy_text.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _isLoading = false;
  bool _obscureCurrentPassword = true;
  bool _obscureNewPassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isLoading = true);

    try {
      final response = await ApiClient.instance.postJson(
        '/api/mobile/change-password',
        data: {
          'currentPassword': _currentPasswordController.text,
          'newPassword': _newPasswordController.text,
        },
      );

      if (!mounted) return;

      final data = response.data;
      final success = data['success'] ?? false;

      if (success) {
        // Show success message
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CopyText('screen.change_password.password_changed_successfully', fallback: "Password updated."),
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

        // Go back to profile screen
        Navigator.of(context).pop();
      } else {
        // Show error message
        final message = data['message'] ?? 'Failed to change password';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
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
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = Theme.of(context).colorScheme.primary;
    final copy = CopyService.instance;

    return Scaffold(
      appBar: AppBar(
        title: CopyText('screen.change_password.change_password', fallback: "Change password"),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header Card with gradient
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [primaryColor.withValues(alpha: 0.8), primaryColor],
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
                child: Column(
                  children: [
                    Icon(Icons.lock_reset, size: 48, color: Colors.white),
                    const SizedBox(height: 12),
                    CopyText('screen.change_password.secure_your_account', fallback: "Secure your account", style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    CopyText('screen.change_password.choose_a_strong_password_to_pr', fallback: "Choose a strong password to protect your account", textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.white.withValues(alpha: 0.9),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Current Password Field
              _buildPasswordField(
                controller: _currentPasswordController,
                label: copy.t(
                  'screen.change_password.current_password',
                  fallback: 'Current password',
                ),
                hint: copy.t(
                  'screen.change_password.current_password_hint',
                  fallback: 'Enter your current password',
                ),
                obscureText: _obscureCurrentPassword,
                onToggleVisibility: () {
                  setState(
                    () => _obscureCurrentPassword = !_obscureCurrentPassword,
                  );
                },
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return copy.t(
                      'screen.change_password.current_password_required',
                      fallback: 'Please enter your current password',
                    );
                  }
                  return null;
                },
                isDark: isDark,
              ),
              const SizedBox(height: 16),

              // New Password Field
              _buildPasswordField(
                controller: _newPasswordController,
                label: copy.t(
                  'screen.change_password.new_password',
                  fallback: 'New password',
                ),
                hint: copy.t(
                  'screen.change_password.new_password_hint',
                  fallback: 'Enter your new password',
                ),
                obscureText: _obscureNewPassword,
                onToggleVisibility: () {
                  setState(() => _obscureNewPassword = !_obscureNewPassword);
                },
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return copy.t(
                      'screen.change_password.new_password_required',
                      fallback: 'Please enter a new password',
                    );
                  }
                  if (value.length < 8) {
                    return copy.t(
                      'screen.change_password.password_min_length',
                      fallback: 'Password must be at least 8 characters',
                    );
                  }
                  if (value == _currentPasswordController.text) {
                    return copy.t(
                      'screen.change_password.new_password_diff',
                      fallback:
                          'New password must be different from current password',
                    );
                  }
                  return null;
                },
                isDark: isDark,
              ),
              const SizedBox(height: 16),

              // Confirm Password Field
              _buildPasswordField(
                controller: _confirmPasswordController,
                label: copy.t(
                  'screen.change_password.confirm_new_password',
                  fallback: 'Confirm new password',
                ),
                hint: copy.t(
                  'screen.change_password.confirm_new_password_hint',
                  fallback: 'Re-enter your new password',
                ),
                obscureText: _obscureConfirmPassword,
                onToggleVisibility: () {
                  setState(
                    () => _obscureConfirmPassword = !_obscureConfirmPassword,
                  );
                },
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return copy.t(
                      'screen.change_password.confirm_password_required',
                      fallback: 'Please confirm your new password',
                    );
                  }
                  if (value != _newPasswordController.text) {
                    return copy.t(
                      'screen.change_password.passwords_not_match',
                      fallback: 'Passwords do not match',
                    );
                  }
                  return null;
                },
                isDark: isDark,
              ),
              const SizedBox(height: 24),

              // Password Requirements
                  Container(
                    padding: EdgeInsets.all(16.w),
                    decoration: BoxDecoration(
                      color: isDark
                          ? Colors.grey[900]
                          : Colors.blue.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDark
                        ? Colors.grey[800]!
                        : Colors.blue.withValues(alpha: 0.1),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.info_outline,
                          size: 18,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        const SizedBox(width: 8),
                        CopyText('screen.change_password.password_requirements', fallback: "Password requirements", style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _buildRequirement('At least 8 characters'),
                    _buildRequirement('Different from current password'),
                    _buildRequirement(
                      'Recommended: mix of letters, numbers & symbols',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Change Password Button
              SizedBox(
                height: 50,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _changePassword,
                  style: ElevatedButton.styleFrom(
                        backgroundColor: primaryColor,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 2,
                  ),
                  child:                       _isLoading
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
                      : CopyText('screen.change_password.change_password', fallback: "Change password", style: TextStyle(
                            fontSize: 16.sp,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 16),

              // Cancel Button
              SizedBox(
                height: 50,
                child: OutlinedButton(
                  onPressed: _isLoading
                      ? null
                      : () => Navigator.of(context).pop(),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: isDark
                        ? Colors.grey[300]
                        : Colors.grey[700],
                    side: BorderSide(
                      color: isDark ? Colors.grey[700]! : Colors.grey[300]!,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: CopyText('screen.login.cancel', fallback: "Cancel", style: TextStyle(fontSize: 16.sp, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPasswordField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required bool obscureText,
    required VoidCallback onToggleVisibility,
    required String? Function(String?) validator,
    required bool isDark,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
      Padding(
        padding: EdgeInsets.only(left: 4.w, bottom: 8),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14.sp,
            fontWeight: FontWeight.w600,
              color: isDark ? Colors.grey[300] : Colors.grey[700],
            ),
          ),
        ),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          validator: validator,
          decoration: InputDecoration(
        isDense: true,
        contentPadding: EdgeInsets.symmetric(
          vertical: 10,
          horizontal: 12.w,
        ),
            hintText: hint,
            prefixIcon: Icon(
              Icons.lock_outline,
              color: Theme.of(context).colorScheme.primary,
            ),
            suffixIcon: IconButton(
              icon: Icon(
                obscureText
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
                color: Colors.grey[600],
              ),
              onPressed: onToggleVisibility,
            ),
            filled: true,
            fillColor: isDark
                ? Colors.grey[900]
                : Colors.white.withValues(alpha: 0.5),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
                color: isDark
                    ? Colors.grey[800]!
                    : Colors.grey.withValues(alpha: 0.2),
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: isDark
                    ? Colors.grey[800]!
                    : Colors.grey.withValues(alpha: 0.2),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: Theme.of(context).colorScheme.primary,
                width: 2,
              ),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Colors.red, width: 1),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Colors.red, width: 2),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRequirement(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(Icons.check_circle_outline, size: 16, color: Colors.grey[600]),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
            ),
          ),
        ],
      ),
    );
  }
}
