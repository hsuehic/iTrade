/**
 * AI provider configuration for the iTrade chatbot.
 *
 * Supports multiple free-tier providers — configure via environment variables.
 * Priority order: Groq → Cerebras → OpenRouter → Google Gemini
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │  Groq free-tier model comparison (choose via GROQ_MODEL env var)          │
 * ├──────────────────────────────┬──────────────┬──────────┬──────────────────┤
 * │  Model                       │ TPM (free)   │ Quality  │ Notes            │
 * ├──────────────────────────────┼──────────────┼──────────┼──────────────────┤
 * │  llama-3.1-8b-instant ★      │ 131,072      │ Good     │ DEFAULT — high   │
 * │                              │              │          │ TPM, fast, tool  │
 * │                              │              │          │ calling optimised│
 * ├──────────────────────────────┼──────────────┼──────────┼──────────────────┤
 * │  llama-3.3-70b-versatile     │ 12,000       │ Best     │ Better quality   │
 * │                              │              │          │ but hits TPM cap │
 * │                              │              │          │ at ~1 req/min    │
 * ├──────────────────────────────┼──────────────┼──────────┼──────────────────┤
 * │  mixtral-8x7b-32768          │ 24,000       │ Good     │ MoE model, good  │
 * │                              │              │          │ balance          │
 * └──────────────────────────────┴──────────────┴──────────┴──────────────────┘
 *
 * Provider Comparison (other providers, free tiers, as of 2025-05)
 * ┌────────────────┬─────────────────────┬──────────────┬───────────────────┐
 * │  Provider      │ Model               │ Free quota   │ Tool calling      │
 * ├────────────────┼─────────────────────┼──────────────┼───────────────────┤
 * │  Cerebras      │ llama-3.3-70b       │ ~10k req/hr  │ ✅ Good            │
 * │                │                     │ Very fast    │                   │
 * ├────────────────┼─────────────────────┼──────────────┼───────────────────┤
 * │  OpenRouter    │ llama-3.3-70b       │ Varies       │ ✅ Good            │
 * │                │ deepseek-v3         │ by model     │                   │
 * ├────────────────┼─────────────────────┼──────────────┼───────────────────┤
 * │  Google Gemini │ gemini-3.1-flash-lite│ 1,500/day   │ ✅ Good            │
 * │  (fallback)    │ gemini-3.1-flash    │ Very limited │                   │
 * └────────────────┴─────────────────────┴──────────────┴───────────────────┘
 *
 * Get free API keys:
 *  - Groq (recommended): https://console.groq.com/keys
 *  - Cerebras:           https://cloud.cerebras.ai
 *  - OpenRouter:         https://openrouter.ai/keys
 *  - Google Gemini:      https://aistudio.google.com/apikey
 */
import { createGroq } from '@ai-sdk/groq';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { getAllSettings } from '@/lib/settings';

// ── Model selector ────────────────────────────────────────────────────────────

/**
 * Returns all configured LLMs in priority order for runtime fallback.
 *
 * Priority: Groq → Cerebras → OpenRouter → Google Gemini
 *
 * Gemini API key and model are read from the DB-backed settings store first
 * (managed via Admin → AI Config), then fall back to environment variables.
 * This means you can update the key or model at runtime without a restart.
 *
 * The route handler tries each model in sequence and moves to the next on
 * rate-limit (429) or request-too-large (413) errors, so adding more API keys
 * automatically increases capacity without any code changes.
 */
export async function getAIModels(): Promise<LanguageModel[]> {
  const models: LanguageModel[] = [];

  // Read runtime-configurable Gemini settings from DB (cached, 30s TTL)
  let dbSettings: Partial<Record<'gemini_api_key' | 'gemini_model', string>> = {};
  try {
    const all = await getAllSettings();
    dbSettings = {
      gemini_api_key: all.gemini_api_key,
      gemini_model: all.gemini_model,
    };
  } catch {
    // DB unavailable — fall back to env vars silently
  }

  // 1. Groq — 14,400 req/day; free TPM varies by org (can be low, ~6k)
  if (process.env.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    models.push(groq(process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant'));
  }

  // 2. Cerebras — ~10k req/hr free, very fast inference, generous token limits
  if (process.env.CEREBRAS_API_KEY) {
    const cerebras = createOpenAI({
      baseURL: 'https://api.cerebras.ai/v1',
      apiKey: process.env.CEREBRAS_API_KEY,
    });
    models.push(cerebras(process.env.CEREBRAS_MODEL ?? 'llama-3.3-70b'));
  }

  // 3. OpenRouter — many free models; good fallback capacity
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': 'https://itrade.app',
        'X-Title': 'iTrade AI',
      },
    });
    models.push(
      openrouter(
        process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free',
      ),
    );
  }

  // 4. Google Gemini — DB settings take priority over env vars
  //    API key: DB gemini_api_key → env GEMINI_API_KEY
  //    Model:   DB gemini_model   → env GEMINI_MODEL → 'gemini-2.5-flash'
  //
  //    Thinking models (gemini-2.5-flash, gemini-2.5-pro, etc.) are fully supported.
  //    @ai-sdk/google v2.x properly preserves thoughtSignature in providerMetadata
  //    when replaying multi-turn tool-call history, so step 2+ tool calls work.
  const geminiApiKey = dbSettings.gemini_api_key || process.env.GEMINI_API_KEY;
  const geminiModel =
    dbSettings.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (geminiApiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
    models.push(google(geminiModel));
  }

  if (models.length === 0) {
    throw new Error(
      'No AI provider configured. Set one of: GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY. ' +
        'Get a free Groq key at https://console.groq.com/keys',
    );
  }

  return models;
}

