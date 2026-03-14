/**
 * portfolio-store.js
 *
 * Central registry for connected portfolios.
 * - Upserts by deterministic id (no duplicates)
 * - Persists to localStorage
 * - Pub/sub change notifications for PortfolioHub
 *
 * Exposed as: window.PortfolioStore
 */
'use strict';

(function () {
    const STORAGE_KEY = 'pp_hub_portfolios_v1';
    const LOG = '[PortfolioStore]';

    // =========================================================================
    // Portfolio Type Enum
    // =========================================================================
    const PORTFOLIO_TYPES = Object.freeze({
        WALLET:    'wallet',
        PLAID:     'plaid',
        BROKERAGE: 'brokerage',
        EXCHANGE:  'exchange',
        MANUAL:    'manual',
    });

    // =========================================================================
    // djb2 hash — lightweight, no deps, reproducible
    // =========================================================================
    function simpleHash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) + h) ^ str.charCodeAt(i);
            h = h >>> 0;
        }
        return h.toString(36);
    }

    function computePortfolioHash(holdings) {
        if (!Array.isArray(holdings) || holdings.length === 0) return 'empty';
        const normalized = holdings
            .map(h => ({
                symbol:   h.symbol || h.security?.ticker_symbol || '',
                valueUsd: +(h.valueUsd || 0).toFixed(4),
                quantity: +(h.formattedBalance ?? h.quantity ?? 0),
                chain:    h.chainName || h.chain || '',
            }))
            .sort((a, b) => a.symbol.localeCompare(b.symbol));
        return simpleHash(JSON.stringify(normalized));
    }

    // =========================================================================
    // Safe localStorage persistence
    // =========================================================================
    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error('not an array');
            return parsed;
        } catch (e) {
            console.warn(LOG, 'Corrupted storage — resetting.', e.message);
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
            return [];
        }
    }

    function saveToStorage(portfolios) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
        } catch (e) {
            console.warn(LOG, 'Save failed:', e.message);
        }
    }

    // =========================================================================
    // Internal state
    // =========================================================================
    let _portfolios = loadFromStorage();
    let _subscribers = [];

    function _notify() {
        const snapshot = [..._portfolios];
        _subscribers.forEach(cb => {
            try { cb(snapshot); } catch (e) { console.error(LOG, 'Subscriber error:', e); }
        });
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Upsert: if portfolio.id already exists, replace in-place.
     * Never appends duplicates.
     */
    function addPortfolio(portfolio) {
        if (!portfolio || !portfolio.id) {
            console.warn(LOG, 'addPortfolio: portfolio.id required');
            return;
        }
        const now = new Date().toISOString();
        const idx = _portfolios.findIndex(p => p.id === portfolio.id);
        if (idx >= 0) {
            _portfolios[idx] = { ..._portfolios[idx], ...portfolio, lastUpdatedAt: portfolio.lastUpdatedAt || now };
        } else {
            _portfolios.push({ ...portfolio, lastUpdatedAt: portfolio.lastUpdatedAt || now });
        }
        saveToStorage(_portfolios);
        _notify();
    }

    function updatePortfolio(id, changes) {
        const idx = _portfolios.findIndex(p => p.id === id);
        if (idx < 0) return;
        _portfolios[idx] = { ..._portfolios[idx], ...changes, lastUpdatedAt: new Date().toISOString() };
        saveToStorage(_portfolios);
        _notify();
    }

    function removePortfolio(id) {
        const before = _portfolios.length;
        _portfolios = _portfolios.filter(p => p.id !== id);
        if (_portfolios.length !== before) {
            saveToStorage(_portfolios);
            _notify();
        }
    }

    function getPortfolioById(id) {
        return _portfolios.find(p => p.id === id) || null;
    }

    function getAllPortfolios() {
        return [..._portfolios];
    }

    function subscribe(cb) {
        if (typeof cb === 'function' && !_subscribers.includes(cb)) {
            _subscribers.push(cb);
        }
    }

    function unsubscribe(cb) {
        _subscribers = _subscribers.filter(s => s !== cb);
    }

    // =========================================================================
    // Expose
    // =========================================================================
    window.PortfolioStore = {
        PORTFOLIO_TYPES,
        simpleHash,
        computePortfolioHash,
        addPortfolio,
        updatePortfolio,
        removePortfolio,
        getPortfolioById,
        getAllPortfolios,
        subscribe,
        unsubscribe,
    };

    console.info(LOG, `Initialized. ${_portfolios.length} persisted portfolio(s).`);
})();
