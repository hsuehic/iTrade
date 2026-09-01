import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:url_launcher/url_launcher.dart';

import '../design/tokens/color.dart';
import '../services/account_service.dart';
import '../services/api_client.dart';
import '../services/copy_service.dart';
import '../widgets/copy_text.dart';

/// Static egress IP of the iTrade production server (GCE).
/// Mirrors `ITRADE_SERVER_IP` from `apps/web/lib/itrade-server-ip.ts`.
const String kItradeServerIp = '34.143.244.107';

/// Give the server time to persist + sync the new account before probing
/// the analytics endpoint (avoids stale-cache false negatives).
const Duration _kVerifyDelay = Duration(milliseconds: 1500);

/// Wizard steps — mirrors the web wizard
/// (`apps/web/components/onboarding/exchange-onboarding-wizard.tsx`).
enum _WizardStep { intro, register, createApikey, addToItrade }

enum _VerifyState {
  idle,
  loading,
  success,

  /// Hard "Connection failed" view. Currently unreachable: a failed save
  /// is handled inline in [_saveAndVerify] (SnackBar + stay on the form),
  /// and [_verify] only runs after a successful save — every verify
  /// outcome is mapped to [success] with `_verifiedInAnalytics` picking
  /// the message. Kept (with the failed view + retry button) for future
  /// use, e.g. if a real credential check is added server-side.
  failed,
}

/// Outcome of [ExchangeOnboardingWizard.show]: lets callers distinguish an
/// explicit user skip (persist the preference) from an accidental
/// barrier-tap / back-gesture dismissal (session-only).
enum ExchangeOnboardingWizardResult {
  /// The user completed the wizard ("View Dashboard").
  finished,

  /// The user explicitly closed the wizard ("Skip for now" or the X
  /// button). Callers should persist the dismissal so the wizard doesn't
  /// auto-show again.
  explicitlyDismissed,

  /// The sheet was popped without an explicit wizard action — a barrier
  /// tap or the system back gesture. Callers must treat this as
  /// session-only (an accidental tap must not permanently suppress the
  /// wizard).
  barrierDismissed,
}

/// Static per-exchange onboarding content (links + copy keys).
/// Mirrors `apps/web/lib/exchange-registration-links.ts` and
/// `apps/web/lib/exchange-api-key-guides.ts`.
class _WizardExchange {
  const _WizardExchange({
    required this.id,
    required this.nameKey,
    required this.nameFallback,
    required this.taglineKey,
    required this.taglineFallback,
    required this.registerUrl,
    required this.kycGuideUrl,
    required this.apiKeyGuideWebUrl,
    required this.apiKeyGuideMobileUrl,
    required this.requiredPermissionKeys,
    required this.forbiddenPermissionKeys,
  });

  final String id;
  final String nameKey;
  final String nameFallback;
  final String taglineKey;
  final String taglineFallback;
  final String registerUrl;
  final String kycGuideUrl;
  final String apiKeyGuideWebUrl;
  final String apiKeyGuideMobileUrl;
  final List<String> requiredPermissionKeys;
  final List<String> forbiddenPermissionKeys;

  bool get requiresPassphrase => id == 'okx';
}

const List<_WizardExchange> _kWizardExchanges = [
  _WizardExchange(
    id: 'binance',
    nameKey: 'screen.exchange_onboarding.intro.exchanges.binance.name',
    nameFallback: 'Binance',
    taglineKey: 'screen.exchange_onboarding.intro.exchanges.binance.tagline',
    taglineFallback: "World's largest crypto exchange",
    registerUrl: 'https://www.binance.com/en/register',
    kycGuideUrl:
        'https://www.binance.com/en/support/faq/how-to-complete-identity-verification-360027353311',
    apiKeyGuideWebUrl: 'https://www.binance.com/en/my/settings/api-management',
    apiKeyGuideMobileUrl:
        'https://www.binance.com/en/support/faq/detail/360002502072',
    requiredPermissionKeys: [
      'screen.exchange_onboarding.permissions.binance.required.read',
      'screen.exchange_onboarding.permissions.binance.required.spot',
      'screen.exchange_onboarding.permissions.binance.required.futures',
    ],
    forbiddenPermissionKeys: [
      'screen.exchange_onboarding.permissions.binance.forbidden.withdrawals',
    ],
  ),
  _WizardExchange(
    id: 'okx',
    nameKey: 'screen.exchange_onboarding.intro.exchanges.okx.name',
    nameFallback: 'OKX',
    taglineKey: 'screen.exchange_onboarding.intro.exchanges.okx.tagline',
    taglineFallback: 'Advanced trading with low fees',
    registerUrl: 'https://www.okx.com/account/register',
    kycGuideUrl:
        'https://www.okx.com/help/i-can-t-complete-identity-verification-verification-levels-explained',
    apiKeyGuideWebUrl: 'https://www.okx.com/account/my-api',
    apiKeyGuideMobileUrl: 'https://www.okx.com/help/api-faq',
    requiredPermissionKeys: [
      'screen.exchange_onboarding.permissions.okx.required.read',
      'screen.exchange_onboarding.permissions.okx.required.trade',
    ],
    forbiddenPermissionKeys: [
      'screen.exchange_onboarding.permissions.okx.forbidden.withdraw',
    ],
  ),
  _WizardExchange(
    id: 'coinbase',
    nameKey: 'screen.exchange_onboarding.intro.exchanges.coinbase.name',
    nameFallback: 'Coinbase',
    taglineKey: 'screen.exchange_onboarding.intro.exchanges.coinbase.tagline',
    taglineFallback: 'Trusted & regulated US exchange',
    registerUrl: 'https://www.coinbase.com/signup',
    kycGuideUrl:
        'https://help.coinbase.com/en/coinbase/privacy-and-security/verify-my-id',
    apiKeyGuideWebUrl: 'https://portal.cdp.coinbase.com/',
    apiKeyGuideMobileUrl:
        'https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication',
    requiredPermissionKeys: [
      'screen.exchange_onboarding.permissions.coinbase.required.accountsRead',
      'screen.exchange_onboarding.permissions.coinbase.required.balancesRead',
      'screen.exchange_onboarding.permissions.coinbase.required.tradesWrite',
    ],
    forbiddenPermissionKeys: [
      'screen.exchange_onboarding.permissions.coinbase.forbidden.withdrawalsWrite',
    ],
  ),
];

