import 'package:flutter/foundation.dart';
import 'api_client.dart';

class ExchangeAccount {
  final int? id;
  final String exchange;
  final String accountId;
  final String? apiKey; // Masked for display
  final bool isActive;
  final DateTime? updatedTime;

  ExchangeAccount({
    this.id,
    required this.exchange,
    required this.accountId,
    this.apiKey,
    required this.isActive,
    this.updatedTime,
  });

  factory ExchangeAccount.fromJson(Map<String, dynamic> json) {
    return ExchangeAccount(
      id: json['id'] as int?,
      exchange: json['exchange'] as String,
      accountId: json['accountId'] as String,
      apiKey: json['apiKey'] as String?,
      isActive: json['isActive'] as bool? ?? true,
      updatedTime: json['updatedTime'] != null
          ? DateTime.parse(json['updatedTime'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      'exchange': exchange,
      'accountId': accountId,
      'isActive': isActive,
    };
  }
}

class AccountService {
  static final AccountService instance = AccountService._internal();
  factory AccountService() => instance;
  AccountService._internal();

  final ApiClient _apiClient = ApiClient.instance;

  /// Fetch all exchange accounts for the current user
  Future<List<ExchangeAccount>> getAccounts() async {
    try {
<<<<<<< HEAD
      final response =
          await _apiClient.getJson<List<dynamic>>('/api/accounts');

=======
      final response = await _apiClient.getJson('/api/accounts');
      
>>>>>>> 6127dc7 (fix: ios pod and initialization)
      if (response.statusCode == 200) {
        final List<dynamic> data = response.data as List<dynamic>;
        return data
            .map(
              (json) =>
                  ExchangeAccount.fromJson(json as Map<String, dynamic>),
            )
            .toList();
      } else {
        throw Exception('Failed to load accounts: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error fetching accounts: $e');
      rethrow;
    }
  }

  /// Create or update an exchange account
  Future<bool> saveAccount({
    int? id,
    required String exchange,
    required String accountId,
    required String apiKey,
    required String secretKey,
    String? passphrase,
    required bool isActive,
  }) async {
    try {
      final data = {
        if (id != null) 'id': id,
        'exchange': exchange,
        'accountId': accountId,
        'apiKey': apiKey,
        'secretKey': secretKey,
        if (passphrase != null && passphrase.isNotEmpty)
          'passphrase': passphrase,
        'isActive': isActive,
      };

<<<<<<< HEAD
      final response =
          await _apiClient.postJson<dynamic>('/api/accounts', data: data);

=======
      final response = await _apiClient.postJson('/api/accounts', data: data);
      
>>>>>>> 6127dc7 (fix: ios pod and initialization)
      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Error saving account: $e');
      rethrow;
    }
  }

  /// Delete an exchange account
  Future<bool> deleteAccount(int id) async {
    try {
      final response = await _apiClient.delete('/api/accounts/$id');
      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Error deleting account: $e');
      rethrow;
    }
  }
}
