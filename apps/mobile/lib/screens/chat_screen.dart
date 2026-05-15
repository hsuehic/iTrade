import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../models/chat_message.dart';
import '../services/auth_service.dart';
import '../services/chat_service.dart';
import '../widgets/chat/chat_message_bubble.dart';
import '../widgets/voice_input_button.dart';

// ── Suggested questions ────────────────────────────────────────────────────────

const _suggestedQuestions = [
  'How much did I earn last month?',
  "What's my most profitable strategy?",
  'Create a SpreadGrid for BTC/USDT on Binance',
  'Set up a MovingAverage strategy for ETH on OKX',
  'Which token made me the most money?',
  'Show my recent orders',
];

/// Build a personalised welcome text using the user's first name.
/// Falls back gracefully if the name is unavailable.
String _buildWelcomeText(String? fullName) {
  // Extract first name: take everything before the first space.
  final firstName = (fullName ?? '').trim().split(' ').first;
  final greeting = firstName.isNotEmpty ? 'Hi **$firstName**!' : 'Hi there!';
  return "$greeting I'm **iTrade AI** 👋\n\n"
      "I can analyze your trading performance **and create new strategies** for you. Try:\n"
      "- *How much did I earn last month?*\n"
      "- *What's my most profitable strategy?*\n"
      "- *Create a SpreadGrid strategy for BTC/USDT on Binance*\n"
      "- *Set up a MovingAverage strategy for ETH on OKX*";
}

