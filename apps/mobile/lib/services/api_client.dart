import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// REST client using Dio with cookie-session authorization and persistent cookies.
///
/// - Cookies are stored via `PersistCookieJar` and attached automatically by `CookieManager`.
/// - Call `login(...)` against your auth endpoint; the server should respond with `Set-Cookie`.
/// - Subsequent requests will include the session cookie; persistence survives app restarts.
/// - Call `ApiClient.instance.init(baseUrl: ...)` before use (e.g., in main()).
class ApiClient {
  ApiClient._internal();
  static final ApiClient instance = ApiClient._internal();

  late final Dio _dio;
  CookieJar? _cookieJar;
  bool _initialized = false;

  bool get isInitialized => _initialized;
  Dio get dio => _dio;

  /// Initialize Dio and persistent cookie storage.
  Future<void> init({
    required String baseUrl,
    Map<String, dynamic>? defaultHeaders,
    Duration connectTimeout = const Duration(seconds: 10),
    Duration receiveTimeout = const Duration(seconds: 20),
    List<String> insecureAllowBadCertForHosts = const <String>[],
  }) async {
    if (_initialized) return;

    try {
      final Directory appDir = await getApplicationSupportDirectory();
      final Directory jarDir = Directory(
        '${appDir.path}${Platform.pathSeparator}cookies',
      );
      if (!await jarDir.exists()) {
        await jarDir.create(recursive: true);
      }
      _cookieJar = PersistCookieJar(storage: FileStorage(jarDir.path));
    } catch (error) {
      // Fallback to in-memory cookies if storage is unavailable.
      debugPrint('ApiClient cookie storage unavailable: $error');
      _cookieJar = CookieJar();
    }

    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: connectTimeout,
        receiveTimeout: receiveTimeout,
        headers: {
          HttpHeaders.acceptHeader: 'application/json, text/plain, */*',
          HttpHeaders.contentTypeHeader: 'application/json; charset=utf-8',
          ...?defaultHeaders,
        },
        // Important for servers that rely on cookie auth
        extra: const {'withCredentials': true},
      ),
    );

    // Configure HTTP client for development scenarios that require
    // accepting self-signed or otherwise invalid certificates for specific hosts.
    _configureBadCertCallback(insecureAllowBadCertForHosts);

    // Interceptors
    _dio.interceptors.add(CookieManager(_cookieJar!));
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.next(options);
        },
        onResponse: (response, handler) {
          handler.next(response);
        },
        onError: (DioException error, handler) {
          handler.next(error);
        },
      ),
    );

    _initialized = true;
  }

  Future<void> updateBaseUrl({
    required String baseUrl,
    List<String> insecureAllowBadCertForHosts = const <String>[],
  }) async {
    if (!_initialized) {
      await init(
        baseUrl: baseUrl,
        insecureAllowBadCertForHosts: insecureAllowBadCertForHosts,
      );
      return;
    }

    _dio.options.baseUrl = baseUrl;
    _configureBadCertCallback(insecureAllowBadCertForHosts);
  }

  Future<Response<T>> getJson<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    _ensureInitialized();
    return _dio.get<T>(
      path,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  Future<Response<T>> postJson<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    _ensureInitialized();
    return _dio.post<T>(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  Future<Response<T>> delete<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    _ensureInitialized();
    return _dio.delete<T>(path, queryParameters: queryParameters);
  }

  /// Clear all persisted cookies (e.g., to sign out or reset session).
  Future<void> clearCookies() async {
    if (_cookieJar != null) {
      await _cookieJar!.deleteAll();
    }
  }

  /// Debug helper: load cookies for the current base URL.
  ///
  /// Returns an empty list on errors or if cookies are unavailable.
  Future<List<Cookie>> debugLoadCookiesForBaseUrl() async {
    try {
      if (_cookieJar == null) return <Cookie>[];
      final Uri base = Uri.parse(_dio.options.baseUrl);
      final List<Cookie> cookies = await _cookieJar!.loadForRequest(base);
      return cookies;
    } catch (_) {
      return <Cookie>[];
    }
  }

  void _ensureInitialized() {
    if (!_initialized) {
      throw StateError(
        'ApiClient not initialized. Call ApiClient.instance.init(...) first.',
      );
    }
  }

  void _configureBadCertCallback(List<String> insecureAllowBadCertForHosts) {
    final IOHttpClientAdapter ioAdapter =
        _dio.httpClientAdapter as IOHttpClientAdapter;
    ioAdapter.createHttpClient = () {
      final HttpClient client = HttpClient();
      if (insecureAllowBadCertForHosts.isNotEmpty) {
        client.badCertificateCallback =
            (X509Certificate cert, String host, int port) {
              return insecureAllowBadCertForHosts.contains(host);
            };
      }
      return client;
    };
  }
}
