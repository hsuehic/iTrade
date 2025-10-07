class OKXTicker {
  final String instId;
  final double last;
  final double open24h;
  final double volume;
  final String iconUrl;

  OKXTicker({
    required this.instId,
    required this.last,
    required this.open24h,
    required this.volume,
    required this.iconUrl,
  });

  factory OKXTicker.fromJson(Map<String, dynamic> json) {
    return OKXTicker(
      instId: json['instId'],
      last: double.parse(json['last']),
      open24h: double.parse(json['open24h']),
      volume: double.parse(json['vol24h']),
      iconUrl:
          'https://static.okx.com/cdn/assets/imgs/2210/${json['instId'].split('-')[0].toLowerCase()}.png',
    );
  }
}
