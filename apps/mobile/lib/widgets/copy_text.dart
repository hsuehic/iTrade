import 'package:firebase_auth/firebase_auth.dart' as firebase_auth;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/copy_service.dart';
import '../services/dynamic_config_service.dart';

class CopyText extends StatelessWidget {
  const CopyText(
    this.copyKey, {
    super.key,
    this.style,
    this.textAlign,
    this.maxLines,
    this.overflow,
    this.params,
    this.fallback,
  });

  const CopyText.raw(
    String text, {
    Key? key,
    TextStyle? style,
    TextAlign? textAlign,
    int? maxLines,
    TextOverflow? overflow,
  }) : this(
          text,
          key: key,
          style: style,
          textAlign: textAlign,
          maxLines: maxLines,
          overflow: overflow,
          fallback: text,
        );

  final String copyKey;
  final TextStyle? style;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;
  final Map<String, String>? params;
  final String? fallback;

  @override
  Widget build(BuildContext context) {
    final service = CopyService.instance;
    final text = service.t(copyKey, params: params);
    final display = text == copyKey && fallback != null ? fallback! : text;
    final base = Text(
      display,
      style: style,
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: overflow,
    );
    if (!service.copyKeyLongPressEnabled) {
      return base;
    }
    final configService = DynamicConfigService.instance;
    final editorUser = firebase_auth.FirebaseAuth.instance.currentUser;
    final editorEmail = editorUser?.email;
    final isAdmin = configService.isCopyAdmin(editorEmail);
    final hasEditorSession = editorUser != null;
    return GestureDetector(
      onLongPress: () async {
        if (!isAdmin) {
          await Clipboard.setData(ClipboardData(text: copyKey));
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: CopyText(
                'copy.key.copied',
                params: {'key': copyKey},
                fallback: 'Copied key: {{key}}',
              ),
            ),
          );
          return;
        }
        if (!context.mounted) return;
        if (!hasEditorSession) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: CopyText('copy.admin.login_required', fallback: "Please login to edit copy", ),
            ),
          );
          return;
        }
        final rootContext = context;
        await showModalBottomSheet<void>(
          context: rootContext,
          useRootNavigator: true,
          builder: (context) {
            return SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ListTile(
                    leading: const Icon(Icons.copy),
                    title: const CopyText('copy.key.copy', fallback: "Copy key", ),
                    onTap: () async {
                      await Clipboard.setData(ClipboardData(text: copyKey));
                      if (!context.mounted) return;
                      Navigator.of(context).pop();
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: CopyText(
                            'copy.key.copied',
                            params: {'key': copyKey},
                            fallback: 'Copied key: {{key}}',
                          ),
                        ),
                      );
                    },
                  ),
                  ListTile(
                    leading: const Icon(Icons.edit),
                    title: const CopyText('copy.admin.edit', fallback: "Edit text", ),
                    onTap: () async {
                      Navigator.of(context).pop();
                      await _showEditDialog(rootContext, copyKey);
                    },
                  ),
                ],
              ),
            );
          },
        );
      },
      child: base,
    );
  }

  Future<void> _showEditDialog(
    BuildContext context,
    String key,
  ) async {
    final service = DynamicConfigService.instance;
    final copyService = CopyService.instance;
    final hintText = copyService.t(
      'copy.admin.edit_hint',
      fallback: 'Enter new text',
    );
    final currentLocaleTag = copyService.currentLocaleTag;
    final controllers = <String, TextEditingController>{};
    var initialized = false;
    final saving = <String, bool>{};
    final rootMessenger = ScaffoldMessenger.of(context);
    final snapshotFuture = service.fetchCopyEditSnapshot(key);
    await showDialog<void>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return FutureBuilder<CopyEditSnapshot?>(
              future: snapshotFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const AlertDialog(
                    title: CopyText('copy.admin.edit_title', fallback: "Edit copy", ),
                    content: SizedBox(
                      height: 56,
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  );
                }
                final data = snapshot.data;
                if (data == null) {
                  return AlertDialog(
                    title: const CopyText('copy.admin.edit_title', fallback: "Edit copy", ),
                    content: const CopyText('copy.admin.update_failed', fallback: "Update failed", ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const CopyText('copy.admin.cancel', fallback: "Cancel", ),
                      ),
                    ],
                  );
                }
                if (!initialized) {
                  final orderedTags = <String>[
                    if (data.localeTags.contains(currentLocaleTag))
                      currentLocaleTag,
                    ...data.localeTags
                        .where((tag) => tag != currentLocaleTag)
                        .toList()
                      ..sort(),
                  ];
                  for (final localeTag in orderedTags) {
                    controllers[localeTag] = TextEditingController(
                      text: data.values[localeTag] ?? '',
                    );
                    saving[localeTag] = false;
                  }
                  initialized = true;
                }
                final localeTags = controllers.keys.toList();
                return AlertDialog(
                  title: const CopyText('copy.admin.edit_title', fallback: "Edit copy", ),
                  content: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final localeTag in localeTags)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: controllers[localeTag],
                                    maxLines: null,
                                    decoration: InputDecoration(
                                      labelText: localeTag,
                                      hintText: hintText,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                IconButton(
                                  onPressed: (saving[localeTag] ?? false)
                                      ? null
                                      : () async {
                                          final value = controllers[localeTag]!
                                              .text
                                              .trim();
                                          if (value.isEmpty) {
                                            if (!context.mounted) return;
                                            rootMessenger.showSnackBar(
                                              SnackBar(
                                                content: CopyText('copy.admin.edit_hint', fallback: "Enter new text", ),
                                              ),
                                            );
                                            return;
                                          }
                                          setState(() {
                                            saving[localeTag] = true;
                                          });
                                          final ok =
                                              await service.updateCopyValueForLocale(
                                            key: key,
                                            value: value,
                                            localeTag: localeTag,
                                            copyService: copyService,
                                          );
                                          if (!context.mounted) return;
                                          setState(() {
                                            saving[localeTag] = false;
                                          });
                                          if (ok) {
                                            rootMessenger.showSnackBar(
                                              const SnackBar(
                                                content: CopyText('copy.admin.updated', fallback: "Copy updated", ),
                                              ),
                                            );
                                          } else {
                                            rootMessenger.showSnackBar(
                                              const SnackBar(
                                                content: CopyText('copy.admin.update_failed', fallback: "Update failed", ),
                                              ),
                                            );
                                          }
                                        },
                                  icon: saving[localeTag] ?? false
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.save_outlined),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const CopyText('copy.admin.cancel', fallback: "Cancel", ),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }
}
