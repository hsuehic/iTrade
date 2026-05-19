import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../models/chat_message.dart';
import 'api_client.dart';

// ── SSE event model ───────────────────────────────────────────────────────────

/// A parsed Server-Sent Event from the /api/chat stream.
class ChatStreamEvent {
  final String type;
  final Map<String, dynamic> data;

  const ChatStreamEvent({required this.type, required this.data});
}

// ── Service ───────────────────────────────────────────────────────────────────

/// Service for sending messages to the AI chatbot API via Server-Sent Events.
///
/// Call [sendMessageStream] to obtain a [Stream<ChatStreamEvent>] and listen to:
///
///   type: "token"       — { "text": "…" }  incremental text delta
///   type: "render_data" — RenderData JSON  chart / table / strategy_proposal
///   type: "done"        — { "cleanText": "…" }  final clean text (JSON stripped)
///   type: "error"       — { "message": "…", "status": int? }
class ChatService {
  ChatService._internal();
  static final ChatService instance = ChatService._internal();

  final ApiClient _apiClient = ApiClient.instance;

  /// Stream the AI response for [message] with the given [history].
  ///
  /// The stream emits [ChatStreamEvent] objects as SSE frames arrive and closes
  /// when the server sends the "done" or "error" event (or on connection error).
  ///
  /// Pass a [CancelToken] to cancel mid-stream (e.g. when the user navigates away).
  Stream<ChatStreamEvent> sendMessageStream({
    required String message,
    required List<ChatMessage> history,
    CancelToken? cancelToken,
  }) {
    // Convert history to the wire format the API expects.
    final historyPayload = history
        .where((m) => !m.isLoading && !m.isStreaming && m.id != 'welcome')
        .map((m) => {
              'role': m.role == MessageRole.assistant ? 'model' : 'user',
              'content': m.content,
            })
        .toList();

    // Use a StreamController so we can push events asynchronously.
    late StreamController<ChatStreamEvent> controller;

    Future<void> startStream() async {
      try {
        final response = await _apiClient.dio.post<ResponseBody>(
          '/api/chat',
          data: {
            'message': message,
            'history': historyPayload,
          },
          options: Options(
            responseType: ResponseType.stream,
            headers: {'Accept': 'text/event-stream'},
            // Agentic loops may take up to 120 s on the server; give 130 s here.
            receiveTimeout: const Duration(seconds: 130),
            sendTimeout: const Duration(seconds: 30),
          ),
          cancelToken: cancelToken,
        );

        final stream = response.data!.stream;
        String buffer = '';

        await for (final chunk in stream) {
          if (controller.isClosed) break;

          buffer += utf8.decode(chunk);

          // SSE events are separated by double newlines.
          final parts = buffer.split('\n\n');
          buffer = parts.removeLast(); // keep trailing incomplete event

          for (final part in parts) {
            if (part.trim().isEmpty) continue;

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

            late Map<String, dynamic> parsedData;
            try {
              parsedData = jsonDecode(dataStr) as Map<String, dynamic>;
            } catch (_) {
              continue; // Skip malformed frames
            }

            controller.add(ChatStreamEvent(type: eventType, data: parsedData));

            // Close the stream after terminal events
            if (eventType == 'done' || eventType == 'error') {
              await controller.close();
              return;
            }
          }
        }

        // Stream ended without a done/error event — close gracefully
        if (!controller.isClosed) await controller.close();
      } on DioException catch (e) {
        if (controller.isClosed) return;

        final body = e.response?.data;
        final serverMsg = (body is Map ? body['error'] : null) as String?;

        String errorMsg;
        switch (e.type) {
          case DioExceptionType.connectionTimeout:
          case DioExceptionType.sendTimeout:
          case DioExceptionType.receiveTimeout:
            errorMsg = 'Request timed out. Please try again.';
            break;
          case DioExceptionType.connectionError:
            errorMsg = 'No connection. Please check your network.';
            break;
          case DioExceptionType.cancel:
            // Intentional cancellation — close silently
            await controller.close();
            return;
          default:
            final code = e.response?.statusCode;
            errorMsg = serverMsg ??
                (code != null ? 'Chat request failed (HTTP $code).' : 'Something went wrong.');
        }

        controller.add(ChatStreamEvent(
          type: 'error',
          data: {'message': errorMsg},
        ));
        await controller.close();
      } catch (e) {
        if (!controller.isClosed) {
          controller.add(ChatStreamEvent(
            type: 'error',
            data: {'message': 'Unexpected error: ${e.toString()}'},
          ));
          await controller.close();
        }
      }
    }

    controller = StreamController<ChatStreamEvent>(
      onListen: () => startStream(),
      onCancel: () {
        cancelToken?.cancel('Stream cancelled by listener');
      },
    );

    return controller.stream;
  }
}