/// Guided onboarding wizard for linking the first exchange account.
///
/// Mobile mirror of the web wizard
/// `apps/web/components/onboarding/exchange-onboarding-wizard.tsx`:
/// 4 steps — exchange selection → registration guide → API key guide →
/// inline form with save + auto-verify. Shown as a near-full-screen modal
/// bottom sheet (mobile idiom for a desktop-style dialog).
class ExchangeOnboardingWizard extends StatefulWidget {
  const ExchangeOnboardingWizard({
    super.key,
    required this.onDismissed,
    required this.onFinished,
  });

  /// Invoked when the user explicitly closes the wizard without finishing
  /// ("Skip for now" or the close button). Barrier-tap / back-gesture
  /// dismissals never reach this callback (the sheet pops with no result).
  final VoidCallback onDismissed;

  /// Invoked after save + verify succeeded and the user taps "View Dashboard".
  final VoidCallback onFinished;

  /// Opens the wizard as a near-full-screen modal bottom sheet and resolves
  /// with how it was closed.
  ///
  /// DESIGN CHOICE (barrier dismissal): the sheet keeps the default
  /// `isDismissible: true` so a barrier tap / back gesture still offers a
  /// quick escape, but those dismissals pop with `null` and resolve as
  /// [ExchangeOnboardingWizardResult.barrierDismissed] — callers persist
  /// the "dismissed" preference ONLY on [explicitlyDismissed] ("Skip for
  /// now" / X button), so an accidental tap can never permanently suppress
  /// the wizard.
  static Future<ExchangeOnboardingWizardResult> show(
    BuildContext context,
  ) async {
    final result = await showModalBottomSheet<ExchangeOnboardingWizardResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      // Barrier taps / back gestures pop with `null` (mapped to
      // [ExchangeOnboardingWizardResult.barrierDismissed] below); only the
      // explicit in-wizard buttons pop a non-null result.
      // The wizard contains a form — avoid accidental drag-dismiss.
      enableDrag: false,
      builder: (sheetContext) => ExchangeOnboardingWizard(
        onDismissed: () => Navigator.of(sheetContext).pop(
          ExchangeOnboardingWizardResult.explicitlyDismissed,
        ),
        onFinished: () => Navigator.of(sheetContext).pop(
          ExchangeOnboardingWizardResult.finished,
        ),
      ),
    );
    return result ?? ExchangeOnboardingWizardResult.barrierDismissed;
  }

  @override
  State<ExchangeOnboardingWizard> createState() =>
      _ExchangeOnboardingWizardState();
}

class _ExchangeOnboardingWizardState extends State<ExchangeOnboardingWizard> {
  _WizardStep _step = _WizardStep.intro;
  _WizardExchange? _selectedExchange;
  bool _saving = false;
  _VerifyState _verifyState = _VerifyState.idle;

  /// Whether the saved exchange appeared in the analytics `exchanges[]`.
  /// Mirrors web: a saved account without analytics data yet still counts
  /// as connected (balance data may lag) — only shown as a softer message.
  bool _verifiedInAnalytics = false;

  final _formKey = GlobalKey<FormState>();
  final _accountIdController = TextEditingController();
  final _apiKeyController = TextEditingController();
  final _secretKeyController = TextEditingController();
  final _passphraseController = TextEditingController();
  bool _obscureSecret = true;
  bool _obscurePassphrase = true;

  @override
  void dispose() {
    _accountIdController.dispose();
    _apiKeyController.dispose();
    _secretKeyController.dispose();
    _passphraseController.dispose();
    super.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation — rules mirror the web wizard exactly.
  // ─────────────────────────────────────────────────────────────────────────

  void _goToStep(_WizardStep step) {
    setState(() {
      _step = step;
      _verifyState = _VerifyState.idle;
    });
  }

  /// Context-aware back: Step 2 (create API key) back → Step 0 (exchange
  /// selection); Step 3 (connect) back → Step 2; otherwise previous step.
  void _handleBack() {
    switch (_step) {
      case _WizardStep.createApikey:
        _goToStep(_WizardStep.intro);
      case _WizardStep.addToItrade:
        _goToStep(_WizardStep.createApikey);
      case _WizardStep.intro:
      case _WizardStep.register:
        if (_step != _WizardStep.intro) {
          _goToStep(_WizardStep.intro);
        }
    }
  }

  String _exchangeName(_WizardExchange exchange) {
    return CopyService.instance.t(
      exchange.nameKey,
      fallback: exchange.nameFallback,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // External links
  // ─────────────────────────────────────────────────────────────────────────

  Future<void> _launchExternal(String url) async {
    try {
      final uri = Uri.parse(url);
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        debugPrint('[ExchangeOnboardingWizard] Could not launch $url');
        _showLinkErrorSnack();
      }
    } catch (e) {
      // Sanitized log — keep the exception type, drop the raw message.
      debugPrint(
        '[ExchangeOnboardingWizard] Launch failed for $url (${e.runtimeType})',
      );
      _showLinkErrorSnack();
    }
  }

  void _showLinkErrorSnack() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: CopyText(
          'screen.exchange_onboarding.common.link_open_failed',
          fallback: 'Could not open the link',
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Save + auto-verify (mirrors web Step 3 inline form)
  // ─────────────────────────────────────────────────────────────────────────

  Future<void> _saveAndVerify() async {
    final exchange = _selectedExchange;
    if (exchange == null) return;
    if (!_formKey.currentState!.validate()) return;

    setState(() => _saving = true);
    try {
      final saved = await AccountService.instance.saveAccount(
        exchange: exchange.id,
        accountId: _accountIdController.text.trim(),
        apiKey: _apiKeyController.text.trim(),
        secretKey: _secretKeyController.text.trim(),
        passphrase: exchange.requiresPassphrase
            ? _passphraseController.text.trim()
            : null,
        isActive: true,
      );
      if (!saved) {
        throw Exception('Saving account failed');
      }
    } catch (e) {
      // Sanitized log — the raw exception may echo request details (Dio
      // includes the request body, which contains the API secret).
      debugPrint('[ExchangeOnboardingWizard] Save failed (${e.runtimeType})');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: CopyText(
              'screen.exchange_onboarding.addToItrade.saveFailed',
              fallback: 'Failed to save account',
            ),
          ),
        );
        setState(() => _saving = false);
      }
      return;
    }
    if (!mounted) return;
    setState(() => _saving = false);
    await _verify(exchange);
  }

