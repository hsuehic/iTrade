import 'package:flutter/material.dart';
import 'package:ihsueh_itrade/services/api_client.dart';
import 'package:ihsueh_itrade/services/auth_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _signingOut = false;
  bool _notificationsEnabled = true;

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    try {
      // Best effort: inform server to clear session if endpoint exists
      try {
        await ApiClient.instance.postJson('/api/auth/logout');
      } catch (err) {
        print('Failed to logout: $err');
      }
      await ApiClient.instance.clearCookies();
      await AuthService.instance.signOut();
      if (!mounted) return;
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        children: [
          const ListTile(
            leading: CircleAvatar(child: Icon(Icons.person)),
            title: Text('User'),
            subtitle: Text('Signed in'),
          ),
          const Divider(height: 1),
          SwitchListTile(
            title: const Text('Enable notifications'),
            value: _notificationsEnabled,
            onChanged: (v) => setState(() => _notificationsEnabled = v),
            secondary: const Icon(Icons.notifications_active_outlined),
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
