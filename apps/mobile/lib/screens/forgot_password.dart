import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:ihsueh_itrade/services/api_client.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  bool _submitting = false;
  String? _error;
  bool _sent = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ApiClient.instance.postJson(
        '/api/auth/request-password-reset',
        data: <String, dynamic>{
          'email': _emailController.text.trim(),
          'redirectTo': '/auth/reset-password',
        },
      );
      if (!mounted) return;
      setState(() {
        _sent = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to send reset email';
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Forgot Password'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _sent
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const SizedBox(height: 24),
                    Icon(
                      Icons.mark_email_read_outlined,
                      size: 72.w,  // ✅ Uniform scaling
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Check your email',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontSize: 22.sp,  // ✅ Adaptive font
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'We sent a password reset link to ${_emailController.text.trim()}.',
                      textAlign: TextAlign.center,
                    ),
                    const Spacer(),
                    FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Back to Sign In'),
                    ),
                  ],
                )
              : Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      const SizedBox(height: 24),
                      Text(
                      'Forgot your password?',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontSize: 22.sp,  // ✅ Adaptive font
                        fontWeight: FontWeight.bold,
                      ),
                        textAlign: TextAlign.left,
                      ),
                      const SizedBox(height: 8),
                      Text(
                      'Enter your email address and we\'ll send you a reset link.',
                      style: theme.textTheme.bodyMedium?.copyWith(fontSize: 14.sp),  // ✅ Adaptive font
                      ),
                      const SizedBox(height: 16),
                      if (_error != null)
                        Text(
                          _error!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 14.sp,  // ✅ Adaptive font
                            color: theme.colorScheme.error,
                          ),
                        ),
                      TextFormField(
                        controller: _emailController,
                        enabled: !_submitting,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email address',
                          prefixIcon: Icon(Icons.email_outlined),
                        ),
                        validator: (String? value) {
                          final String v = (value ?? '').trim();
                          if (v.isEmpty) return 'Email is required';
                          if (!v.contains('@')) return 'Enter a valid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          onPressed: _submitting ? null : _submit,
                          child: Text(
                            _submitting ? 'Sending...' : 'Send reset link',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}
