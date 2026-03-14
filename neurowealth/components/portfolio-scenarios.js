/**
 * portfolio-scenarios.js
 *
 * Deterministic scenario stress testing engine.
 * Takes PortfolioAnalysis.compute() output and computes portfolio impact
 * for a set of predefined market scenarios using exposure weights.
 *
 * Formula: impactPercent = exposurePercent × scenarioMovePercent / 100
 *
 * DOES NOT:
 * - Call any API
 * - Make price predictions
 * - Use AI for calculations
 *
 * Exposed as: window.PortfolioScenarios = { compute }
 */

'use strict';

(function () {

    /** Predefined market scenarios */
    const SCENARIOS = [
        { id: 'btcUp10',       label: 'BTC +10%',             exposure: 'btcExposurePercent',       move: +10 },
        { id: 'btcDown10',     label: 'BTC -10%',             exposure: 'btcExposurePercent',       move: -10 },
        { id: 'ethUp10',       label: 'ETH +10%',             exposure: 'ethExposurePercent',       move: +10 },
        { id: 'ethDown10',     label: 'ETH -10%',             exposure: 'ethExposurePercent',       move: -10 },
        { id: 'altsDown20',    label: 'Layer-1 Alts -20%',    exposure: 'layer1AltExposurePercent', move: -20 },
        { id: 'altsUp15',      label: 'Layer-1 Alts +15%',    exposure: 'layer1AltExposurePercent', move: +15 },
        { id: 'rwaDown10',     label: 'Tokenized Assets -10%', exposure: 'rwaExposurePercent',      move: -10 },
        { id: 'cryptoBullRun', label: 'Broad Crypto +30%',    exposure: null, move: null, custom: true },
        { id: 'cryptoCrash',   label: 'Broad Crypto -40%',    exposure: null, move: null, custom: true },
    ];

    /**
     * Compute scenario impact for a single scenario.
     * Returns { id, label, portfolioImpactPercent, portfolioImpactUsd, exposurePercent, move }
     */
    function computeScenario(scenario, metrics) {
        const { totalPortfolioValueUsd, marketExposure } = metrics;

        if (scenario.custom) {
            // Custom scenarios: apply move to all volatile assets (non-stablecoin, non-RWA)
            const volatilePercent = (
                marketExposure.btcExposurePercent +
                marketExposure.ethExposurePercent +
                marketExposure.layer1AltExposurePercent +
                marketExposure.otherExposurePercent
            );
            const move = scenario.id === 'cryptoBullRun' ? +30 : -40;
            const portfolioImpactPercent = parseFloat(((volatilePercent / 100) * move).toFixed(2));
            const portfolioImpactUsd = parseFloat(((portfolioImpactPercent / 100) * totalPortfolioValueUsd).toFixed(2));
            return {
                id: scenario.id,
                label: scenario.label,
                exposurePercent: parseFloat(volatilePercent.toFixed(2)),
                move,
                portfolioImpactPercent,
                portfolioImpactUsd,
                postScenarioValueUsd: parseFloat((totalPortfolioValueUsd + portfolioImpactUsd).toFixed(2)),
            };
        }

        const exposurePercent = marketExposure[scenario.exposure] || 0;
        const portfolioImpactPercent = parseFloat(((exposurePercent / 100) * scenario.move).toFixed(2));
        const portfolioImpactUsd = parseFloat(((portfolioImpactPercent / 100) * totalPortfolioValueUsd).toFixed(2));

        return {
            id: scenario.id,
            label: scenario.label,
            exposurePercent,
            move: scenario.move,
            portfolioImpactPercent,
            portfolioImpactUsd,
            postScenarioValueUsd: parseFloat((totalPortfolioValueUsd + portfolioImpactUsd).toFixed(2)),
        };
    }

    /**
     * Main compute function.
     * @param {object} metrics — output of PortfolioAnalysis.compute()
     * @returns {object} scenario analysis result
     */
    function compute(metrics) {
        if (!metrics || metrics.totalPortfolioValueUsd <= 0) {
            return {
                scenarios: [],
                bestCaseScenario: null,
                worstCaseScenario: null,
                hasVolatileExposure: false,
                note: 'Portfolio value is zero or not priced — scenario analysis not applicable.',
            };
        }

        const results = SCENARIOS.map(s => computeScenario(s, metrics));

        // Find best and worst
        const positiveScenarios = results.filter(r => r.portfolioImpactPercent > 0);
        const negativeScenarios = results.filter(r => r.portfolioImpactPercent < 0);

        const bestCase = positiveScenarios.length > 0
            ? positiveScenarios.reduce((a, b) => a.portfolioImpactPercent > b.portfolioImpactPercent ? a : b)
            : null;
        const worstCase = negativeScenarios.length > 0
            ? negativeScenarios.reduce((a, b) => a.portfolioImpactPercent < b.portfolioImpactPercent ? a : b)
            : null;

        const hasVolatileExposure = (
            (metrics.marketExposure?.btcExposurePercent || 0) > 0 ||
            (metrics.marketExposure?.ethExposurePercent || 0) > 0 ||
            (metrics.marketExposure?.layer1AltExposurePercent || 0) > 0
        );

        return {
            scenarios: results,
            bestCaseScenario: bestCase,
            worstCaseScenario: worstCase,
            hasVolatileExposure,
        };
    }

    window.PortfolioScenarios = { compute };

    console.info('[PortfolioScenarios] Scenario stress testing engine loaded.');

})();
