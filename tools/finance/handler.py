"""
Finance Tool Lambda — AgentCore Gateway target
Provides Yahoo Finance stock data, analysis, and comparisons.
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

import yfinance as yf

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DELIMITER = "___"
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]{1,6}([.\-][A-Z0-9]{1,4})?$")
VALID_PERIODS = ("1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max")
VALID_INTERVALS = ("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo")
MAX_HISTORY_ROWS = 15
MAX_NEWS_ITEMS = 10
MAX_COMPARE_SYMBOLS = 5
MAX_OPTIONS_ROWS = 10


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route tool calls from AgentCore Gateway."""
    logger.info("event=%s", json.dumps(event))

    tool_name = _extract_tool_name(context)
    logger.info("tool=%s", tool_name)

    router: dict[str, Any] = {
        "stock_quote": stock_quote,
        "stock_history": stock_history,
        "stock_compare": stock_compare,
        "financial_news": financial_news,
        "stock_analysis": stock_analysis,
        "options_chain": options_chain,
    }

    handler_fn = router.get(tool_name)
    if not handler_fn:
        return _error(f"Unknown tool: {tool_name}")

    try:
        return handler_fn(event)
    except ValueError as e:
        logger.warning("tool=%s validation_error=%s", tool_name, str(e))
        return _error(str(e))
    except Exception:
        logger.error("tool=%s unexpected_error", tool_name, exc_info=True)
        return _error("An internal error occurred")


def _extract_tool_name(context: Any) -> str:
    """Pull tool name from Gateway-injected client context."""
    try:
        raw = context.client_context.custom["bedrockAgentCoreToolName"]
        if DELIMITER in raw:
            return raw[raw.index(DELIMITER) + len(DELIMITER):]
        return raw
    except (AttributeError, KeyError, TypeError):
        return "unknown"


def _validate_symbol(raw: Any) -> str:
    """Validate ticker symbol format. Raises ValueError on invalid input."""
    if not raw or not isinstance(raw, str):
        raise ValueError("symbol is required")
    symbol = raw.strip().upper()
    if not SYMBOL_PATTERN.match(symbol):
        logger.warning("invalid_symbol_attempted: %s", raw)
        raise ValueError(f"Invalid symbol format: {raw}")
    return symbol


# ── Tools ──────────────────────────────────────────────────────────


def stock_quote(params: dict[str, Any]) -> dict[str, Any]:
    """Real-time stock quote with key metrics."""
    symbol = _validate_symbol(params.get("symbol"))

    info = yf.Ticker(symbol).info
    price = (info or {}).get("regularMarketPrice") or (info or {}).get("currentPrice")
    if not info or not price:
        return _error(f"No data for {symbol}")

    lines = [
        f"**{info.get('shortName', symbol)}** ({symbol})",
        f"Price: ${_fmt(price)}",
        f"Change: {_fmt(info.get('regularMarketChange'))} ({_fmt(info.get('regularMarketChangePercent'))}%)",
        f"Open: ${_fmt(info.get('regularMarketOpen'))}",
        f"Previous Close: ${_fmt(info.get('regularMarketPreviousClose'))}",
        f"Day Range: ${_fmt(info.get('regularMarketDayLow'))} – ${_fmt(info.get('regularMarketDayHigh'))}",
        f"52W Range: ${_fmt(info.get('fiftyTwoWeekLow'))} – ${_fmt(info.get('fiftyTwoWeekHigh'))}",
        f"Volume: {_int(info.get('regularMarketVolume'))}",
        f"Market Cap: ${_compact(info.get('marketCap'))}",
        f"P/E (TTM): {_fmt(info.get('trailingPE'))}",
        f"EPS (TTM): ${_fmt(info.get('trailingEps'))}",
        f"Dividend Yield: {_pct(info.get('dividendYield'))}",
    ]
    return _ok("\n".join(lines))


