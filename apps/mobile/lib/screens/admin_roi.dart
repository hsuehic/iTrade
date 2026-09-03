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

    return Container(
      margin: EdgeInsets.fromLTRB(16.w, 8, 16.w, 8),
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1F2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.06),
        ),
      ),
      child: Row(
        children: [
          _summaryItem('screen.admin_roi.summary_users', 'Users', totalUsers.toString()),
          _summaryItem('screen.admin_roi.summary_accounts', 'Accounts', totalAccounts.toString()),
          _summaryItem(
            'screen.admin_roi.summary_balance',
            'Total Balance',
            _formatCurrency(totalBalance),
            fontSize: 13.sp,
          ),
          _summaryItem(
            'screen.admin_roi.summary_locked',
            'Locked',
            _formatCurrency(totalLocked),
            fontSize: 13.sp,
          ),
        ],
      ),
    );
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
          Row(
            children: [
              _roiItem('MtoNowROI', row.mtoNowRoi, hasBaseline: row.mtoNowBaseline > 0),
              SizedBox(width: 12.w),
              _roiItem('YtoNowROI', row.ytoNowRoi, hasBaseline: row.ytoNowBaseline > 0),
            ],
          ),
        ],
      ),
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

  Widget _roiItem(String label, double roi, {bool hasBaseline = true}) {
    return Expanded(
      child: Row(
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 12.sp, color: Colors.grey[600]),
          ),
          SizedBox(width: 6.w),
          Text(
            hasBaseline ? _formatRoi(roi) : 'N/A',
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: FontWeight.bold,
              color: hasBaseline ? _roiColor(roi) : Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }
}