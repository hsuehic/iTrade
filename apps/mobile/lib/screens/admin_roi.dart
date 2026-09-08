import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../design/tokens/color.dart';
import '../models/admin_roi.dart';
import '../services/admin_service.dart';
import '../services/copy_service.dart';
import '../widgets/copy_text.dart';

/// Admin screen showing an aggregated asset & ROI overview for every user
/// that has at least one linked exchange account (mirror of the web console's
/// `/admin/roi-analysis` page).
///
/// Per row: account count, balance, fee/available balance, locked balance,
/// MtoNowROI (return from start of month to now) and YtoNowROI (return from
/// start of year to now). ROI values are colored green (profit) / red (loss)
/// using the same design tokens as the rest of the app.
class AdminRoiScreen extends StatefulWidget {
  const AdminRoiScreen({super.key});

  @override
  State<AdminRoiScreen> createState() => _AdminRoiScreenState();
}

class _AdminRoiScreenState extends State<AdminRoiScreen> {
  bool _loading = true;
  bool _error = false;
  List<AdminRoiRow> _rows = const [];
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    final rows = await AdminService.instance.fetchRoiAnalysis();
    if (!mounted) return;
    setState(() {
      if (rows == null) {
        // Transport/HTTP/parse failure — show the error state.
        _error = true;
        _loading = false;
      } else {
        // Successful (possibly empty) response — empty dataset shows the
        // "no users with exchange accounts" empty state, not an error.
        _rows = rows;
        _error = false;
        _loading = false;
      }
    });
  }

  List<AdminRoiRow> get _filtered {
    final query = _search.trim().toLowerCase();
    if (query.isEmpty) return _rows;
    return _rows.where((row) {
      return row.name.toLowerCase().contains(query) ||
          row.email.toLowerCase().contains(query);
    }).toList();
  }

  // ── Formatting helpers ────────────────────────────────────────────────
  String _formatCurrency(double v) {
    // Thousands separators for readability of larger aggregate balances.
    final neg = v < 0;
    final abs = v.abs();
    final s = abs.toStringAsFixed(2);
    final parts = s.split('.');
    final intPart = parts[0].replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (m) => ',',
    );
    return '\$${neg ? '-' : ''}$intPart.${parts[1]}';
  }

  String _formatRoi(double v) {
    if (v > 1000 || v < -1000) {
      return '${v >= 0 ? '+' : ''}${v.toStringAsFixed(0)}%';
    }
    return '${v >= 0 ? '+' : ''}${v.toStringAsFixed(2)}%';
  }

  Color _roiColor(double v) => v >= 0 ? ColorTokens.profitGreen : ColorTokens.lossRed;

  // ── Build ─────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: const CopyText(
          'screen.admin_roi.title',
          fallback: 'ROI Analysis',
        ),
        centerTitle: true,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error
          ? _buildError()
          : Column(
              children: [
                _buildSearchBar(isDark),
                _buildSummary(isDark),
                Expanded(
                  child: _filtered.isEmpty
                      ? _buildEmptyState()
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: EdgeInsets.fromLTRB(16.w, 4, 16.w, 32.w),
                            itemCount: _filtered.length,
                            separatorBuilder: (_, index) => SizedBox(height: 8.w),
                            itemBuilder: (context, index) =>
                                _buildRoiCard(_filtered[index], isDark),
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(32.w),
        child: CopyText(
          'screen.admin_roi.load_failed',
          fallback: 'Failed to load ROI analysis.',
          style: TextStyle(color: Colors.grey[600], fontSize: 14.sp),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(32.w),
        child: CopyText(
          'screen.admin_roi.empty',
          fallback: 'No users with exchange accounts.',
          style: TextStyle(color: Colors.grey[600], fontSize: 14.sp),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildSearchBar(bool isDark) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 8, 16.w, 4),
      child: TextField(
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: CopyService.instance.t(
            'screen.admin_roi.search_hint',
            fallback: 'Search user or email...',
          ),
          prefixIcon: const Icon(Icons.search),
          isDense: true,
          filled: true,
          fillColor: isDark ? Colors.grey[900] : Colors.grey.withValues(alpha: 0.08),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
        ),
        onChanged: (value) => setState(() => _search = value),
      ),
    );
  }

  Widget _buildSummary(bool isDark) {
    final totalUsers = _rows.length;
    final totalAccounts = _rows.fold<int>(0, (acc, r) => acc + r.accountCount);
    final totalBalance = _rows.fold<double>(0, (acc, r) => acc + r.balance);
    final totalLocked = _rows.fold<double>(0, (acc, r) => acc + r.lockedBalance);
    // PnL / ROI baselines: only count users with a real period-start baseline
    // (baseline > 0) so a user with no snapshot doesn't skew the aggregate,
    // mirroring the web console's weighted totals.
    double mtdPnl = 0, mtdBaseline = 0, ytdPnl = 0, ytdBaseline = 0;
    for (final r in _rows) {
      if (r.mtoNowBaseline > 0) {
        mtdPnl += r.mtoNowPnl;
        mtdBaseline += r.mtoNowBaseline;
      }
      if (r.ytoNowBaseline > 0) {
        ytdPnl += r.ytoNowPnl;
        ytdBaseline += r.ytoNowBaseline;
      }
    }
    final mtdRoi = mtdBaseline > 0 ? (mtdPnl / mtdBaseline) * 100 : 0.0;
    final ytdRoi = ytdBaseline > 0 ? (ytdPnl / ytdBaseline) * 100 : 0.0;
    final hasMtd = mtdBaseline > 0;
    final hasYtd = ytdBaseline > 0;

    return Container(
      margin: EdgeInsets.fromLTRB(16.w, 8, 16.w, 8),
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.06),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _summaryItem(
                'screen.admin_roi.summary_users',
                'Users',
                totalUsers.toString(),
              ),
              _summaryItem(
                'screen.admin_roi.summary_accounts',
                'Accounts',
                totalAccounts.toString(),
              ),
            ],
          ),
          SizedBox(height: 12.w),
          Row(
            children: [
              _summaryItem(
                'screen.admin_roi.summary_balance',
                'Total Balance',
                _formatCurrency(totalBalance),
              ),
              _summaryItem(
                'screen.admin_roi.summary_locked',
                'Locked',
                _formatCurrency(totalLocked),
              ),
            ],
          ),
          SizedBox(height: 12.w),
          Row(
            children: [
              _pnlSummaryCard(
                'screen.admin_roi.summary_mtd_pnl',
                'MTD PnL',
                _formatCurrencySigned(mtdPnl),
                mtdRoi,
                hasBaseline: hasMtd,
                isDark: isDark,
              ),
              SizedBox(width: 12.w),
              _pnlSummaryCard(
                'screen.admin_roi.summary_ytd_pnl',
                'YTD PnL',
                _formatCurrencySigned(ytdPnl),
                ytdRoi,
                hasBaseline: hasYtd,
                isDark: isDark,
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Colored MTD/YTD PnL summary card with its weighted ROI badge, mirroring
  /// the web console's MTD PnL / YTD PnL cards.
  Widget _pnlSummaryCard(
    String key,
    String fallback,
    String value,
    double roi,
    {
    required bool hasBaseline,
    required bool isDark,
  }) {
    final cardColor = hasBaseline
        ? (roi >= 0 ? ColorTokens.profitGreen : ColorTokens.lossRed)
        : Colors.grey;
    final baseBg = isDark ? const Color(0xFF242A3A) : const Color(0xFFF4F6F9);
    return Expanded(
      child: Container(
        padding: EdgeInsets.all(12.w),
        decoration: BoxDecoration(
          color: baseBg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CopyText(
              key,
              fallback: fallback,
              style: TextStyle(fontSize: 11.sp, color: Colors.grey[600]),
            ),
            SizedBox(height: 4.w),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                value,
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.bold,
                  color: hasBaseline ? cardColor : Colors.grey[600],
                ),
              ),
            ),
            SizedBox(height: 6.w),
            Container(
              padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.w),
              decoration: BoxDecoration(
                color: cardColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                hasBaseline ? _formatRoi(roi) : 'N/A',
                style: TextStyle(
                  fontSize: 11.sp,
                  fontWeight: FontWeight.bold,
                  color: hasBaseline ? cardColor : Colors.grey[600],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatCurrencySigned(double v) {
    return v >= 0 ? '+${_formatCurrency(v)}' : '−${_formatCurrency(v.abs())}';
  }

  Widget _summaryItem(
    String key,
    String fallback,
    String value, {
    double fontSize = 16,
  }) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CopyText(
            key,
            fallback: fallback,
            style: TextStyle(
              fontSize: 11.sp,
              color: Colors.grey[600],
            ),
          ),
          SizedBox(height: 2.w),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(
                fontSize: fontSize.sp,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRoiCard(AdminRoiRow row, bool isDark) {
    final displayName = row.name.isNotEmpty ? row.name : row.email;
    return Container(
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.06),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (row.name.isNotEmpty && row.email.isNotEmpty)
                      Text(
                        row.email,
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: Colors.grey[600],
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.w),
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.08)
                      : Colors.grey.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: CopyText(
                  'screen.admin_roi.account_count',
                  params: {'count': row.accountCount.toString()},
                  fallback: '{{count}} accts',
                  style: TextStyle(
                    fontSize: 11.sp,
                    color: Colors.grey[600],
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 12.w),
          Row(
            children: [
              _balanceItem('screen.admin_roi.balance', 'Balance', _formatCurrency(row.balance)),
              _balanceItem('screen.admin_roi.fee_balance', 'Fee Balance', _formatCurrency(row.feeBalance)),
              _balanceItem('screen.admin_roi.locked', 'Locked', _formatCurrency(row.lockedBalance)),
            ],
          ),
          SizedBox(height: 10.w),
          _buildPeriodBlock(
            label: 'MTD',
            labelKey: 'screen.admin_roi.mtd',
            pnl: row.mtoNowPnl,
            roi: row.mtoNowRoi,
            hasBaseline: row.mtoNowBaseline > 0,
          ),
          SizedBox(height: 8.w),
          _buildPeriodBlock(
            label: 'YTD',
            labelKey: 'screen.admin_roi.ytd',
            pnl: row.ytoNowPnl,
            roi: row.ytoNowRoi,
            hasBaseline: row.ytoNowBaseline > 0,
          ),
        ],
      ),
    );
  }

  /// One period (MTD / YTD) block: period label, colored PnL value and a
  /// colored ROI badge — mirrors the web console row which shows PnL + ROI
  /// together for each period.
  Widget _buildPeriodBlock({
    required String label,
    required String labelKey,
    required double pnl,
    required double roi,
    required bool hasBaseline,
  }) {
    final color = hasBaseline ? _roiColor(pnl) : Colors.grey[600];
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              CopyText(
                labelKey,
                fallback: label,
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey[700],
                ),
              ),
              SizedBox(width: 10.w),
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    hasBaseline ? _formatCurrencySigned(pnl) : 'N/A',
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.bold,
                      color: hasBaseline ? color : Colors.grey[600],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(width: 8.w),
        Container(
          padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.w),
          decoration: BoxDecoration(
            color: (hasBaseline ? _roiColor(roi) : Colors.grey)
                .withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            hasBaseline ? _formatRoi(roi) : 'N/A',
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.bold,
              color: hasBaseline ? _roiColor(roi) : Colors.grey[600],
            ),
          ),
        ),
      ],
    );
  }

  Widget _balanceItem(String key, String fallback, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CopyText(
            key,
            fallback: fallback,
            style: TextStyle(fontSize: 10.sp, color: Colors.grey[600]),
          ),
          SizedBox(height: 1.w),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}