  /// Probes the analytics endpoint after a successful save.
  ///
  /// Because this only runs once `AccountService.saveAccount` succeeded,
  /// the account is already persisted server-side (upsert) — so EVERY
  /// outcome here is at least "saved but not yet visible":
  ///  - HTTP 200 + exchange listed → fully verified (hard success copy).
  ///  - HTTP 200 + exchange missing → analytics sync lag (soft copy).
  ///  - HTTP != 200, or the fetch threw (transient network / server
  ///    hiccup) → still saved; soft copy, NOT the hard "Connection failed"
  ///    view — showing that would make the user think the save failed and
  ///    keep retrying for no reason.
  /// A hard failure is only possible when the save itself fails, which is
  /// handled in [_saveAndVerify]'s catch (SnackBar + stay on the form), so
  /// this method never sets [_VerifyState.failed].
  Future<void> _verify(_WizardExchange exchange) async {
    setState(() {
      _verifyState = _VerifyState.loading;
      _verifiedInAnalytics = false;
    });

    // Give the server time to persist + sync the new account before probing.
    await Future<void>.delayed(_kVerifyDelay);

    var found = false;
    try {
      final response = await ApiClient.instance.getJson<Map<String, dynamic>>(
        '/api/analytics/account',
        queryParameters: const {'period': '7d'},
      );
      if (response.statusCode == 200) {
        final exchangesRaw = response.data?['exchanges'];
        found =
            exchangesRaw is List &&
            exchangesRaw.any((e) => e is Map && e['exchange'] == exchange.id);
      } else {
        // Non-200 analytics response — the account is still saved; fall
        // through to the soft "saved but not yet visible" message.
        debugPrint(
          '[ExchangeOnboardingWizard] Verify probe returned HTTP '
          '${response.statusCode}; treating as saved-but-unverified',
        );
      }
    } catch (e) {
      // Probe threw (transient network / server hiccup) — the account is
      // still saved; fall through to the soft message. Sanitized log (no
      // raw exception details).
      debugPrint(
        '[ExchangeOnboardingWizard] Verify probe failed (${e.runtimeType}); '
        'treating as saved-but-unverified',
      );
    }
    if (!mounted) return;
    setState(() {
      _verifiedInAnalytics = found;
      _verifyState = _VerifyState.success;
    });
  }

  /// Mirrors web `handleRetry`: reset the verify state and clear the form.
  ///
  /// NOTE: only reachable from the failed view, which is itself currently
  /// unreachable (see [_VerifyState.failed]) — kept wired up so the failed
  /// view stays functional if a hard-failure path is (re)introduced.
  void _retry() {
    _accountIdController.clear();
    _apiKeyController.clear();
    _secretKeyController.clear();
    _passphraseController.clear();
    setState(() => _verifyState = _VerifyState.idle);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final size = MediaQuery.sizeOf(context);
    final viewInsets = MediaQuery.of(context).viewInsets;

    return Padding(
      // Keep the sheet above the on-screen keyboard.
      padding: EdgeInsets.only(bottom: viewInsets.bottom),
      child: Container(
        height: size.height * 0.92,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF161B22) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildSheetHeader(context, isDark),
              _buildStepper(context, isDark),
              Divider(
                height: 1,
                color: isDark
                    ? Colors.white.withValues(alpha: 0.08)
                    : Colors.black.withValues(alpha: 0.06),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(16.w, 16.w, 16.w, 16.w),
                  child: _buildStepContent(context, isDark),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSheetHeader(BuildContext context, bool isDark) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 8.w, 8.w, 0),
      child: Column(
        children: [
          // Drag handle (visual affordance; dragging is disabled).
          Container(
            width: 36.w,
            height: 4.w,
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.18)
                  : Colors.black.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          SizedBox(height: 10.w),
          Row(
            children: [
              Expanded(
                child: CopyText(
                  'screen.exchange_onboarding.title',
                  fallback: 'Connect your exchange',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              IconButton(
                icon: Icon(
                  Icons.close,
                  size: 22.w,
                  color: isDark ? Colors.white70 : Colors.black54,
                ),
                onPressed: widget.onDismissed,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStepper(BuildContext context, bool isDark) {
    final labels = <(_WizardStep, String, String)>[
      (
        _WizardStep.intro,
        'screen.exchange_onboarding.steps.intro',
        'Select Exchange',
      ),
      (
        _WizardStep.register,
        'screen.exchange_onboarding.steps.register',
        'Register',
      ),
      (
        _WizardStep.createApikey,
        'screen.exchange_onboarding.steps.createApikey',
        'Create API Key',
      ),
      (
        _WizardStep.addToItrade,
        'screen.exchange_onboarding.steps.addToItrade',
        'Connect',
      ),
    ];

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.w),
      child: Row(
        children: [
          for (final (index, entry) in labels.indexed)
            Expanded(
              child: _buildStepperItem(
                context,
                isDark: isDark,
                index: index,
                isLast: index == labels.length - 1,
                step: entry.$1,
                labelKey: entry.$2,
                labelFallback: entry.$3,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStepperItem(
    BuildContext context, {
    required bool isDark,
    required int index,
    required bool isLast,
    required _WizardStep step,
    required String labelKey,
    required String labelFallback,
  }) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final isActive = step == _step;
    final isDone = index < _step.index;
    final active = isActive || isDone;
    final connectorColor = index <= _step.index
        ? primary.withValues(alpha: 0.6)
        : (isDark ? Colors.white.withValues(alpha: 0.12) : Colors.black12);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Expanded(
              child: Container(
                height: 2,
                color: index == 0 ? Colors.transparent : connectorColor,
              ),
            ),
            SizedBox(width: 6.w),
            Container(
              width: 24.w,
              height: 24.w,
              decoration: BoxDecoration(
                color: active ? primary : Colors.transparent,
                shape: BoxShape.circle,
                border: Border.all(
                  color: active
                      ? primary
                      : (isDark
                            ? Colors.white.withValues(alpha: 0.18)
                            : Colors.black26),
                  width: 1.2,
                ),
              ),
              child: isDone
                  ? Icon(
                      Icons.check,
                      size: 14.sp,
                      color: theme.colorScheme.onPrimary,
                    )
                  : Center(
                      child: Text(
                        '${index + 1}',
                        style: TextStyle(
                          fontSize: 11.sp,
                          fontWeight: FontWeight.w700,
                          color: active
                              ? theme.colorScheme.onPrimary
                              : (isDark ? Colors.white60 : Colors.black45),
                        ),
                      ),
                    ),
            ),
            SizedBox(width: 6.w),
            Expanded(
              child: Container(
                height: 2,
                color: isLast ? Colors.transparent : connectorColor,
              ),
            ),
          ],
        ),
        SizedBox(height: 6.w),
        CopyText(
          labelKey,
          fallback: labelFallback,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 10.sp,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive
                ? (isDark ? Colors.white : Colors.black87)
                : (isDark ? Colors.white54 : Colors.black45),
          ),
        ),
      ],
    );
  }

  Widget _buildStepContent(BuildContext context, bool isDark) {
    switch (_step) {
      case _WizardStep.intro:
        return _buildIntroStep(context, isDark);
      case _WizardStep.register:
        return _buildRegisterStep(context, isDark);
      case _WizardStep.createApikey:
        return _buildCreateApikeyStep(context, isDark);
      case _WizardStep.addToItrade:
        return _buildAddToItradeStep(context, isDark);
    }
  }

  Widget _buildStepHeader(
    BuildContext context, {
    required String titleKey,
    required String titleFallback,
    required String descriptionKey,
    required String descriptionFallback,
    Map<String, String>? params,
  }) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CopyText(
          titleKey,
          params: params,
          fallback: titleFallback,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        SizedBox(height: 6.w),
        CopyText(
          descriptionKey,
          params: params,
          fallback: descriptionFallback,
          style: theme.textTheme.bodySmall?.copyWith(
            height: 1.45,
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.white70
                : Colors.black54,
          ),
        ),
      ],
    );
  }

  Widget _buildStepCard(BuildContext context, {required Widget child}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.04)
            : Colors.black.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(14.r),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.06),
        ),
      ),
      child: child,
    );
  }

