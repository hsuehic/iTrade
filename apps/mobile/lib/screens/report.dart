import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../widgets/user_avatar.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key});

  @override
  State<ReportScreen> createState() => _RportScreenState();
}

class _RportScreenState extends State<ReportScreen> {
  final AuthService _authService = AuthService.instance;
  @override
  void initState() {
    super.initState();
    // 状态栏透明（可按需调整）
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final double statusBarHeight = MediaQuery.of(context).padding.top;
    final double expandedImageHeight = 200.0; // 图片在不含状态栏时的高度
    final double expandedHeight = expandedImageHeight + statusBarHeight;

    const double collapsedFontSize = 18.0;
    const double expandedFontSize = 28.0;
    const double collapsedOffset = 0.0;
    const double expandedOffset = 30.0;

    return Scaffold(
      extendBodyBehindAppBar: true,
      body: NestedScrollView(
        // header：SliverAppBar
        headerSliverBuilder: (context, innerBoxIsScrolled) {
          return [
            SliverOverlapAbsorber(
              handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
              sliver: SliverAppBar(
                pinned: true,
                floating: false,
                expandedHeight: expandedHeight,
                centerTitle: true,
                backgroundColor: Colors.blue, // 收起后会显示的背景色
                elevation: 0,
                // 使用 LayoutBuilder 获取当前高度，从而计算收缩比例 t
                flexibleSpace: LayoutBuilder(
                  builder: (context, constraints) {
                    final double currentHeight = constraints.biggest.height;
                    // t: 0.0(完全收起) ~ 1.0(完全展开)
                    final double t =
                        ((currentHeight - kToolbarHeight) /
                                (expandedHeight - kToolbarHeight))
                            .clamp(0.0, 1.0);

                    final double fontSize =
                        collapsedFontSize +
                        (expandedFontSize - collapsedFontSize) * t;
                    final double offsetY =
                        collapsedOffset +
                        (expandedOffset - collapsedOffset) * t;
                    // 我们用 AnimatedPadding + AnimatedDefaultTextStyle 来平滑动画

                    return Stack(
                      fit: StackFit.expand,
                      children: [
                        // 背景图（会延伸到状态栏，因为 expandedHeight 包含状态栏高度）
                        Image.network(
                          'https://picsum.photos/800/800',
                          fit: BoxFit.fitWidth,
                        ),
                        if (t > 0.5) UserAvatar(),

                        ListTile(
                          leading: UserAvatar(),
                          title: Text(_authService.user?.name ?? 'User'),
                          subtitle: Text(
                            _authService.user?.email ?? 'Signed in',
                          ),
                        ),
                        // 顶部渐变，保证文字在亮/暗背景上都清晰
                        Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.center,
                              colors: [
                                Colors.black.withOpacity(0.35),
                                Colors.transparent,
                              ],
                            ),
                          ),
                        ),
                        // 动态标题：用 AnimatedPadding 控制垂直位移，用 AnimatedDefaultTextStyle 控制字体大小的平滑过渡
                        // 将文字放到底部左侧（类似 FlexibleSpaceBar 默认的位置）
                        Positioned(
                          left: 16,
                          right: 16,
                          bottom: 0,
                          child: AnimatedPadding(
                            duration: const Duration(milliseconds: 120),
                            padding: EdgeInsets.only(
                              bottom: 16 + offsetY,
                            ), // 动态偏移
                            child: AnimatedDefaultTextStyle(
                              duration: const Duration(milliseconds: 120),
                              style: TextStyle(
                                fontSize: fontSize,
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                              child: const Text('Header Title'),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ];
        },
        // body：内层滚动视图
        body: Builder(
          builder: (BuildContext context) {
            return CustomScrollView(
              slivers: [
                // 注入 overlap 占位，避免内容覆盖 AppBar
                SliverOverlapInjector(
                  handle: NestedScrollView.sliverOverlapAbsorberHandleFor(
                    context,
                  ),
                ),
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, index) => ListTile(title: Text('Item #$index')),
                    childCount: 30,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
