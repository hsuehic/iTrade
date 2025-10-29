import 'package:flutter/material.dart';

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
        title: Text('Delete Account', style: TextStyle(color: colorOnError)),
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
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '⚠️ Deleting your account is permanent.',
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            const Text('Please type your email address to confirm:'),
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
                    child: const Text('Cancel'),
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
                    child: const Text('Delete'),
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
