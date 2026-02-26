/* ========================================================================
   STRATEGY LIFECYCLE v1 — Versioned Registry + State Machine
   Turns backtest runs into versioned, auditable strategies with states:
   DRAFT → RESEARCH → VALIDATED → PRODUCTION → DEPRECATED
   UI-layer only. No engine modifications. No backend.
   ======================================================================== */

(function () {
    'use strict';

    const LOG = '[StrategyLifecycle]';
    const STORAGE_KEY = 'pp_strategy_registry_v1';
    const MAX_STRATEGIES = 200;
    const MAX_VERSIONS = 100;
    const VALID_STATES = ['DRAFT', 'RESEARCH', 'VALIDATED', 'PRODUCTION', 'DEPRECATED'];
    const CAPITAL_READY_TIERS = ['CAPITAL-READY', 'CAPITAL_READY'];

    // ====================================================================
    // HELPERS
    // ====================================================================
    function genUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function isoNow() { return new Date().toISOString(); }

    function safeParseJSON(str, fallback) {
        try { return JSON.parse(str); } catch { return fallback; }
    }

    function bumpPatch(semver) {
        if (!semver) return '1.0.0';
        const parts = semver.split('.').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return '1.0.0';
        parts[2]++;
        return parts.join('.');
    }

    function shortHash(h) { return h ? h.substring(0, 8) : '—'; }

    // ====================================================================
    // STATE BADGE CONFIG
    // ====================================================================
    const STATE_BADGE = {
        DRAFT: { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)', icon: '○' },
        RESEARCH: { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.25)', icon: '🔵' },
        VALIDATED: { color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)', icon: '✓' },
        PRODUCTION: { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', icon: '⚡' },
        DEPRECATED: { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)', icon: '✗' }
    };

    // ====================================================================
    // REGISTRY PERSISTENCE
    // ====================================================================
    let registry = [];

    function loadRegistry() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { registry = []; return; }
            const parsed = safeParseJSON(raw, []);
            if (!Array.isArray(parsed)) { registry = []; return; }
            registry = parsed;
            enforceGlobalCaps();
        } catch (e) {
            console.warn(LOG, 'Registry load failed, starting empty:', e);
            registry = [];
        }
    }

    function saveRegistry() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
        } catch (e) {
            console.error(LOG, 'Registry save failed:', e);
        }
    }

    function enforceGlobalCaps() {
        if (registry.length > MAX_STRATEGIES) {
            const deprecated = registry.filter(s => s.state === 'DEPRECATED')
                .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
            while (registry.length > MAX_STRATEGIES && deprecated.length) {
                const oldest = deprecated.shift();
                registry = registry.filter(s => s.strategy_id !== oldest.strategy_id);
            }
            if (registry.length > MAX_STRATEGIES) {
                registry = registry.slice(0, MAX_STRATEGIES);
            }
        }
    }

    function enforceVersionCap(strategy) {
        if (strategy.versions.length > MAX_VERSIONS) {
            console.warn(LOG, `Strategy "${strategy.name}" exceeds ${MAX_VERSIONS} versions, dropping oldest`);
            strategy.versions = strategy.versions.slice(-MAX_VERSIONS);
        }
    }

    // ====================================================================
    // STATE MACHINE
    // ====================================================================
    function isCapitalReady(tier) {
        if (!tier) return false;
        return CAPITAL_READY_TIERS.includes(tier.toUpperCase().replace(/[\s-]/g, '_').replace(/_+/g, '_'))
            || tier.toUpperCase().includes('CAPITAL') && tier.toUpperCase().includes('READY');
    }

    function computeAutoState(strategy) {
        if (strategy.state === 'PRODUCTION') return 'PRODUCTION';
        if (strategy.state === 'DEPRECATED') return 'DEPRECATED';
        if (!strategy.versions || strategy.versions.length === 0) return 'DRAFT';

        const latest = strategy.versions[strategy.versions.length - 1];
        const tier = latest.snapshots?.readiness?.tier;
        if (isCapitalReady(tier)) return 'VALIDATED';
        return 'RESEARCH';
    }

    // ====================================================================
    // CORE CRUD
    // ====================================================================
    function createStrategy(name, description, tags) {
        const now = isoNow();
        const strategy = {
            strategy_id: genUUID(),
            name: name || 'Untitled Strategy',
            description: description || null,
            created_at: now,
            updated_at: now,
            state: 'DRAFT',
            tags: tags || [],
            current_version_id: null,
            versions: []
        };
        registry.push(strategy);
        enforceGlobalCaps();
        saveRegistry();
        return strategy;
    }

    function getStrategy(id) {
        return registry.find(s => s.strategy_id === id) || null;
    }

    function getStrategyByName(name) {
        return registry.find(s => s.name === name) || null;
    }

    function listStrategies(filters) {
        let list = [...registry];
        if (filters) {
            if (filters.state && filters.state !== 'ALL') {
                list = list.filter(s => s.state === filters.state);
            }
            if (filters.search) {
                const q = filters.search.toLowerCase();
                list = list.filter(s =>
                    s.name.toLowerCase().includes(q) ||
                    (s.tags || []).some(t => t.toLowerCase().includes(q))
                );
            }
        }
        return list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }

    // ====================================================================
    // SAVE STRATEGY VERSION
    // ====================================================================
    function saveStrategyVersion(strategyId, opts = {}) {
        const strategy = getStrategy(strategyId);
        if (!strategy) { console.error(LOG, 'Strategy not found:', strategyId); return null; }

        const lastVer = strategy.versions.length > 0
            ? strategy.versions[strategy.versions.length - 1] : null;
        const nextSemver = opts.version || bumpPatch(lastVer?.version);

        // Gather snapshots from existing subsystems
        let normalizedConfig = null, configHash = null, presetRef = { preset_name: null, preset_id: null, preset_version: null };
        try {
            if (window.PresetVersioning) {
                const identity = window.PresetVersioning.snapshotIdentity();
                normalizedConfig = identity.normalized_config;
                configHash = identity.config_hash;
                presetRef = {
                    preset_name: identity.preset_name || null,
                    preset_id: identity.preset_id || null,
                    preset_version: identity.preset_version || null
                };
            }
        } catch (e) { console.warn(LOG, 'PresetVersioning snapshot failed:', e); }

        // CRS / readiness snapshot
        let readinessSnapshot = { crs: null, tier: null, breakdown: null, notes: null };
        try {
            const presetKey = document.getElementById('preset-selector')?.value || 'CUSTOM';
            if (window.CapitalReadiness && window.CapitalReadiness.computeCRS) {
                const crs = window.CapitalReadiness.computeCRS(presetKey);
                readinessSnapshot = {
                    crs: crs.crs ?? null,
                    tier: crs.tier ?? null,
                    breakdown: crs.breakdown ?? null,
                    notes: crs.notes ?? null
                };
            }
        } catch (e) { console.warn(LOG, 'CRS snapshot failed:', e); }

        // Validation (WF) snapshot
        let validationSnapshot = { wf_enabled: false, wf_summary: null, oos_windows_count: null, oos_trades_total: null };
        try {
            const gate = window._lastGateResult;
            if (gate && gate.walkForward) {
                validationSnapshot = {
                    wf_enabled: true,
                    wf_summary: gate.walkForward.summary || null,
                    oos_windows_count: gate.walkForward.windows?.length ?? null,
                    oos_trades_total: gate.walkForward.totalOOSTrades ?? null
                };
            }
        } catch (e) { /* non-fatal */ }

        // Metrics snapshot
        let metricsSnapshot = null;
        if (opts.metrics) {
            const m = opts.metrics;
            metricsSnapshot = {
                return_pct: parseFloat(m.totalReturn) || null,
                maxdd_pct: parseFloat(m.maxDrawdown) || null,
                score_ret_dd: parseFloat(m.profitFactor) || null,
                profit_factor: parseFloat(m.profitFactor) || null,
                expectancy_per_trade: parseFloat(m.avgWinLoss) || null,
                trades: parseInt(m.tradeCount) || null,
                win_rate: parseFloat(m.winRate) || null
            };
        }

        const version = {
            version_id: genUUID(),
            version: nextSemver,
            created_at: isoNow(),
            release_notes: opts.release_notes || null,
            normalized_config: normalizedConfig || opts.normalized_config || null,
            config_hash: configHash || opts.config_hash || null,
            preset_ref: presetRef,
            snapshots: {
                readiness: readinessSnapshot,
                validation: validationSnapshot,
                metrics: metricsSnapshot
            },
            exports: {
                config_export_json: opts.config_export || null,
                report_export_json: opts.report_export || null
            }
        };

        strategy.versions.push(version);
        enforceVersionCap(strategy);
        strategy.current_version_id = version.version_id;
        strategy.updated_at = isoNow();
        strategy.state = computeAutoState(strategy);

        saveRegistry();
        return version;
    }

    // ====================================================================
    // PROMOTE / DEPRECATE
    // ====================================================================
    function promoteToProduction(strategyId) {
        const s = getStrategy(strategyId);
        if (!s) return { ok: false, reason: 'Strategy not found' };
        if (s.state !== 'VALIDATED') return { ok: false, reason: 'Only VALIDATED strategies can be promoted. Current: ' + s.state };
        s.state = 'PRODUCTION';
        s.updated_at = isoNow();
        saveRegistry();
        return { ok: true };
    }

    function deprecateStrategy(strategyId, replacementId) {
        const s = getStrategy(strategyId);
        if (!s) return { ok: false, reason: 'Strategy not found' };
        s.state = 'DEPRECATED';
        s.updated_at = isoNow();
        if (replacementId) s._replacement_id = replacementId;
        saveRegistry();
        return { ok: true };
    }

    function exportStrategyJSON(strategyId) {
        const s = getStrategy(strategyId);
        if (!s) return null;
        const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `strategy_${s.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return s;
    }

    // ====================================================================
    // TOAST
    // ====================================================================
    function showToast(msg, color) {
        const t = document.createElement('div');
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            background: color || '#4ade80', color: '#0f172a',
            padding: '12px 24px', borderRadius: '8px', fontWeight: '600',
            fontFamily: "'Inter', sans-serif", fontSize: '0.85rem',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
            zIndex: '99999', opacity: '1', transition: 'opacity 0.5s'
        });
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3500);
    }

    // ====================================================================
    // UI — STATE BADGE ELEMENT
    // ====================================================================
    function createStateBadge(state) {
        const cfg = STATE_BADGE[state] || STATE_BADGE.DRAFT;
        const span = document.createElement('span');
        span.textContent = `${cfg.icon} ${state}`;
        Object.assign(span.style, {
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem',
            fontWeight: '600', fontFamily: "'JetBrains Mono', monospace",
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            letterSpacing: '0.5px', whiteSpace: 'nowrap'
        });
        return span;
    }

    // ====================================================================
    // UI — SAVE AS STRATEGY VERSION MODAL
    // ====================================================================
    let saveModalEl = null;

    function ensureSaveModal() {
        if (saveModalEl) return saveModalEl;
        saveModalEl = document.createElement('div');
        saveModalEl.id = 'sl-save-modal-overlay';
        Object.assign(saveModalEl.style, {
            display: 'none', position: 'fixed', inset: '0', zIndex: '10001',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            alignItems: 'center', justifyContent: 'center'
        });
        saveModalEl.innerHTML = buildSaveModalHTML();
        document.body.appendChild(saveModalEl);
        attachSaveModalListeners();
        return saveModalEl;
    }

    function buildSaveModalHTML() {
        return `<div id="sl-save-modal" style="background:#0f172a;border:1px solid rgba(99,102,241,0.2);border-radius:12px;width:460px;max-width:90vw;max-height:85vh;overflow-y:auto;padding:28px;font-family:'Inter',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
    <h3 style="margin:0;color:#e2e8f0;font-size:1rem;font-weight:600;">Save as Strategy Version</h3>
    <button id="sl-save-close" style="background:none;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;">&times;</button>
  </div>
  <div style="margin-bottom:14px;">
    <label style="display:block;color:#94a3b8;font-size:0.75rem;margin-bottom:4px;font-weight:500;">Strategy</label>
    <select id="sl-save-strategy-select" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid rgba(99,102,241,0.2);border-radius:6px;color:#e2e8f0;font-size:0.8rem;font-family:'Inter',sans-serif;">
      <option value="__new__">+ New Strategy</option>
    </select>
  </div>
  <div id="sl-new-strategy-fields" style="margin-bottom:14px;">
    <label style="display:block;color:#94a3b8;font-size:0.75rem;margin-bottom:4px;font-weight:500;">Strategy Name</label>
    <input id="sl-save-name" type="text" placeholder="e.g. BTC Momentum Alpha" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid rgba(99,102,241,0.2);border-radius:6px;color:#e2e8f0;font-size:0.8rem;font-family:'Inter',sans-serif;box-sizing:border-box;" />
    <label style="display:block;color:#94a3b8;font-size:0.75rem;margin-bottom:4px;margin-top:10px;font-weight:500;">Tags (comma-separated)</label>
    <input id="sl-save-tags" type="text" placeholder="e.g. momentum, btc, 4h" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid rgba(99,102,241,0.2);border-radius:6px;color:#e2e8f0;font-size:0.8rem;font-family:'Inter',sans-serif;box-sizing:border-box;" />
  </div>
  <div style="margin-bottom:14px;">
    <label style="display:block;color:#94a3b8;font-size:0.75rem;margin-bottom:4px;font-weight:500;">Version</label>
    <input id="sl-save-version" type="text" value="1.0.0" style="width:120px;padding:8px 10px;background:#1e293b;border:1px solid rgba(99,102,241,0.2);border-radius:6px;color:#e2e8f0;font-size:0.8rem;font-family:'JetBrains Mono',monospace;box-sizing:border-box;" />
  </div>
  <div style="margin-bottom:18px;">
    <label style="display:block;color:#94a3b8;font-size:0.75rem;margin-bottom:4px;font-weight:500;">Release Notes</label>
    <textarea id="sl-save-notes" rows="2" placeholder="Optional notes..." style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid rgba(99,102,241,0.2);border-radius:6px;color:#e2e8f0;font-size:0.8rem;font-family:'Inter',sans-serif;resize:vertical;box-sizing:border-box;"></textarea>
  </div>
  <button id="sl-save-confirm" style="width:100%;padding:10px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;font-family:'Inter',sans-serif;transition:all 0.2s;">
    Save Version
  </button>
</div>`;
    }

    function attachSaveModalListeners() {
        const overlay = saveModalEl;
        overlay.querySelector('#sl-save-close').addEventListener('click', closeSaveModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeSaveModal(); });

        const sel = overlay.querySelector('#sl-save-strategy-select');
        const newFields = overlay.querySelector('#sl-new-strategy-fields');
        sel.addEventListener('change', () => {
            newFields.style.display = sel.value === '__new__' ? 'block' : 'none';
            if (sel.value !== '__new__') {
                const s = getStrategy(sel.value);
                if (s && s.versions.length > 0) {
                    const last = s.versions[s.versions.length - 1];
                    overlay.querySelector('#sl-save-version').value = bumpPatch(last.version);
                }
            }
        });

        overlay.querySelector('#sl-save-confirm').addEventListener('click', handleSaveConfirm);
    }

    function openSaveModal() {
        ensureSaveModal();
        const sel = saveModalEl.querySelector('#sl-save-strategy-select');
        sel.innerHTML = '<option value="__new__">+ New Strategy</option>';
        registry.filter(s => s.state !== 'DEPRECATED').forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.strategy_id;
            opt.textContent = `${s.name} (${s.state})`;
            sel.appendChild(opt);
        });
        sel.value = '__new__';
        saveModalEl.querySelector('#sl-new-strategy-fields').style.display = 'block';
        saveModalEl.querySelector('#sl-save-version').value = '1.0.0';
        saveModalEl.querySelector('#sl-save-notes').value = '';
        saveModalEl.querySelector('#sl-save-name').value = '';
        saveModalEl.querySelector('#sl-save-tags').value = '';
        saveModalEl.style.display = 'flex';
    }

    function closeSaveModal() {
        if (saveModalEl) saveModalEl.style.display = 'none';
    }

    function handleSaveConfirm() {
        const sel = saveModalEl.querySelector('#sl-save-strategy-select').value;
        const verStr = saveModalEl.querySelector('#sl-save-version').value.trim() || '1.0.0';
        const notes = saveModalEl.querySelector('#sl-save-notes').value.trim();

        // Gather current metrics from the page
        let metrics = null;
        try {
            const get = id => document.querySelector(`[data-metric="${id}"]`)?.textContent || '';
            metrics = {
                totalReturn: get('totalReturn'), maxDrawdown: get('maxDrawdown'),
                profitFactor: get('profitFactor'), avgWinLoss: get('avgWinLoss'),
                winRate: get('winRate'), tradeCount: get('tradeCount')
            };
        } catch (e) { /* ok */ }

        let strategy;
        if (sel === '__new__') {
            const name = saveModalEl.querySelector('#sl-save-name').value.trim();
            if (!name) { alert('Please enter a strategy name.'); return; }
            const tagsRaw = saveModalEl.querySelector('#sl-save-tags').value;
            const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
            strategy = createStrategy(name, null, tags);
        } else {
            strategy = getStrategy(sel);
            if (!strategy) { alert('Strategy not found.'); return; }
        }

        const version = saveStrategyVersion(strategy.strategy_id, {
            version: verStr, release_notes: notes, metrics: metrics
        });

        if (version) {
            closeSaveModal();
            showToast(`Saved ${strategy.name} v${version.version} — State: ${strategy.state}`);
        }
    }

    // ====================================================================
    // UI — STRATEGY LIBRARY MODAL
    // ====================================================================
    let libModalEl = null;
    let libFilters = { state: 'ALL', search: '' };
    let libDetailId = null;

    function ensureLibModal() {
        if (libModalEl) return libModalEl;
        libModalEl = document.createElement('div');
        libModalEl.id = 'sl-lib-modal-overlay';
        Object.assign(libModalEl.style, {
            display: 'none', position: 'fixed', inset: '0', zIndex: '10001',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            alignItems: 'center', justifyContent: 'center'
        });
        libModalEl.innerHTML = buildLibModalHTML();
        document.body.appendChild(libModalEl);
        attachLibModalListeners();
        return libModalEl;
    }

    function buildLibModalHTML() {
        return `<div id="sl-lib-modal" style="background:#0f172a;border:1px solid rgba(99,102,241,0.2);border-radius:12px;width:800px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:28px;font-family:'Inter',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <h3 style="margin:0;color:#e2e8f0;font-size:1.05rem;font-weight:600;">Strategy Library</h3>
    <button id="sl-lib-close" style="background:none;border:none;color:#64748b;font-size:1.3rem;cursor:pointer;">&times;</button>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">
    <div id="sl-lib-state-filters" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
    <input id="sl-lib-search" type="text" placeholder="Search name/tag..." style="margin-left:auto;padding:6px 10px;background:#1e293b;border:1px solid rgba(99,102,241,0.15);border-radius:6px;color:#e2e8f0;font-size:0.75rem;width:180px;font-family:'Inter',sans-serif;" />
  </div>
  <div id="sl-lib-list" style="margin-bottom:14px;"></div>
  <div id="sl-lib-detail" style="display:none;"></div>
</div>`;
    }

    function attachLibModalListeners() {
        libModalEl.querySelector('#sl-lib-close').addEventListener('click', closeLibModal);
        libModalEl.addEventListener('click', e => { if (e.target === libModalEl) closeLibModal(); });
        libModalEl.querySelector('#sl-lib-search').addEventListener('input', e => {
            libFilters.search = e.target.value;
            renderLibList();
        });
    }

    function openLibModal() {
        ensureLibModal();
        libDetailId = null;
        libFilters = { state: 'ALL', search: '' };
        libModalEl.querySelector('#sl-lib-search').value = '';
        renderLibStateFilters();
        renderLibList();
        libModalEl.querySelector('#sl-lib-detail').style.display = 'none';
        libModalEl.style.display = 'flex';
    }

    function closeLibModal() { if (libModalEl) libModalEl.style.display = 'none'; }

    function renderLibStateFilters() {
        const container = libModalEl.querySelector('#sl-lib-state-filters');
        container.innerHTML = '';
        ['ALL', ...VALID_STATES].forEach(st => {
            const btn = document.createElement('button');
            btn.textContent = st;
            const active = st === libFilters.state;
            Object.assign(btn.style, {
                padding: '4px 10px', borderRadius: '4px', fontSize: '0.65rem',
                fontWeight: '600', cursor: 'pointer', border: '1px solid',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px',
                background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: active ? '#a5b4fc' : '#64748b',
                borderColor: active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'
            });
            btn.addEventListener('click', () => {
                libFilters.state = st;
                renderLibStateFilters();
                renderLibList();
            });
            container.appendChild(btn);
        });
    }

    function renderLibList() {
        const container = libModalEl.querySelector('#sl-lib-list');
        const strategies = listStrategies(libFilters);

        if (!strategies.length) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#475569;font-size:0.8rem;">No strategies found.</div>`;
            return;
        }

        let html = `<table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
<thead><tr style="color:#64748b;border-bottom:1px solid rgba(255,255,255,0.06);">
  <th style="text-align:left;padding:6px 8px;font-weight:500;">Name</th>
  <th style="text-align:left;padding:6px 8px;font-weight:500;">State</th>
  <th style="text-align:left;padding:6px 8px;font-weight:500;">Version</th>
  <th style="text-align:left;padding:6px 8px;font-weight:500;">CRS</th>
  <th style="text-align:left;padding:6px 8px;font-weight:500;">Updated</th>
  <th style="text-align:right;padding:6px 8px;font-weight:500;"></th>
</tr></thead><tbody>`;

        strategies.forEach(s => {
            const latest = s.versions.length > 0 ? s.versions[s.versions.length - 1] : null;
            const ver = latest ? latest.version : '—';
            const crs = latest?.snapshots?.readiness?.crs;
            const crsStr = crs != null ? crs.toFixed(0) : '—';
            const badge = STATE_BADGE[s.state] || STATE_BADGE.DRAFT;
            const dt = new Date(s.updated_at);
            const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" data-sid="${s.strategy_id}" class="sl-lib-row">
  <td style="padding:8px;color:#e2e8f0;font-weight:500;">${s.name}</td>
  <td style="padding:8px;"><span style="padding:2px 6px;border-radius:4px;font-size:0.6rem;font-weight:600;color:${badge.color};background:${badge.bg};border:1px solid ${badge.border};font-family:'JetBrains Mono',monospace;">${badge.icon} ${s.state}</span></td>
  <td style="padding:8px;color:#94a3b8;font-family:'JetBrains Mono',monospace;">${ver}</td>
  <td style="padding:8px;color:#94a3b8;font-family:'JetBrains Mono',monospace;">${crsStr}</td>
  <td style="padding:8px;color:#64748b;">${dateStr}</td>
  <td style="padding:8px;text-align:right;"><button class="sl-lib-view-btn" data-sid="${s.strategy_id}" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#818cf8;padding:3px 10px;border-radius:4px;font-size:0.65rem;cursor:pointer;font-family:'Inter',sans-serif;">View</button></td>
</tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        container.querySelectorAll('.sl-lib-view-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                openLibDetail(btn.dataset.sid);
            });
        });
        container.querySelectorAll('.sl-lib-row').forEach(row => {
            row.addEventListener('click', () => openLibDetail(row.dataset.sid));
        });
    }

    function openLibDetail(strategyId) {
        const s = getStrategy(strategyId);
        if (!s) return;
        libDetailId = strategyId;
        const detail = libModalEl.querySelector('#sl-lib-detail');
        const list = libModalEl.querySelector('#sl-lib-list');
        list.style.display = 'none';
        detail.style.display = 'block';

        const badge = STATE_BADGE[s.state] || STATE_BADGE.DRAFT;
        const isProduction = s.state === 'PRODUCTION';
        const latestVer = s.versions.length > 0 ? s.versions[s.versions.length - 1] : null;
        const prodWarning = isProduction && latestVer && !isCapitalReady(latestVer.snapshots?.readiness?.tier)
            ? `<div style="margin:10px 0;padding:8px 12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;color:#fbbf24;font-size:0.75rem;">⚠ Latest version is not validated (tier: ${latestVer.snapshots?.readiness?.tier || 'unknown'})</div>` : '';

        let versionsHTML = '';
        [...s.versions].reverse().forEach(v => {
            const tier = v.snapshots?.readiness?.tier || '—';
            const crs = v.snapshots?.readiness?.crs;
            const crsStr = crs != null ? crs.toFixed(0) : '—';
            const dt = new Date(v.created_at);
            const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            const isCurrent = v.version_id === s.current_version_id;
            versionsHTML += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
  <td style="padding:6px 8px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;">${v.version}${isCurrent ? ' <span style="color:#4ade80;font-size:0.6rem;">●</span>' : ''}</td>
  <td style="padding:6px 8px;color:#64748b;">${dateStr}</td>
  <td style="padding:6px 8px;color:#94a3b8;">${tier}</td>
  <td style="padding:6px 8px;color:#94a3b8;font-family:'JetBrains Mono',monospace;">${crsStr}</td>
  <td style="padding:6px 8px;color:#64748b;font-family:'JetBrains Mono',monospace;" title="${v.config_hash || ''}">${shortHash(v.config_hash)}</td>
  <td style="padding:6px 8px;color:#475569;font-size:0.7rem;">${v.release_notes || '—'}</td>
</tr>`;
        });

        detail.innerHTML = `
<div style="margin-bottom:14px;">
  <button id="sl-detail-back" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.75rem;padding:0;font-family:'Inter',sans-serif;">← Back to Library</button>
</div>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
  <h4 style="margin:0;color:#e2e8f0;font-size:1rem;">${s.name}</h4>
  <span style="padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:600;color:${badge.color};background:${badge.bg};border:1px solid ${badge.border};font-family:'JetBrains Mono',monospace;">${badge.icon} ${s.state}</span>
</div>
${s.tags?.length ? `<div style="margin-bottom:10px;display:flex;gap:4px;flex-wrap:wrap;">${s.tags.map(t => `<span style="padding:1px 6px;border-radius:3px;font-size:0.6rem;color:#94a3b8;background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.15);">${t}</span>`).join('')}</div>` : ''}
${prodWarning}
<div style="display:flex;gap:6px;margin:14px 0;flex-wrap:wrap;">
  ${s.state === 'VALIDATED' ? '<button id="sl-btn-promote" style="padding:5px 14px;border-radius:6px;font-size:0.7rem;font-weight:600;cursor:pointer;background:rgba(167,139,250,0.12);color:#c4b5fd;border:1px solid rgba(167,139,250,0.3);font-family:\'Inter\',sans-serif;">⚡ Promote to Production</button>' : ''}
  ${s.state !== 'DEPRECATED' ? '<button id="sl-btn-deprecate" style="padding:5px 14px;border-radius:6px;font-size:0.7rem;font-weight:600;cursor:pointer;background:rgba(248,113,113,0.08);color:#fca5a5;border:1px solid rgba(248,113,113,0.25);font-family:\'Inter\',sans-serif;">✗ Deprecate</button>' : ''}
  <button id="sl-btn-export" style="padding:5px 14px;border-radius:6px;font-size:0.7rem;font-weight:600;cursor:pointer;background:rgba(56,189,248,0.08);color:#7dd3fc;border:1px solid rgba(56,189,248,0.2);font-family:'Inter',sans-serif;">Export JSON</button>
</div>
<div style="margin-top:14px;">
  <h5 style="margin:0 0 8px;color:#94a3b8;font-size:0.8rem;font-weight:500;">Version History (${s.versions.length})</h5>
  <table style="width:100%;border-collapse:collapse;font-size:0.7rem;">
  <thead><tr style="color:#64748b;border-bottom:1px solid rgba(255,255,255,0.06);">
    <th style="text-align:left;padding:6px 8px;">Version</th>
    <th style="text-align:left;padding:6px 8px;">Date</th>
    <th style="text-align:left;padding:6px 8px;">Tier</th>
    <th style="text-align:left;padding:6px 8px;">CRS</th>
    <th style="text-align:left;padding:6px 8px;">Hash</th>
    <th style="text-align:left;padding:6px 8px;">Notes</th>
  </tr></thead><tbody>${versionsHTML}</tbody></table>
</div>`;

        detail.querySelector('#sl-detail-back').addEventListener('click', () => {
            detail.style.display = 'none';
            list.style.display = 'block';
            renderLibList();
        });

        const promoteBtn = detail.querySelector('#sl-btn-promote');
        if (promoteBtn) {
            promoteBtn.addEventListener('click', () => {
                const res = promoteToProduction(strategyId);
                if (res.ok) { showToast(`${s.name} promoted to PRODUCTION`, '#a78bfa'); openLibDetail(strategyId); }
                else alert(res.reason);
            });
        }

        const deprecateBtn = detail.querySelector('#sl-btn-deprecate');
        if (deprecateBtn) {
            deprecateBtn.addEventListener('click', () => {
                if (!confirm(`Deprecate "${s.name}"? This marks it as retired.`)) return;
                const res = deprecateStrategy(strategyId);
                if (res.ok) { showToast(`${s.name} deprecated`, '#f87171'); openLibDetail(strategyId); }
                else alert(res.reason);
            });
        }

        const exportBtn = detail.querySelector('#sl-btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => exportStrategyJSON(strategyId));
        }
    }

    // ====================================================================
    // UI — INJECT BUTTONS INTO LEFT PANEL
    // ====================================================================
    function injectButtons() {
        const exportArea = document.querySelector('#export-group');
        if (!exportArea) return;

        const container = document.createElement('div');
        container.id = 'sl-buttons-container';
        Object.assign(container.style, {
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
            marginTop: '8px'
        });

        const btnSave = document.createElement('button');
        btnSave.id = 'btn-save-strategy-version';
        btnSave.className = 'bt-btn-sm';
        Object.assign(btnSave.style, {
            justifyContent: 'center', padding: '8px', fontSize: '0.72rem',
            background: 'rgba(99,102,241,0.08)', color: '#a5b4fc',
            border: '1px solid rgba(99,102,241,0.25)', gridColumn: 'span 1'
        });
        btnSave.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="margin-right:4px;"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Strategy Version`;
        btnSave.addEventListener('click', openSaveModal);

        const btnLib = document.createElement('button');
        btnLib.id = 'btn-strategy-library';
        btnLib.className = 'bt-btn-sm';
        Object.assign(btnLib.style, {
            justifyContent: 'center', padding: '8px', fontSize: '0.72rem',
            background: 'rgba(56,189,248,0.08)', color: '#7dd3fc',
            border: '1px solid rgba(56,189,248,0.2)', gridColumn: 'span 1'
        });
        btnLib.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="margin-right:4px;"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Strategy Library`;
        btnLib.addEventListener('click', openLibModal);

        container.appendChild(btnSave);
        container.appendChild(btnLib);
        exportArea.parentNode.insertBefore(container, exportArea.nextSibling);
    }

    // ====================================================================
    // SELF-TEST (Dev Console)
    // ====================================================================
    function selfTest() {
        console.log('=== STRATEGY LIFECYCLE v1 — SELF-TEST ===');
        let pass = 0, fail = 0;
        const assert = (cond, msg) => {
            if (cond) { console.log('✅ PASS:', msg); pass++; }
            else { console.error('❌ FAIL:', msg); fail++; }
        };

        // Backup registry
        const backup = JSON.parse(JSON.stringify(registry));

        try {
            // 1. Create strategy → DRAFT
            const s = createStrategy('Test Strategy', 'desc', ['test']);
            assert(s.state === 'DRAFT', '1. New strategy is DRAFT');

            // 2. Save version 1.0.0 → RESEARCH
            const v1 = saveStrategyVersion(s.strategy_id, {
                version: '1.0.0', release_notes: 'First version',
                config_hash: 'hash_aaa', normalized_config: { a: 1 }
            });
            assert(v1 && v1.version === '1.0.0', '2a. Version 1.0.0 created');
            const s2 = getStrategy(s.strategy_id);
            assert(s2.state === 'RESEARCH', '2b. State auto-transitioned to RESEARCH');

            // 3. Save version 1.0.1 with different hash
            const v2 = saveStrategyVersion(s.strategy_id, {
                version: '1.0.1', config_hash: 'hash_bbb', normalized_config: { a: 2 }
            });
            const s3 = getStrategy(s.strategy_id);
            assert(s3.versions[0].config_hash === 'hash_aaa', '3a. v1.0.0 config_hash immutable');
            assert(v2.config_hash === 'hash_bbb', '3b. v1.0.1 has new hash');

            // 4. Promote from RESEARCH → should fail
            const r1 = promoteToProduction(s.strategy_id);
            assert(!r1.ok, '4. Promote RESEARCH → PRODUCTION blocked');

            // 5. Simulate CAPITAL_READY tier
            const s4 = getStrategy(s.strategy_id);
            s4.versions.push({
                version_id: genUUID(), version: '1.1.0', created_at: isoNow(),
                release_notes: 'Validated', normalized_config: {}, config_hash: 'hash_ccc',
                preset_ref: {}, snapshots: {
                    readiness: { crs: 85, tier: 'CAPITAL-READY', breakdown: null, notes: null },
                    validation: { wf_enabled: false }, metrics: null
                }, exports: {}
            });
            s4.state = computeAutoState(s4);
            saveRegistry();
            assert(s4.state === 'VALIDATED', '5. Tier CAPITAL-READY → state VALIDATED');

            // 6. Promote VALIDATED → PRODUCTION
            const r2 = promoteToProduction(s.strategy_id);
            assert(r2.ok, '6. Promote VALIDATED → PRODUCTION success');
            assert(getStrategy(s.strategy_id).state === 'PRODUCTION', '6b. State is PRODUCTION');

            // 7. Add non-validated version to PRODUCTION → stays PRODUCTION
            const s5 = getStrategy(s.strategy_id);
            s5.versions.push({
                version_id: genUUID(), version: '1.2.0', created_at: isoNow(),
                release_notes: 'New run', normalized_config: {}, config_hash: 'hash_ddd',
                preset_ref: {}, snapshots: {
                    readiness: { crs: 40, tier: 'RESEARCH-ONLY', breakdown: null, notes: null },
                    validation: { wf_enabled: false }, metrics: null
                }, exports: {}
            });
            s5.state = computeAutoState(s5);
            saveRegistry();
            assert(s5.state === 'PRODUCTION', '7. PRODUCTION stays PRODUCTION with non-validated version');

            // 8. Deprecate
            const r3 = deprecateStrategy(s.strategy_id);
            assert(r3.ok && getStrategy(s.strategy_id).state === 'DEPRECATED', '8. Deprecate works');

            // 9. Registry persistence
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = JSON.parse(raw);
            const found = parsed.find(x => x.strategy_id === s.strategy_id);
            assert(!!found, '9. Registry persisted to localStorage');

        } catch (e) {
            console.error('Test exception:', e);
            fail++;
        }

        // Restore registry
        registry = backup;
        saveRegistry();

        console.log(`=== SELF-TEST COMPLETE: ${pass} PASS / ${fail} FAIL ===`);
        return fail === 0 ? 'ALL PASS' : 'SOME FAILED';
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================
    function init() {
        loadRegistry();
        injectButtons();
        console.log(LOG, `v1 loaded — ${registry.length} strategies in registry`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================
    window.StrategyLifecycle = {
        createStrategy,
        saveStrategyVersion,
        getStrategy,
        getStrategyByName,
        listStrategies,
        promoteToProduction,
        deprecateStrategy,
        exportStrategyJSON,
        openSaveModal,
        openLibModal,
        selfTest,
        getRegistry: () => [...registry],
        STATE_BADGE
    };

})();
