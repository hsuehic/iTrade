import 'dart:io';

import 'package:archive/archive_io.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:sherpa_onnx/sherpa_onnx.dart' as sherpa;

// ── Model URLs ─────────────────────────────────────────────────────────────
// sherpa-onnx Whisper-tiny (int8 quantised, ~43 MB compressed)
const _kModelVersion = '1.13.0';
const _kBaseUrl =
    'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models';
const _kModelArchive = 'sherpa-onnx-whisper-tiny.tar.bz2';

// Minimum recording duration in milliseconds to bother transcribing.
// Very short clips produce empty/garbage output and can cause native crashes.
const _kMinRecordingMs = 800;

// ── State ──────────────────────────────────────────────────────────────────

enum VoiceStatus {
  idle,
  checkingPermission,
  downloadingModel,
  ready,
  recording,
  transcribing,
  error,
}

class VoiceServiceState {
  final VoiceStatus status;
  final double downloadProgress; // 0–1 during downloadingModel
  final String? errorMessage;

  const VoiceServiceState({
    required this.status,
    this.downloadProgress = 0,
    this.errorMessage,
  });

  bool get isIdle => status == VoiceStatus.idle;
  bool get isRecording => status == VoiceStatus.recording;
  bool get isBusy =>
      status == VoiceStatus.checkingPermission ||
      status == VoiceStatus.downloadingModel ||
      status == VoiceStatus.transcribing;
}

// ── Service ────────────────────────────────────────────────────────────────

/// Manages offline voice-to-text using sherpa-onnx Whisper tiny.
///
/// All heavy native work (sherpa initBindings, OfflineRecognizer creation,
/// and decode) runs in a background isolate via compute() so the main Dart
/// isolate — and therefore the iOS/Android platform watchdog — is never
/// blocked.
///
/// Typical flow:
///   await VoiceService.instance.startRecording();  // user starts speaking
///   final text = await VoiceService.instance.stopRecording();
///
/// The first call transparently downloads the ~43 MB model to the app's
/// documents directory and caches it for all subsequent sessions.
class VoiceService extends ChangeNotifier {
  VoiceService._internal();
  static final VoiceService instance = VoiceService._internal();

  // ── State ----------------------------------------------------------------
  VoiceServiceState _state =
      const VoiceServiceState(status: VoiceStatus.idle);

  VoiceServiceState get state => _state;

  void _setState(VoiceServiceState s) {
    _state = s;
    notifyListeners();
  }

  // ── Internals ------------------------------------------------------------

  /// Cached path to the directory holding the model files.
  /// Set once model files are confirmed present; null until then.
  String? _modelDirPath;

  /// Guard against concurrent calls to ensureReady().
  Future<void>? _initFuture;

  final AudioRecorder _recorder = AudioRecorder();

  /// Wall-clock time when recording started (used to enforce minimum length).
  DateTime? _recordingStartedAt;

  // ── Public API -----------------------------------------------------------

  /// Ensures the model is downloaded.
  /// Safe to call multiple times — concurrent calls share the same future.
  Future<void> ensureReady() {
    _initFuture ??= _doInit();
    return _initFuture!;
  }

  Future<void> _doInit() async {
    if (_modelDirPath != null) return;

    _setState(
        const VoiceServiceState(status: VoiceStatus.checkingPermission));

    // Check / request microphone permission via the record package.
    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) {
      _initFuture = null; // allow retry after user grants permission
      _setState(const VoiceServiceState(
        status: VoiceStatus.error,
        errorMessage: 'Microphone permission denied.',
      ));
      throw Exception('Microphone permission denied.');
    }

    // Ensure model files are present on-disk.
    final modelDir = await _modelDirectory();
    await _ensureModelFiles(modelDir);