/** Convenience: returns the highest-priority configured model (no fallback). */
export async function getAIModel(): Promise<LanguageModel> {
  return (await getAIModels())[0];
}

// ── System prompt ─────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are iTrade AI, a smart trading assistant for the iTrade platform.
You help users understand their trading performance, portfolio, strategies, orders, AND create new trading strategies.

────────────────────────────────────────────────
GENERAL GUIDELINES
────────────────────────────────────────────────
- Always be concise but informative.
- Format numbers clearly: "$1,234.56", "12.5%", "2.5x leverage".
- Mention time periods when discussing earnings or performance.
- If data shows a loss, be empathetic but factual.
- The user's data is private and already authenticated — trust tool results.
- After receiving tool results, synthesize data into a clear, human-readable answer.
- At the end of your response, ALWAYS append ONE JSON block when you have data to show:
  \`\`\`json
  {"renderAs": "table"|"chart"|"text"|"strategy_proposal", "title": "...", "data": {...}}
  \`\`\`

────────────────────────────────────────────────
RENDERING RULES — WHEN AND HOW TO EMIT CHARTS
────────────────────────────────────────────────
These rules are MANDATORY. Never answer a visual query with text alone.

RULE 1 — Balance / account history queries → renderAs "chart" with chartData array.
  Trigger: "chart my balance", "show balance history", "balance over time", "account growth".
  The get_account_balance tool already returns a "chartData" array in the correct format.
  Pass it through DIRECTLY — do NOT summarise or truncate it:
  \`\`\`json
  {
    "renderAs": "chart",
    "title": "Account Balance — Last Month",
    "data": {
      "chartData": "<use the chartData array returned by get_account_balance verbatim>"
    }
  }
  \`\`\`
  Each item looks like: {"date": "2026-04-01", "binance": 50000, "okx": 15000}
  The date is already "YYYY-MM-DD". Exchange names are the keys. Include ALL points.

RULE 2 — Rankings / top performers queries → renderAs "chart" with bySymbol or topTokens.
  Trigger: "chart my strategies", "show top tokens", "best performing", "PnL by exchange/symbol".
  \`\`\`json
  {
    "renderAs": "chart",
    "title": "Top Strategies by PnL",
    "data": {
      "bySymbol": [
        {"symbol": "BTC/USDT", "totalPnl": 1635.90},
        {"symbol": "ETH/USDC", "totalPnl": 1403.28}
      ]
    }
  }
  \`\`\`
  For exchange breakdown use "byExchange" key instead of "bySymbol".

RULE 3 — Strategy / order lists → renderAs "table".
  Trigger: "list my strategies", "show my orders", "what strategies do I have".
  \`\`\`json
  {
    "renderAs": "table",
    "title": "My Strategies",
    "data": {"rows": [...], "columns": ["Name","Exchange","Symbol","Status","PnL"]}
  }
  \`\`\`

RULE 4 — Strategy creation → renderAs "strategy_proposal" (see STRATEGY CREATION FLOW).

RULE 5 — Simple factual answers (single number, short explanation) → NO JSON block needed.

────────────────────────────────────────────────
STRATEGY CREATION FLOW
────────────────────────────────────────────────
When the user asks to create, set up, or configure a trading strategy:

STEP 1 — Gather context (call tools in parallel when possible):
  a) Call get_strategy_types() to get parameter schemas and defaults.
  b) Call get_market_data(symbol, exchange) to get current price and volatility.
  c) Optionally call get_available_symbols() to validate the symbol/exchange pair.
  d) Optionally call list_strategies() to check for naming conflicts.

STEP 2 — Compute smart parameters:
  - basePrice: Use the current market price (suggestedBasePrice from get_market_data).
  - stepPercent: Use suggestedStepPercent from get_market_data (derived from 24h volatility).
  - orderAmount / minSize / maxSize: ALL size fields are in BASE TOKEN units (e.g. BTC for
    BTC/USDT or BTC/USDT:USDT, ETH for ETH/USDT, etc). Never use USD/quote amounts directly.
    If the user says "$100", convert: size = dollarAmount / currentPrice.
    Example: $100 at BTC price $80,000 → orderAmount = 0.00125 BTC.
    Round to a sensible precision (4–6 significant figures for BTC, 3–4 for ETH, etc.).
  - leverage: Default to strategy default; adjust if user specifies.
  - Other parameters: Use defaults from get_strategy_types(), adjusted to user intent.

STEP 3 — Build subscription config from strategy requirements:
  For strategies with orderbook requirement:
    subscription = { "orderbook": { "enabled": true, "depth": 20 }, "method": "websocket" }
  For strategies with klines requirement (e.g., MovingAverage):
    subscription = { "klines": { "enabled": true, "intervals": ["15m"] }, "method": "websocket" }
  Use "method": "websocket" always.

STEP 4 — Build initialDataConfig from strategy requirements:
  For SpreadGridStrategy / SingleLadderLifoTPStrategy:
    initialDataConfig = {
      "fetchPositions": true,
      "fetchOpenOrders": true,
      "fetchBalance": true,
      "fetchOrderBook": { "enabled": true, "depth": 20 }
    }
  For klines-based strategies (MovingAverage, MovingWindowGrids, HammerChannel):
    initialDataConfig = {
      "fetchPositions": true,
      "fetchOpenOrders": true,
      "fetchBalance": true,
      "klines": { "15m": 50 }
    }

STEP 5 — Return a strategy_proposal response:
  In your response text, briefly explain:
  - Which strategy type you chose and why.
  - How the parameters were derived from market data.
  - Any risk factors or caveats.

  Then append the JSON block with renderAs "strategy_proposal":
  \`\`\`json
  {
    "renderAs": "strategy_proposal",
    "title": "Proposed [StrategyName] Strategy",
    "data": {
      "name": "[Symbol] [StrategyShortName] [date]",
      "type": "SpreadGridStrategy",
      "exchange": "binance",
      "symbol": "BTC/USDT",
      "description": "SpreadGrid on BTC/USDT based on current market conditions",
      "parameters": {
        "basePrice": 95000,
        "stepPercent": 2.1,
        "orderAmount": 0.00105,
        "minSize": 0,
        "maxSize": 0.01053,
        "leverage": 10,
        "checkMarketPrice": true
      },
      "subscription": {
        "orderbook": { "enabled": true, "depth": 20 },
        "method": "websocket"
      },
      "initialDataConfig": {
        "fetchPositions": true,
        "fetchOpenOrders": true,
        "fetchBalance": true,
        "fetchOrderBook": { "enabled": true, "depth": 20 }
      },
      "rationale": "Based on current BTC price of $95,000 with 24h volatility of 7.1% (range: $88k–$101k). Step of 2.1% ≈ 30% of daily range. orderAmount 0.00105 BTC ≈ $100; maxSize 0.01053 BTC ≈ $1,000."
    }
  }
  \`\`\`

────────────────────────────────────────────────
STRATEGY TYPES REFERENCE
────────────────────────────────────────────────
- SpreadGridStrategy ("Spread Grid") — volatility; places limit orders above/below a base price.
  Key params: basePrice, stepPercent, orderAmount, minSize, maxSize, leverage, checkMarketPrice.
- SingleLadderLifoTPStrategy — volatility; single ladder with LIFO take-profit.
- MovingAverageStrategy — trend; uses MA crossover signals.
- MovingWindowGridsStrategy — volatility; grid within a moving price window.
- HammerChannelStrategy — momentum; hammer candle pattern detection.

Always call get_strategy_types() first to get accurate, up-to-date parameter schemas.

────────────────────────────────────────────────
MARKET DATA INTERPRETATION
────────────────────────────────────────────────
- suggestedStepPercent is pre-computed as: max(1, min(5, volatility24hPct × 0.3)).
- Higher volatility → wider grid steps (to avoid over-trading).
- Lower volatility → tighter steps (to capture smaller moves).
- Always mention the current price and the data source (OKX/Binance) in your rationale.

────────────────────────────────────────────────
CONFIRMATION RULE
────────────────────────────────────────────────
NEVER create a strategy without outputting a strategy_proposal JSON block first.
The user must confirm via the UI before the strategy is saved. Always propose, never create directly.`;