def stock_history(params: dict[str, Any]) -> dict[str, Any]:
    """Historical OHLCV data with summary statistics."""
    symbol = _validate_symbol(params.get("symbol"))
    period = params.get("period", "1mo")
    interval = params.get("interval", "1d")

    if period not in VALID_PERIODS:
        return _error(f"period must be one of: {', '.join(VALID_PERIODS)}")
    if interval not in VALID_INTERVALS:
        return _error(f"interval must be one of: {', '.join(VALID_INTERVALS)}")

    hist = yf.Ticker(symbol).history(period=period, interval=interval)
    if hist.empty:
        return _error(f"No history for {symbol} (period={period})")

    rows: list[str] = []
    step = max(1, len(hist) // MAX_HISTORY_ROWS)
    for i in range(0, len(hist), step):
        row = hist.iloc[i]
        date = hist.index[i].strftime("%Y-%m-%d")
        rows.append(
            f"| {date} | {row['Open']:.2f} | {row['High']:.2f} | "
            f"{row['Low']:.2f} | {row['Close']:.2f} | {_int(int(row['Volume']))} |"
        )

    first_close = hist["Close"].iloc[0]
    last_close = hist["Close"].iloc[-1]
    change = last_close - first_close
    pct = (change / first_close) * 100 if first_close else 0.0
    high = hist["High"].max()
    low = hist["Low"].min()
    avg_vol = hist["Volume"].mean()

    header = (
        f"**{symbol}** — {period} history (interval: {interval})\n\n"
        "| Date | Open | High | Low | Close | Volume |\n"
        "|------|------|------|-----|-------|--------|\n"
    )
    summary = (
        f"\n\n**Summary:** Change ${change:.2f} ({pct:+.2f}%) | "
        f"High ${high:.2f} | Low ${low:.2f} | Avg Vol {_int(int(avg_vol))}"
    )
    return _ok(header + "\n".join(rows) + summary)


def stock_compare(params: dict[str, Any]) -> dict[str, Any]:
    """Compare multiple stocks side by side."""
    symbols_raw = params.get("symbols", [])
    if not isinstance(symbols_raw, list) or not symbols_raw:
        return _error("symbols (array of tickers) is required")
    if len(symbols_raw) > MAX_COMPARE_SYMBOLS:
        return _error(f"Maximum {MAX_COMPARE_SYMBOLS} symbols for comparison")

    symbols = [_validate_symbol(s) for s in symbols_raw]

    rows: list[str] = []
    for sym in symbols:
        info = yf.Ticker(sym).info
        if not info:
            rows.append(f"| {sym} | N/A | — | — | — | — |")
            continue
        rows.append(
            f"| {sym} | ${_fmt(info.get('regularMarketPrice'))} | "
            f"{_fmt(info.get('regularMarketChangePercent'))}% | "
            f"P/E {_fmt(info.get('trailingPE'))} | "
            f"Cap ${_compact(info.get('marketCap'))} | "
            f"{info.get('recommendationKey', 'N/A')} |"
        )

    header = (
        "| Symbol | Price | Change% | P/E | Market Cap | Analyst |\n"
        "|--------|-------|---------|-----|-----------|----------|\n"
    )
    return _ok(header + "\n".join(rows))


def financial_news(params: dict[str, Any]) -> dict[str, Any]:
    """Latest news articles for a stock."""
    symbol = _validate_symbol(params.get("symbol"))
    count_raw = params.get("count", 5)
    try:
        count = min(int(count_raw), MAX_NEWS_ITEMS)
        if count < 1:
            count = 5
    except (ValueError, TypeError):
        count = 5

    news = yf.Ticker(symbol).news
    if not news:
        return _error(f"No news for {symbol}")

    items: list[str] = []
    for item in news[:count]:
        content = item.get("content", {})
        title = content.get("title", "No title")
        provider = content.get("provider", {}).get("displayName", "Unknown")
        pub_date = content.get("pubDate", "")
        url = content.get("canonicalUrl", {}).get("url", "")

        try:
            if pub_date.endswith("Z"):
                pub_date = pub_date[:-1] + "+00:00"
            dt = datetime.fromisoformat(pub_date)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            date_str = dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, AttributeError):
            date_str = "Unknown"

        items.append(f"- **{title}**\n  {provider} · {date_str}\n  {url}")

    return _ok(f"**{symbol} News** ({len(items)} articles)\n\n" + "\n\n".join(items))


