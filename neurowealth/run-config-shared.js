/* =============================================================================
   RUN-CONFIG-SHARED.JS — Pure shared utilities (no DOM, no Node-only APIs)
   Used by:  backtest-engine.js  (browser)
             parity-test.js      (Node)
   DO NOT add browser globals (document/window) or Node globals (require/fs).
   ============================================================================= */

// eslint-disable-next-line no-unused-vars
const RunConfigShared = (function () {
    'use strict';

    const ENGINE_VERSION = 'v3.0.0';

    /**
     * requireNum — strict finite-number validator.
     * Throws a descriptive Error if the value is missing, NaN, or Infinity.
     * This replaces the silent `config.x || default` anti-pattern.
     *
     * @param {object} obj   - config object
     * @param {string} key   - property name
     * @returns {number}     - the validated finite number
     * @throws  {Error}      - on missing / non-finite value
     */
    function requireNum(obj, key) {
        const v = obj[key];
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new Error(
                `[RunConfig] "${key}" must be a finite number — got: ${JSON.stringify(v)}. ` +
                `Check that the UI input for "${key}" is filled in and valid.`
            );
        }
        return v;
    }

    /**
     * djb2 hash — deterministic, 32-bit signed integer.
     * Same algorithm used in both browser and Node so hashes are comparable.
     *
     * @param {string} str
     * @returns {number}
     */
    function djb2(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
            hash |= 0; // Convert to 32-bit signed int
        }
        return hash;
    }

    /**
     * hashConfig — canonical deterministic hash of run config.
     * Always hashes the same keys in the same order so that
     * changing ANY input changes the hash.
     *
     * Fields included (all execution-relevant):
     *   asset, timeframe, startDate, endDate,
     *   startingCapital, riskPercent, stopPercent,
     *   slippagePct, feeRate
     *
     * @param {object} config
     * @returns {number} 32-bit signed integer
     */
    function hashConfig(config) {
        const canonical = JSON.stringify({
            asset: config.asset,
            timeframe: config.timeframe,
            startDate: config.startDate,
            endDate: config.endDate,
            startingCapital: config.startingCapital,
            riskPercent: config.riskPercent,
            stopPercent: config.stopPercent,
            slippagePct: config.slippagePct,
            feeRate: config.feeRate
        });
        return djb2(canonical);
    }

    /**
     * computeCandlesetHash — lightweight fingerprint of the candle set.
     * Format: "<firstTimestampMs>-<lastTimestampMs>-<count>"
     * Changing date range OR timeframe produces a different hash.
     *
     * @param {Array<{date: Date}>} candles
     * @returns {string}
     */
    function computeCandlesetHash(candles) {
        const n = candles.length;
        if (n === 0) return '0-0-0';
        const first = candles[0].date instanceof Date
            ? candles[0].date.getTime()
            : Number(candles[0].timestamp || 0);
        const last = candles[n - 1].date instanceof Date
            ? candles[n - 1].date.getTime()
            : Number(candles[n - 1].timestamp || 0);
        return `${first}-${last}-${n}`;
    }

    /**
     * hashEquityCurve — deterministic hash of equity curve values.
     * Used for the Sensitivity Test and parity checks.
     *
     * @param {number[]} eq
     * @returns {number}
     */
    function hashEquityCurve(eq) {
        let hash = 5381;
        for (let i = 0; i < eq.length; i++) {
            const val = Math.round(eq[i] * 100); // cents precision
            hash = (((hash << 5) + hash) + val) | 0;
        }
        return hash;
    }

    /**
     * generateRunId — timestamp + 5-char random suffix.
     * Unique per run, never reused even if config is identical.
     *
     * @returns {string}
     */
    function generateRunId() {
        return Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    }

    /**
     * hashStrategy — deterministic djb2 hash of a StrategyDefinition.
     * Indicators are sorted by (type + JSON params) so card order doesn't matter.
     * Any change to indicator params, entry rules, or exit rules will change the hash.
     *
     * @param {object} strategyDef - StrategyDefinition from buildStrategyDefinitionFromUI()
     * @returns {number} 32-bit signed integer
     */
    function hashStrategy(strategyDef) {
        if (!strategyDef) return 0;
        // Sort indicators so card order is irrelevant
        const sortedIndicators = (strategyDef.indicators || [])
            .map(ind => ({ type: ind.type || '', params: ind.params || {} }))
            .sort((a, b) => {
                const ka = a.type + JSON.stringify(a.params);
                const kb = b.type + JSON.stringify(b.params);
                return ka < kb ? -1 : ka > kb ? 1 : 0;
            });
        const canonical = JSON.stringify({
            indicators: sortedIndicators,
            entryRules: strategyDef.entryRules || [],
            exitRules: strategyDef.exitRules || [],
            risk: strategyDef.risk || {}
        });
        return djb2(canonical);
    }

    // ---- Public API ----
    return {
        ENGINE_VERSION,
        requireNum,
        hashConfig,
        hashStrategy,
        computeCandlesetHash,
        hashEquityCurve,
        generateRunId
    };
})();

// Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RunConfigShared;
}
