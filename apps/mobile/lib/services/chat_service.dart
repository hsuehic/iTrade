import 'package:dio/dio.dart';
import '../models/chat_message.dart';
import 'api_client.dart';

/// Response returned by POST /api/chat
class ChatResponse {
  final String message;
  final RenderData? renderData;

  const ChatResponse({required this.message, this.renderData});
}

/// Service for sending messages to the AI chatbot API.
///
/// Wraps POST /api/chat with:
///   { message: string, history: Array<{role, content}> }
///
/// Returns ChatResponse with optional structured renderData for
/// charts, tables, and strategy proposals.
class ChatService {
  ChatService._internal();
  static final ChatService instance = ChatService._internal();

  final ApiClient _apiClient = ApiClient.instance;

  /// Send [message] with the current [history] to the AI chatbot.
  ///
  /// [history] should exclude the current message and any loading placeholders.
  /// Roles must be 'user' or 'model' (server expects Gemini-legacy format).
  Future<ChatResponse> sendMessage({
    required String message,
    required List<ChatMessage> history,
  }) async {
    // Convert history to the wire format the API expects.
    // The API maps role='model' → 'assistant' internally, so we send 'model'
    // for assistant messages to match the existing web client contract.
    final historyPayload = history
        .where((m) => !m.isLoading && m.id != 'welcome')
        .map((m) => {
              'role': m.role == MessageRole.assistant ? 'model' : 'user',
              'content': m.content,
            })
        .toList();

    try {
      final Response response = await _apiClient.postJson(
        '/api/chat',
        data: {
          'message': message,
          'history': historyPayload,
        },
        options: Options(
          // Chat can take up to 120 s on the server side (agentic loop).
          receiveTimeout: const Duration(seconds: 130),
          sendTimeout: const Duration(seconds: 30),
        ),
      );

      final body = response.data as Map<String, dynamic>;

      // Server returned an error payload with 200 status (rare, but handle it).
      if (body['error'] != null) {
        throw Exception(body['error'] as String);
      }

      RenderData? renderData;
      if (body['renderData'] is Map<String, dynamic>) {
        renderData =
            RenderData.fromJson(body['renderData'] as Map<String, dynamic>);
      }

      return ChatResponse(
        message: (body['message'] as String?) ?? '',
        renderData: renderData,
      );
    } on DioException catch (e) {
      // Dio throws for 4xx/5xx — extract the server's JSON error message.
      final body = e.response?.data;
      final serverMsg = (body is Map ? body['error'] : null) as String?;
      if (serverMsg != null) throw Exception(serverMsg);

      // Fall back to connection-level messages.
      switch (e.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          throw Exception('Request timed out. Please try again.');
        case DioExceptionType.connectionError:
          throw Exception('No connection. Please check your network.');
        default:
          final code = e.response?.statusCode;
          throw Exception(
            code != null ? 'Chat request failed (HTTP $code).' : 'Something went wrong.',
          );
      }
    }
  }
}