    _modelDirPath = modelDir.path;
    _setState(const VoiceServiceState(status: VoiceStatus.ready));
  }

  /// Start recording audio. [ensureReady] is called automatically on first use.
  Future<void> startRecording() async {
    await ensureReady();
    if (_state.isRecording) return;

    final tmpDir = await getTemporaryDirectory();
    final path =
        '${tmpDir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.wav';

    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.wav,
        sampleRate: 16000,
        numChannels: 1,
      ),
      path: path,
    );

    _recordingStartedAt = DateTime.now();
    _setState(const VoiceServiceState(status: VoiceStatus.recording));
  }

  /// Stop recording and transcribe. Returns the recognised text, or null if
  /// the recording was too short / nothing was heard.
  Future<String?> stopRecording() async {
    if (!_state.isRecording) return null;

    _setState(const VoiceServiceState(status: VoiceStatus.transcribing));

    final wavPath = await _recorder.stop();
    if (wavPath == null) {
      _setState(const VoiceServiceState(status: VoiceStatus.ready));
      return null;
    }

    // Skip transcription if the clip is too short — avoids native segfaults
    // and empty / garbage whisper output on very brief audio.
    final elapsed = _recordingStartedAt == null
        ? _kMinRecordingMs + 1
        : DateTime.now()
            .difference(_recordingStartedAt!)
            .inMilliseconds;
    _recordingStartedAt = null;

    if (elapsed < _kMinRecordingMs) {
      _setState(const VoiceServiceState(status: VoiceStatus.ready));
      try {
        File(wavPath).deleteSync();
      } catch (_) {}
      return null;
    }

    final modelDir = _modelDirPath;
    if (modelDir == null) {
      _setState(const VoiceServiceState(status: VoiceStatus.ready));
      return null;
    }

    try {
      // Run all sherpa-onnx work (initBindings + recognizer + decode)
      // in a background isolate to avoid blocking the main Dart isolate.
      final text = await compute(
        _transcribeInIsolate,
        _TranscribeArgs(
          encoderPath: '$modelDir/tiny-encoder.int8.onnx',
          decoderPath: '$modelDir/tiny-decoder.int8.onnx',
          tokensPath: '$modelDir/tiny-tokens.txt',
          wavPath: wavPath,
        ),
      );

      _setState(const VoiceServiceState(status: VoiceStatus.ready));
      // Clean up temp WAV.
      try {
        File(wavPath).deleteSync();
      } catch (_) {}
      return (text == null || text.isEmpty) ? null : text;
    } catch (e) {
      _setState(VoiceServiceState(
        status: VoiceStatus.error,
        errorMessage: e.toString(),
      ));
      rethrow;
    }
  }

  /// Cancel an in-progress recording without transcribing.
  Future<void> cancelRecording() async {
    if (!_state.isRecording) return;
    _recordingStartedAt = null;
    await _recorder.cancel();
    _setState(const VoiceServiceState(status: VoiceStatus.ready));
  }

  // ── Model management ----------------------------------------------------

  Future<Directory> _modelDirectory() async {
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory(
        '${docs.path}/sherpa_onnx/whisper-tiny/$_kModelVersion');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir;
  }

  bool _modelFilesExist(Directory dir) =>
      File('${dir.path}/tiny-encoder.int8.onnx').existsSync() &&
      File('${dir.path}/tiny-decoder.int8.onnx').existsSync() &&
      File('${dir.path}/tiny-tokens.txt').existsSync();

  Future<void> _ensureModelFiles(Directory modelDir) async {
    if (_modelFilesExist(modelDir)) return;

    _setState(const VoiceServiceState(
      status: VoiceStatus.downloadingModel,
      downloadProgress: 0,
    ));

    final tmpDir = await getTemporaryDirectory();
    final archivePath = '${tmpDir.path}/$_kModelArchive';

    final dio = Dio();
    await dio.download(
      '$_kBaseUrl/$_kModelArchive',
      archivePath,
      onReceiveProgress: (received, total) {
        if (total > 0) {
          _setState(VoiceServiceState(
            status: VoiceStatus.downloadingModel,
            downloadProgress: received / total,
          ));
        }
      },
      options: Options(receiveTimeout: const Duration(minutes: 5)),
    );

    _setState(const VoiceServiceState(
      status: VoiceStatus.downloadingModel,
      downloadProgress: 1.0,
    ));

    // Extract in a background isolate to avoid blocking the UI thread.
    await compute(_extractTarBz2, _ExtractArgs(archivePath, modelDir.path));

    // Remove the downloaded archive.
    try {
      File(archivePath).deleteSync();
    } catch (_) {}
  }
}

// ── Isolate helpers ──────────────────────────────────────────────────────

class _TranscribeArgs {
  final String encoderPath;
  final String decoderPath;
  final String tokensPath;
  final String wavPath;

  const _TranscribeArgs({
    required this.encoderPath,
    required this.decoderPath,
    required this.tokensPath,
    required this.wavPath,
  });
}

/// Runs entirely inside a background isolate (via compute).
///
/// Each isolate needs its own initBindings() + OfflineRecognizer instance —
/// native objects are NOT shareable across Dart isolates.
String? _transcribeInIsolate(_TranscribeArgs args) {
  // Must be the very first sherpa-onnx call in this isolate.
  sherpa.initBindings();

  final whisperConfig = sherpa.OfflineWhisperModelConfig(
    encoder: args.encoderPath,
    decoder: args.decoderPath,
    language: 'auto',
    task: 'transcribe',
  );

  final modelConfig = sherpa.OfflineModelConfig(
    whisper: whisperConfig,
    tokens: args.tokensPath,
    numThreads: 2,
    debug: false,
  );

  final config = sherpa.OfflineRecognizerConfig(
    model: modelConfig,
    decodingMethod: 'greedy_search',
  );

  final recognizer = sherpa.OfflineRecognizer(config);

  try {
    final waveData = sherpa.readWave(args.wavPath);

    final stream = recognizer.createStream();
    stream.acceptWaveform(
      samples: waveData.samples,
      sampleRate: waveData.sampleRate,
    );
    recognizer.decode(stream);
    final result = recognizer.getResult(stream);
    stream.free();

    final text = result.text.trim();
    return text.isEmpty ? null : text;
  } finally {
    recognizer.free();
  }
}

class _ExtractArgs {
  final String archivePath;
  final String destDir;
  const _ExtractArgs(this.archivePath, this.destDir);
}

/// Extracts a .tar.bz2 archive, stripping the top-level directory so model
/// files land directly under [args.destDir].
///
/// Runs in a separate isolate via compute().
void _extractTarBz2(_ExtractArgs args) {
  final inputStream = InputFileStream(args.archivePath);
  final tarBytes = BZip2Decoder().decodeBuffer(inputStream);
  inputStream.close();

  final archive = TarDecoder().decodeBytes(tarBytes);

  for (final file in archive) {
    if (!file.isFile) continue;
    // Strip the leading directory component:
    //   "sherpa-onnx-whisper-tiny/tiny-encoder.int8.onnx" → "tiny-encoder.int8.onnx"
    final name = file.name.split('/').last;
    if (name.isEmpty) continue;

    final outFile = File('${args.destDir}/$name');
    outFile.parent.createSync(recursive: true);
    outFile.writeAsBytesSync(file.content as List<int>);
  }
}