  // ── Step 0: Intro + exchange selection ────────────────────────────────────

  Widget _buildIntroStep(BuildContext context, bool isDark) {
    final theme = Theme.of(context);
    final exchangeSelected = _selectedExchange != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildStepHeader(
          context,
          titleKey: 'screen.exchange_onboarding.intro.title',
          titleFallback: 'Welcome to iTrade',
          descriptionKey: 'screen.exchange_onboarding.intro.description',
          descriptionFallback:
              'Connect your exchange account in 3 simple steps to start trading.',
        ),
        SizedBox(height: 16.w),
        for (final exchange in _kWizardExchanges)
          _buildExchangeCard(context, exchange, isDark),
        SizedBox(height: 12.w),
        // Primary CTA — mirrors web "I have an account" (skips registration).
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: exchangeSelected
                ? () => _goToStep(_WizardStep.createApikey)
                : null,
            icon: Icon(Icons.arrow_forward_rounded, size: 18.w),
            label: CopyText(
              'screen.exchange_onboarding.common.haveAccount',
              fallback: 'I have an account',
              style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: theme.colorScheme.onPrimary,
              padding: EdgeInsets.symmetric(vertical: 14.w),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12.r),
              ),
            ),
          ),
        ),
        SizedBox(height: 8.w),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: exchangeSelected
                ? () {
                    _launchExternal(_selectedExchange!.registerUrl);
                    _goToStep(_WizardStep.register);
                  }
                : null,
            icon: Icon(Icons.open_in_new_rounded, size: 18.w),
            label: CopyText(
              'screen.exchange_onboarding.common.goRegister',
              fallback: 'Go Register',
              style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
            ),
            style: OutlinedButton.styleFrom(
              padding: EdgeInsets.symmetric(vertical: 14.w),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12.r),
              ),
            ),
          ),
        ),
        SizedBox(height: 4.w),
        Center(
          child: TextButton(
            onPressed: widget.onDismissed,
            child: CopyText(
              'screen.exchange_onboarding.common.later',
              fallback: 'Skip for now',
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildExchangeCard(
    BuildContext context,
    _WizardExchange exchange,
    bool isDark,
  ) {
    final theme = Theme.of(context);
    final selected = _selectedExchange?.id == exchange.id;
    final accent = _exchangeAccent(context, exchange.id);
    final borderColor = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : Colors.black.withValues(alpha: 0.06);

    return Padding(
      padding: EdgeInsets.only(bottom: 10.w),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14.r),
        child: InkWell(
          onTap: () => setState(() => _selectedExchange = exchange),
          borderRadius: BorderRadius.circular(14.r),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: EdgeInsets.all(12.w),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14.r),
              border: Border.all(
                color: selected ? theme.colorScheme.primary : borderColor,
                width: selected ? 1.6 : 1,
              ),
              color: selected
                  ? theme.colorScheme.primary.withValues(alpha: 0.06)
                  : null,
            ),
            child: Row(
              children: [
                _buildExchangeLogo(exchange, accent, isDark),
                SizedBox(width: 12.w),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CopyText(
                        exchange.nameKey,
                        fallback: exchange.nameFallback,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(height: 2.w),
                      CopyText(
                        exchange.taglineKey,
                        fallback: exchange.taglineFallback,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 12.sp,
                          color: isDark ? Colors.white60 : Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                Icon(
                  selected
                      ? Icons.check_circle_rounded
                      : Icons.radio_button_unchecked,
                  size: 22.w,
                  color: selected
                      ? theme.colorScheme.primary
                      : (isDark ? Colors.white24 : Colors.black26),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildExchangeLogo(
    _WizardExchange exchange,
    Color accentColor,
    bool isDark,
  ) {
    final asset = _exchangeLogoAsset(exchange.id);
    return Container(
      width: 44.w,
      height: 44.w,
      decoration: BoxDecoration(
        color: accentColor.withValues(alpha: isDark ? 0.18 : 0.12),
        shape: BoxShape.circle,
        border: Border.all(color: accentColor.withValues(alpha: 0.25)),
      ),
      child: ClipOval(
        child: asset == null
            ? Icon(Icons.account_balance, color: accentColor, size: 22.sp)
            : Padding(
                padding: EdgeInsets.all(8.w),
                child: Image.asset(
                  asset,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) {
                    return Icon(
                      Icons.account_balance,
                      color: accentColor,
                      size: 22.sp,
                    );
                  },
                ),
              ),
      ),
    );
  }

  String? _exchangeLogoAsset(String exchangeId) {
    switch (exchangeId) {
      case 'binance':
        return 'assets/icons/exchanges/binance.png';
      case 'okx':
        return 'assets/icons/exchanges/okx.png';
      case 'coinbase':
        return 'assets/icons/exchanges/coinbase.png';
      default:
        return null;
    }
  }

  Color _exchangeAccent(BuildContext context, String exchangeId) {
    switch (exchangeId) {
      case 'binance':
        return ColorTokens.exchangeBinance;
      case 'okx':
        return ColorTokens.exchangeOkx;
      case 'coinbase':
        return ColorTokens.exchangeCoinbase;
      default:
        return Theme.of(context).colorScheme.primary;
    }
  }

  // ── Step 1: Register exchange account ─────────────────────────────────────

  Widget _buildRegisterStep(BuildContext context, bool isDark) {
    final exchange = _selectedExchange;
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildStepHeader(
          context,
          titleKey: 'screen.exchange_onboarding.register.title',
          titleFallback: 'Create your exchange account',
          descriptionKey: 'screen.exchange_onboarding.register.description',
          descriptionFallback:
              'If you already have an account, skip this step.',
        ),
        SizedBox(height: 16.w),
        _buildStepCard(
          context,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CopyText(
                'screen.exchange_onboarding.register.guideTitle',
                params: exchange != null
                    ? {'exchange': _exchangeName(exchange)}
                    : null,
                fallback: 'How to register on {{exchange}}',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: 10.w),
              _buildNumberedGuideRow(
                context,
                number: 1,
                copyKey: 'screen.exchange_onboarding.register.step1',
                fallback:
                    "Visit the exchange's official website and sign up with your email.",
              ),
              _buildNumberedGuideRow(
                context,
                number: 2,
                copyKey: 'screen.exchange_onboarding.register.step2',
                fallback:
                    'Complete identity verification (KYC) — this is required to use API features.',
              ),
              _buildNumberedGuideRow(
                context,
                number: 3,
                copyKey: 'screen.exchange_onboarding.register.step3',
                fallback:
                    'Enable Two-Factor Authentication (2FA) — required for API key creation.',
              ),
            ],
          ),
        ),
        SizedBox(height: 12.w),
        if (exchange != null) ...[
          _buildLinkTile(
            context,
            icon: Icons.verified_user_outlined,
            labelKey: 'screen.exchange_onboarding.register.kycGuide',
            labelFallback: 'KYC/Identity verification guide',
            url: exchange.kycGuideUrl,
            isDark: isDark,
          ),
          SizedBox(height: 8.w),
          _buildLinkTile(
            context,
            icon: Icons.app_registration_outlined,
            labelKey: 'screen.exchange_onboarding.register.registerLink',
            labelFallback: 'Go to registration page',
            url: exchange.registerUrl,
            isDark: isDark,
          ),
        ],
        SizedBox(height: 20.w),
        _buildStepNavButtons(
          context,
          onNext: () => _goToStep(_WizardStep.createApikey),
        ),
      ],
    );
  }

  Widget _buildNumberedGuideRow(
    BuildContext context, {
    required int number,
    required String copyKey,
    required String fallback,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Padding(
      padding: EdgeInsets.only(bottom: 8.w),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 18.w,
            child: CopyText.raw(
              '$number.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: CopyText(
              copyKey,
              fallback: fallback,
              style: theme.textTheme.bodySmall?.copyWith(
                height: 1.45,
                color: isDark ? Colors.white70 : Colors.black54,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLinkTile(
    BuildContext context, {
    required IconData icon,
    required String labelKey,
    required String labelFallback,
    required String url,
    required bool isDark,
  }) {
    final theme = Theme.of(context);
    final borderColor = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : Colors.black.withValues(alpha: 0.06);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(12.r),
      child: InkWell(
        onTap: () => _launchExternal(url),
        borderRadius: BorderRadius.circular(12.r),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.w),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12.r),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18.w, color: theme.colorScheme.primary),
              SizedBox(width: 10.w),
              Expanded(
                child: CopyText(
                  labelKey,
                  fallback: labelFallback,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ),
              Icon(
                Icons.open_in_new_rounded,
                size: 15.w,
                color: theme.colorScheme.primary.withValues(alpha: 0.7),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Step 2: Create API key ────────────────────────────────────────────────

  Widget _buildCreateApikeyStep(BuildContext context, bool isDark) {
    final exchange = _selectedExchange;
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildStepHeader(
          context,
          titleKey: 'screen.exchange_onboarding.createApikey.title',
          titleFallback: 'Create an API Key',
          descriptionKey: 'screen.exchange_onboarding.createApikey.description',
          descriptionFallback:
              'Generate API credentials on your exchange to connect with iTrade.',
        ),
        SizedBox(height: 16.w),
        if (exchange != null) ...[
          _buildStepCard(
            context,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CopyText(
                  'screen.exchange_onboarding.createApikey.guideTitle',
                  params: {'exchange': _exchangeName(exchange)},
                  fallback: 'How to create an API Key on {{exchange}}',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 10.w),
                _buildLinkTile(
                  context,
                  icon: Icons.monitor_outlined,
                  labelKey: 'screen.exchange_onboarding.createApikey.webLink',
                  labelFallback: 'Web: Open API Management',
                  url: exchange.apiKeyGuideWebUrl,
                  isDark: isDark,
                ),
                SizedBox(height: 8.w),
                _buildLinkTile(
                  context,
                  icon: Icons.smartphone_outlined,
                  labelKey: exchange.id == 'coinbase'
                      ? 'screen.exchange_onboarding.createApikey.mobileLinkCoinbase'
                      : 'screen.exchange_onboarding.createApikey.mobileLink',
                  labelFallback: 'Mobile App: Official guide',
                  url: exchange.apiKeyGuideMobileUrl,
                  isDark: isDark,
                ),
              ],
            ),
          ),
          SizedBox(height: 12.w),
          _buildStepCard(
            context,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CopyText(
                  'screen.exchange_onboarding.createApikey.permissionsTitle',
                  fallback: 'Required API permissions',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 10.w),
                CopyText(
                  'screen.exchange_onboarding.createApikey.actions.required',
                  fallback: 'Required permissions (enable these):',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isDark ? Colors.white60 : Colors.black54,
                  ),
                ),
                SizedBox(height: 6.w),
                Wrap(
                  spacing: 6.w,
                  runSpacing: 6.w,
                  children: [
                    for (final key in exchange.requiredPermissionKeys)
                      _buildPermissionBadge(context, key, forbidden: false),
                  ],
                ),
                SizedBox(height: 12.w),
                Divider(
                  height: 1,
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.08)
                      : Colors.black.withValues(alpha: 0.06),
                ),
                SizedBox(height: 12.w),
                CopyText(
                  'screen.exchange_onboarding.createApikey.actions.forbidden',
                  fallback: 'Forbidden permissions (do NOT enable):',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isDark ? Colors.white60 : Colors.black54,
                  ),
                ),
                SizedBox(height: 6.w),
                Wrap(
                  spacing: 6.w,
                  runSpacing: 6.w,
                  children: [
                    for (final key in exchange.forbiddenPermissionKeys)
                      _buildPermissionBadge(context, key, forbidden: true),
                  ],
                ),
              ],
            ),
          ),
        ],
        SizedBox(height: 12.w),
        // IP whitelist notice — mirrors web ApiKeyIpWhitelistNotice (modal).
        _buildAmberNotice(
          context,
          descriptionKey:
              'screen.exchange_onboarding.createApikey.ipWhitelist.description',
          descriptionFallback:
              'Before entering credentials, enable IP whitelist on your exchange API key and add {{serverIp}} to the allowed list.',
          params: const {'serverIp': kItradeServerIp},
        ),
        SizedBox(height: 12.w),
        // Security tip.
        _buildAmberNotice(
          context,
          titleKey: 'screen.exchange_onboarding.createApikey.securityTip.title',
          titleFallback: 'Security tip: IP whitelist',
          descriptionKey:
              'screen.exchange_onboarding.createApikey.securityTip.description',
          descriptionFallback:
              "Add the iTrade server IP {{serverIp}} to your API key's IP whitelist. This ensures only our server can access your account.",
          params: const {'serverIp': kItradeServerIp},
        ),
        SizedBox(height: 20.w),
        _buildStepNavButtons(
          context,
          onNext: () => _goToStep(_WizardStep.addToItrade),
        ),
      ],
    );
  }

  Widget _buildPermissionBadge(
    BuildContext context,
    String copyKey, {
    required bool forbidden,
  }) {
    final color = forbidden ? ColorTokens.lossRed : ColorTokens.profitGreen;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 5.w),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            forbidden ? Icons.gpp_bad_outlined : Icons.check_circle_outline,
            size: 13.sp,
            color: color,
          ),
          SizedBox(width: 4.w),
          Flexible(
            child: CopyText(
              copyKey,
              fallback: '',
              style: TextStyle(
                color: color,
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAmberNotice(
    BuildContext context, {
    String? titleKey,
    String? titleFallback,
    required String descriptionKey,
    required String descriptionFallback,
    Map<String, String>? params,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final amber = ColorTokens.warningAmber;
    final titleColor = isDark
        ? const Color(0xFFFCD34D)
        : const Color(0xFFB45309);
    final descColor = isDark
        ? const Color(0xFFFDE68A)
        : const Color(0xFF92400E);

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: amber.withValues(alpha: isDark ? 0.12 : 0.10),
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: amber.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, color: amber, size: 18.sp),
          SizedBox(width: 10.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (titleKey != null) ...[
                  CopyText(
                    titleKey,
                    fallback: titleFallback ?? '',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: titleColor,
                      fontSize: 13.sp,
                    ),
                  ),
                  SizedBox(height: 4.w),
                ],
                CopyText(
                  descriptionKey,
                  params: params,
                  fallback: descriptionFallback,
                  style: theme.textTheme.bodySmall?.copyWith(
                    height: 1.45,
                    color: descColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Step 3: Add to iTrade — inline form + save + auto-verify ──────────────

  Widget _buildAddToItradeStep(BuildContext context, bool isDark) {
    switch (_verifyState) {
      case _VerifyState.loading:
        return _buildVerifyingView(context);
      case _VerifyState.success:
        return _buildVerifySuccessView(context);
      case _VerifyState.failed:
        return _buildVerifyFailedView(context, isDark);
      case _VerifyState.idle:
        return _buildInlineForm(context, isDark);
    }
  }

  Widget _buildVerifyingView(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 48.w),
      child: Column(
        children: [
          SizedBox(
            width: 36.w,
            height: 36.w,
            child: const CircularProgressIndicator(strokeWidth: 3),
          ),
          SizedBox(height: 16.w),
          CopyText(
            'screen.exchange_onboarding.verify.loading',
            fallback: 'Verifying connection...',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.brightness == Brightness.dark
                  ? Colors.white70
                  : Colors.black54,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVerifySuccessView(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        SizedBox(height: 32.w),
        Icon(
          Icons.check_circle_rounded,
          size: 64.w,
          color: ColorTokens.profitGreen,
        ),
        SizedBox(height: 16.w),
        CopyText(
          'screen.exchange_onboarding.verify.successTitle',
          fallback: 'Connection verified!',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        SizedBox(height: 8.w),
        CopyText(
          _verifiedInAnalytics
              ? 'screen.exchange_onboarding.verify.successDesc'
              : 'screen.exchange_onboarding.verify.successNoBalance',
          fallback:
              'Your exchange account is now linked. You can view your balance and start trading on the dashboard.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            height: 1.5,
            color: theme.brightness == Brightness.dark
                ? Colors.white70
                : Colors.black54,
          ),
        ),
        SizedBox(height: 32.w),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: widget.onFinished,
            style: ElevatedButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: theme.colorScheme.onPrimary,
              padding: EdgeInsets.symmetric(vertical: 14.w),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12.r),
              ),
            ),
            child: CopyText(
              'screen.exchange_onboarding.verify.viewDashboard',
              fallback: 'View Dashboard',
              style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildVerifyFailedView(BuildContext context, bool isDark) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(height: 16.w),
        Center(
          child: Icon(
            Icons.error_outline_rounded,
            size: 56.w,
            color: ColorTokens.lossRed,
          ),
        ),
        SizedBox(height: 12.w),
        CopyText(
          'screen.exchange_onboarding.verify.failedTitle',
          fallback: 'Connection failed',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        SizedBox(height: 8.w),
        CopyText(
          'screen.exchange_onboarding.verify.failedDesc',
          fallback:
              "We couldn't verify the connection. Please check your API key permissions and IP whitelist settings.",
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            height: 1.5,
            color: isDark ? Colors.white70 : Colors.black54,
          ),
        ),
        SizedBox(height: 20.w),
        _buildStepCard(
          context,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CopyText(
                'screen.exchange_onboarding.verify.troubleshoot',
                fallback: 'Troubleshooting checklist:',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: 8.w),
              _buildTroubleshootRow(
                context,
                copyKey: 'screen.exchange_onboarding.verify.troubleshoot1',
                fallback: 'Verify the API Key and Secret Key are correct',
              ),
              _buildTroubleshootRow(
                context,
                copyKey: 'screen.exchange_onboarding.verify.troubleshoot2',
                fallback:
                    'Ensure the required permissions are enabled (see Step 2)',
              ),
              _buildTroubleshootRow(
                context,
                copyKey: 'screen.exchange_onboarding.verify.troubleshoot3',
                fallback:
                    "Add the iTrade server IP to the API key's IP whitelist",
              ),
            ],
          ),
        ),
        SizedBox(height: 20.w),
        Row(
          children: [
            TextButton(
              onPressed: _handleBack,
              child: CopyText(
                'screen.exchange_onboarding.common.back',
                fallback: 'Back',
              ),
            ),
            const Spacer(),
            ElevatedButton(
              onPressed: _retry,
              style: ElevatedButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: theme.colorScheme.onPrimary,
                padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 12.w),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12.r),
                ),
              ),
              child: CopyText(
                'screen.exchange_onboarding.addToItrade.retry',
                fallback: 'Try Again',
                style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTroubleshootRow(
    BuildContext context, {
    required String copyKey,
    required String fallback,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Padding(
      padding: EdgeInsets.only(bottom: 6.w),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.check_circle_outline,
            size: 14.sp,
            color: theme.colorScheme.primary,
          ),
          SizedBox(width: 8.w),
          Expanded(
            child: CopyText(
              copyKey,
              fallback: fallback,
              style: theme.textTheme.bodySmall?.copyWith(
                height: 1.45,
                color: isDark ? Colors.white70 : Colors.black54,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInlineForm(BuildContext context, bool isDark) {
    final exchange = _selectedExchange;
    final theme = Theme.of(context);

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildStepHeader(
            context,
            titleKey: 'screen.exchange_onboarding.addToItrade.title',
            titleFallback: 'Connect to iTrade',
            descriptionKey:
                'screen.exchange_onboarding.addToItrade.description',
            descriptionFallback:
                'Enter your API credentials to link your {{exchange}} account.',
            params: exchange != null
                ? {'exchange': _exchangeName(exchange)}
                : null,
          ),
          SizedBox(height: 16.w),
          if (exchange != null) _buildExchangeBadgeRow(context, exchange),
          SizedBox(height: 12.w),
          _buildFormField(
            context,
            controller: _accountIdController,
            icon: Icons.account_circle_outlined,
            labelKey: 'screen.exchange_onboarding.addToItrade.fields.accountId',
            labelFallback: 'Account Name / ID',
            helperKey:
                'screen.exchange_onboarding.addToItrade.fields.accountIdHint',
            helperFallback: 'A nickname to identify this account.',
            errorKey:
                'screen.exchange_onboarding.addToItrade.fields.accountIdRequired',
            errorFallback: 'Please enter an account name',
          ),
          SizedBox(height: 12.w),
          _buildFormField(
            context,
            controller: _apiKeyController,
            icon: Icons.vpn_key_outlined,
            labelKey: 'screen.exchange_onboarding.addToItrade.fields.apiKey',
            labelFallback: 'API Key',
            errorKey:
                'screen.exchange_onboarding.addToItrade.fields.apiKeyRequired',
            errorFallback: 'Please enter the API Key',
          ),
          SizedBox(height: 12.w),
          _buildFormField(
            context,
            controller: _secretKeyController,
            icon: Icons.lock_outline,
            labelKey: 'screen.exchange_onboarding.addToItrade.fields.secretKey',
            labelFallback: 'Secret Key',
            errorKey:
                'screen.exchange_onboarding.addToItrade.fields.secretKeyRequired',
            errorFallback: 'Please enter the Secret Key',
            obscureText: _obscureSecret,
            onToggleObscure: () =>
                setState(() => _obscureSecret = !_obscureSecret),
            isSecret: true,
          ),
          if (exchange != null && exchange.requiresPassphrase) ...[
            SizedBox(height: 12.w),
            _buildFormField(
              context,
              controller: _passphraseController,
              icon: Icons.password_outlined,
              labelKey:
                  'screen.exchange_onboarding.addToItrade.fields.passphrase',
              labelFallback: 'Passphrase',
              errorKey:
                  'screen.exchange_onboarding.addToItrade.fields.passphraseRequired',
              errorFallback: 'Passphrase is required for OKX',
              obscureText: _obscurePassphrase,
              onToggleObscure: () =>
                  setState(() => _obscurePassphrase = !_obscurePassphrase),
              isSecret: true,
            ),
          ],
          SizedBox(height: 16.w),
          // Security notice.
          Container(
            width: double.infinity,
            padding: EdgeInsets.all(12.w),
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(12.r),
              border: Border.all(
                color: theme.colorScheme.primary.withValues(alpha: 0.25),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.shield_outlined,
                  color: theme.colorScheme.primary,
                  size: 18.sp,
                ),
                SizedBox(width: 10.w),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CopyText(
                        'screen.exchange_onboarding.addToItrade.security.title',
                        fallback: 'Your keys are encrypted',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          fontSize: 13.sp,
                        ),
                      ),
                      SizedBox(height: 4.w),
                      CopyText(
                        'screen.exchange_onboarding.addToItrade.security.description',
                        fallback:
                            'iTrade encrypts your API credentials at rest. We never store your secrets in plaintext.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          height: 1.45,
                          color: isDark ? Colors.white70 : Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: 20.w),
          Row(
            children: [
              TextButton(
                onPressed: _handleBack,
                child: CopyText(
                  'screen.exchange_onboarding.common.back',
                  fallback: 'Back',
                ),
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: _saving ? null : _saveAndVerify,
                style: ElevatedButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  foregroundColor: theme.colorScheme.onPrimary,
                  padding: EdgeInsets.symmetric(
                    horizontal: 20.w,
                    vertical: 12.w,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                ),
                child: _saving
                    ? SizedBox(
                        width: 18.w,
                        height: 18.w,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: theme.colorScheme.onPrimary,
                        ),
                      )
                    : CopyText(
                        'screen.exchange_onboarding.addToItrade.saveAndVerify',
                        fallback: 'Save & Verify',
                        style: TextStyle(
                          fontSize: 14.sp,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildExchangeBadgeRow(
    BuildContext context,
    _WizardExchange exchange,
  ) {
    final theme = Theme.of(context);
    final accent = _exchangeAccent(context, exchange.id);
    return Row(
      children: [
        CopyText(
          'screen.exchange_onboarding.addToItrade.fields.exchange',
          fallback: 'Exchange',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.brightness == Brightness.dark
                ? Colors.white60
                : Colors.black54,
          ),
        ),
        SizedBox(width: 8.w),
        Container(
          padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.w),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: accent.withValues(alpha: 0.3)),
          ),
          child: CopyText(
            exchange.nameKey,
            fallback: exchange.nameFallback,
            style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }

  Widget _buildFormField(
    BuildContext context, {
    required TextEditingController controller,
    required IconData icon,
    required String labelKey,
    required String labelFallback,
    required String errorKey,
    required String errorFallback,
    String? helperKey,
    String? helperFallback,
    bool obscureText = false,
    VoidCallback? onToggleObscure,

    /// Whether this field holds a secret credential (secret key /
    /// passphrase). Secret fields use the visible-password keyboard so
    /// iOS/Android never auto-correct, smart-substitute or learn the pasted
    /// value — even while it is temporarily revealed via the eye toggle.
    bool isSecret = false,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderColor = isDark
        ? Colors.white.withValues(alpha: 0.12)
        : Colors.black.withValues(alpha: 0.08);
    final fillColor = isDark
        ? Colors.white.withValues(alpha: 0.04)
        : Colors.black.withValues(alpha: 0.02);

    return TextFormField(
      controller: controller,
      obscureText: obscureText,
      // Secret credentials: visible-password keyboard (no autocorrect /
      // smart substitution / learning) even when temporarily revealed.
      keyboardType: isSecret ? TextInputType.visiblePassword : null,
      autocorrect: false,
      enableSuggestions: false,
      style: theme.textTheme.bodyMedium?.copyWith(
        fontWeight: FontWeight.w600,
        color: theme.colorScheme.onSurface,
      ),
      decoration: InputDecoration(
        // Floating label — stays visible after the user types/pastes a
        // long credential (unlike a hint, which disappears once text is
        // entered). While the field is empty the label renders inside it,
        // doubling as the placeholder.
        labelText: CopyService.instance.t(labelKey, fallback: labelFallback),
        labelStyle: TextStyle(
          color: isDark ? Colors.white54 : Colors.black54,
          fontWeight: FontWeight.w500,
          fontSize: 14.sp,
        ),
        floatingLabelStyle: TextStyle(
          color: theme.colorScheme.primary,
          fontWeight: FontWeight.w600,
          fontSize: 12.sp,
        ),
        helperText: helperKey != null
            ? CopyService.instance.t(helperKey, fallback: helperFallback ?? '')
            : null,
        helperMaxLines: 2,
        helperStyle: theme.textTheme.bodySmall?.copyWith(
          color: isDark ? Colors.white38 : Colors.black38,
          fontSize: 11.sp,
        ),
        prefixIcon: Padding(
          padding: EdgeInsets.only(left: 12.w, right: 8.w),
          child: Icon(icon, size: 20.w, color: theme.colorScheme.primary),
        ),
        prefixIconConstraints: BoxConstraints(minWidth: 36.w, minHeight: 36.w),
        suffixIcon: onToggleObscure == null
            ? null
            : IconButton(
                icon: Icon(
                  obscureText
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  size: 20.w,
                  color: isDark ? Colors.white54 : Colors.black45,
                ),
                onPressed: onToggleObscure,
              ),
        filled: true,
        fillColor: fillColor,
        contentPadding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 14.w),
        constraints: BoxConstraints(minHeight: 52.w),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: BorderSide(color: borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: BorderSide(color: theme.colorScheme.primary, width: 1.2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: BorderSide(color: theme.colorScheme.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: BorderSide(color: theme.colorScheme.error),
        ),
      ),
      validator: (value) {
        if (value == null || value.trim().isEmpty) {
          return CopyService.instance.t(errorKey, fallback: errorFallback);
        }
        return null;
      },
    );
  }

  /// Bottom navigation row for guide steps (Back + primary "Done" action).
  Widget _buildStepNavButtons(
    BuildContext context, {
    required VoidCallback onNext,
  }) {
    final theme = Theme.of(context);
    return Row(
      children: [
        TextButton(
          onPressed: _handleBack,
          child: CopyText(
            'screen.exchange_onboarding.common.back',
            fallback: 'Back',
          ),
        ),
        const Spacer(),
        ElevatedButton.icon(
          onPressed: onNext,
          icon: Icon(Icons.arrow_forward_rounded, size: 18.w),
          label: CopyText(
            'screen.exchange_onboarding.common.completed',
            fallback: 'Done',
            style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: theme.colorScheme.primary,
            foregroundColor: theme.colorScheme.onPrimary,
            padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 12.w),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12.r),
            ),
          ),
        ),
      ],
    );
  }
}
