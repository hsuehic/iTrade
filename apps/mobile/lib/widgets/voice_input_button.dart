import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../services/voice_service.dart';

/// A hold-to-record microphone button for the AI chat input bar.
///
/// - Press and hold to start recording.
/// - Release to stop, run STT, and deliver the transcript via [onTranscript].
/// - On first use, shows a bottom sheet while the Whisper model downloads.
class VoiceInputButton extends StatefulWidget {
  const VoiceInputButton({
    super.key,
    required this.onTranscript,
    this.disabled = false,
  });

  /// Called with the recognised text when recording finishes.
  final ValueChanged<String> onTranscript;

  /// When true the button is greyed out and ignores gestures.
  final bool disabled;

  @override
  State<VoiceInputButton> createState() => _VoiceInputButtonState();
}

class _VoiceInputButtonState extends State<VoiceInputButton>
    with SingleTickerProviderStateMixin {
  final VoiceService _voice = VoiceService.instance;

  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseAnim;

  // Shown while recording so the user knows how long they've spoken.
  Timer? _durationTimer;
  int _recordSeconds = 0;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..addStatusListener((s) {
        if (s == AnimationStatus.completed) _pulseCtrl.reverse();
        if (s == AnimationStatus.dismissed) _pulseCtrl.forward();
      });

    _pulseAnim = Tween<double>(begin: 1.0, end: 1.25).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );

    _voice.addListener(_onVoiceStateChanged);
  }

  @override
  void dispose() {
    _voice.removeListener(_onVoiceStateChanged);
    _pulseCtrl.dispose();
    _durationTimer?.cancel();
    super.dispose();
  }

  void _onVoiceStateChanged() {
    if (!mounted) return;
    setState(() {});
    if (_voice.state.isRecording && !_pulseCtrl.isAnimating) {
      _pulseCtrl.forward();
    } else if (!_voice.state.isRecording && _pulseCtrl.isAnimating) {
      _pulseCtrl.stop();
      _pulseCtrl.reset();
    }
  }

  // ── Gesture handlers ────────────────────────────────────────────────────

  Future<void> _onPressStart() async {
    if (widget.disabled) return;
    HapticFeedback.mediumImpact();

    final state = _voice.state;

    // If the model isn't ready yet, show the download sheet first.
    if (state.status == VoiceStatus.idle ||
        state.status == VoiceStatus.error) {
      final ready = await _awaitModelReady();
      if (!ready) return;
    }

    _recordSeconds = 0;
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _recordSeconds++);
    });

    try {
      await _voice.startRecording();
    } catch (e) {
      _durationTimer?.cancel();
      if (mounted) _showError(e.toString());
    }
  }

  Future<void> _onPressEnd() async {
    _durationTimer?.cancel();
    _durationTimer = null;

    if (!_voice.state.isRecording) return;
    HapticFeedback.lightImpact();

    try {
      final text = await _voice.stopRecording();
      if (text != null && text.isNotEmpty && mounted) {
        widget.onTranscript(text);
      }
    } catch (e) {
      if (mounted) _showError(e.toString());
    }
  }

  Future<void> _onPressCancel() async {
    _durationTimer?.cancel();
    _durationTimer = null;
    await _voice.cancelRecording();
  }

  // ── Model download sheet ─────────────────────────────────────────────────

  /// Shows a bottom sheet that waits for the model to finish downloading.
  /// Returns true if the model is ready, false if cancelled/failed.
  Future<bool> _awaitModelReady() async {
    bool ready = false;

    await showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ModelDownloadSheet(
        voice: _voice,
        onReady: () {
          ready = true;
          Navigator.of(context).pop();
        },
        onCancel: () => Navigator.of(context).pop(),
      ),
    );

    return ready;
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg.replaceFirst('Exception: ', '')),
        backgroundColor: Theme.of(context).colorScheme.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isRecording = _voice.state.isRecording;
    final isBusy = _voice.state.isBusy;
    final disabled = widget.disabled || isBusy;

    return GestureDetector(
      onLongPressStart: disabled ? null : (_) => _onPressStart(),
      onLongPressEnd: disabled ? null : (_) => _onPressEnd(),
      onLongPressCancel: disabled ? null : _onPressCancel,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ScaleTransition(
            scale: isRecording ? _pulseAnim : const AlwaysStoppedAnimation(1.0),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isRecording
                    ? theme.colorScheme.error
                    : disabled
                        ? theme.colorScheme.primary.withValues(alpha: 0.3)
                        : theme.colorScheme.primary.withValues(alpha: 0.12),
              ),
              child: isBusy
                  ? Center(
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    )
                  : Icon(
                      isRecording ? Icons.stop_rounded : Icons.mic_rounded,
                      size: 20.w,
                      color: isRecording
                          ? theme.colorScheme.onError
                          : disabled
                              ? theme.colorScheme.primary.withValues(alpha: 0.4)
                              : theme.colorScheme.primary,
                    ),
            ),
          ),
          if (isRecording) ...[
            const SizedBox(height: 2),
            Text(
              _formatDuration(_recordSeconds),
              style: theme.textTheme.labelSmall?.copyWith(
                fontSize: 9.sp,
                color: theme.colorScheme.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatDuration(int seconds) {
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}

// ── Model download bottom sheet ──────────────────────────────────────────

class _ModelDownloadSheet extends StatefulWidget {
  const _ModelDownloadSheet({
    required this.voice,
    required this.onReady,
    required this.onCancel,
  });

  final VoiceService voice;
  final VoidCallback onReady;
  final VoidCallback onCancel;

  @override
  State<_ModelDownloadSheet> createState() => _ModelDownloadSheetState();
}

class _ModelDownloadSheetState extends State<_ModelDownloadSheet> {
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.voice.addListener(_onVoiceChanged);
    // Kick off model preparation.
    WidgetsBinding.instance.addPostFrameCallback((_) => _prepare());
  }

  @override
  void dispose() {
    widget.voice.removeListener(_onVoiceChanged);
    super.dispose();
  }

  Future<void> _prepare() async {
    try {
      await widget.voice.ensureReady();
      if (mounted) widget.onReady();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = widget.voice.state;

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 36),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: theme.colorScheme.outline.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 20),
          Icon(
            Icons.mic_rounded,
            size: 40,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(height: 12),
          Text(
            'Voice Input',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          if (_error != null) ...[
            Text(
              _error!,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.error),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: widget.onCancel,
              child: const Text('Dismiss'),
            ),
          ] else if (state.status == VoiceStatus.downloadingModel) ...[
            Text(
              'Downloading voice model (~43 MB)…',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: state.downloadProgress == 0
                ? null
                : state.downloadProgress),
            const SizedBox(height: 4),
            Text(
              state.downloadProgress > 0
                  ? '${(state.downloadProgress * 100).toStringAsFixed(0)}%'
                  : 'Connecting…',
              style: theme.textTheme.labelSmall,
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: widget.onCancel,
              child: const Text('Cancel'),
            ),
          ] else ...[
            Text(
              'Preparing…',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            const CircularProgressIndicator(),
          ],
        ],
      ),
    );
  }
}
