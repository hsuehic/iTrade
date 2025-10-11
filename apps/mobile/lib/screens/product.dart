import 'dart:async';
import 'package:flutter/material.dart';
import '../widgets/search_input.dart' show SimpleSearchBar;
import '../widgets/tag_list.dart';
import '../widgets/custom_app_bar.dart';
import '../services/okx_data_service.dart';

class ProductScreen extends StatefulWidget {
  const ProductScreen({super.key});

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends State<ProductScreen>
    with AutomaticKeepAliveClientMixin {
  late final OKXDataService _okxService;
  Tag _currentTag = Tag(name: 'Spot', value: 'SPOT');
  String _query = '';
  List<OKXTicker> _tickers = [];
  bool _loading = true;
  late Timer _timer;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _okxService = OKXDataService();
    _loadData();

    // 每秒只刷新数据，不触发整个 FutureBuilder 重建
    _timer = Timer.periodic(const Duration(milliseconds: 600), (_) {
      _refreshData();
    });
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final data = await _okxService.getTickers(_currentTag.value);
    setState(() {
      _tickers = data.where((ticker) {
        return ticker.instId.toLowerCase().contains(_query);
      }).toList();
      _loading = false;
    });
  }

  Future<void> _refreshData() async {
    final data = await _okxService.getTickers(_currentTag.value);
    // ⚠️ 不重新 setState 整个 widget，只更新 _tickers
    if (mounted) {
      setState(() {
        _tickers = data.where((ticker) {
          return ticker.instId.toLowerCase().contains(_query);
        }).toList();
      });
    }
  }

  void _handleQuery(String query) {
    if (query.trim().isNotEmpty) {
      final lowerQuery = query.trim().toLowerCase();
      if (_query != lowerQuery) {
        setState(() {
          _query = lowerQuery;
          _loadData();
        });
      }
    }
  }

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _timer.cancel();
    _scrollController.dispose();
    _okxService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // Required for AutomaticKeepAliveClientMixin
    final List<Tag> tags = [
      Tag(name: 'Spot', value: 'SPOT'),
      Tag(name: 'Swap', value: 'SWAP'),
      Tag(name: 'Futures', value: 'FUTURES'),
      Tag(name: 'Option', value: 'OPTION'),
    ];

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: const CustomAppBar(title: 'Products'),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SimpleSearchBar(
            onChanged: (query) {
              _handleQuery(query);
            },
            onSubmitted: (query) {
              _handleQuery(query);
            },
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TagList(
              tags: tags,
              currentTag: _currentTag,
              onTap: (tag) async {
                setState(() {
                  _currentTag = tag;
                });
                await _loadData(); // 切换标签重新加载
              },
            ),
          ),
          const SizedBox(height: 16),

          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else
            Expanded(
              child: ListView.builder(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                controller: _scrollController,
                itemCount: _tickers.length,
                itemBuilder: (context, index) {
                  final ticker = _tickers[index];
                  final changePercent =
                      ((ticker.last - ticker.open24h) / ticker.open24h) * 100;
                  final changeColor = changePercent >= 0
                      ? Colors.green
                      : Colors.red;

                  return ListTile(
                    key: ValueKey(ticker.instId),
                    leading: Image.network(
                      ticker.iconUrl,
                      width: 28,
                      height: 28,
                      errorBuilder: (context, error, stackTrace) =>
                          const Icon(Icons.monetization_on, size: 28),
                    ),
                    title: Text(
                      ticker.instId,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      'Vol: ${ticker.volCcy24h.toStringAsFixed(2)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    trailing: IntrinsicWidth(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        mainAxisSize: MainAxisSize.min, // 关键点
                        children: [
                          Text(
                            ticker.last.toString(),
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            mainAxisSize: MainAxisSize.min, // 防止Row拉伸
                            children: [
                              Icon(
                                changePercent >= 0
                                    ? Icons.trending_up
                                    : Icons.trending_down,
                                size: 16,
                                color: changeColor,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '${changePercent.toStringAsFixed(2)}%',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: changeColor),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
