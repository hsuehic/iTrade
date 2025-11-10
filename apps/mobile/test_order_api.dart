/// Test script to verify order API parsing
/// Run: dart apps/mobile/test_order_api.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

void main() async {
  print('🧪 Testing Order API Integration\n');

  final url = Uri.parse('https://itrade.ihsueh.com/api/orders?strategyId=22');
  final headers = {
    'Cookie':
        '__Secure-better-auth.session_token=Bux09UNADGoOjW7nmGyA73Hc3tOUi9zt.fKcDrqX8sBLAyjSF2RmQ4vg3tttb2mVrHr5WTXao0%2FM%3D',
  };

  try {
    print('📡 Fetching orders from API...');
    final response = await http.get(url, headers: headers);

    print('  Status: ${response.statusCode}');
    print('  Content-Type: ${response.headers['content-type']}');

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      print('  Data type: ${data.runtimeType}');

      if (data is Map<String, dynamic>) {
        print('  ✅ Response is a Map');

        if (data.containsKey('orders')) {
          print('  ✅ Contains "orders" key');
          final orders = data['orders'];

          if (orders is List) {
            print('  ✅ Orders is a List');
            print('  ✅ Orders count: ${orders.length}');

            if (orders.isNotEmpty) {
              print('\n📦 Sample Order:');
              final firstOrder = orders[0];
              print('  ID: ${firstOrder['id']}');
              print('  Symbol: ${firstOrder['symbol']}');
              print('  Side: ${firstOrder['side']}');
              print('  Status: ${firstOrder['status']}');
              print('  StrategyId: ${firstOrder['strategyId']}');
              print('  StrategyName: ${firstOrder['strategyName']}');
            }

            print('\n✅ API FORMAT IS CORRECT!');
            print('   The mobile app SHOULD be able to parse this.');
          } else {
            print('  ❌ Orders is not a List: ${orders.runtimeType}');
          }
        } else {
          print('  ❌ Missing "orders" key');
          print('  Available keys: ${data.keys.toList()}');
        }
      } else {
        print('  ❌ Response is not a Map: ${data.runtimeType}');
      }
    } else {
      print('  ❌ HTTP Error: ${response.statusCode}');
      print('  Body: ${response.body}');
    }
  } catch (e) {
    print('❌ Error: $e');
  }

  print('\n🔍 Testing PnL API...');
  final pnlUrl = Uri.parse('https://itrade.ihsueh.com/api/analytics/pnl?strategyId=22');
  
  try {
    final pnlResponse = await http.get(pnlUrl, headers: headers);
    print('  Status: ${pnlResponse.statusCode}');
    
    if (pnlResponse.statusCode == 200) {
      final pnlData = jsonDecode(pnlResponse.body);
      print('  Data: $pnlData');
      
      if (pnlData is Map && pnlData.containsKey('pnl')) {
        final pnl = pnlData['pnl'];
        print('  ✅ PnL API Format Correct');
        print('  Total PnL: ${pnl['pnl']}');
        print('  Realized PnL: ${pnl['realizedPnl']}');
        print('  Total Orders: ${pnl['totalOrders']}');
        print('  Filled Orders: ${pnl['filledOrders']}');
      }
    }
  } catch (e) {
    print('❌ PnL Error: $e');
  }
}

