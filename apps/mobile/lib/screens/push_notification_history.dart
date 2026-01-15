import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../services/api_client.dart';

class PushNotificationHistoryItem {
  final String id;
  final DateTime createdAt;
  final String category;
  final String? title;
  final String? body;
  final Map<String, dynamic>? data;

  PushNotificationHistoryItem({
    required this.id,
    required this.createdAt,
    required this.category,
    required this.title,
    required this.body,
    required this.data,
  });

  factory PushNotificationHistoryItem.fromJson(Map<String, dynamic> json) {
    final notification = json['notification'];
    final notificationMap = notification is Map ? notification : null;
    final data = json['data'];
    final dataMap = data is Map ? Map<String, dynamic>.from(data) : null;

    return PushNotificationHistoryItem(
      id: json['id']?.toString() ?? '',
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      category: json['category']?.toString() ?? 'general',
      title: notificationMap?['title']?.toString(),
      body: notificationMap?['body']?.toString(),
      data: dataMap,
    );
  }
}

class PushNotificationHistoryScreen extends StatefulWidget {
  const PushNotificationHistoryScreen({super.key});

  @override
  State<PushNotificationHistoryScreen> createState() =>
      _PushNotificationHistoryScreenState();
}

class _PushNotificationHistoryScreenState
    extends State<PushNotificationHistoryScreen> {
  final List<PushNotificationHistoryItem> _items = [];
  bool _loading = false;
  bool _loadingMore = false;
  int _offset = 0;
  int _total = 0;
  static const int _limit = 30;

  String get _platform => Platform.isIOS ? 'ios' : 'android';
  String get _provider => 'fcm';

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _offset = 0;
      _items.clear();
    });
    try {
      await _fetchPage(offset: 0, append: false);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore) return;
    if (_items.length >= _total) return;
    setState(() => _loadingMore = true);
    try {
      await _fetchPage(offset: _offset, append: true);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _fetchPage({required int offset, required bool append}) async {
    if (!ApiClient.instance.isInitialized) return;

    final Response<dynamic> res = await ApiClient.instance.getJson<dynamic>(
      '/api/mobile/push/logs',
      queryParameters: <String, dynamic>{
        'platform': _platform,
        'provider': _provider,
        'limit': _limit,
        'offset': offset,
      },
      options: Options(
        followRedirects: false,
        validateStatus: (int? s) => s != null && s < 500,
      ),
    );

    if (res.statusCode != 200 || res.data is! Map) {
      return;
    }

    final Map<String, dynamic> body = res.data as Map<String, dynamic>;
    final dynamic logsRaw = body['logs'];
    final int total = (body['total'] as num?)?.toInt() ?? 0;

    final List<PushNotificationHistoryItem> page = <PushNotificationHistoryItem>[];
    if (logsRaw is List) {
      for (final item in logsRaw) {
        if (item is Map) {
          page.add(
            PushNotificationHistoryItem.fromJson(
              Map<String, dynamic>.from(item),
            ),
          );
        }
      }
    }

    if (!mounted) return;
    setState(() {
      _total = total;
      if (append) {
        _items.addAll(page);
      } else {
        _items
          ..clear()
          ..addAll(page);
      }
      _offset = _items.length;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notification History'),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _loading && _items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : _items.isEmpty
                ? ListView(
                    children: const [
                      SizedBox(height: 120),
                      Center(child: Text('No notifications yet.')),
                    ],
                  )
                : NotificationListener<ScrollNotification>(
                    onNotification: (n) {
                      if (n.metrics.pixels >= n.metrics.maxScrollExtent - 200) {
                        _loadMore();
                      }
                      return false;
                    },
                    child: ListView.separated(
                      itemCount: _items.length + (_loadingMore ? 1 : 0),
                      separatorBuilder: (context, index) =>
                          const Divider(height: 1),
                      itemBuilder: (context, index) {
                        if (index >= _items.length) {
                          return const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }

                        final item = _items[index];
                        final title = item.title?.trim().isNotEmpty == true
                            ? item.title!
                            : '(No title)';
                        final subtitle = item.body?.trim().isNotEmpty == true
                            ? item.body!
                            : '';

                        return ListTile(
                          title: Text(title),
                          subtitle: subtitle.isEmpty
                              ? Text('${item.category} • ${item.createdAt.toLocal()}')
                              : Text(
                                  '${item.category} • ${item.createdAt.toLocal()}\n$subtitle',
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                          isThreeLine: subtitle.isNotEmpty,
                          onTap: () {
                            showDialog<void>(
                              context: context,
                              builder: (_) => AlertDialog(
                                title: Text(title),
                                content: SingleChildScrollView(
                                  child: Text(
                                    [
                                      if (subtitle.isNotEmpty) subtitle,
                                      'Category: ${item.category}',
                                      'Time: ${item.createdAt.toLocal()}',
                                      if (item.data != null)
                                        'Data: ${item.data}',
                                    ].join('\n\n'),
                                  ),
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(context),
                                    child: const Text('Close'),
                                  ),
                                ],
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}

