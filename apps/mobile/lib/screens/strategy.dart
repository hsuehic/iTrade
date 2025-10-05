import 'package:flutter/material.dart';

class StrategyScreen extends StatelessWidget {
  const StrategyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(home: IOSStyleAnimatedPage());
  }
}

class IOSStyleAnimatedPage extends StatefulWidget {
  @override
  _IOSStyleAnimatedPageState createState() => _IOSStyleAnimatedPageState();
}

class _IOSStyleAnimatedPageState extends State<IOSStyleAnimatedPage> {
  final ScrollController _scrollController = ScrollController();
  double _scrollOffset = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      setState(() {
        _scrollOffset = _scrollController.offset;
      });
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const double expandedHeight = 120;
    const double toolbarHeight = kToolbarHeight;

    // 计算滚动比例
    double t = (_scrollOffset / (expandedHeight - toolbarHeight)).clamp(
      0.0,
      1.0,
    );

    // 大标题缩放和透明度
    double largeTitleScale = 1.0 - 0.3 * t; // 缩小到 70%
    double largeTitleOpacity = 1.0 - t;

    // 大标题向上移动
    double largeTitleTranslateY = -t * 32; // 上移 32px

    // 小标题透明度
    double smallTitleOpacity = t;

    return Scaffold(
      body: CustomScrollView(
        controller: _scrollController,
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: expandedHeight,
            title: Opacity(
              opacity: smallTitleOpacity,
              child: Text("标题", style: TextStyle(fontSize: 18)),
            ),
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.pin,
              background: Container(
                alignment: Alignment.bottomLeft,
                padding: EdgeInsets.only(left: 16, bottom: 16),
                child: Transform.translate(
                  offset: Offset(0, largeTitleTranslateY),
                  child: Transform.scale(
                    scale: largeTitleScale,
                    alignment: Alignment.bottomLeft,
                    child: Opacity(
                      opacity: largeTitleOpacity,
                      child: Text(
                        "大标题",
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),

          SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) => ListTile(title: Text('Item #$index')),
              childCount: 30,
            ),
          ),
        ],
      ),
    );
  }
}
