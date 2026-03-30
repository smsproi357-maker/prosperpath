/* ============================================================
   MARKET SURFACE — ProsperPath Native Chart Engine
   Powered by Yahoo Finance OHLCV + Lightweight Charts
   
   Public API:
     ProsperPathChart.create(options) → renders Market Surface card
   
   Options:
     containerId    string   ID of the element to mount into
     symbol         string   Yahoo Finance symbol (e.g. "AAPL", "GC=F")
     assetName      string   Human-readable name
     currentPrice   number   Current price (from hero data)
     changePercent  number   24h % change
   
   Dependencies:
     - LightweightCharts (global, from CDN)
     - fetchYahooOHLC (global, from script.js)
     - CORS_PROXIES (global, from script.js)
   ============================================================ */

'use strict';

(function (global) {

    /* ── Design Tokens ────────────────────────────────────────── */
    const TOKENS = {
        bg:           'rgba(8, 12, 24, 1)',
        bgElevated:   'rgba(12, 18, 32, 1)',
        text:         'rgba(255, 255, 255, 0.75)',
        textMuted:    'rgba(255, 255, 255, 0.35)',
        grid:         'rgba(255, 255, 255, 0.04)',
        crosshair:    'rgba(0, 212, 170, 0.35)',
        up:           '#00d4aa',
        down:         '#ff6b6b',
        upVolume:     'rgba(0, 212, 170, 0.18)',
        downVolume:   'rgba(255, 107, 107, 0.18)',
        border:       'rgba(255, 255, 255, 0.08)',
    };

    /* ── Timeframe Config ─────────────────────────────────────── */
    const TIMEFRAMES = [
        { label: '5m',  value: '5m',   tip: '5-min candles'  },
        { label: '15m', value: '15m',  tip: '15-min candles' },
        { label: '1H',  value: '1h',   tip: 'Hourly candles' },
        { label: '1D',  value: '1d',   tip: '5-day intraday' },
        { label: '1W',  value: '5d',   tip: '1-month daily'  },
        { label: '1M',  value: '1mo',  tip: 'Monthly view'   },
        { label: '3M',  value: '3mo',  tip: '3-month view'   },
        { label: '6M',  value: '6mo',  tip: '6-month view'   },
        { label: '1Y',  value: '1y',   tip: '1-year view'    },
        { label: '5Y',  value: '5y',   tip: '5-year view'    },
    ];

    const INTRADAY_RANGES = new Set(['5m', '15m', '1h']);

    /* ── Indicator Helpers ────────────────────────────────────── */

    function calcSMA(closes, period) {
        if (!closes || closes.length < period) return null;
        const slice = closes.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / period;
    }

    function calcATR(data, period = 14) {
        if (!data || data.length < period + 1) return null;
        const trList = [];
        for (let i = 1; i < data.length; i++) {
            const prev = data[i - 1];
            const cur  = data[i];
            trList.push(Math.max(
                cur.high - cur.low,
                Math.abs(cur.high - prev.close),
                Math.abs(cur.low  - prev.close)
            ));
        }
        if (trList.length < period) return null;
        const atr = trList.slice(-period).reduce((a, b) => a + b, 0) / period;
        return atr;
    }

    /* ── Derive Context Strip Values from OHLCV ──────────────── */

    function deriveContext(data) {
        if (!data || data.length < 5) {
            return {
                trend:       { label: '—', cls: 'placeholder' },
                range:       { label: '—', cls: 'placeholder' },
                volatility:  { label: '—', cls: 'placeholder' },
                keyLevel:    { label: '—', cls: 'placeholder' },
            };
        }

        const closes = data.map(d => d.close);
        const recent = data.slice(-20);

        // Trend: last close vs SMA20
        const sma20 = calcSMA(closes, Math.min(20, closes.length));
        const lastClose = closes[closes.length - 1];
        let trend, trendCls;
        if (sma20 && lastClose > sma20 * 1.005)      { trend = 'Bullish';  trendCls = 'bullish'; }
        else if (sma20 && lastClose < sma20 * 0.995) { trend = 'Bearish';  trendCls = 'bearish'; }
        else                                          { trend = 'Neutral';  trendCls = 'neutral'; }

        // Range: current Hi/Lo bandwidth vs 30-day average
        const recentHi  = Math.max(...recent.map(d => d.high));
        const recentLo  = Math.min(...recent.map(d => d.low));
        const bandwidth = (recentHi - recentLo) / recentLo;

        const older     = data.slice(-40, -20);
        let range, rangeCls;
        if (older.length >= 5) {
            const olderHi  = Math.max(...older.map(d => d.high));
            const olderLo  = Math.min(...older.map(d => d.low));
            const olderBw  = (olderHi - olderLo) / olderLo;
            const expansion = bandwidth / (olderBw || 0.0001);
            if (expansion > 1.3)      { range = 'Expanding';    rangeCls = 'elevated'; }
            else if (expansion < 0.7) { range = 'Contracting';  rangeCls = 'neutral'; }
            else                      { range = 'Normal';        rangeCls = 'bullish'; }
        } else {
            range    = `${(bandwidth * 100).toFixed(1)}% band`;
            rangeCls = 'neutral';
        }

        // Volatility: ATR as % of price
        const atr = calcATR(data.slice(-30), Math.min(14, data.length - 1));
        let volatility, volCls;
        if (atr) {
            const atrPct = (atr / lastClose) * 100;
            if (atrPct > 2.5)       { volatility = 'Elevated';   volCls = 'elevated'; }
            else if (atrPct > 1.0)  { volatility = 'Moderate';   volCls = 'neutral';  }
            else                    { volatility = 'Low';         volCls = 'bullish';  }
        } else {
            volatility = '—'; volCls = 'placeholder';
        }

        // Key Level: lowest low of last 10 candles (recent support)
        const last10 = data.slice(-10);
        const keyLow = Math.min(...last10.map(d => d.low));
        const keyLabel = lastClose >= 100
            ? '$' + keyLow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '$' + keyLow.toPrecision(5);

        return {
            trend:      { label: trend,      cls: trendCls },
            range:      { label: range,      cls: rangeCls },
            volatility: { label: volatility, cls: volCls   },
            keyLevel:   { label: keyLabel,   cls: 'neutral' },
        };
    }

    /* ── Format Helpers ───────────────────────────────────────── */

    function formatPrice(price, changePercent) {
        if (price === null || price === undefined || isNaN(price)) return { price: '—', change: '—', cls: 'neutral' };
        const p = price >= 1000 ? '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : price >= 1   ? '$' + price.toFixed(2)
                : price >= 0.01 ? '$' + price.toFixed(4)
                : '$' + price.toPrecision(4);

        const sign = changePercent > 0 ? '+' : '';
        const ch   = changePercent != null && !isNaN(changePercent) ? `${sign}${changePercent.toFixed(2)}%` : '—';
        const cls  = changePercent > 0.05 ? 'up' : changePercent < -0.05 ? 'down' : 'neutral';
        return { price: p, change: ch, cls };
    }

    /* ── Build DOM Structure ──────────────────────────────────── */

    function buildCard(opts) {
        const { assetName, symbol, currentPrice, changePercent } = opts;
        const { price: priceStr, change: changeStr, cls: changeCls } = formatPrice(currentPrice, changePercent);

        const card = document.createElement('div');
        card.className = 'ms-card';

        card.innerHTML = `
            <!-- Header -->
            <div class="ms-header" id="ms-header-${symbol}">
                <div class="ms-header-left">
                    <div class="ms-asset-row">
                        <span class="ms-asset-name" title="${escHtml(assetName)}">${escHtml(assetName)}</span>
                        <span class="ms-asset-symbol">${escHtml(symbol)}</span>
                    </div>
                    <div class="ms-price-row">
                        <span class="ms-price" id="ms-price-${symbol}">${escHtml(priceStr)}</span>
                        <span class="ms-change ${changeCls}" id="ms-change-${symbol}">${escHtml(changeStr)}</span>
                    </div>
                </div>
                <div class="ms-tf-selector" id="ms-tf-${symbol}" role="group" aria-label="Timeframe"></div>
            </div>

            <!-- Chart Region -->
            <div class="ms-chart-region" id="ms-chart-region-${symbol}">
                <div class="ms-chart-loading" id="ms-loading-${symbol}">
                    <div class="ms-spinner"></div>
                    <span class="ms-loading-text">Loading chart data…</span>
                </div>
                <div class="ms-chart-canvas" id="ms-canvas-${symbol}"></div>
            </div>

            <!-- Context Strip -->
            <div class="ms-context-strip" id="ms-context-${symbol}">
                <div class="ms-context-item">
                    <span class="ms-context-label">Trend</span>
                    <span class="ms-context-value placeholder" id="ms-ctx-trend-${symbol}">—</span>
                </div>
                <div class="ms-context-item">
                    <span class="ms-context-label">Range</span>
                    <span class="ms-context-value placeholder" id="ms-ctx-range-${symbol}">—</span>
                </div>
                <div class="ms-context-item">
                    <span class="ms-context-label">Volatility</span>
                    <span class="ms-context-value placeholder" id="ms-ctx-vol-${symbol}">—</span>
                </div>
                <div class="ms-context-item">
                    <span class="ms-context-label">Key Level</span>
                    <span class="ms-context-value placeholder" id="ms-ctx-key-${symbol}">—</span>
                </div>
            </div>
        `;

        return card;
    }

    /* ── Update Context Strip ─────────────────────────────────── */

    function updateContextStrip(symbol, data) {
        const ctx = deriveContext(data);

        const setCtx = (id, value, cls) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = value;
            el.className   = `ms-context-value ${cls}`;
        };

        setCtx(`ms-ctx-trend-${symbol}`, ctx.trend.label,      ctx.trend.cls);
        setCtx(`ms-ctx-range-${symbol}`, ctx.range.label,      ctx.range.cls);
        setCtx(`ms-ctx-vol-${symbol}`,   ctx.volatility.label, ctx.volatility.cls);
        setCtx(`ms-ctx-key-${symbol}`,   ctx.keyLevel.label,   ctx.keyLevel.cls);
    }

    /* ── Show Chart Empty State ───────────────────────────────── */

    function showChartEmpty(canvasEl, symbol, onRetry) {
        canvasEl.innerHTML = `
            <div class="ms-chart-empty">
                <span class="ms-chart-empty-icon">📡</span>
                <p class="ms-chart-empty-text">Chart data temporarily unavailable.<br>Market may be closed or the connection is loading.</p>
                <button class="ms-retry-btn" id="ms-retry-${symbol}">↺ Retry</button>
            </div>
        `;
        const btn = document.getElementById(`ms-retry-${symbol}`);
        if (btn && onRetry) btn.addEventListener('click', onRetry);
    }

    /* ── Render Lightweight Chart ─────────────────────────────── */

    function renderChart(canvasEl, data, range, symbol, showVolumePanel) {
        canvasEl.innerHTML = '';

        if (!window.LightweightCharts) {
            canvasEl.innerHTML = '<div class="ms-chart-empty"><p class="ms-chart-empty-text">Chart library not available.</p></div>';
            return null;
        }

        const isIntraday = INTRADAY_RANGES.has(range);
        const withVolume = showVolumePanel !== false;

        const chart = LightweightCharts.createChart(canvasEl, {
            width:  canvasEl.clientWidth  || canvasEl.offsetWidth  || 600,
            height: canvasEl.clientHeight || canvasEl.offsetHeight || 360,
            layout: {
                background: { type: 'solid', color: TOKENS.bg },
                textColor:  TOKENS.text,
                fontSize:   11,
            },
            grid: {
                vertLines: { color: TOKENS.grid },
                horzLines: { color: TOKENS.grid },
            },
            crosshair: {
                mode:     LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: TOKENS.crosshair, width: 1, style: 2, labelBackgroundColor: TOKENS.bgElevated },
                horzLine: { color: TOKENS.crosshair, width: 1, style: 2, labelBackgroundColor: TOKENS.bgElevated },
            },
            rightPriceScale: {
                borderColor: TOKENS.border,
                scaleMargins: withVolume
                    ? { top: 0.06, bottom: 0.2 }
                    : { top: 0.06, bottom: 0.06 },
            },
            timeScale: {
                borderColor:    TOKENS.border,
                timeVisible:    isIntraday,
                secondsVisible: false,
                // Free pan/zoom — do NOT clamp left or right edges.
                // Users can freely navigate the full loaded dataset.
                fixLeftEdge:  false,
                fixRightEdge: false,
            },
            handleScroll: true,
            handleScale:  true,
        });

        // Candlestick series
        const candleSeries = chart.addCandlestickSeries({
            upColor:         TOKENS.up,
            downColor:       TOKENS.down,
            borderUpColor:   TOKENS.up,
            borderDownColor: TOKENS.down,
            wickUpColor:     TOKENS.up,
            wickDownColor:   TOKENS.down,
        });
        candleSeries.setData(data);

        // Volume histogram — omitted for forex (showVolumePanel=false)
        let volumeSeries = null;
        if (withVolume) {
            const volumeData = data.map(d => ({
                time:  d.time,
                value: d.volume || 0,
                color: d.close >= d.open ? TOKENS.upVolume : TOKENS.downVolume,
            }));
            volumeSeries = chart.addHistogramSeries({
                priceFormat:  { type: 'volume' },
                priceScaleId: 'vol',
            });
            volumeSeries.priceScale().applyOptions({
                scaleMargins: { top: 0.82, bottom: 0 },
            });
            volumeSeries.setData(volumeData);
        }

        chart.timeScale().fitContent();

        // Responsive resize
        const resizer = new ResizeObserver(() => {
            if (!canvasEl.isConnected) { resizer.disconnect(); return; }
            chart.applyOptions({
                width:  canvasEl.clientWidth,
                height: canvasEl.clientHeight || 360,
            });
        });
        resizer.observe(canvasEl);

        // Return chart + series refs so loadChart can update data for backfill
        return { chart, candleSeries, volumeSeries };
    }

    /* ── Core: Load Chart for Timeframe ──────────────────────── */

    // Map timeframe button values to Yahoo interval strings (for backfill).
    // Must match RANGE_PARAMS in fetchYahooOHLC.
    const TF_TO_INTERVAL = {
        '5m':  '5m',
        '15m': '15m',
        '1h':  '60m',
        '1d':  '1d',
        '5d':  '1d',
        '1mo': '1d',
        '3mo': '1wk',
        '6mo': '1wk',
        '1y':  '1mo',
        '5y':  '1mo',
    };

    // How close to the left edge (as fraction of visible bars) triggers backfill.
    // 0.15 = when the user has panned to within 15% of the oldest loaded candle.
    const BACKFILL_TRIGGER_FRACTION = 0.15;

    async function loadChart(opts, range, activeChart) {
        const { symbol } = opts;
        const showVolumePanel = opts.showVolumePanel !== false;

        // Destroy previous chart instance and subscriptions
        if (activeChart.instance) {
            try { activeChart.instance.chart.remove(); } catch (_) {}
            activeChart.instance = null;
        }
        activeChart.allData      = [];   // accumulated candles (sorted asc)
        activeChart.interval     = TF_TO_INTERVAL[range] || '1d';
        activeChart.backfilling  = false;
        activeChart.noMoreLeft   = false;

        const loadingEl = document.getElementById(`ms-loading-${symbol}`);
        const canvasEl  = document.getElementById(`ms-canvas-${symbol}`);
        const tfBtns    = document.querySelectorAll(`#ms-tf-${symbol} .ms-tf-btn`);

        // Show loading, lock buttons
        if (loadingEl) { loadingEl.style.opacity = '1'; loadingEl.style.pointerEvents = 'auto'; loadingEl.classList.remove('hidden'); }
        canvasEl.innerHTML = '';
        tfBtns.forEach(b => { b.disabled = true; b.classList.toggle('active', b.dataset.range === range); });

        // Fetch maximized initial history
        let data = [];
        if (typeof fetchYahooOHLC === 'function') {
            try {
                data = await fetchYahooOHLC(symbol, range);
            } catch (e) {
                console.warn('[MarketSurface] fetchYahooOHLC error:', e);
                data = [];
            }
        }

        // Hide loading, restore buttons
        if (loadingEl) { loadingEl.classList.add('hidden'); setTimeout(() => { loadingEl.style.opacity = '0'; }, 300); }
        tfBtns.forEach(b => b.disabled = false);

        if (!data || data.length === 0) {
            showChartEmpty(canvasEl, symbol, () => loadChart(opts, range, activeChart));
            updateContextStrip(symbol, []);
            return;
        }

        activeChart.allData = [...data];
        const rendered = renderChart(canvasEl, data, range, symbol, showVolumePanel);
        if (!rendered) return;

        activeChart.instance = rendered;
        updateContextStrip(symbol, data);

        // ── Left-Edge Backfill Subscription ───────────────────────
        // Fired on every visible range change (pan/zoom).
        // When the user scrolls close to the oldest loaded candle,
        // we fetch older history and prepend it without blanking the chart.
        rendered.chart.timeScale().subscribeVisibleLogicalRangeChange(async (logicalRange) => {
            if (!logicalRange) return;
            if (activeChart.backfilling) return;
            if (activeChart.noMoreLeft) return;
            if (activeChart.interval !== TF_TO_INTERVAL[activeChart.currentRange]) return;

            const from = logicalRange.from;
            const to   = logicalRange.to;
            const visibleBars = to - from;

            // Trigger when viewport left edge is within BACKFILL_TRIGGER_FRACTION of bar 0
            if (from > visibleBars * BACKFILL_TRIGGER_FRACTION) return;

            const allData = activeChart.allData;
            if (!allData.length) return;

            const oldestTs = allData[0].time; // Unix seconds
            activeChart.backfilling = true;

            let olderData = [];
            try {
                if (typeof fetchYahooOHLCBefore === 'function') {
                    olderData = await fetchYahooOHLCBefore(symbol, activeChart.interval, oldestTs);
                }
            } catch (e) {
                console.warn('[MarketSurface] Backfill fetch error:', e);
            }

            if (!olderData || olderData.length === 0) {
                // No more history available from Yahoo — stop trying
                activeChart.noMoreLeft = true;
                activeChart.backfilling = false;
                return;
            }

            // Deduplicate: only keep candles strictly older than current oldest
            const newCandles = olderData.filter(c => c.time < oldestTs);
            if (newCandles.length === 0) {
                // Yahoo returned the same data — we've hit the limit
                activeChart.noMoreLeft = true;
                activeChart.backfilling = false;
                return;
            }

            // Prepend older candles (already sorted ascending) and update series.
            // We preserve the current viewport by NOT calling fitContent().
            const merged = [...newCandles, ...allData];
            activeChart.allData = merged;

            try {
                // setData replaces all data. LightweightCharts preserves scroll position
                // if the new data is a superset (left-extension) of the existing data.
                rendered.candleSeries.setData(merged);

                if (rendered.volumeSeries) {
                    const volData = merged.map(d => ({
                        time:  d.time,
                        value: d.volume || 0,
                        color: d.close >= d.open ? TOKENS.upVolume : TOKENS.downVolume,
                    }));
                    rendered.volumeSeries.setData(volData);
                }

                // Update context strip with full merged dataset
                updateContextStrip(symbol, merged);

            } catch (seriesErr) {
                // If series update fails (e.g. chart was destroyed), abort silently
                console.warn('[MarketSurface] Backfill series update error:', seriesErr);
            }

            activeChart.backfilling = false;
        });

        // Store current range key for staleness check in subscription
        activeChart.currentRange = range;
    }

    /* ── Build Timeframe Buttons ──────────────────────────────── */

    function buildTFButtons(opts, defaultRange, activeChart) {
        const { symbol } = opts;
        const container  = document.getElementById(`ms-tf-${symbol}`);
        if (!container) return;

        TIMEFRAMES.forEach(tf => {
            const btn = document.createElement('button');
            btn.className     = 'ms-tf-btn' + (tf.value === defaultRange ? ' active' : '');
            btn.textContent   = tf.label;
            btn.title         = tf.tip;
            btn.dataset.range = tf.value;
            btn.setAttribute('aria-pressed', String(tf.value === defaultRange));

            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                loadChart(opts, tf.value, activeChart);
                // Update aria-pressed visually
                container.querySelectorAll('.ms-tf-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
            });

            container.appendChild(btn);
        });
    }

    /* ── escapeHtml helper ────────────────────────────────────── */

    function escHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── Public API ───────────────────────────────────────────── */

    /**
     * ProsperPathChart.create(options)
     *
     * Mounts a full Market Surface card (header + chart + context) into a container element.
     *
     * @param {object} opts
     * @param {string} opts.containerId          — ID of element to replace/mount into
     * @param {string} opts.symbol               — Yahoo Finance symbol
     * @param {string} opts.assetName            — Human-readable asset name
     * @param {number} [opts.currentPrice]       — Current price (optional).
     *                                             FIX 2: May be null/undefined — chart renders
     *                                             with '—' placeholder and never blocks.
     *                                             Call updatePrice() when data arrives.
     * @param {number} [opts.changePercent]      — 24h % change (optional, same rule).
     * @param {string} [opts.defaultRange]       — Initial timeframe (default: '1d')
     * @param {boolean} [opts.showVolumePanel]   — FIX 1: Set false to hide volume histogram
     *                                             (e.g. forex). All OHLC context metrics
     *                                             (Trend, Range, Volatility, Key Level) remain
     *                                             visible regardless of this flag.
     */
    function create(opts) {
        if (!opts || !opts.containerId || !opts.symbol) {
            console.error('[MarketSurface] create() requires containerId and symbol');
            return;
        }

        const container = document.getElementById(opts.containerId);
        if (!container) {
            console.error(`[MarketSurface] Container not found: #${opts.containerId}`);
            return;
        }

        // FIX 2: currentPrice and changePercent are fully optional.
        // formatPrice() already returns '—' for null/undefined/NaN values,
        // so the header renders cleanly with placeholders immediately.
        // The caller can invoke ProsperPathChart.updatePrice() at any point
        // after hero data loads — chart rendering is never blocked.
        const defaultRange = opts.defaultRange || '1d';
        const activeChart  = { instance: null };

        // Build and mount the card
        const card = buildCard(opts);
        container.innerHTML = '';
        container.appendChild(card);

        // Wire timeframe buttons
        buildTFButtons(opts, defaultRange, activeChart);

        // Initial chart load — does not depend on price/change values
        loadChart(opts, defaultRange, activeChart);
    }

    /**
     * ProsperPathChart.updatePrice(symbol, price, changePercent)
     * Updates header price/change without re-rendering chart.
     */
    function updatePrice(symbol, price, changePercent) {
        const { price: priceStr, change: changeStr, cls } = formatPrice(price, changePercent);
        const priceEl  = document.getElementById(`ms-price-${symbol}`);
        const changeEl = document.getElementById(`ms-change-${symbol}`);
        if (priceEl)  priceEl.textContent = priceStr;
        if (changeEl) { changeEl.textContent = changeStr; changeEl.className = `ms-change ${cls}`; }
    }

    // Expose globally
    global.ProsperPathChart = { create, updatePrice };

}(window));
