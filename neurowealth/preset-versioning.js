/* ========================================================================
   PRESET VERSIONING v1 — Immutable Identity + Change Tracking
   Provides: PresetIdentity, NormalizedConfig, Config Hash, Version Registry,
             Config Diff utility, and UI rendering helpers.
   localStorage only. No engine changes. No backend.
   ======================================================================== */

const PresetVersioning = (function () {
    'use strict';

    const REGISTRY_KEY = 'pp_presets_registry_v1';
    const LOG_PREFIX = '[PresetVersioning]';

    // ====================================================================
    // HELPERS
    // ====================================================================

    /** Generate a stable preset_id slug from preset_name */
    function slugify(name) {
        return String(name || 'custom')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_\-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /** Round numeric to N decimals for normalization */
    function roundNum(val, decimals = 4) {
        if (typeof val !== 'number' || isNaN(val)) return val;
        return parseFloat(val.toFixed(decimals));
    }

    /** DJB2 hash fallback (sync, returns hex-like string) */
    function djb2Hash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    /** Sort object keys recursively for deterministic JSON */
    function sortKeys(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sortKeys);
        const sorted = {};
        Object.keys(obj).sort().forEach(k => {
            sorted[k] = sortKeys(obj[k]);
        });
        return sorted;
    }

    // ====================================================================
    // NORMALIZED CONFIG BUILDER
    // ====================================================================

    /**
     * Build a normalized config from current UI state.
     * Includes ONLY user-facing strategy/runtime parameters.
     * Returns a plain object with stable key order + rounded numerics.
     */
    function buildNormalizedConfig() {
        const presetName = document.getElementById('preset-selector')?.value || 'custom';
        const asset = document.getElementById('asset-select')?.value || '';
        const timeframe = document.getElementById('timeframe-select')?.value || '';
        const startDate = document.getElementById('start-date')?.value || '';
        const endDate = document.getElementById('end-date')?.value || '';
        const startingCapital = parseFloat(document.getElementById('starting-capital')?.value) || 0;
        const positionPct = parseFloat(document.getElementById('position-size')?.value) || 0;
        const feePct = parseFloat(document.getElementById('trading-fees')?.value) || 0;
        const slippagePct = parseFloat(document.getElementById('slippage')?.value) || 0;
        const stopLossPct = parseFloat(document.getElementById('stop-loss')?.value) || 0;
        const takeProfitPct = parseFloat(document.getElementById('take-profit')?.value) || 0;

        // Build raw config
        const raw = {
            asset: asset,
            date_end: endDate,
            date_start: startDate,
            fee_pct: roundNum(feePct),
            position_pct: roundNum(positionPct),
            preset_name: presetName,
            slippage_pct: roundNum(slippagePct),
            starting_capital: roundNum(startingCapital, 2),
            stop_loss_pct: roundNum(stopLossPct),
            take_profit_pct: roundNum(takeProfitPct),
            timeframe: timeframe
        };

        // Omit undefined/null/empty fields
        const normalized = {};
        Object.keys(raw).sort().forEach(k => {
            const v = raw[k];
            if (v !== null && v !== undefined && v !== '' && v !== 0) {
                normalized[k] = v;
            }
        });

        return normalized;
    }

    /**
     * Build normalized config from an existing config object (e.g. from a saved report).
     */
    function buildNormalizedFromObj(configObj) {
        if (!configObj) return {};

        const raw = {
            asset: configObj.asset || '',
            date_end: configObj.endDate || configObj.date_end || '',
            date_start: configObj.startDate || configObj.date_start || '',
            fee_pct: roundNum(configObj.feeRate != null ? configObj.feeRate * 100 : (configObj.fee_pct || 0)),
            position_pct: roundNum(configObj.riskPercent != null ? configObj.riskPercent * 100 : (configObj.position_pct || 0)),
            preset_name: configObj.preset_name || configObj.label || 'custom',
            slippage_pct: roundNum(configObj.slippagePct != null ? configObj.slippagePct * 100 : (configObj.slippage_pct || 0)),
            starting_capital: roundNum(configObj.startingCapital || configObj.starting_capital || 0, 2),
            stop_loss_pct: roundNum(configObj.stopPercent != null ? configObj.stopPercent * 100 : (configObj.stop_loss_pct || 0)),
            take_profit_pct: roundNum(configObj.takeProfitPct || configObj.take_profit_pct || 0),
            timeframe: configObj.timeframe || ''
        };

        const normalized = {};
        Object.keys(raw).sort().forEach(k => {
            const v = raw[k];
            if (v !== null && v !== undefined && v !== '' && v !== 0) {
                normalized[k] = v;
            }
        });

        return normalized;
    }

    // ====================================================================
    // CONFIG HASHING
    // ====================================================================

    /**
     * Compute a deterministic hash of a normalized config.
     * Uses SHA-256 via crypto.subtle if available, else DJB2 fallback.
     * Returns a Promise<string> (hex digest).
     */
    async function computeConfigHash(normalizedConfig) {
        const sorted = sortKeys(normalizedConfig);
        const jsonStr = JSON.stringify(sorted);

        // Try SubtleCrypto SHA-256
        if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
            try {
                const encoded = new TextEncoder().encode(jsonStr);
                const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) {
                // Fall through to DJB2
            }
        }

        // Fallback: DJB2
        return djb2Hash(jsonStr);
    }

    /**
     * Synchronous hash for use in non-async contexts.
     * Uses DJB2 only (faster, still deterministic).
     */
    function computeConfigHashSync(normalizedConfig) {
        const sorted = sortKeys(normalizedConfig);
        const jsonStr = JSON.stringify(sorted);
        return djb2Hash(jsonStr);
    }

    // ====================================================================
    // VERSION REGISTRY (localStorage)
    // ====================================================================

    function loadRegistry() {
        try {
            const raw = localStorage.getItem(REGISTRY_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn(LOG_PREFIX, 'Registry load failed:', e);
        }
        return { presets: {} };
    }

    function saveRegistry(registry) {
        try {
            localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
        } catch (e) {
            console.warn(LOG_PREFIX, 'Registry save failed:', e);
        }
    }

    /**
     * Get current identity for a preset.
     * Initializes preset in registry if not present.
     */
    function getCurrentIdentity(presetName) {
        const pid = slugify(presetName);
        const registry = loadRegistry();
        const preset = registry.presets[pid];

        if (!preset || !preset.versions || preset.versions.length === 0) {
            return {
                preset_name: presetName,
                preset_id: pid,
                preset_version: '1.0.0',
                config_hash: null,
                created_at: null,
                notes: null
            };
        }

        const currentVer = preset.versions.find(v => v.version === preset.current_version)
            || preset.versions[0];

        return {
            preset_name: presetName,
            preset_id: pid,
            preset_version: currentVer.version,
            config_hash: currentVer.config_hash,
            created_at: currentVer.created_at,
            notes: currentVer.notes || null
        };
    }

    /**
     * Create a new version for a preset.
     * @param {string} presetName
     * @param {string} versionStr — e.g. "1.0.1"
     * @param {string} configHash
     * @param {string} notes — optional release notes
     * @param {object} normalizedConfig — optional snapshot
     */
    function createNewVersion(presetName, versionStr, configHash, notes, normalizedConfig) {
        const pid = slugify(presetName);
        const registry = loadRegistry();

        if (!registry.presets[pid]) {
            registry.presets[pid] = {
                current_version: versionStr,
                versions: []
            };
        }

        // Check for duplicate version
        const existing = registry.presets[pid].versions.find(v => v.version === versionStr);
        if (existing) {
            console.warn(LOG_PREFIX, `Version ${versionStr} already exists for ${pid}`);
            return null;
        }

        const entry = {
            version: versionStr,
            config_hash: configHash,
            created_at: new Date().toISOString(),
            notes: notes || '',
            normalized_config: normalizedConfig || null
        };

        registry.presets[pid].versions.unshift(entry);
        registry.presets[pid].current_version = versionStr;
        saveRegistry(registry);

        console.log(LOG_PREFIX, `Created version ${versionStr} for ${pid} (hash: ${configHash?.substring(0, 8)}…)`);
        return entry;
    }

    /**
     * Get all versions for a preset.
     */
    function getVersionHistory(presetName) {
        const pid = slugify(presetName);
        const registry = loadRegistry();
        const preset = registry.presets[pid];
        if (!preset) return [];
        return preset.versions || [];
    }

    /**
     * Suggest the next version string (patch bump).
     */
    function suggestNextVersion(presetName) {
        const identity = getCurrentIdentity(presetName);
        const parts = identity.preset_version.split('.').map(Number);
        if (parts.length === 3) {
            parts[2]++;
            return parts.join('.');
        }
        return '1.0.1';
    }

    // ====================================================================
    // SNAPSHOT IDENTITY (convenience)
    // ====================================================================

    /**
     * Capture complete identity snapshot from current UI state.
     * Returns { preset_name, preset_id, preset_version, config_hash, normalized_config }.
     * config_hash computed synchronously (DJB2).
     */
    function snapshotIdentity() {
        const presetName = document.getElementById('preset-selector')?.value || 'custom';
        const normalizedConfig = buildNormalizedConfig();
        const configHash = computeConfigHashSync(normalizedConfig);
        const identity = getCurrentIdentity(presetName);

        return {
            preset_name: presetName,
            preset_id: identity.preset_id,
            preset_version: identity.preset_version,
            config_hash: configHash,
            normalized_config: normalizedConfig
        };
    }

    /**
     * Capture identity from an existing config object (for saved reports).
     */
    function snapshotIdentityFromConfig(configObj) {
        const presetName = configObj.preset_name || configObj.label || 'custom';
        const normalizedConfig = buildNormalizedFromObj(configObj);
        const configHash = computeConfigHashSync(normalizedConfig);
        const identity = getCurrentIdentity(presetName);

        return {
            preset_name: presetName,
            preset_id: identity.preset_id,
            preset_version: identity.preset_version,
            config_hash: configHash,
            normalized_config: normalizedConfig
        };
    }

    // ====================================================================
    // CONFIG DIFF
    // ====================================================================

    /**
     * Diff two normalized configs.
     * @returns {Array<{field: string, oldValue: any, newValue: any, type: 'changed'|'added'|'removed'}>}
     */
    function diffConfigs(configA, configB) {
        if (!configA || !configB) return [];

        const allKeys = new Set([...Object.keys(configA), ...Object.keys(configB)]);
        const diffs = [];

        allKeys.forEach(key => {
            const a = configA[key];
            const b = configB[key];

            if (a === undefined && b !== undefined) {
                diffs.push({ field: key, oldValue: null, newValue: b, type: 'added' });
            } else if (a !== undefined && b === undefined) {
                diffs.push({ field: key, oldValue: a, newValue: null, type: 'removed' });
            } else if (JSON.stringify(a) !== JSON.stringify(b)) {
                diffs.push({ field: key, oldValue: a, newValue: b, type: 'changed' });
            }
        });

        return diffs.sort((a, b) => a.field.localeCompare(b.field));
    }

    /** Human-friendly field labels */
    const FIELD_LABELS = {
        asset: 'Asset',
        date_end: 'End Date',
        date_start: 'Start Date',
        fee_pct: 'Fee %',
        position_pct: 'Position %',
        preset_name: 'Preset',
        slippage_pct: 'Slippage %',
        starting_capital: 'Starting Capital',
        stop_loss_pct: 'Stop Loss %',
        take_profit_pct: 'Take Profit %',
        timeframe: 'Timeframe'
    };

    function fieldLabel(field) {
        return FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Render a diff list as an HTML string (table rows).
     */
    function renderDiffHTML(diffs) {
        if (!diffs || diffs.length === 0) {
            return `<div class="pv-diff-empty">
                <span style="color:#64748b; font-size:0.78rem;">✓ No config changes</span>
            </div>`;
        }

        let html = `<table class="pv-diff-table">
            <thead><tr>
                <th>Parameter</th>
                <th>Before</th>
                <th>After</th>
            </tr></thead><tbody>`;

        diffs.forEach(d => {
            const cls = d.type === 'added' ? 'pv-diff-added' :
                d.type === 'removed' ? 'pv-diff-removed' : 'pv-diff-changed';
            const label = fieldLabel(d.field);
            const oldVal = d.oldValue != null ? d.oldValue : '—';
            const newVal = d.newValue != null ? d.newValue : '—';
            html += `<tr class="${cls}">
                <td>${label}</td>
                <td>${oldVal}</td>
                <td>${newVal}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    }

    /**
     * Render compact diff summary (for New Version modal).
     */
    function renderDiffSummary(diffs) {
        if (!diffs || diffs.length === 0) {
            return '<span style="color:#64748b; font-size:0.78rem;">No config changes since current version.</span>';
        }

        return diffs.map(d => {
            const label = fieldLabel(d.field);
            if (d.type === 'added') return `<div class="pv-diff-line pv-diff-added">+ ${label}: ${d.newValue}</div>`;
            if (d.type === 'removed') return `<div class="pv-diff-line pv-diff-removed">− ${label}: ${d.oldValue}</div>`;
            return `<div class="pv-diff-line pv-diff-changed">△ ${label}: ${d.oldValue} → ${d.newValue}</div>`;
        }).join('');
    }

    // ====================================================================
    // ABBREVIATED HASH
    // ====================================================================

    function shortHash(hash) {
        if (!hash) return '—';
        return hash.substring(0, 8);
    }

    // ====================================================================
    // UI — VERSION DISPLAY + NEW VERSION MODAL
    // ====================================================================

    let _initialized = false;

    function initUI() {
        if (_initialized) return;
        _initialized = true;

        // Insert version display after preset selector
        const presetField = document.getElementById('preset-selector')?.closest('.bt-field-group');
        if (presetField) {
            const versionRow = document.createElement('div');
            versionRow.className = 'pv-version-row';
            versionRow.id = 'pv-version-row';
            versionRow.innerHTML = `
                <span class="pv-version-badge" id="pv-version-badge">v1.0.0</span>
                <span class="pv-hash-badge" id="pv-hash-badge" title="Config hash">—</span>
                <button class="pv-btn-new-version" id="btn-new-version" title="Create New Version">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    New Version
                </button>
            `;
            presetField.appendChild(versionRow);
        }

        // Create New Version modal
        const modal = document.createElement('div');
        modal.className = 'pv-modal-overlay';
        modal.id = 'pv-new-version-modal';
        modal.innerHTML = `
            <div class="pv-modal">
                <div class="pv-modal-header">
                    <h3 class="pv-modal-title">Create New Version</h3>
                    <button class="pv-modal-close" id="pv-modal-close">&times;</button>
                </div>
                <div class="pv-modal-body">
                    <div class="pv-modal-field">
                        <label class="pv-modal-label">Preset</label>
                        <div class="pv-modal-value" id="pv-modal-preset">—</div>
                    </div>
                    <div class="pv-modal-field">
                        <label class="pv-modal-label">Current Version</label>
                        <div class="pv-modal-value" id="pv-modal-current-ver">—</div>
                    </div>
                    <div class="pv-modal-field">
                        <label class="pv-modal-label">New Version</label>
                        <input type="text" class="pv-modal-input" id="pv-modal-new-ver" placeholder="1.0.1">
                    </div>
                    <div class="pv-modal-field">
                        <label class="pv-modal-label">Release Notes (optional)</label>
                        <textarea class="pv-modal-textarea" id="pv-modal-notes" placeholder="What changed…" rows="2"></textarea>
                    </div>
                    <div class="pv-modal-field">
                        <label class="pv-modal-label">Config Changes</label>
                        <div class="pv-modal-changes" id="pv-modal-changes">—</div>
                    </div>
                </div>
                <div class="pv-modal-footer">
                    <button class="pv-btn-cancel" id="pv-btn-cancel">Cancel</button>
                    <button class="pv-btn-confirm" id="pv-btn-confirm">Create Version</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Wire events
        document.getElementById('btn-new-version')?.addEventListener('click', openNewVersionModal);
        document.getElementById('pv-modal-close')?.addEventListener('click', closeNewVersionModal);
        document.getElementById('pv-btn-cancel')?.addEventListener('click', closeNewVersionModal);
        document.getElementById('pv-btn-confirm')?.addEventListener('click', handleConfirmVersion);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeNewVersionModal();
        });

        // Listen for preset changes
        document.getElementById('preset-selector')?.addEventListener('change', updateVersionDisplay);

        // Initial display
        updateVersionDisplay();
        console.log(LOG_PREFIX, 'UI initialized');
    }

    function updateVersionDisplay() {
        const presetName = document.getElementById('preset-selector')?.value || 'custom';
        const identity = getCurrentIdentity(presetName);
        const normalizedConfig = buildNormalizedConfig();
        const configHash = computeConfigHashSync(normalizedConfig);

        const badge = document.getElementById('pv-version-badge');
        const hashBadge = document.getElementById('pv-hash-badge');

        if (badge) badge.textContent = `v${identity.preset_version}`;
        if (hashBadge) {
            hashBadge.textContent = shortHash(configHash);
            hashBadge.title = `Config hash: ${configHash}`;
        }
    }

    function openNewVersionModal() {
        const modal = document.getElementById('pv-new-version-modal');
        if (!modal) return;

        const presetName = document.getElementById('preset-selector')?.value || 'custom';
        const identity = getCurrentIdentity(presetName);
        const suggested = suggestNextVersion(presetName);
        const currentNorm = buildNormalizedConfig();

        // Compute diff vs last version's config
        const history = getVersionHistory(presetName);
        let diffs = [];
        if (history.length > 0 && history[0].normalized_config) {
            diffs = diffConfigs(history[0].normalized_config, currentNorm);
        }

        document.getElementById('pv-modal-preset').textContent = presetName;
        document.getElementById('pv-modal-current-ver').textContent = `v${identity.preset_version}`;
        document.getElementById('pv-modal-new-ver').value = suggested;
        document.getElementById('pv-modal-notes').value = '';
        document.getElementById('pv-modal-changes').innerHTML = renderDiffSummary(diffs);

        modal.classList.add('pv-open');
    }

    function closeNewVersionModal() {
        const modal = document.getElementById('pv-new-version-modal');
        if (modal) modal.classList.remove('pv-open');
    }

    async function handleConfirmVersion() {
        const presetName = document.getElementById('preset-selector')?.value || 'custom';
        const versionStr = document.getElementById('pv-modal-new-ver')?.value?.trim();
        const notes = document.getElementById('pv-modal-notes')?.value?.trim() || '';

        if (!versionStr) {
            alert('Version string is required.');
            return;
        }

        // Validate version format (loose semver)
        if (!/^\d+\.\d+\.\d+$/.test(versionStr)) {
            alert('Version must be in format X.Y.Z (e.g. 1.0.1)');
            return;
        }

        const normalizedConfig = buildNormalizedConfig();
        const configHash = await computeConfigHash(normalizedConfig);

        const entry = createNewVersion(presetName, versionStr, configHash, notes, normalizedConfig);
        if (!entry) {
            alert(`Version ${versionStr} already exists.`);
            return;
        }

        closeNewVersionModal();
        updateVersionDisplay();

        // Toast notification
        if (typeof showToast === 'function') {
            showToast(`Version ${versionStr} created for ${presetName}`);
        }

        console.log(LOG_PREFIX, `Version ${versionStr} created:`, entry);
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================

    function init() {
        // Ensure first version exists for known presets
        const registry = loadRegistry();
        const knownPresets = ['BTC_4H_PRODUCTION', 'BTC_DAILY_PRODUCTION'];

        knownPresets.forEach(name => {
            const pid = slugify(name);
            if (!registry.presets[pid] || !registry.presets[pid].versions || registry.presets[pid].versions.length === 0) {
                registry.presets[pid] = {
                    current_version: '1.0.0',
                    versions: [{
                        version: '1.0.0',
                        config_hash: null,
                        created_at: new Date().toISOString(),
                        notes: 'Initial version',
                        normalized_config: null
                    }]
                };
            }
        });

        saveRegistry(registry);

        // Init UI when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initUI);
        } else {
            // Defer to let other scripts load first
            setTimeout(initUI, 100);
        }

        console.log(LOG_PREFIX, 'v1 loaded — Preset Versioning');
    }

    // ====================================================================
    // VERIFICATION / SELF-TEST
    // ====================================================================

    function runTests() {
        console.group('🧪 PresetVersioning — Self-Tests');
        const tests = [];

        // Test 1: slugify
        tests.push({
            name: 'slugify produces stable ID',
            pass: slugify('BTC_4H_PRODUCTION') === 'btc_4h_production' &&
                slugify('My Custom Strategy') === 'my_custom_strategy'
        });

        // Test 2: sortKeys determinism
        const a = { z: 1, a: 2, m: { b: 3, a: 4 } };
        const b = { a: 2, m: { a: 4, b: 3 }, z: 1 };
        tests.push({
            name: 'sortKeys produces identical JSON',
            pass: JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
        });

        // Test 3: DJB2 determinism
        const h1 = djb2Hash('hello world');
        const h2 = djb2Hash('hello world');
        tests.push({
            name: 'djb2Hash is deterministic',
            pass: h1 === h2 && h1.length > 0
        });

        // Test 4: computeConfigHashSync determinism
        const cfg1 = { asset: 'BTC-USD', timeframe: '4h', starting_capital: 10000 };
        const cfg2 = { timeframe: '4h', starting_capital: 10000, asset: 'BTC-USD' };
        tests.push({
            name: 'computeConfigHashSync is key-order independent',
            pass: computeConfigHashSync(cfg1) === computeConfigHashSync(cfg2)
        });

        // Test 5: diffConfigs detects changes
        const cA = { asset: 'BTC-USD', timeframe: '4h', fee_pct: 0.1 };
        const cB = { asset: 'ETH-USD', timeframe: '4h', slippage_pct: 0.05 };
        const diffs = diffConfigs(cA, cB);
        tests.push({
            name: 'diffConfigs detects changed/added/removed',
            pass: diffs.some(d => d.type === 'changed' && d.field === 'asset') &&
                diffs.some(d => d.type === 'removed' && d.field === 'fee_pct') &&
                diffs.some(d => d.type === 'added' && d.field === 'slippage_pct')
        });

        // Test 6: diffConfigs returns empty for identical configs
        tests.push({
            name: 'diffConfigs returns empty for identical configs',
            pass: diffConfigs(cA, { ...cA }).length === 0
        });

        // Test 7: roundNum precision
        tests.push({
            name: 'roundNum rounds to 4 decimals',
            pass: roundNum(1.23456789) === 1.2346
        });

        // Test 8: Registry round-trip
        const testPid = '__test_preset__';
        const reg = loadRegistry();
        reg.presets[testPid] = { current_version: '0.0.1', versions: [{ version: '0.0.1', config_hash: 'test' }] };
        saveRegistry(reg);
        const reg2 = loadRegistry();
        const rtPass = reg2.presets[testPid]?.versions[0]?.config_hash === 'test';
        delete reg2.presets[testPid];
        saveRegistry(reg2);
        tests.push({
            name: 'Registry round-trip (localStorage)',
            pass: rtPass
        });

        tests.forEach(t => {
            console.log(`${t.pass ? '✅' : '❌'} ${t.name}`);
        });

        const allPass = tests.every(t => t.pass);
        console.log(allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
        console.groupEnd();
        return allPass;
    }

    // ====================================================================
    // AUTO-INIT
    // ====================================================================
    init();

    // ====================================================================
    // PUBLIC API
    // ====================================================================
    return {
        // Config
        buildNormalizedConfig,
        buildNormalizedFromObj,
        computeConfigHash,
        computeConfigHashSync,

        // Identity
        getCurrentIdentity,
        snapshotIdentity,
        snapshotIdentityFromConfig,
        slugify,
        shortHash,

        // Registry
        createNewVersion,
        getVersionHistory,
        suggestNextVersion,

        // Diff
        diffConfigs,
        renderDiffHTML,
        renderDiffSummary,

        // UI
        updateVersionDisplay,

        // Test
        runTests
    };

})();
