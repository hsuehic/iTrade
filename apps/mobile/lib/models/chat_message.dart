/// Data models for the AI chatbot feature.
///
/// These mirror the API response shape from POST /api/chat:
///   { message: string, renderData: RenderData | null }

enum RenderType { table, chart, text, strategyProposal }

/// Structured render payload attached to an assistant message.
class RenderData {
  final RenderType renderAs;
  final String? title;
  final dynamic data;
  final dynamic chartConfig;

  const RenderData({
    required this.renderAs,
    this.title,
    this.data,
    this.chartConfig,
  });

  factory RenderData.fromJson(Map<String, dynamic> json) {
    final renderAsStr = json['renderAs'] as String? ?? 'text';
    final RenderType renderAs;
    switch (renderAsStr) {
      case 'table':
        renderAs = RenderType.table;
        break;
      case 'chart':
        renderAs = RenderType.chart;
        break;
      case 'strategy_proposal':
        renderAs = RenderType.strategyProposal;
        break;
      default:
        renderAs = RenderType.text;
    }
    return RenderData(
      renderAs: renderAs,
      title: json['title'] as String?,
      data: json['data'],
      chartConfig: json['chartConfig'],
    );
  }
}

enum MessageRole { user, assistant }

/// A single chat message in the conversation.
class ChatMessage {
  final String id;
  final MessageRole role;
  final String content;
  final RenderData? renderData;
  final DateTime timestamp;

  /// True while waiting for the first token — shows loading dots.
  final bool isLoading;

  /// True while SSE tokens are actively streaming in — shows blinking cursor.
  final bool isStreaming;

  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    this.renderData,
    required this.timestamp,
    this.isLoading = false,
    this.isStreaming = false,
  });

  ChatMessage copyWith({
    String? content,
    RenderData? renderData,
    bool? isLoading,
    bool? isStreaming,
  }) {
    return ChatMessage(
      id: id,
      role: role,
      content: content ?? this.content,
      renderData: renderData ?? this.renderData,
      timestamp: timestamp,
      isLoading: isLoading ?? this.isLoading,
      isStreaming: isStreaming ?? this.isStreaming,
    );
  }
}
