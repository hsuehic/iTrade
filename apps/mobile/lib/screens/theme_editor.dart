import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../services/dynamic_config_models.dart';
import '../services/dynamic_config_service.dart';
import '../services/theme_service.dart';
import '../widgets/copy_text.dart';

class ThemeEditorScreen extends StatefulWidget {
  const ThemeEditorScreen({super.key});

  @override
  State<ThemeEditorScreen> createState() => _ThemeEditorScreenState();
}

class _ThemeEditorScreenState extends State<ThemeEditorScreen> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _docPath;
  Map<String, dynamic>? _doc;
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final doc = await DynamicConfigService.instance.fetchThemeDoc();
    if (!mounted) return;
    if (doc == null) {
      setState(() {
        _loading = false;
        _error = 'Failed to load theme config.';
      });
      return;
    }
    _doc = Map<String, dynamic>.from(doc);
    _docPath = DynamicConfigService.instance.currentThemeDocPath;
    _controller.text = const JsonEncoder.withIndent('  ').convert(_doc);
    setState(() => _loading = false);
  }

  void _applyPreview() {
    try {
      final parsed = jsonDecode(_controller.text) as Map<String, dynamic>;
      final config = parseThemeConfig(parsed);
      ThemeService.instance.applyRemoteTheme(
        light: config.light,
        dark: config.dark,
        version: config.version,
      );
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: CopyText('theme.admin.preview_applied', fallback: "Preview applied", ),
        ),
      );
    } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CopyText(
              'screen.theme_editor.invalid_json',
              params: {'error': e.toString()},
              fallback: 'Invalid JSON: {{error}}',
            ),
          ),
        );
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final parsed = jsonDecode(_controller.text) as Map<String, dynamic>;
      final ok = await DynamicConfigService.instance.updateThemeDoc(
        themeDoc: parsed,
      );
      if (!mounted) return;
      if (ok) {
        _doc = Map<String, dynamic>.from(parsed);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: CopyText('theme.admin.updated', fallback: "Theme updated", ),
          ),
        );
      } else {
        setState(() => _error = 'Permission denied or save failed.');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Failed to save: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final isAdmin = DynamicConfigService.instance.isThemeAdmin(user?.email);
    return Scaffold(
      appBar: AppBar(
        title: const CopyText('page.theme_editor', fallback: "Theme editor", ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _applyPreview,
            icon: const Icon(Icons.visibility),
            tooltip: 'Preview',
          ),
          IconButton(
            onPressed: _loading || _saving ? null : _save,
            icon: const Icon(Icons.save_outlined),
            tooltip: 'Save',
          ),
        ],
      ),
      body: !isAdmin
          ? const Center(
              child: CopyText('theme.admin.not_authorized', fallback: "Not authorized.", ),
            )
          : _loading
              ? const Center(child: CircularProgressIndicator())
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      if (_docPath != null)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: CopyText(
                            'screen.theme_editor.path',
                            params: {'path': _docPath ?? ''},
                            fallback: 'Path: {{path}}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      if (_error != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          _error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ],
                      const SizedBox(height: 12),
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          maxLines: null,
                          expands: true,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                          ),
                          style: const TextStyle(fontFamily: 'monospace'),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
