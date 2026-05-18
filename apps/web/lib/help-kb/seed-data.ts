/**
 * Built-in seed articles for the help-KB chatbot.
 *
 * Loaded by `POST /api/admin/help-kb/seed-defaults`. Operators trigger seeding
 * once from the admin UI after the first deploy; re-running upserts by slug
 * so manual edits to existing articles are preserved (the upsert replaces
 * all fields including content, so do not run it after admins have edited).
 *
 * If GEMINI_API_KEY is set, the embedding service will populate each
 * article's vector at seed time. Otherwise the articles are stored with a
 * NULL embedding and the admin can click "Re-embed pending" later.
 */
export interface SeedArticle {
  slug: string;
  title: string;
  category: string;
  locale: 'en' | 'zh';
  content: string;
  tags?: string[];
}

export const SEED_ARTICLES: SeedArticle[] = [
  // ── English ────────────────────────────────────────────────────────────────
  {
    slug: 'what-is-itrade',
    title: 'What is iTrade?',
    category: 'general',
    locale: 'en',
    tags: ['overview', 'intro'],
    content: `iTrade is an intelligent and strategic cryptocurrency-trading platform that lets you trade across multiple exchanges (Binance, OKX, Coinbase) from a single interface.

Key features:
- **Multi-exchange trading** — connect any combination of supported exchanges and trade them from one dashboard.
- **AI-powered strategies** — built-in strategies including SpreadGrid and MovingAverage that you can run live or backtest.
- **Real-time market data** — live prices, order books, and balances streamed directly from each exchange.
- **Risk management** — built-in position sizing, stop-loss, and portfolio tracking.
- **Mobile + web** — manage portfolios on the web and trade on the go from the iOS or Android app.

iTrade is provided for study and research purposes. Trading cryptocurrencies carries significant risk; never risk funds you cannot afford to lose.`,
  },
  {
    slug: 'how-to-sign-up',
    title: 'How do I sign up for iTrade?',
    category: 'getting_started',
    locale: 'en',
    tags: ['signup', 'account'],
    content: `Sign up takes about a minute:

1. Click **Sign Up** in the top-right of the landing page.
2. Enter your email and a strong password (at least 8 characters, mix of letters and numbers).
3. Verify your email — we send a 6-digit code to confirm you own the address.
4. Sign in and you'll land on your dashboard.

You can also sign in with **Google** or **Apple** if you prefer not to manage another password.

Once signed in, head to **Settings → Exchange Accounts** to connect an exchange so you can start trading.`,
  },
  {
    slug: 'how-to-reset-password',
    title: 'How do I reset my password?',
    category: 'account',
    locale: 'en',
    tags: ['password', 'reset'],
    content: `If you've forgotten your password:

1. Click **Sign In**, then **Forgot password?** below the password field.
2. Enter the email you signed up with.
3. We'll send you a reset link that's valid for one hour.
4. Open the link and choose a new password.

If you don't receive the email within a few minutes, check your spam folder. If it still hasn't arrived, your account may have been created with a different email or via Google/Apple sign-in — try signing in with one of those instead.`,
  },
  {
    slug: 'mobile-install-android',
    title: 'How do I install the Android app?',
    category: 'mobile',
    locale: 'en',
    tags: ['android', 'install', 'apk'],
    content: `There are two ways to install iTrade on Android:

**Option 1 — Google Play Store (recommended)**
Open Google Play and search for *iTrade*, then tap **Install**. You'll get automatic updates whenever we release a new version.

**Option 2 — Direct APK**
On the landing page, find the **Download iTrade Mobile App** section and tap **Direct APK**. Your browser will download an .apk file.

To install an APK directly:
1. Open the downloaded file from your notifications or the Downloads folder.
2. If Android warns about "installing from unknown sources", grant the permission for your browser (Settings → Apps → Browser → Install unknown apps).
3. Tap **Install** and open the app once it's done.

After installation, sign in with the same email and password you use on the web.`,
  },
  {
    slug: 'mobile-install-ios',
    title: 'How do I install the iOS app?',
    category: 'mobile',
    locale: 'en',
    tags: ['ios', 'install', 'iphone', 'apple'],
    content: `Open the **App Store** on your iPhone or iPad and search for *iTrade*, then tap **Get**.

Alternatively, scan the QR code on the **Download iTrade Mobile App** section of the landing page — it deep-links to the App Store listing.

Once installed, open the app and sign in with the same email and password you use on the web. If you signed up with Google or Apple, tap the matching button at the bottom of the sign-in screen.`,
  },
  {
    slug: 'connect-exchange-account',
    title: 'How do I connect my exchange account?',
    category: 'trading',
    locale: 'en',
    tags: ['exchange', 'api-key', 'binance', 'okx', 'coinbase'],
    content: `To trade or backtest with live data, connect one of the supported exchanges (Binance, OKX, Coinbase):

1. Sign in and go to **Settings → Exchange Accounts**.
2. Click **Add Account** and pick the exchange.
3. Create an API key on the exchange website. The key needs **read** and **trade** permissions; **never** enable withdrawals.
4. Paste the API key and secret into the iTrade form. We encrypt both at rest.
5. Give the account a memorable name (e.g. "Binance Main") and save.

Once connected, your balances and order history sync within a few seconds. You can connect multiple accounts per exchange — useful for separating strategies or sub-accounts.

**Security tip:** restrict the API key to the iTrade server's IP if your exchange supports it.`,
  },
  {
    slug: 'trading-strategies-overview',
    title: 'What trading strategies does iTrade support?',
    category: 'strategies',
    locale: 'en',
    tags: ['strategy', 'spreadgrid', 'movingaverage'],
    content: `iTrade ships with two built-in strategies that you can run live or backtest:

**SpreadGrid** — places a grid of buy and sell orders around the current price. Profits from sideways movement: each oscillation between grid levels captures a small spread. Good for ranging markets, less ideal in strong trends.

**MovingAverage** — a classic trend-following strategy. Goes long when a faster moving average crosses above a slower one, and exits (or reverses) on the opposite cross. Configurable periods so you can tune for the timeframe you care about.

Both strategies are configured per **trading pair and exchange**. You can run several strategies in parallel, each on its own pair, and view their combined performance on the dashboard.

To see how a strategy would have performed historically before risking real funds, use the **Backtest** tab to simulate it on past price data.`,
  },
  {
    slug: 'troubleshooting-cannot-sign-in',
    title: "Why can't I sign in?",
    category: 'troubleshooting',
    locale: 'en',
    tags: ['signin', 'login', 'troubleshooting'],
    content: `If sign-in fails, try the following in order:

1. **Check your email address** — make sure it's the one you signed up with, with no typos.
2. **Verify your password** — use **Forgot password?** if you're not sure.
3. **Try Google or Apple** — you may have originally signed up via SSO without setting a password.
4. **Clear cookies for itrade.ihsueh.com** and refresh.
5. **Disable browser extensions** that block cookies or scripts (privacy extensions are a common culprit).

If you still can't get in, contact support with the email you used to sign up — we'll help recover access.`,
  },
  {
    slug: 'faq-is-itrade-free',
    title: 'Is iTrade free to use?',
    category: 'faq',
    locale: 'en',
    tags: ['pricing', 'free'],
    content: `Yes — iTrade is currently free to use for study and research purposes. You only pay your exchange's own trading fees (which iTrade does not collect).

Please remember that cryptocurrency trading is risky. Past backtest performance is not a guarantee of future results, and you should never trade with funds you cannot afford to lose.`,
  },

  // ── 中文 ────────────────────────────────────────────────────────────────────
  {
    slug: 'what-is-itrade-zh',
    title: '什么是 iTrade？',
    category: 'general',
    locale: 'zh',
    tags: ['概览', '介绍'],
    content: `iTrade 是一个智能策略加密货币交易平台，让你在一个界面里同时管理多个交易所（Binance、OKX、Coinbase）。

主要功能：
- **多交易所**：连接任意支持的交易所组合，在同一仪表盘上交易。
- **AI 策略**：内置 SpreadGrid、MovingAverage 等策略，可实盘或回测。
- **实时行情**：来自各交易所的实时价格、订单簿、余额。
- **风险管理**：内置仓位管理、止损、组合追踪。
- **移动 + 网页**：在网页端管理组合，在 iOS / Android 应用上随时交易。

iTrade 仅供学习研究使用。加密货币交易风险较高，请勿投入超过你承受能力的资金。`,
  },
  {
    slug: 'mobile-install-android-zh',
    title: '如何安装 Android 应用？',
    category: 'mobile',
    locale: 'zh',
    tags: ['安卓', 'apk', '安装'],
    content: `Android 上有两种安装方式：

**方式一：Google Play（推荐）**
在 Google Play 中搜索 *iTrade*，点击**安装**。后续会自动更新。

**方式二：直接安装 APK**
在登录页底部的"下载 iTrade 移动应用"区域点击**直接下载 APK**，浏览器会下载 .apk 文件。

安装 APK 步骤：
1. 在通知栏或"下载"文件夹中打开下载的 APK。
2. 如果系统提示"未知来源"，请在"设置 → 应用 → 浏览器 → 安装未知应用"中授权。
3. 点击**安装**，完成后打开应用。

安装完成后，使用与网页相同的邮箱和密码登录。`,
  },
  {
    slug: 'connect-exchange-account-zh',
    title: '如何连接交易所账户？',
    category: 'trading',
    locale: 'zh',
    tags: ['交易所', 'api', '币安', 'okx'],
    content: `要进行实盘或使用实时数据回测，需要连接一个支持的交易所账户：

1. 登录后进入**设置 → 交易所账户**。
2. 点击**添加账户**，选择交易所。
3. 在交易所网站创建 API Key，权限只勾选**读取**与**交易**，**切勿**开启提币权限。
4. 将 API Key 与 Secret 填入 iTrade 表单。我们会在服务器端加密存储。
5. 给账户起一个易记的名字（例如 "Binance 主账户"），保存。

连接成功后，余额与订单会在几秒内同步。同一个交易所可以连接多个账户，便于策略分组管理。

**安全建议**：若交易所支持，请将 API Key 限定到 iTrade 服务器 IP。`,
  },
];
