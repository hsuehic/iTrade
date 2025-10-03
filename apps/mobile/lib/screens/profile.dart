import 'dart:typed_data';
import 'dart:convert';
import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/preference.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _signingOut = false;
  bool _notificationsEnabled = true;
  bool _enableFaceId = true;
  final AuthService _authService = AuthService.instance;

  Future<void> _loadSetting() async {
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    final biometricEnabled = await Preference.getBiometricEnabled();
    setState(() {
      _notificationsEnabled = notificationsEnabled ?? false;
      _enableFaceId = biometricEnabled ?? false;
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

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        children: [
          ListTile(
            leading: CircleAvatar(
              backgroundImage: image != null
                  ? image.startsWith('data:image/')
                        ? MemoryImage(
                            Uint8List.fromList(
                              base64Decode(image.split(',').last),
                            ),
                          )
                        : NetworkImage(_authService.user!.image!)
                  : null,
              child: image == null ? const Icon(Icons.person) : null,
            ),
            title: Text(_authService.user?.name ?? 'User'),
            subtitle: Text(_authService.user?.email ?? 'Signed in'),
          ),
          const Divider(height: 1),
          SwitchListTile(
            title: const Text('Enable notifications'),
            value: _notificationsEnabled,
            onChanged: (v) {
              setState(() => _notificationsEnabled = v);
              Preference.setNotificationsEnabled(v);
            },
            secondary: const Icon(Icons.notifications_active_outlined),
          ),
          const Divider(height: 1),
          SwitchListTile(
            title: const Text('Enable Face ID'),
            value: _enableFaceId,
            onChanged: (v) {
              setState(() => _enableFaceId = v);
              Preference.setBiometricEnabled(v);
            },
            secondary: const Icon(Icons.fingerprint),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('About'),
            subtitle: const Text('iTrade mobile app'),
            onTap: () => showAboutDialog(
              context: context,
              applicationName: 'iTrade',
              applicationVersion: '1.0.0',
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              height: 48,
              child: FilledButton.icon(
                onPressed: _signingOut ? null : _signOut,
                icon: const Icon(Icons.logout),
                label: Text(_signingOut ? 'Signing out...' : 'Sign out'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
