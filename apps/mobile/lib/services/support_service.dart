import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import 'api_client.dart';

// ── Models ────────────────────────────────────────────────────────────────────

/// A single message in a live-support session.
class SupportMessage {
  final String id;
  final String role; // "user" | "supporter"
  final String content;
  final DateTime createdAt;

  const SupportMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
  });

  factory SupportMessage.fromJson(Map<String, dynamic> json) {
    return SupportMessage(
      id: json['id'] as String,
      role: json['role'] as String? ?? 'supporter',
      content: json['content'] as String? ?? '',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

/// Events emitted by [SupportService.streamMessages].
sealed class SupportStreamEvent {}

class SupportMessageEvent extends SupportStreamEvent {
  final SupportMessage message;
  SupportMessageEvent(this.message);
}

class SupportSessionClosedEvent extends SupportStreamEvent {}

// ── Service ───────────────────────────────────────────────────────────────────

/// Service for the live human-agent support chat.
///
/// Flow:
///   1. Call [createSession] to open a new support session and get a sessionId.
///   2. Call [streamMessages] to subscribe to incoming supporter messages via SSE.
///   3. Call [sendMessage] to send user messages.
///   4. Call [closeSession] when the user ends the conversation.
///
/// The SSE stream ([streamMessages]) emits:
///   - [SupportMessageEvent]      — a new message (may be user or supporter)
///   - [SupportSessionClosedEvent] — session was closed server-side
class SupportService {
  SupportService._internal();
  static final SupportService instance = SupportService._internal();

  final ApiClient _apiClient = ApiClient.instance;

  // ── Session lifecycle ───────────────────────────────────────────────────────

  /// Create a new support session.
  /// Returns the sessionId to use in all subsequent calls.
  Future<String> createSession({String locale = 'en'}) async {
    final response = await _apiClient.postJson<Map<String, dynamic>>(
      '/api/support/session',
      data: {'locale': locale},
      options: Options(receiveTimeout: const Duration(seconds: 15)),
    );
    final body = response.data!;
    final sessionId = body['sessionId'] as String?;
    if (sessionId == null || sessionId.isEmpty) {
      throw Exception('Failed to create support session: missing sessionId');
    }
    return sessionId;
  }

  /// Send a user message to the support session.
  Future<void> sendMessage({
    required String sessionId,
    required String content,
  }) async {
    final response = await _apiClient.postJson<Map<String, dynamic>>(
      '/api/support/$sessionId/send',
      data: {'content': content},
      options: Options(
        receiveTimeout: const Duration(seconds: 10),
        sendTimeout: const Duration(seconds: 10),
      ),
    );
    final body = response.data;
    if (body != null && body['error'] != null) {
      throw Exception(body['error'] as String);
    }
  }

  /// Close the support session.
  Future<void> closeSession(String sessionId) async {
    try {
      await _apiClient.postJson<void>(
        '/api/support/$sessionId/close',
        options: Options(receiveTimeout: const Duration(seconds: 10)),
      );
    } catch (_) {
      // Best-effort — the session will expire server-side anyway
    }
  }

  // ── SSE stream ──────────────────────────────────────────────────────────────

  /// Subscribe to the live-support SSE stream for [sessionId].
  ///
  /// Emits historical messages (catch-up) on connect, then live events as they
  /// arrive. Closes when the session is closed or the connection drops.
  ///
  /// Pass a [CancelToken] to disconnect explicitly (e.g. on screen dispose).
  Stream<SupportStreamEvent> streamMessages({
    required String sessionId,
    CancelToken? cancelToken,
  }) {
    late StreamController<SupportStreamEvent> controller;

    Future<void> startStream() async {
      try {
        final response = await _apiClient.dio.get<ResponseBody>(
          '/api/support/$sessionId/stream',
          options: Options(
            responseType: ResponseType.stream,
            headers: {'Accept': 'text/event-stream'},
            // Keep-alive SSE — no receive timeout (stream stays open)
            receiveTimeout: null,
            sendTimeout: const Duration(seconds: 10),
          ),
          cancelToken: cancelToken,
        );

        final stream = response.data!.stream;
        String buffer = '';

        await for (final chunk in stream) {
          if (controller.isClosed) break;

          buffer += utf8.decode(chunk);

          // SSE events are separated by double newlines
          final parts = buffer.split('\n\n');
          buffer = parts.removeLast();

          for (final part in parts) {
            // Skip keepalive comments (lines starting with ':')
            if (part.trim().isEmpty || part.trim().startsWith(':')) continue;

            String eventType = 'message';
            String dataStr = '';

            for (final line in part.split('\n')) {
              if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
              } else if (line.startsWith('data: ')) {
                dataStr = line.substring(6);
              }
            }

            if (dataStr.isEmpty) continue;

            if (eventType == 'session_closed') {
              controller.add(SupportSessionClosedEvent());
              await controller.close();
              return;
            }

            if (eventType == 'message') {
              try {
                final json = jsonDecode(dataStr) as Map<String, dynamic>;
                controller.add(SupportMessageEvent(SupportMessage.fromJson(json)));
              } catch (_) {
                // Malformed frame — skip
              }
            }
          }
        }

        if (!controller.isClosed) await controller.close();
      } on DioException catch (e) {
        if (controller.isClosed) return;
        if (e.type == DioExceptionType.cancel) {
          await controller.close();
          return;
        }
        // For network errors, close the stream — the UI can offer a reconnect
        await controller.close();
      } catch (_) {
        if (!controller.isClosed) await controller.close();
      }
    }

    controller = StreamController<SupportStreamEvent>(
      onListen: () => startStream(),
      onCancel: () => cancelToken?.cancel('Support stream cancelled'),
    );

    return controller.stream;
  }
}