def stock_analysis(params: dict[str, Any]) -> dict[str, Any]:
    """Fundamental analysis with valuation and financial health metrics."""
    symbol = _validate_symbol(params.get("symbol"))

    info = yf.Ticker(symbol).info
    if not info:
        return _error(f"No data for {symbol}")

    sections = [
        f"## {info.get('longName', symbol)} ({symbol})",
        f"Sector: {info.get('sector', 'N/A')} | Industry: {info.get('industry', 'N/A')}",
        "",
        "### Valuation",
        f"- Market Cap: ${_compact(info.get('marketCap'))}",
        f"- Enterprise Value: ${_compact(info.get('enterpriseValue'))}",
        f"- Trailing P/E: {_fmt(info.get('trailingPE'))}",
        f"- Forward P/E: {_fmt(info.get('forwardPE'))}",
        f"- PEG Ratio: {_fmt(info.get('pegRatio'))}",
        f"- Price/Book: {_fmt(info.get('priceToBook'))}",
        f"- EV/EBITDA: {_fmt(info.get('enterpriseToEbitda'))}",
        "",
        "### Profitability",
        f"- Revenue: ${_compact(info.get('totalRevenue'))}",
        f"- Net Income: ${_compact(info.get('netIncomeToCommon'))}",
        f"- Profit Margin: {_pct(info.get('profitMargins'))}",
        f"- Operating Margin: {_pct(info.get('operatingMargins'))}",
        f"- ROE: {_pct(info.get('returnOnEquity'))}",
        f"- ROA: {_pct(info.get('returnOnAssets'))}",
        "",
        "### Growth & Health",
        f"- Revenue Growth: {_pct(info.get('revenueGrowth'))}",
        f"- Earnings Growth: {_pct(info.get('earningsGrowth'))}",
        f"- Debt/Equity: {_fmt(info.get('debtToEquity'))}",
        f"- Current Ratio: {_fmt(info.get('currentRatio'))}",
        f"- Free Cash Flow: ${_compact(info.get('freeCashflow'))}",
        "",
        "### Analyst Consensus",
        f"- Recommendation: **{info.get('recommendationKey', 'N/A')}**",
        f"- Target Mean: ${_fmt(info.get('targetMeanPrice'))}",
        f"- Target High: ${_fmt(info.get('targetHighPrice'))}",
        f"- Target Low: ${_fmt(info.get('targetLowPrice'))}",
        f"- # of Analysts: {info.get('numberOfAnalystOpinions', 'N/A')}",
    ]
    return _ok("\n".join(sections))


def options_chain(params: dict[str, Any]) -> dict[str, Any]:
    """Options chain data for nearest expiry."""
    symbol = _validate_symbol(params.get("symbol"))
    option_type = str(params.get("type", "calls")).lower()
    if option_type not in ("calls", "puts"):
        return _error("type must be 'calls' or 'puts'")

    ticker = yf.Ticker(symbol)
    expirations = ticker.options
    if not expirations:
        return _error(f"No options data for {symbol}")

    expiry = expirations[0]
    chain = ticker.option_chain(expiry)
    df = chain.calls if option_type == "calls" else chain.puts

    if df.empty:
        return _error(f"No {option_type} for {symbol} expiry {expiry}")

    rows: list[str] = []
    for _, row in df.head(MAX_OPTIONS_ROWS).iterrows():
        vol = int(row["volume"]) if row.get("volume") else 0
        oi = int(row["openInterest"]) if row.get("openInterest") else 0
        iv = (row.get("impliedVolatility") or 0) * 100
        rows.append(
            f"| {row['strike']:.2f} | {row['lastPrice']:.2f} | "
            f"{row['bid']:.2f} | {row['ask']:.2f} | "
            f"{_int(vol)} | {_int(oi)} | {iv:.1f}% |"
        )

    header = (
        f"**{symbol} {option_type.title()}** — Expiry: {expiry}\n\n"
        "| Strike | Last | Bid | Ask | Volume | OI | IV |\n"
        "|--------|------|-----|-----|--------|----|----|  \n"
    )
    return _ok(header + "\n".join(rows))


# ── Formatting helpers ─────────────────────────────────────────────


def _fmt(val: Any) -> str:
    if val is None:
        return "N/A"
    try:
        return f"{val:,.2f}"
    except (ValueError, TypeError):
        return str(val)


def _int(val: Any) -> str:
    if val is None:
        return "N/A"
    try:
        return f"{int(val):,}"
    except (ValueError, TypeError):
        return str(val)


def _pct(val: Any) -> str:
    if val is None:
        return "N/A"
    try:
        return f"{val * 100:.2f}%"
    except (ValueError, TypeError):
        return "N/A"


def _compact(val: Any) -> str:
    """Format large numbers as human-readable (1.2T, 340B, 5.1M)."""
    if val is None:
        return "N/A"
    try:
        v = float(val)
    except (ValueError, TypeError):
        return "N/A"
    if abs(v) >= 1e12:
        return f"{v/1e12:.2f}T"
    if abs(v) >= 1e9:
        return f"{v/1e9:.2f}B"
    if abs(v) >= 1e6:
        return f"{v/1e6:.2f}M"
    return f"{v:,.0f}"


# ── Response helpers ───────────────────────────────────────────────


def _ok(text: str) -> dict[str, Any]:
    return {
        "statusCode": 200,
        "body": json.dumps({"content": [{"type": "text", "text": text}]}),
    }


def _error(msg: str) -> dict[str, Any]:
    logger.error("error_response: %s", msg)
    return {
        "statusCode": 400,
        "body": json.dumps({"error": msg}),
    }