// ── Screen ─────────────────────────────────────────────────────────────────────

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen>
    with AutomaticKeepAliveClientMixin {
  final ChatService _chatService = ChatService.instance;
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _inputFocus = FocusNode();

  List<ChatMessage> _messages = [];
  bool _isLoading = false;
  bool _showSuggestions = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    // Show a placeholder welcome immediately, then personalise once we have
    // the user's name (which may already be cached in AuthService).
    _messages = [_buildWelcomeMessage(AuthService.instance.user?.name)];
    _loadUserGreeting();
  }

  /// If the user name wasn't cached yet, fetch it and refresh the greeting.
  Future<void> _loadUserGreeting() async {
    // Already have a name — nothing to do.
    if (AuthService.instance.user?.name.isNotEmpty == true) return;
    try {
      final user = await AuthService.instance.getUser();
      if (!mounted) return;
      // Only update the welcome message; leave any subsequent messages alone.
      setState(() {
        _messages = _messages.map((m) {
          if (m.id == 'welcome') return _buildWelcomeMessage(user?.name);
          return m;
        }).toList();
      });
    } catch (_) {
      // Network error — keep the generic greeting, no user-visible impact.
    }
  }

  ChatMessage _buildWelcomeMessage(String? name) => ChatMessage(
        id: 'welcome',
        role: MessageRole.assistant,
        content: _buildWelcomeText(name),
        timestamp: DateTime.now(),
      );

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _inputFocus.dispose();
    super.dispose();
  }

  // ── Scroll ─────────────────────────────────────────────────────────────────

  void _scrollToBottom({bool animate = true}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      if (animate) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      } else {
        _scrollController.jumpTo(
          _scrollController.position.maxScrollExtent,
        );
      }
    });
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  Future<void> _sendMessage(String text) async {
    final content = text.trim();
    if (content.isEmpty || _isLoading) return;

    _inputController.clear();
    setState(() {
      _showSuggestions = false;
      _isLoading = true;
      _messages = [
        ..._messages,
        ChatMessage(
          id: 'user-${DateTime.now().millisecondsSinceEpoch}',
          role: MessageRole.user,
          content: content,
          timestamp: DateTime.now(),
        ),
        ChatMessage(
          id: 'loading-${DateTime.now().millisecondsSinceEpoch}',
          role: MessageRole.assistant,
          content: '',
          timestamp: DateTime.now(),
          isLoading: true,
        ),
      ];
    });
    _scrollToBottom();

    try {
      // Build history: all non-loading, non-welcome messages sent so far
      final history = _messages
          .where((m) => !m.isLoading && m.id != 'welcome')
          .toList();

      final response = await _chatService.sendMessage(
        message: content,
        history: history,
      );

      final assistantMsg = ChatMessage(
        id: 'assistant-${DateTime.now().millisecondsSinceEpoch}',
        role: MessageRole.assistant,
        content: response.message,
        renderData: response.renderData,
        timestamp: DateTime.now(),
      );

      setState(() {
        _messages = _messages
            .map((m) => m.isLoading ? assistantMsg : m)
            .toList();
        _isLoading = false;
      });
    } catch (e) {
      final errorMsg = ChatMessage(
        id: 'error-${DateTime.now().millisecondsSinceEpoch}',
        role: MessageRole.assistant,
        content: 'Sorry, I had trouble connecting. Please try again.\n\n_${e.toString().replaceFirst('Exception: ', '')}_',
        timestamp: DateTime.now(),
      );
      setState(() {
        _messages = _messages
            .map((m) => m.isLoading ? errorMsg : m)
            .toList();
        _isLoading = false;
      });
    }

    _scrollToBottom();
  }

  void _clearMessages() {
    setState(() {
      _messages = [_buildWelcomeMessage(AuthService.instance.user?.name)];
      _showSuggestions = true;
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final theme = Theme.of(context);
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      appBar: _buildAppBar(theme),
      body: Column(
        children: [
          // Messages list
          Expanded(
            child: _buildMessageList(theme),
          ),
          // Input area (animates up with keyboard)
          AnimatedPadding(
            duration: const Duration(milliseconds: 100),
            padding: EdgeInsets.only(bottom: bottomPad),
            child: _buildInputArea(theme),
          ),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(ThemeData theme) {
    final userMsgCount = _messages.where((m) => m.role == MessageRole.user).length;
    return AppBar(
      automaticallyImplyLeading: false,
      backgroundColor: theme.colorScheme.primary,
      foregroundColor: theme.colorScheme.onPrimary,
      elevation: 0,
      titleSpacing: 12,
      title: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: theme.colorScheme.onPrimary.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.auto_awesome,
              size: 17,
              color: theme.colorScheme.onPrimary,
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'iTrade AI',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: theme.colorScheme.onPrimary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                'Powered by AI',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onPrimary.withValues(alpha: 0.7),
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ],
      ),
      actions: [
        if (userMsgCount > 0)
          IconButton(
            onPressed: _clearMessages,
            icon: Icon(
              Icons.delete_outline,
              size: 20.w,
              color: theme.colorScheme.onPrimary,
            ),
            tooltip: 'Clear conversation',
          ),
        // Close button — pops the modal sheet
        IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(
            Icons.close,
            size: 20.w,
            color: theme.colorScheme.onPrimary,
          ),
          tooltip: 'Close',
        ),
        const SizedBox(width: 2),
      ],
    );
  }

  Widget _buildMessageList(ThemeData theme) {
    final userMsgCount =
        _messages.where((m) => m.role == MessageRole.user).length;

    return ListView.builder(
      controller: _scrollController,
      padding: EdgeInsets.fromLTRB(12, 12, 12, 8),
      itemCount: _messages.length +
          (_showSuggestions && userMsgCount == 0 ? 1 : 0),
      itemBuilder: (context, index) {
        if (index < _messages.length) {
          return ChatMessageBubble(message: _messages[index]);
        }
        // Suggested questions appended after messages
        return _buildSuggestions(theme);
      },
    );
  }

  Widget _buildSuggestions(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 36, bottom: 6),
            child: Text(
              'Try asking:',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          ...(_suggestedQuestions.map(
            (q) => Padding(
              padding: const EdgeInsets.only(left: 36, bottom: 6),
              child: InkWell(
                onTap: () => _sendMessage(q),
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color:
                          theme.colorScheme.outline.withValues(alpha: 0.35),
                    ),
                    borderRadius: BorderRadius.circular(20),
                    color: theme.colorScheme.surfaceContainerHighest
                        .withValues(alpha: 0.4),
                  ),
                  child: Text(
                    q,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface,
                      fontSize: 12.sp,
                    ),
                  ),
                ),
              ),
            ),
          )),
        ],
      ),
    );
  }

  /// Called by [VoiceInputButton] when a transcript is ready.
  /// Populates the text field so the user can review before sending.
  void _onVoiceTranscript(String text) {
    _inputController.text = text;
    _inputController.selection = TextSelection.fromPosition(
      TextPosition(offset: text.length),
    );
    _inputFocus.requestFocus();
  }

  Widget _buildInputArea(ThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(
            color: theme.colorScheme.outline.withValues(alpha: 0.2),
          ),
        ),
      ),
      padding: EdgeInsets.fromLTRB(12, 8, 12, 12 + MediaQuery.of(context).padding.bottom * 0),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // ── Mic button ────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.only(bottom: 0, right: 4),
              child: VoiceInputButton(
                disabled: _isLoading,
                onTranscript: _onVoiceTranscript,
              ),
            ),
            // ── Text input ────────────────────────────────────────────────
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest
                      .withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: theme.colorScheme.outline.withValues(alpha: 0.2),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _inputController,
                        focusNode: _inputFocus,
                        enabled: !_isLoading,
                        maxLines: 4,
                        minLines: 1,
                        textInputAction: TextInputAction.newline,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 13.sp,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Ask about your trading performance…',
                          hintStyle: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant
                                .withValues(alpha: 0.5),
                            fontSize: 13.sp,
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                        ),
                        onSubmitted: (v) => _sendMessage(v),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            // ── Send button ───────────────────────────────────────────────
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: _inputController,
              builder: (_, value, __) {
                final canSend = value.text.trim().isNotEmpty && !_isLoading;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: 40,
                  height: 40,
                  child: FilledButton(
                    onPressed: canSend
                        ? () => _sendMessage(_inputController.text)
                        : null,
                    style: FilledButton.styleFrom(
                      padding: EdgeInsets.zero,
                      shape: const CircleBorder(),
                      backgroundColor: theme.colorScheme.primary,
                      disabledBackgroundColor: theme.colorScheme.primary
                          .withValues(alpha: 0.35),
                    ),
                    child: _isLoading
                        ? SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: theme.colorScheme.onPrimary,
                            ),
                          )
                        : Icon(
                            Icons.send_rounded,
                            size: 17,
                            color: theme.colorScheme.onPrimary,
                          ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
