# iTrade Backtest Runner

A self-contained Node.js script that runs MA (Moving Average) crossover backtests against Binance kline data and produces interactive HTML reports.

---

## Quick Start

```bash
# From the backtest/ directory:
node run_backtest.js backtest_template.json
```

That's it. The script auto-compiles the strategy, fetches data from the Binance API, runs the simulation, and writes HTML reports to the `result/` folder.

---

## Directory Layout

```
backtest/
├── run_backtest.js          # The backtest runner script
├── backtest_template.json   # Template config — copy and customise this
├── config/                  # Your saved config files (not tracked by default)
├── data/                    # Pre-downloaded kline JSON files (for "local" mode)
│   ├── btcusdc_15m.json
│   ├── ethusdc_15m.json
│   └── ...
└── result/                  # Generated HTML reports (one per symbol + comparison)
```

---

## Configuration Reference

All parameters live in a single JSON config file. Start from `backtest_template.json` and adjust as needed.

### `name` / `tag`

| Field  | Description                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `name` | Human-readable label shown in the report header.                                                                                              |
| `tag`  | Short string used as a filename prefix for output reports (e.g. `MA25_99_TP2_SL1.2_LS`). If omitted, auto-generated from strategy parameters. |

---

### `strategy`

| Field               | Type   | Description                                                                                                  |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `fastPeriod`        | number | Short MA window (bars). Entry signal fires when fast MA crosses slow MA.                                     |
| `slowPeriod`        | number | Long MA window (bars). Must be greater than `fastPeriod`.                                                    |
| `takeProfitPercent` | number | Take-profit distance from fill price as a percentage (e.g. `2` = 2%).                                        |
| `stopLossPercent`   | number | Stop-loss distance from fill price as a percentage. Set `0` to disable.                                      |
| `klineInterval`     | string | Candlestick interval. Supported values: `1m` `3m` `5m` `15m` `30m` `1h` `2h` `4h` `6h` `8h` `12h` `1d` `1w`. |
| `direction`         | string | Trade direction: `"long"` (buys only), `"short"` (sells only), or `"both"` (bidirectional).                  |

---

### `data`

| Field          | Type   | Description                                                                                                                                                                                                                            |
| -------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`       | string | `"api"` — fetch fresh candles from Binance automatically (default). `"local"` — read pre-downloaded JSON files from `localDir`.                                                                                                        |
| `exchange`     | string | `"binance-futures"` — USDⓈ-M perpetuals via `fapi.binance.com` (default). `"binance-spot"` — spot market via `api.binance.com`.                                                                                                        |
| `lookbackDays` | number | How many calendar days of history to fetch from the API. Note: Binance caps at roughly 90 days of 15m data cleanly. Use fewer days for higher-frequency intervals.                                                                     |
| `localDir`     | string | Only used when `source` is `"local"`. Path to the folder containing kline JSON files. Can be absolute or relative to the config file. File naming convention: `{symbol.toLowerCase()}_{klineInterval}.json` (e.g. `btcusdc_15m.json`). |

---

### `account`

| Field            | Type   | Description                                                                                |
| ---------------- | ------ | ------------------------------------------------------------------------------------------ |
| `initialBalance` | number | Starting paper-money balance in USDC (or quote asset). Default: `10000`.                   |
| `commissionRate` | number | Per-side commission as a decimal (e.g. `0.0002` = 0.02%, the Binance VIP maker rate).      |
| `entryTtlBars`   | number | How many bars to wait for a limit entry order to fill before cancelling it. Default: `16`. |

---

### `symbols`

An array of symbol configurations. `orderAmount` and `maxPos` are in **base asset units** (BTC, ETH, SOL — not USDC).

```json
{
  "sym": "BTCUSDC",
  "orderAmount": 0.0511,
  "maxPos": 0.2555
}
```

| Field         | Description                                                                   |
| ------------- | ----------------------------------------------------------------------------- |
| `sym`         | Trading pair symbol (must match Binance's naming, e.g. `BTCUSDC`, `ETHUSDC`). |
| `orderAmount` | Size of each individual order in base asset.                                  |
| `maxPos`      | Maximum allowed open position in base asset. Typically 3–5× `orderAmount`.    |

---

### `paths`

| Field          | Type         | Description                                                                                                  |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `outputDir`    | string       | Directory where HTML reports are saved. Relative to the config file. Default: `result`.                      |
| `projectRoot`  | string\|null | Root of the iTrade monorepo (the folder containing `packages/strategies/src`). Set to `null` to auto-detect. |
| `forceCompile` | boolean      | Set to `true` to force recompilation of the strategy even if the compiled output is already up-to-date.      |

---

## Output

For each run the script produces:

- **`{outputDir}/{tag}_{SYMBOL}.html`** — Detailed report for each symbol, including equity curve, trade log, and per-trade P&L.
- **`{outputDir}/{tag}_comparison.html`** — Side-by-side comparison across all symbols in the run.

Open any of these files directly in a browser — no server required.

---

## Common Workflows

### 1. Run with live Binance data (default)

```bash
node run_backtest.js backtest_template.json
```

### 2. Run with a custom config

```bash
# Create your own config
cp backtest_template.json config/my_strategy.json
# Edit config/my_strategy.json, then:
node run_backtest.js config/my_strategy.json
```

### 3. Run on pre-downloaded local data

Set `data.source` to `"local"` in your config and point `data.localDir` to the folder containing the kline JSON files:

```json
"data": {
  "source": "local",
  "localDir": "../backtest/data"
}
```

The data files must follow the naming convention `{symbol.toLowerCase()}_{klineInterval}.json` (e.g. `btcusdc_15m.json`). Sample files are already provided in the `data/` folder.

### 4. Force recompilation of the strategy

If you have modified the strategy TypeScript source and the script is not picking up your changes, set:

```json
"paths": {
  "forceCompile": true
}
```

---

## Tips

- **Higher-frequency intervals** (e.g. `1m`, `5m`) return fewer days from the API. Reduce `lookbackDays` if you hit API limits.
- **`stopLossPercent: 0`** disables the stop-loss entirely — useful for testing TP-only strategies.
- **Direction `"long"` / `"short"`** is handy for isolating one side of a bi-directional strategy before combining.
- Reports are self-contained HTML files and can be shared with teammates without any additional setup.
