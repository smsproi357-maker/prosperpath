/* ========================================================================
   DEPLOYMENT JOURNAL v1 — Structured Research Ledger
   Links: Backtest Run → Paper Deploy Session → CRS/Tier at time of run
   UI + localStorage only. No engine changes.
   ======================================================================== */

(function () {
    'use strict';

    // ====================================================================
    // CONSTANTS
    // ====================================================================
    const STORAGE_KEY = 'pp_deployment_journal_v1';
    const MAX_ENTRIES = 300;

    // Tier config for badge rendering (mirror from capital-readiness)
    const TIER_STYLES = {
        'CAPITAL-READY': { color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)', icon: '🟢' },
        'OBSERVE': { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)', icon: '🟡' },
        'RESEARCH-ONLY': { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.25)', icon: '🔵' },
        'DO NOT DEPLOY': { color: '#f87171', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', icon: '🔴' }
    };

    // ====================================================================
    // UUID GENERATOR
    // ====================================================================
    function genUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'dj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    }

    // ====================================================================
    // STORAGE LAYER
    // ====================================================================
    let entries = [];

    function loadEntries() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    entries = parsed.filter(e => e && e.id && e.created_at);
                } else {
                    throw new Error('Invalid journal structure');
                }
            }
        } catch (e) {
            console.error('[DeploymentJournal] Failed to load:', e);
            entries = [];
        }
    }

    function saveEntriesToStorage() {
        try {
            // Enforce cap
            while (entries.length > MAX_ENTRIES) {
                entries.pop(); // drop oldest (entries are newest-first)
            }
            const jsonStr = JSON.stringify(entries);
            localStorage.setItem(STORAGE_KEY, jsonStr);
        } catch (e) {
            console.error('[DeploymentJournal] Storage full or error:', e);
            alert('Storage full — delete older journal entries.');
        }
    }

    // ====================================================================
    // AUTO-GENERATED TITLES
    // ====================================================================
    function autoTitle(entryType, context, readinessSnapshot) {
        const crs = readinessSnapshot ? readinessSnapshot.crs : '?';
        const preset = context.preset_name && context.preset_name !== 'CUSTOM' && context.preset_name !== 'custom'
            ? context.preset_name
            : (context.asset + '/' + context.timeframe);

        switch (entryType) {
            case 'BACKTEST':
                return `Backtest — ${preset} — CRS ${crs}`;
            case 'PAPER_SESSION':
                return `Paper Session — ${preset} — CRS ${crs}`;
            case 'COMPARISON':
                return `A/B Compare — ${preset}`;
            default:
                return `Journal Entry — ${preset}`;
        }
    }

    // ====================================================================
    // CRS SNAPSHOT CAPTURE
    // ====================================================================
    function captureCRSSnapshot(presetKey) {
        if (!window.CapitalReadiness || typeof window.CapitalReadiness.computeCRS !== 'function') {
            return { crs: 0, tier: 'RESEARCH-ONLY', breakdown: {}, notes: ['CRS module not loaded'] };
        }
        try {
            const result = window.CapitalReadiness.computeCRS(presetKey);
            return {
                crs: result.crs || 0,
                tier: result.tier || 'RESEARCH-ONLY',
                breakdown: result.breakdown || {},
                notes: result.notes || []
            };
        } catch (err) {
            console.warn('[DeploymentJournal] CRS snapshot failed:', err);
            return { crs: 0, tier: 'RESEARCH-ONLY', breakdown: {}, notes: ['CRS computation error'] };
        }
    }

    // ====================================================================
    // SAVE ENTRY
    // ====================================================================
    function saveEntry({
        entry_type = 'BACKTEST',
        title = '',
        tags = [],
        linkages = {},
        context = {},
        metrics = {},
        operator_notes = '',
        config_export = null,
        report_export = null,
        presetKey = 'CUSTOM'
    } = {}) {
        const readinessSnapshot = captureCRSSnapshot(presetKey);

        // Auto-generate title if empty
        if (!title || title.trim() === '') {
            title = autoTitle(entry_type, context, readinessSnapshot);
        }

        const entry = {
            id: genUUID(),
            created_at: new Date().toISOString(),
            entry_type: entry_type,
            title: title.trim(),
            tags: Array.isArray(tags) ? tags : [],

            linkages: {
                run_record_id: linkages.run_record_id || null,
                baseline_run_id: linkages.baseline_run_id || null,
                compare_run_id: linkages.compare_run_id || null,
                paper_session_id: linkages.paper_session_id || null
            },

            context: {
                preset_name: context.preset_name || null,
                asset: context.asset || '',
                timeframe: context.timeframe || '',
                date_range: context.date_range || null,
                starting_capital: context.starting_capital || null,
                // Preset Versioning v1
                preset_id: context.preset_id || null,
                preset_version: context.preset_version || null,
                config_hash: context.config_hash || null
            },

            readiness_snapshot: readinessSnapshot,

            metrics_snapshot: {
                return_pct: metrics.return_pct ?? null,
                maxdd_pct: metrics.maxdd_pct ?? null,
                score_ret_dd: metrics.score_ret_dd ?? null,
                profit_factor: metrics.profit_factor ?? null,
                expectancy_per_trade: metrics.expectancy_per_trade ?? null,
                trades: metrics.trades ?? null,
                win_rate: metrics.win_rate ?? null
            },

            operator_notes: operator_notes || '',

            attachments: {
                config_export_json: config_export || null,
                report_export_json: report_export || null
            }
        };

        entries.unshift(entry);
        saveEntriesToStorage();
        renderJournalUI();
        return entry;
    }

    // ====================================================================
    // QUERY API
    // ====================================================================
    function getEntries() { return entries; }
    function getEntry(id) { return entries.find(e => e.id === id) || null; }

    function deleteEntry(id) {
        entries = entries.filter(e => e.id !== id);
        saveEntriesToStorage();
        renderJournalUI();
    }

    function getFilteredEntries({ tier, preset, tag } = {}) {
        let filtered = entries;
        if (tier && tier !== 'ALL') {
            filtered = filtered.filter(e => e.readiness_snapshot && e.readiness_snapshot.tier === tier);
        }
        if (preset && preset !== 'ALL') {
            filtered = filtered.filter(e => e.context && e.context.preset_name === preset);
        }
        if (tag && tag.trim() !== '') {
            const tagLower = tag.trim().toLowerCase();
            filtered = filtered.filter(e => e.tags && e.tags.some(t => t.toLowerCase().includes(tagLower)));
        }
        return filtered;
    }

    function getAllPresets() {
        const presets = new Set();
        entries.forEach(e => {
            if (e.context && e.context.preset_name) presets.add(e.context.preset_name);
        });
        return Array.from(presets);
    }

    function getAllTags() {
        const tags = new Set();
        entries.forEach(e => {
            if (e.tags) e.tags.forEach(t => tags.add(t));
        });
        return Array.from(tags);
    }

    // ====================================================================
    // UI — JOURNAL PANEL (injected into AI Strategy Modal)
    // ====================================================================
    let currentDetailId = null;
    let activeFilters = { tier: 'ALL', preset: 'ALL', tag: '' };

    function ensureJournalPanel() {
        if (document.getElementById('dj-panel-root')) return;

        // Find the run history section inside the AI modal and insert after it
        const runHistorySection = document.querySelector('#ai-modal .bt-modal-body > div:last-child') ||
            document.querySelector('#ai-modal .bt-modal-body');
        if (!runHistorySection) {
            console.warn('[DeploymentJournal] Could not find injection point');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'dj-panel-root';
        panel.style.cssText = 'margin-top: 24px; border-top: 1px solid rgba(226, 232, 240, 0.08); padding-top: 16px;';

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 class="bt-section-title" style="margin: 0; display: flex; align-items: center; gap: 8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M4 4h16v16H4z" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="rgba(168,85,247,0.08)"/>
                        <path d="M8 8h8M8 12h6M8 16h4" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    Deployment Journal
                </h3>
                <span class="bt-badge" style="background: rgba(168, 85, 247, 0.1); color: #c084fc; border-color: rgba(168, 85, 247, 0.2);">Research Ledger</span>
            </div>

            <!-- Filter Bar -->
            <div id="dj-filter-bar" class="dj-filter-bar">
                <select id="dj-filter-tier" class="dj-filter-select">
                    <option value="ALL">All Tiers</option>
                    <option value="CAPITAL-READY">Capital-Ready</option>
                    <option value="OBSERVE">Observe</option>
                    <option value="RESEARCH-ONLY">Research-Only</option>
                    <option value="DO NOT DEPLOY">Do Not Deploy</option>
                </select>
                <select id="dj-filter-preset" class="dj-filter-select">
                    <option value="ALL">All Presets</option>
                </select>
                <input type="text" id="dj-filter-tag" class="dj-filter-input" placeholder="Filter by tag..." />
            </div>

            <!-- List View -->
            <div id="dj-entry-list" class="dj-entry-list"></div>

            <!-- Detail View (hidden by default) -->
            <div id="dj-detail-view" class="dj-detail-view" style="display: none;"></div>

            <!-- JSON Viewer Modal -->
            <div id="dj-json-modal" class="dj-json-modal" style="display: none;">
                <div class="dj-json-modal-inner">
                    <div class="dj-json-modal-header">
                        <span id="dj-json-modal-title">JSON Export</span>
                        <button id="dj-json-modal-close" class="dj-json-close-btn">&times;</button>
                    </div>
                    <pre id="dj-json-modal-content" class="dj-json-content"></pre>
                    <button id="dj-json-download-btn" class="bt-btn-sm" style="margin-top: 8px; width: 100%; justify-content: center;">Download JSON</button>
                </div>
            </div>
        `;

        // Insert after run history
        if (runHistorySection.parentNode) {
            runHistorySection.parentNode.appendChild(panel);
        }

        // Attach filter listeners
        document.getElementById('dj-filter-tier').addEventListener('change', () => {
            activeFilters.tier = document.getElementById('dj-filter-tier').value;
            renderJournalList();
        });
        document.getElementById('dj-filter-preset').addEventListener('change', () => {
            activeFilters.preset = document.getElementById('dj-filter-preset').value;
            renderJournalList();
        });
        document.getElementById('dj-filter-tag').addEventListener('input', () => {
            activeFilters.tag = document.getElementById('dj-filter-tag').value;
            renderJournalList();
        });

        // JSON modal close
        document.getElementById('dj-json-modal-close').addEventListener('click', () => {
            document.getElementById('dj-json-modal').style.display = 'none';
        });
    }

    // ====================================================================
    // UI — LIST VIEW RENDERING
    // ====================================================================
    function renderJournalList() {
        const listEl = document.getElementById('dj-entry-list');
        if (!listEl) return;

        const filtered = getFilteredEntries(activeFilters);

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="dj-empty">No journal entries${activeFilters.tier !== 'ALL' || activeFilters.preset !== 'ALL' || activeFilters.tag ? ' matching filters' : ''}. Run a backtest and "Save to Journal".</div>`;
            return;
        }

        let html = '';
        filtered.forEach(entry => {
            const date = new Date(entry.created_at);
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const tier = entry.readiness_snapshot ? entry.readiness_snapshot.tier : 'RESEARCH-ONLY';
            const crs = entry.readiness_snapshot ? entry.readiness_snapshot.crs : '—';
            const tierStyle = TIER_STYLES[tier] || TIER_STYLES['RESEARCH-ONLY'];
            const preset = entry.context ? (entry.context.preset_name || '—') : '—';
            const metrics = entry.metrics_snapshot || {};

            const tagsHtml = entry.tags && entry.tags.length > 0
                ? `<div class="dj-card-tags">${entry.tags.map(t => `<span class="dj-tag">${t}</span>`).join('')}</div>`
                : '';

            const returnPct = metrics.return_pct;
            const retColor = returnPct != null ? (parseFloat(returnPct) >= 0 ? '#4ade80' : '#f87171') : '#64748b';
            const retDisplay = returnPct != null ? `${parseFloat(returnPct) >= 0 ? '+' : ''}${parseFloat(returnPct).toFixed(1)}%` : '—';

            html += `
                <div class="dj-entry-card" data-id="${entry.id}">
                    <div class="dj-card-top">
                        <div class="dj-card-left">
                            <div class="dj-card-title">${entry.title}</div>
                            <div class="dj-card-meta">${dateStr} ${timeStr} · ${preset}</div>
                        </div>
                        <div class="dj-card-right">
                            <span class="dj-tier-badge" style="background:${tierStyle.bg};color:${tierStyle.color};border-color:${tierStyle.border};">${tierStyle.icon} ${tier.split(' ')[0]}</span>
                            <span class="dj-crs-number">CRS ${crs}</span>
                        </div>
                    </div>
                    <div class="dj-card-metrics">
                        <span class="dj-card-metric"><span class="dj-card-metric-label">Return</span><span style="color:${retColor}">${retDisplay}</span></span>
                        <span class="dj-card-metric"><span class="dj-card-metric-label">MaxDD</span><span style="color:#f87171">${metrics.maxdd_pct != null ? parseFloat(metrics.maxdd_pct).toFixed(1) + '%' : '—'}</span></span>
                        <span class="dj-card-metric"><span class="dj-card-metric-label">PF</span><span>${metrics.profit_factor != null ? parseFloat(metrics.profit_factor).toFixed(2) : '—'}</span></span>
                        <span class="dj-card-metric"><span class="dj-card-metric-label">Trades</span><span>${metrics.trades != null ? metrics.trades : '—'}</span></span>
                        <span class="dj-card-metric"><span class="dj-card-metric-label">WR</span><span>${metrics.win_rate != null ? parseFloat(metrics.win_rate).toFixed(1) + '%' : '—'}</span></span>
                    </div>
                    ${tagsHtml}
                </div>
            `;
        });

        listEl.innerHTML = html;

        // Entry card click → detail
        listEl.querySelectorAll('.dj-entry-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                openDetailView(id);
            });
        });
    }

    // ====================================================================
    // UI — DETAIL VIEW
    // ====================================================================
    function openDetailView(id) {
        const entry = getEntry(id);
        if (!entry) return;

        currentDetailId = id;
        const detailEl = document.getElementById('dj-detail-view');
        if (!detailEl) return;

        const tier = entry.readiness_snapshot ? entry.readiness_snapshot.tier : 'RESEARCH-ONLY';
        const crs = entry.readiness_snapshot ? entry.readiness_snapshot.crs : 0;
        const tierStyle = TIER_STYLES[tier] || TIER_STYLES['RESEARCH-ONLY'];
        const bd = entry.readiness_snapshot ? entry.readiness_snapshot.breakdown : {};
        const notes = entry.readiness_snapshot ? entry.readiness_snapshot.notes : [];
        const metrics = entry.metrics_snapshot || {};
        const ctx = entry.context || {};
        const dateStr = new Date(entry.created_at).toLocaleString();

        const barColor = crs >= 75 ? '#4ade80' : crs >= 55 ? '#fbbf24' : crs >= 35 ? '#60a5fa' : '#f87171';

        let html = `
            <div class="dj-detail-header">
                <button class="dj-detail-back" id="dj-detail-back">← Back</button>
                <button class="dj-detail-delete" id="dj-detail-delete">Delete</button>
            </div>

            <div class="dj-detail-title-row">
                <h3 class="dj-detail-title">${entry.title}</h3>
                <span class="dj-tier-badge" style="background:${tierStyle.bg};color:${tierStyle.color};border-color:${tierStyle.border};">${tierStyle.icon} ${tier}</span>
            </div>
            <div class="dj-detail-meta">${dateStr} · ${entry.entry_type} · ${ctx.preset_name || 'CUSTOM'}${ctx.preset_version ? ' <span class="pv-journal-badge">' + (ctx.preset_name || 'custom') + '@v' + ctx.preset_version + '</span>' : ''} · ${ctx.asset || ''}/${ctx.timeframe || ''}${ctx.config_hash ? ' <span class="pv-journal-hash" title="Config hash: ' + ctx.config_hash + '">#' + ctx.config_hash.substring(0, 8) + '</span>' : ''}</div>

            <!-- CRS Score Bar -->
            <div class="dj-detail-section">
                <div class="dj-detail-section-title">CRS SNAPSHOT</div>
                <div class="dj-crs-bar-row">
                    <span class="dj-crs-label">Capital Readiness Score</span>
                    <span class="dj-crs-value" style="color:${barColor}">${crs} <span style="color:#64748b;font-weight:400;font-size:0.65rem">/ 100</span></span>
                </div>
                <div class="dj-crs-bar-track">
                    <div class="dj-crs-bar-fill" style="width:${crs}%;background:${barColor}"></div>
                </div>
            </div>

            <!-- CRS Breakdown -->
            <div class="dj-detail-section">
                <div class="dj-detail-section-title">CRS BREAKDOWN</div>
                ${renderDetailBreakdownRow('Sample', bd.sample, 20)}
                ${renderDetailBreakdownRow('Stability', bd.stability, 35)}
                ${renderDetailBreakdownRow('Edge', bd.edge, 25)}
                ${renderDetailBreakdownRow('Alignment', bd.alignment, 15)}
                ${renderDetailBreakdownRow('Hygiene', bd.hygiene, 0, true)}
            </div>
        `;

        // CRS Notes
        if (notes.length > 0) {
            html += `<div class="dj-detail-section">
                <div class="dj-detail-section-title">CRS NOTES</div>
                ${notes.map(n => {
                const isHigh = n.includes('Override') || n.includes('Safety') || n.includes('diverging');
                return `<div class="dj-note-item ${isHigh ? 'dj-note-warn' : 'dj-note-info'}">${isHigh ? '⚠' : '○'} ${n}</div>`;
            }).join('')}
            </div>`;
        }

        // Metrics Snapshot
        html += `
            <div class="dj-detail-section">
                <div class="dj-detail-section-title">METRICS SNAPSHOT</div>
                <div class="dj-metrics-grid">
                    ${metricCell('Return', metrics.return_pct, '%', true)}
                    ${metricCell('Max DD', metrics.maxdd_pct, '%', false, true)}
                    ${metricCell('Score (R/DD)', metrics.score_ret_dd)}
                    ${metricCell('Profit Factor', metrics.profit_factor)}
                    ${metricCell('Expectancy', metrics.expectancy_per_trade, '', true)}
                    ${metricCell('Trades', metrics.trades)}
                    ${metricCell('Win Rate', metrics.win_rate, '%')}
                </div>
            </div>
        `;

        // Operator Notes
        if (entry.operator_notes) {
            html += `
                <div class="dj-detail-section">
                    <div class="dj-detail-section-title">OPERATOR NOTES</div>
                    <div class="dj-operator-notes">${entry.operator_notes}</div>
                </div>
            `;
        }

        // Tags
        if (entry.tags && entry.tags.length > 0) {
            html += `
                <div class="dj-detail-section">
                    <div class="dj-detail-section-title">TAGS</div>
                    <div class="dj-card-tags">${entry.tags.map(t => `<span class="dj-tag">${t}</span>`).join('')}</div>
                </div>
            `;
        }

        // Attachment Links
        html += `
            <div class="dj-detail-section">
                <div class="dj-detail-section-title">EXPORTS</div>
                <div class="dj-export-row">
                    <button class="bt-btn-sm dj-export-btn" id="dj-view-config" ${entry.attachments && entry.attachments.config_export_json ? '' : 'disabled style="opacity:0.4"'}>Open Config JSON</button>
                    <button class="bt-btn-sm dj-export-btn" id="dj-view-report" ${entry.attachments && entry.attachments.report_export_json ? '' : 'disabled style="opacity:0.4"'}>Open Report JSON</button>
                </div>
            </div>
        `;

        detailEl.innerHTML = html;
        detailEl.style.display = 'block';

        // Hide list, show detail
        const listEl = document.getElementById('dj-entry-list');
        const filterBar = document.getElementById('dj-filter-bar');
        if (listEl) listEl.style.display = 'none';
        if (filterBar) filterBar.style.display = 'none';

        // Back button
        document.getElementById('dj-detail-back').addEventListener('click', closeDetailView);

        // Delete button
        document.getElementById('dj-detail-delete').addEventListener('click', () => {
            if (confirm('Delete this journal entry? This cannot be undone.')) {
                deleteEntry(id);
                closeDetailView();
            }
        });

        // Config JSON viewer
        const btnConfig = document.getElementById('dj-view-config');
        if (btnConfig && entry.attachments && entry.attachments.config_export_json) {
            btnConfig.addEventListener('click', () => {
                openJSONViewer('Config Export', entry.attachments.config_export_json);
            });
        }

        // Report JSON viewer
        const btnReport = document.getElementById('dj-view-report');
        if (btnReport && entry.attachments && entry.attachments.report_export_json) {
            btnReport.addEventListener('click', () => {
                openJSONViewer('Report Export', entry.attachments.report_export_json);
            });
        }
    }

    function closeDetailView() {
        currentDetailId = null;
        const detailEl = document.getElementById('dj-detail-view');
        const listEl = document.getElementById('dj-entry-list');
        const filterBar = document.getElementById('dj-filter-bar');
        if (detailEl) detailEl.style.display = 'none';
        if (listEl) listEl.style.display = 'flex';
        if (filterBar) filterBar.style.display = 'flex';
    }

    // ====================================================================
    // UI — JSON VIEWER
    // ====================================================================
    function openJSONViewer(title, jsonObj) {
        const modal = document.getElementById('dj-json-modal');
        if (!modal) return;

        document.getElementById('dj-json-modal-title').textContent = title;
        const content = document.getElementById('dj-json-modal-content');
        content.textContent = JSON.stringify(jsonObj, null, 2);
        modal.style.display = 'flex';

        // Download handler
        const dlBtn = document.getElementById('dj-json-download-btn');
        const newDlBtn = dlBtn.cloneNode(true);
        dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);
        newDlBtn.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(jsonObj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = title.toLowerCase().replace(/\s+/g, '_') + '.json';
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // ====================================================================
    // UI HELPERS
    // ====================================================================
    function renderDetailBreakdownRow(label, value, maxVal, isPenalty) {
        if (value == null || value === undefined) value = 0;
        let barPct, barColor;
        if (isPenalty) {
            barPct = Math.abs(value) / 20 * 100;
            barColor = value >= 0 ? '#4ade80' : value > -10 ? '#fbbf24' : '#f87171';
        } else {
            barPct = maxVal > 0 ? (value / maxVal) * 100 : 0;
            const ratio = maxVal > 0 ? value / maxVal : 0;
            barColor = ratio >= 0.7 ? '#4ade80' : ratio >= 0.4 ? '#fbbf24' : '#f87171';
        }
        const scoreDisplay = isPenalty ? `${parseFloat(value).toFixed(0)}` : `${parseFloat(value).toFixed(0)}/${maxVal}`;

        return `
            <div class="dj-breakdown-row">
                <div class="dj-breakdown-header">
                    <span class="dj-breakdown-label">${label}</span>
                    <span class="dj-breakdown-score" style="color:${barColor}">${scoreDisplay}</span>
                </div>
                <div class="dj-breakdown-track"><div class="dj-breakdown-fill" style="width:${Math.min(100, barPct)}%;background:${barColor}"></div></div>
            </div>
        `;
    }

    function metricCell(label, value, suffix, colorBySign, alwaysNeg) {
        let display = '—';
        let color = '#94a3b8';
        if (value != null && value !== '' && !isNaN(parseFloat(value))) {
            const num = parseFloat(value);
            display = suffix === '%' ? num.toFixed(1) + '%' : num.toFixed(2);
            if (colorBySign) color = num >= 0 ? '#4ade80' : '#f87171';
            if (alwaysNeg) color = '#f87171';
            if (label === 'Trades') display = Math.round(num).toString();
        }
        return `
            <div class="dj-metric-cell">
                <div class="dj-metric-cell-label">${label}</div>
                <div class="dj-metric-cell-value" style="color:${color}">${display}</div>
            </div>
        `;
    }

    // ====================================================================
    // UI — PRESET FILTER POPULATION
    // ====================================================================
    function updatePresetFilter() {
        const select = document.getElementById('dj-filter-preset');
        if (!select) return;
        const presets = getAllPresets();
        const current = select.value;
        select.innerHTML = '<option value="ALL">All Presets</option>';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            select.appendChild(opt);
        });
        if (presets.includes(current)) select.value = current;
    }

    // ====================================================================
    // UI — MAIN RENDER
    // ====================================================================
    function renderJournalUI() {
        ensureJournalPanel();
        updatePresetFilter();
        renderJournalList();
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================
    function init() {
        loadEntries();
        let _djInitialized = false;

        function tryInit() {
            if (_djInitialized) return;
            if (document.getElementById('ai-modal')) {
                _djInitialized = true;
                renderJournalUI();
            }
        }

        // Delayed init — wait for AI modal DOM, disconnect after first success
        const observer = new MutationObserver(() => {
            if (!_djInitialized && document.getElementById('ai-modal')) {
                observer.disconnect();
                _djInitialized = true;
                renderJournalUI();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Also try after short delay
        setTimeout(tryInit, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================
    window.DeploymentJournal = {
        saveEntry,
        getEntries,
        getEntry,
        deleteEntry,
        getFilteredEntries,
        renderJournalUI,
        captureCRSSnapshot
    };

    console.log('[DeploymentJournal] v1 loaded — Research Ledger');

})();
