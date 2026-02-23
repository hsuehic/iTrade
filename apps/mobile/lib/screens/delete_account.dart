import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../widgets/copy_text.dart';

class DeleteAccountScreen extends StatefulWidget {
  final String userEmail;
  final VoidCallback onConfirm;

  const DeleteAccountScreen({
    super.key,
    required this.userEmail,
    required this.onConfirm,
  });

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  final TextEditingController _controller = TextEditingController();
  bool _isMatched = false;

  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final colorOnError = Theme.of(context).colorScheme.onError;

    return Scaffold(
      appBar: AppBar(
        title: CopyText('screen.exchange_accounts.delete_account', fallback: "Delete account", style: TextStyle(fontSize: 18.sp, color: colorOnError)),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).colorScheme.errorContainer,
        leading: IconButton(
          icon: Icon(Icons.chevron_left, color: colorOnError),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Padding(
        padding: EdgeInsets.all(24.w),  // ✅ Width-adapted
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CopyText('screen.delete_account.deleting_your_account_is_perma', fallback: "\u26a0\ufe0f Deleting your account is permanent.", style: TextStyle(
                fontSize: 14.sp,  // ✅ Adaptive font
                color: Theme.of(context).colorScheme.error,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            CopyText('screen.delete_account.please_type_your_email_address', fallback: "Please type your email address to confirm:", style: TextStyle(fontSize: 14.sp)),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              decoration: InputDecoration(
                labelText: 'Email address',
                hintText: widget.userEmail,
                border: const OutlineInputBorder(),
              ),
              onChanged: (value) {
                setState(() => _isMatched = value.trim() == widget.userEmail);
              },
            ),
            const Spacer(),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    child: CopyText('screen.login.cancel', fallback: "Cancel", style: TextStyle(fontSize: 14.sp)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: _isMatched
                          ? Theme.of(context).colorScheme.error
                          : Colors.grey.shade400,
                    ),
                    onPressed: _isMatched
                        ? () {
                            widget.onConfirm();
                            Navigator.pop(context);
                          }
                        : null,
                    child: CopyText('screen.strategy_detail.delete', fallback: "Delete", style: TextStyle(fontSize: 14.sp)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
