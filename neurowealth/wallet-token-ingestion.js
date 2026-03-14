/**
 * wallet-token-ingestion.js
 *
 * Fetches on-chain token balances for a connected wallet across ALL supported
 * EVM chains and renders them into the portfolio page.
 *
 * ARCHITECTURE:
 * - Primary path: GET /api/wallet-tokens-multichain?address=0x...
 *   Scans Ethereum, BNB Chain, Polygon, Arbitrum, Base, Optimism, Avalanche
 *   in parallel server-side, returns unified multichain payload.
 * - Fallback path: GET /api/wallet-tokens?address=0x...&chainId=N
 *   Used only if the multichain endpoint fails entirely.
 * - No token data is fabricated.
 * - Tokens with $0 USD value but non-zero balances ARE shown (unpriced assets).
 * - Unsupported chains produce an honest inline message.
 * - window.portfolioData is written so the AI Insights system picks up wallet
 *   data via the same path as Plaid.
 *
 * Exposed as: window.WalletTokenIngestion = { fetchAndRender }
 */

'use strict';

(function () {

    // -------------------------------------------------------------------------
    // API base URL resolution
    // -------------------------------------------------------------------------
    // On localhost (3000/3005): use relative paths — server.js / simple-server.js
    //   handles /api/* routes locally.
    // On production (prosperpath.pages.dev or any non-localhost host): use the
    //   absolute Worker URL. Cloudflare Pages CDN does NOT serve /api/* routes;
    //   relative URLs there return HTML, causing the "non-JSON" parse error.
    // window.WORKER_BASE_URL is set by script.js which loads before this file.
    const _isLocalhost = (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    );
    const _apiBase = _isLocalhost
        ? ''   // relative path — handled by local Node.js server
        : (window.WORKER_BASE_URL || 'https://neurowealth-worker.smsproi357.workers.dev');

    // -------------------------------------------------------------------------
    // Chain icon map (emoji badges shown in section headers)
    // -------------------------------------------------------------------------
    const CHAIN_ICON = {
        'Ethereum':          '⟠',
        'Ethereum Mainnet':  '⟠',
        'BNB Chain':         '🟡',
        'Polygon':           '🟣',
        'Arbitrum':          '🔵',
        'Arbitrum One':      '🔵',
        'Base':              '🔷',
        'Optimism':          '🔴',
        'Avalanche C-Chain': '🔺',
    };

    function getChainIcon(chainName) {
        return CHAIN_ICON[chainName] || '🔗';
    }

    // -------------------------------------------------------------------------
    // Internal UI helpers
    // -------------------------------------------------------------------------

    function setHoldingsLoading(isLoading, message) {
        const container      = document.getElementById('holdings-container');
        const section        = document.getElementById('holdings-section');
        const dashboardSection = document.getElementById('dashboard-section');
        if (!container || !section) return;

        if (isLoading) {
            if (dashboardSection) dashboardSection.classList.remove('hidden');
            section.classList.remove('hidden');
            container.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; padding:20px 0; color:#94a3b8; font-size:0.9rem;">
                    <div style="
                        width:18px; height:18px;
                        border:2px solid rgba(212,175,55,0.2);
                        border-top-color:#D4AF37;
                        border-radius:50%;
                        animation:pp-spin 0.7s linear infinite;
                        flex-shrink:0;
                    "></div>
                    <span>${message || 'Fetching token balances…'}</span>
                </div>
            `;
        }
    }

    function setHoldingsMessage(type, message) {
        const container        = document.getElementById('holdings-container');
        const section          = document.getElementById('holdings-section');
        const dashboardSection = document.getElementById('dashboard-section');
        if (!container || !section) return;

        const colors = {
            error:   { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.2)',  text: '#fca5a5' },
            warning: { bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.2)', text: '#fde68a' },
            info:    { bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.2)', text: '#c4b5fd' },
        };
        const c = colors[type] || colors.info;

        if (dashboardSection) dashboardSection.classList.remove('hidden');
        section.classList.remove('hidden');
        container.innerHTML = `
            <div style="
                background:${c.bg}; border:1px solid ${c.border}; border-radius:10px;
                padding:16px 18px; font-size:0.85rem; color:${c.text}; line-height:1.6;
            ">${message}</div>
        `;
    }

    /**
     * Update the wallet total USD slot inside #wallet-summary.
     */
    function updateWalletTotalUSD(totalUsd, chainCount) {
        const el = document.getElementById('wallet-total-usd');
        if (!el) return;
        if (totalUsd > 0) {
            const chainSuffix = chainCount ? ` · ${chainCount} chain${chainCount === 1 ? '' : 's'}` : '';
            el.textContent = `Multichain portfolio: $${totalUsd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })}${chainSuffix}`;
            el.style.display = '';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    /** Update the chain-scanned count badge if the element exists. */
    function updateChainCountBadge(activeChains, scannedChains) {
        const el = document.getElementById('wallet-chain-count');
        if (!el) return;
        el.textContent = `${activeChains} of ${scannedChains} chains active`;
        el.style.display = '';
    }

    /** Hide the "not yet available" static note in #wallet-summary. */
    function hideStaleNote() {
        const note = document.getElementById('wallet-holdings-note');
        if (note) note.classList.add('hidden');
    }

    // -------------------------------------------------------------------------
    // Summary bar + analysis section updaters
    // -------------------------------------------------------------------------

    /**
     * Populate the #portfolio-summary-bar with multichain totals.
     */
    function updateMultichainSummaryBar(result) {
        if (window.PortfolioSummaryBar) {
            window.PortfolioSummaryBar.render('portfolio-summary-bar-container', result);
        } else {
            console.warn('[WalletTokenIngestion] PortfolioSummaryBar component not found.');
        }

        if (window.PortfolioPerformanceChart) {
            window.PortfolioPerformanceChart.render('portfolio-performance-chart-container', result.totalPortfolioValueUsd);
        } else {
            console.warn('[WalletTokenIngestion] PortfolioPerformanceChart component not found.');
        }

        console.info('[WalletTokenIngestion] Summary bar updated:', {
            totalUsd:     result.totalPortfolioValueUsd,
            priced:       result.pricedHoldingsCount,
            unpriced:     result.unpricedHoldingsCount,
        });
    }

    function renderMultichainAnalysis(result) {
        const dashboardSection = document.getElementById('dashboard-section');
        if (dashboardSection) {
            dashboardSection.classList.remove('hidden');
        }

        // Render Distribution Chart
        if (window.PortfolioDistributionChart && result.allHoldingsFlat) {
            window.PortfolioDistributionChart.render(
                'distribution-chart', 
                result.allHoldingsFlat, 
                result.totalPortfolioValueUsd || 0
            );
        }

        // Render Insights Panel
        if (window.PortfolioInsightsPanel && result.allHoldingsFlat) {
            window.PortfolioInsightsPanel.render('portfolio-insights-panel', result);
        }

        // Render Health Panel
        if (window.PortfolioHealthPanel && result.allHoldingsFlat) {
            window.PortfolioHealthPanel.render('portfolio-health-panel', result);
        }

        console.info('[WalletTokenIngestion] Analysis section rendered via dashboard components');
    }

    // -------------------------------------------------------------------------
    // Multichain fetch
    // -------------------------------------------------------------------------

    /**
     * Safely fetch JSON from an API endpoint.
     * Falls back to the raw text in error messages so the developer always
     * sees what the server actually returned — no more opaque parse failures.
     */
    async function safeJsonFetch(url, options) {
        const response = await fetch(url, options);
        const rawText  = await response.text();

        // Attempt JSON parse regardless of Content-Type
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            // Log the raw text so the developer can diagnose the real issue
            console.error(
                `[WalletTokenIngestion] Non-JSON response from ${url}\n` +
                `  Status: ${response.status} ${response.statusText}\n` +
                `  Raw body (first 300 chars): ${rawText.slice(0, 300)}`
            );

            // Check for the specific 503 we inject when server.js is offline
            if (rawText.includes('API_SERVER_OFFLINE') || rawText.includes('API server is not running')) {
                throw new Error(
                    'The ProsperPath API server (server.js) is not running on port 3000. ' +
                    'Open a second terminal and run: node server.js'
                );
            }

            // Generic non-JSON error
            const preview = rawText.slice(0, 80).trim();
            throw new Error(
                `Server returned non-JSON on ${url} (HTTP ${response.status}): "${preview}…" — ` +
                `Check that server.js is running (node server.js) and that your .env has ALCHEMY_API_KEY.`
            );
        }

        if (!response.ok) {
            // ── Production deployment: wallet scanning is not available ───────
            // The Cloudflare Worker returns a JSON 501 with code
            // WALLET_SCAN_UNAVAILABLE_IN_PRODUCTION for /api/wallet-tokens*
            // endpoints. Surface a friendly message instead of a raw API error.
            if (data.code === 'WALLET_SCAN_UNAVAILABLE_IN_PRODUCTION') {
                throw new Error(
                    '🌐 On-chain wallet scanning requires the local backend (node server.js). ' +
                    'The live site does not have access to the Alchemy API key. ' +
                    'Run server.js locally to use this feature.'
                );
            }
            throw new Error(data.error || `Server returned ${response.status}`);
        }
        return data;
    }


    /**
     * Fetch multichain token balances from /api/wallet-tokens-multichain.
     */
    async function fetchMultichainTokens(address, noCache) {
        const params = new URLSearchParams({
            address,
            ...(noCache ? { noCache: '1' } : {}),
        });
        // _apiBase is '' on localhost, full Worker URL on production
        return safeJsonFetch(`${_apiBase}/api/wallet-tokens-multichain?${params}`);
    }

    /**
     * Fallback: fetch single-chain tokens (original endpoint).
     */
    async function fetchSingleChainTokens(address, chainId, noCache) {
        const params = new URLSearchParams({
            address,
            chainId: String(chainId),
            ...(noCache ? { noCache: '1' } : {}),
        });
        return safeJsonFetch(`${_apiBase}/api/wallet-tokens?${params}`);
    }

    // -------------------------------------------------------------------------
    // Build AI-compatible portfolio payload (multichain-aware)
    // -------------------------------------------------------------------------

    function buildMultichainPortfolioData(multichainResult, activeChainId) {
        const {
            walletAddress,
            totalPortfolioValueUsd,
            chainGroupedHoldings,
            allHoldingsFlat,
            chainTotals,
            topHoldings,
            activeChains,
            failedChains,
            pricedHoldingsCount,
            unpricedHoldingsCount,
        } = multichainResult;

        const STABLE_SYMBOLS = new Set(['USDT','USDC','DAI','BUSD','TUSD','FRAX','LUSD','USDD','GUSD']);

        const stablecoinExposureUsd = allHoldingsFlat
            .filter(h => STABLE_SYMBOLS.has((h.symbol || '').toUpperCase()))
            .reduce((s, h) => s + (h.valueUsd || 0), 0);

        const nativeHoldingsByChain = {};
        for (const [chainName, holdings] of Object.entries(chainGroupedHoldings)) {
            const native = holdings.find(h => h.isNative);
            if (native) {
                nativeHoldingsByChain[chainName] = {
                    symbol:   native.symbol,
                    quantity: native.formattedBalance || native.quantity,
                    valueUsd: native.valueUsd,
                };
            }
        }

        const cryptoSummary = {
            totalValueUsd:        totalPortfolioValueUsd,
            activeChains,
            walletAddress,
            activeChainId,
            chainConcentration:   chainTotals,
            nativeHoldingsByChain,
            tokenCount:           allHoldingsFlat.filter(h => !h.isNative).length,
            stablecoinExposureUsd,
            topHoldings,
            failedChains:         (failedChains || []).map(c => c.chainName),
            isMultichain:         true,
            pricedHoldingsCount,
            unpricedHoldingsCount,
        };

        console.info('[WalletTokenIngestion] Multichain AI payload prepared:', {
            totalAssets:  allHoldingsFlat.length,
            totalUsd:     totalPortfolioValueUsd,
            priced:       pricedHoldingsCount,
            unpriced:     unpricedHoldingsCount,
            activeChains,
            stablecoinExposureUsd,
        });

        return {
            holdings:     { holdings: allHoldingsFlat, accounts: [] },
            transactions: { investment_transactions: [], securities: [] },
            walletSource: {
                address:      walletAddress,
                chainId:      activeChainId,
                isMultichain: true,
            },
            cryptoSummary,
            multichainData: multichainResult,
        };
    }

    function buildSingleChainPortfolioData(result, chainId) {
        const { holdings, chainName, totalUsd, nativeSymbol, address } = result;

        const native = holdings.find(h => h.isNative);
        const tokens = holdings.filter(h => !h.isNative);

        const STABLE_SYMBOLS = new Set(['USDT','USDC','DAI','BUSD','TUSD','FRAX','LUSD','USDD','GUSD']);
        const stablecoinExposureUsd = tokens
            .filter(t => STABLE_SYMBOLS.has((t.security?.ticker_symbol || '').toUpperCase()))
            .reduce((s, t) => s + (t.usdValue || 0), 0);

        const topHoldings = [...holdings]
            .sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
            .slice(0, 5)
            .map(h => ({
                symbol:   h.security?.ticker_symbol,
                name:     h.security?.name,
                chain:    chainName,
                valueUsd: h.usdValue,
                pct: totalUsd > 0 ? ((h.usdValue / totalUsd) * 100).toFixed(1) : '0',
            }));

        const cryptoSummary = {
            totalValueUsd:       totalUsd,
            chain:               chainName,
            chainId,
            walletAddress:       address,
            nativeSymbol,
            nativeHolding:       native ? {
                symbol:   native.security?.ticker_symbol,
                quantity: native.quantity,
                valueUsd: native.usdValue,
            } : null,
            tokenCount:          tokens.length,
            stablecoinExposureUsd,
            topHoldings,
            chainConcentration:  { [chainName]: totalUsd },
            isMultichain:        false,
        };

        return {
            holdings:     { holdings, accounts: [] },
            transactions: { investment_transactions: [], securities: [] },
            walletSource: { address, chainId, chainName, nativeSymbol },
            cryptoSummary,
        };
    }

    // -------------------------------------------------------------------------
    // Multichain UI renderer
    // -------------------------------------------------------------------------

    function formatUsd(value) {
        if (!value && value !== 0) return '—';
        return '$' + value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    /**
     * Render a single token holding card.
     * Clearly distinguishes:
     *   - high-confidence priced tokens (green value, no badge)
     *   - fallback-priced tokens (amber "Fallback price" badge)
     *   - unpriced tokens (grey "Unpriced" badge, qty only)
     */
    function renderTokenCard(h, totalPortfolioValueUsd = 0) {
        const symbol   = h.symbol || h.security?.ticker_symbol || '?';
        const name     = h.name   || h.security?.name          || 'Unknown';
        const qty      = h.formattedBalance ?? h.quantity ?? 0;
        const quantity = typeof qty === 'number'
            ? qty.toLocaleString(undefined, { maximumFractionDigits: 6 })
            : String(qty);

        const priceUsd = h.priceUsd ?? h.institution_price ?? 0;
        const valueUsd = h.valueUsd ?? (typeof qty === 'number' ? qty * priceUsd : 0);
        const isPriced = h.isPriced ?? (valueUsd > 0);
        const logoUrl  = h.logoUrl  || h.security?.logo_url || null;
        const isNative = h.isNative;
        const pSource  = h.pricingSource || null;
        const pMeta    = h.pricingMeta   || null;

        // Determine whether this is a notably large holding (>20% of portfolio)
        const isLargeHolding = isPriced && totalPortfolioValueUsd > 0 && (valueUsd / totalPortfolioValueUsd) > 0.2;
        // Unpriced assets are slightly de-emphasised
        const opacityStyle = !isPriced ? 'opacity:0.75;' : '';

        const logoHtml = logoUrl
            ? `<img src="${logoUrl}" alt="${symbol}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.style.display='none'">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:rgba(212,175,55,0.12);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#D4AF37;">${symbol.slice(0,2)}</div>`;

        const nativeBadge = isNative
            ? `<span style="font-size:0.6rem;padding:1px 6px;border-radius:10px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);color:#D4AF37;margin-left:6px;">NATIVE</span>`
            : '';

        let pricingBadge = '';
        if (!isPriced) {
            pricingBadge = `<span style="font-size:0.6rem;padding:2px 8px;border-radius:10px;background:rgba(100,116,139,0.1);border:1px solid rgba(100,116,139,0.3);color:#94a3b8;margin-left:8px;">Unpriced Asset</span>`;
        } else if (pSource === 'dexscreener_fallback') {
            pricingBadge = `<span style="font-size:0.6rem;padding:1px 6px;border-radius:10px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);color:#fbbf24;margin-left:6px;">Fallback price</span>`;
        }

        let subtitle = name;
        if (!isPriced) {
            subtitle = `<span style="color:#64748b;font-style:italic;">No reliable market liquidity</span>`;
        } else if (pSource === 'dexscreener_fallback' && pMeta?.liquidityUsd) {
            const liq = pMeta.liquidityUsd >= 1000
                ? '$' + (pMeta.liquidityUsd / 1000).toFixed(1) + 'K'
                : '$' + Math.round(pMeta.liquidityUsd);
            const dex = pMeta.dexId ? ` · ${pMeta.dexId}` : '';
            subtitle = `${name} <span style="color:#64748b;font-size:0.68rem;">· liq ${liq}${dex}</span>`;
        }

        let weightStr = '';
        if (isPriced && totalPortfolioValueUsd > 0) {
            const pct = ((valueUsd / totalPortfolioValueUsd) * 100).toFixed(1);
            weightStr = `<span style="font-size:0.8rem; color:#D4AF37; font-weight:700; margin-left:12px;">${pct}%</span>`;
        } else if (!isPriced) {
            weightStr = '';
        }

        let valueStr, priceDescription, valueColor;
        if (isPriced) {
             valueStr  = formatUsd(valueUsd);
             priceDescription = `${quantity} × ${formatUsd(priceUsd)}`;
             valueColor = pSource === 'dexscreener_fallback' ? '#fbbf24' : '#fff';
        } else {
             valueStr  = `<span style="font-size:0.85rem;color:#475569;font-style:italic;font-weight:500;">Unpriced</span>`;
             priceDescription  = `<span style="color:#e2e8f0;font-weight:600;">qty only: ${quantity}</span>`;
             valueColor = '#64748b';
        }

        return `
            <div class="holding-card ${isLargeHolding ? 'premium-glow' : ''}" style="padding:16px;display:flex;flex-direction:column;gap:12px; height:100%; ${opacityStyle}">
                <!-- Top Row -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${logoHtml}
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <span style="font-weight:700;color:${isPriced ? '#fff' : '#94a3b8'};font-size:1.1rem;">${symbol}</span>
                            ${nativeBadge}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:1.15rem;font-weight:700;color:${valueColor};">${valueStr}</span>
                        ${weightStr}
                    </div>
                </div>
                
                <!-- Second Row: Token Name -->
                <div style="font-size:0.95rem;color:#f4f4f5;font-weight:500;">
                    ${name}
                </div>
                
                <!-- Third Row: Qty x Price -->
                <div style="font-size:0.85rem;color:#94a3b8;">
                    ${priceDescription}
                </div>
                
                <!-- Fourth Row: Status/Metadata -->
                <div style="font-size:0.8rem;color:#64748b;margin-top:auto;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05);">
                    ${pricingBadge ? pricingBadge + ' • ' : ''}${subtitle}
                </div>
            </div>
        `;
    }

    /**
     * Render chain-grouped multichain holdings into #holdings-container.
     */
    function renderMultichainHoldings(multichainResult) {
        const container   = document.getElementById('holdings-container');
        const section     = document.getElementById('holdings-section');
        const dataSection = document.getElementById('portfolio-data-section');
        if (!container) return; // section is optional in the new layout

        const {
            chainGroupedHoldings,
            chainTotals,
            totalPortfolioValueUsd,
            failedChains,
            activeChains,
            scannedChains,
            pricedHoldingsCount,
            unpricedHoldingsCount,
            fallbackPricedCount,
        } = multichainResult;

        if (dataSection) dataSection.classList.remove('hidden');
        if (section) section.classList.remove('hidden');

        let html = '';

        // ── Partial-failure banner ───────────────────────────────────────────
        if (failedChains && failedChains.length > 0) {
            const failNames = failedChains.map(c => c.chainName).join(', ');
            html += `
                <div style="
                    background:rgba(251,191,36,0.03); 
                    border:1px solid rgba(251,191,36,0.15);
                    border-radius:8px;
                    padding:10px 12px;
                    font-size:0.78rem;
                    color:#eab308;
                    margin-bottom:14px;
                    display:flex;
                    align-items:flex-start;
                    gap:8px;
                ">
                    <span style="flex-shrink:0;font-size:0.9rem;">⚠️</span>
                    <span><strong style="font-weight:600;">Partial Scan:</strong> Data from ${failNames} may be missing. Showing available assets.</span>
                </div>
            `;
        }

        // ── Multichain summary strip ─────────────────────────────────────────
        const totalStr = totalPortfolioValueUsd > 0
            ? formatUsd(totalPortfolioValueUsd)
            : '<span style="font-size:1rem;color:#64748b;">$0.00</span>';

        let pricingNote = '';
        const fallbackCount = fallbackPricedCount || 0;
        if (unpricedHoldingsCount > 0 && pricedHoldingsCount > 0) {
            let note = `Total based on <strong style="color:#94a3b8">${pricedHoldingsCount} priced asset${pricedHoldingsCount === 1 ? '' : 's'}</strong> only · <strong style="color:#64748b">${unpricedHoldingsCount} unpriced</strong> excluded`;
            if (fallbackCount > 0) {
                note += ` · <span style="color:#fbbf24">${fallbackCount} via fallback source${fallbackCount === 1 ? '' : 's'}</span>`;
            }
            pricingNote = `<div style="font-size:0.72rem;color:#475569;margin-top:4px;">${note}</div>`;
        } else if (unpricedHoldingsCount > 0 && pricedHoldingsCount === 0) {
            pricingNote = `<div style="font-size:0.72rem;color:#475569;margin-top:4px;">All ${unpricedHoldingsCount} assets are currently unpriced — awaiting price data</div>`;
        } else if (fallbackCount > 0) {
            pricingNote = `<div style="font-size:0.72rem;color:#475569;margin-top:4px;"><span style="color:#fbbf24">${fallbackCount} asset${fallbackCount === 1 ? '' : 's'} priced via fallback sources</span></div>`;
        }

        html += `
            <div style="
                background:rgba(212,175,55,0.04);
                border:1px solid rgba(212,175,55,0.15);
                border-radius:10px;
                padding:14px 18px;
                margin-bottom:20px;
                display:flex;
                align-items:center;
                justify-content:space-between;
                flex-wrap:wrap;
                gap:12px;
            ">
                <div>
                    <div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Total Multichain Portfolio</div>
                    <div style="font-size:1.5rem;font-weight:700;color:#D4AF37;">${totalStr}</div>
                    ${pricingNote}
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Active Chains</div>
                    <div style="font-size:1.1rem;font-weight:600;color:#94a3b8;">${activeChains} <span style="font-size:0.75rem;color:#64748b;">of ${scannedChains} scanned</span></div>
                </div>
            </div>
        `;

        // ── Render largest holding card ──────────────────────────────────────
        const largestCardContainer = document.getElementById('largest-position-card');
        if (largestCardContainer && multichainResult.allHoldingsFlat) {
            let maxVal = 0;
            let largestHolding = null;
            multichainResult.allHoldingsFlat.forEach(h => {
                const val = h.valueUsd ?? (h.quantity * (h.institution_price || h.priceUsd || h.usdValue || 0)) ?? 0;
                if (val > maxVal) { maxVal = val; largestHolding = h; }
            });
            if (largestHolding && totalPortfolioValueUsd > 0) {
                 const pct = ((maxVal / totalPortfolioValueUsd) * 100).toFixed(1);
                 largestCardContainer.innerHTML = `
                     <div class="card" style="padding: var(--space-4); background: linear-gradient(145deg, rgba(212,175,55,0.1) 0%, rgba(212,175,55,0.02) 100%); border: 1px solid rgba(212,175,55,0.2); position:relative; overflow:hidden;">
                         <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:#D4AF37; box-shadow: 0 0 10px #D4AF37;"></div>
                         <div style="display:flex; justify-content:space-between; align-items:center;">
                             <div>
                                 <div style="font-size:0.7rem; color:#D4AF37; text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-bottom:4px;">Largest Position</div>
                                 <div style="font-size:1.2rem; font-weight:700; color:#fff;">${largestHolding.symbol || largestHolding.security?.ticker_symbol || 'Unknown'}</div>
                             </div>
                             <div style="text-align:right;">
                                 <div style="font-size:1.1rem; font-weight:700; color:#a3e635;">${formatUsd(maxVal)}</div>
                                 <div style="font-size:0.8rem; color:#94a3b8;">${pct}% of portfolio</div>
                             </div>
                         </div>
                     </div>
                 `;
            } else {
                 largestCardContainer.innerHTML = '';
            }
        }

        // ── Per-chain sections ───────────────────────────────────────────────
        const chainNames = Object.keys(chainGroupedHoldings);

        if (chainNames.length === 0) {
            html += `
                <div style="
                    background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);
                    border-radius:10px;padding:16px 18px;font-size:0.85rem;color:#c4b5fd;
                ">
                    🔍 No token holdings found across all scanned chains for this address.
                    The wallet may be empty or hold only tokens without on-chain metadata.
                </div>
            `;
        }

        for (const chainName of chainNames) {
            const holdings   = chainGroupedHoldings[chainName];
            const chainTotal = chainTotals[chainName] || 0;
            const chainIcon  = getChainIcon(chainName);
            const pct = totalPortfolioValueUsd > 0
                ? ((chainTotal / totalPortfolioValueUsd) * 100).toFixed(1)
                : '0';

            const chainPriced   = holdings.filter(h => h.isPriced).length;
            const chainUnpriced = holdings.length - chainPriced;
            const chainSubNote  = chainUnpriced > 0
                ? `<span style="font-size:0.62rem;color:#475569;margin-left:8px;">${chainUnpriced} unpriced</span>`
                : '';

            html += `
                <div style="margin-bottom:24px;">
                    <!-- Chain section header -->
                    <div style="
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                        padding:10px 14px;
                        background:rgba(255,255,255,0.03);
                        border:1px solid rgba(255,255,255,0.07);
                        border-radius:10px 10px 0 0;
                        margin-bottom:6px;
                    ">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <span style="font-size:1.1rem;">${chainIcon}</span>
                            <span style="font-weight:600;color:#fff;font-size:0.95rem;">${chainName}</span>
                            <span style="
                                font-size:0.65rem;font-weight:600;
                                padding:2px 8px;border-radius:20px;
                                border:1px solid rgba(212,175,55,0.25);
                                color:#D4AF37;background:rgba(212,175,55,0.07);
                            ">${holdings.length} asset${holdings.length === 1 ? '' : 's'}</span>
                            ${chainSubNote}
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.95rem;font-weight:700;color:${chainTotal > 0 ? '#a3e635' : '#64748b'};">${chainTotal > 0 ? formatUsd(chainTotal) : '—'}</div>
                            ${chainTotal > 0 && totalPortfolioValueUsd > 0
                                ? `<div style="font-size:0.7rem;color:#64748b;">${pct}% of portfolio</div>`
                                : ''}
                        </div>
                    </div>
                    <!-- Token cards for this chain -->
                    <div class="holdings-grid-layout" style="margin-top: 16px;">
                        ${holdings.map(h => renderTokenCard(h, totalPortfolioValueUsd)).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Render Portfolio Chain Exposure
        if (window.PortfolioChainExposure) {
            window.PortfolioChainExposure.render('portfolio-chain-exposure-container', {
                chainTotals,
                totalPortfolioValueUsd
            });
        }
    }

    // -------------------------------------------------------------------------
    // Main entry point
    // -------------------------------------------------------------------------

    async function fetchAndRender(address, chainId, opts) {
        if (!address) {
            console.warn('[WalletTokenIngestion] No address provided.');
            return;
        }

        const noCache    = opts?.noCache || false;
        const chainLabel = (window.ProsperPathProviders?.getChainMeta?.(chainId)?.name) || `Chain ${chainId}`;

        console.info(`\n[WalletTokenIngestion] ═══ fetchAndRender START ═══`);
        console.info(`[WalletTokenIngestion] Address: ${address}`);
        console.info(`[WalletTokenIngestion] Active chain: ${chainLabel} (${chainId})`);
        console.info(`[WalletTokenIngestion] noCache: ${noCache}`);
        console.info(`[WalletTokenIngestion] Strategy: MULTICHAIN (all supported EVM chains)`);

        setHoldingsLoading(true, 'Scanning all supported chains…');
        hideStaleNote();

        // Mark as syncing in the portfolio store
        const portfolioStoreId = 'wallet:' + address.toLowerCase();
        if (window.PortfolioStore) {
            window.PortfolioStore.updatePortfolio(portfolioStoreId, { syncStatus: 'syncing' });
        }

        // ── PRIMARY: Multichain aggregation ───────────────────────────────────
        try {
            console.info('[WalletTokenIngestion] Calling /api/wallet-tokens-multichain…');
            const result = await fetchMultichainTokens(address, noCache);

            console.info('[WalletTokenIngestion] Multichain scan complete:', {
                activeChains:         result.activeChains,
                totalAssets:          result.allHoldingsFlat?.length,
                totalUsd:             result.totalPortfolioValueUsd,
                pricedHoldingsCount:  result.pricedHoldingsCount,
                unpricedHoldingsCount: result.unpricedHoldingsCount,
                failedChains:         result.failedChains?.length,
            });

            // Build portfolio data for the AI system
            const portfolioData = buildMultichainPortfolioData(result, chainId);
            window.portfolioData = portfolioData;

            // Render chain-grouped holdings
            renderMultichainHoldings(result);

            // Render the analysis section (pie chart + allocation breakdown)
            renderMultichainAnalysis(result);

            // Populate the summary bar
            updateMultichainSummaryBar(result);

            // Update wallet panel elements
            updateWalletTotalUSD(result.totalPortfolioValueUsd, result.activeChains);
            updateChainCountBadge(result.activeChains, result.scannedChains);

            const dataSection = document.getElementById('dashboard-section');
            if (dataSection) dataSection.classList.remove('hidden');

            console.info(
                `[WalletTokenIngestion] Rendered multichain portfolio: ` +
                `${result.allHoldingsFlat?.length} assets across ${result.activeChains} chain(s), ` +
                `priced=${result.pricedHoldingsCount} unpriced=${result.unpricedHoldingsCount}, ` +
                `total $${result.totalPortfolioValueUsd?.toFixed(2)} USD`
            );
            console.info('[WalletTokenIngestion] ═══ fetchAndRender DONE (multichain) ═══\n');

            // Normalize and register in Portfolio Hub store
            if (window.PortfolioStore) {
                window.PortfolioStore.addPortfolio(
                    normalizeWalletPortfolio(result, address, chainId, portfolioData)
                );
            }
            return;

        } catch (multichainErr) {
            console.warn('[WalletTokenIngestion] Multichain endpoint failed:', multichainErr.message);
            console.info('[WalletTokenIngestion] Falling back to single-chain for chainId:', chainId);
            // Keep syncStatus as 'syncing' during fallback attempt
        }

        // ── FALLBACK: Single-chain (original endpoint) ────────────────────────
        try {
            setHoldingsLoading(true, `Fetching tokens on ${chainLabel} (fallback)…`);

            const result = await fetchSingleChainTokens(address, chainId, noCache);

            if (result.unsupported) {
                setHoldingsMessage('warning',
                    `🔗 <strong>${result.chainName || 'This network'}</strong> is not yet supported for ` +
                    `automatic token ingestion. Your wallet is connected and the native balance is visible ` +
                    `above. Token portfolio breakdown will be available once support for this chain is added.`
                );
                console.info('[WalletTokenIngestion] Unsupported chain:', result.chainId);
                return;
            }

            const { holdings, chainName, totalUsd, nativeSymbol } = result;

            if (!holdings || holdings.length === 0) {
                setHoldingsMessage('info',
                    `🔍 No token holdings found on <strong>${chainName}</strong> for this address.`
                );
                updateWalletTotalUSD(0, 0);
                window.portfolioData = buildSingleChainPortfolioData(
                    { holdings: [], chainName, totalUsd: 0, nativeSymbol: nativeSymbol || 'ETH', address },
                    chainId
                );
                return;
            }

            const portfolioData = buildSingleChainPortfolioData(result, chainId);
            window.portfolioData = portfolioData;

            // Use the chain-grouped multichain renderer for single-chain too
            // by wrapping into a minimal multichain-like object
            const fakeMultichain = {
                chainGroupedHoldings:  { [chainName]: holdings },
                chainTotals:           { [chainName]: totalUsd },
                totalPortfolioValueUsd: totalUsd,
                failedChains:          [],
                activeChains:          1,
                scannedChains:         1,
                pricedHoldingsCount:   holdings.filter(h => (h.usdValue || 0) > 0).length,
                unpricedHoldingsCount: holdings.filter(h => !(h.usdValue > 0)).length,
                unpricedSymbols:       holdings.filter(h => !(h.usdValue > 0)).map(h => h.security?.ticker_symbol).filter(Boolean),
                allHoldingsFlat:       holdings,
            };

            renderMultichainHoldings(fakeMultichain);
            renderMultichainAnalysis(fakeMultichain);
            updateMultichainSummaryBar(fakeMultichain);
            updateWalletTotalUSD(totalUsd, 1);

            const dataSection = document.getElementById('dashboard-section');
            if (dataSection) dataSection.classList.remove('hidden');

            console.info(
                `[WalletTokenIngestion] Fallback rendered ${holdings.length} assets on ${chainName}. ` +
                `Total: $${portfolioData.cryptoSummary.totalValueUsd.toFixed(2)}`
            );
            console.info('[WalletTokenIngestion] ═══ fetchAndRender DONE (single-chain fallback) ═══\n');

            // Normalize and register in Portfolio Hub store (single-chain fallback)
            if (window.PortfolioStore) {
                window.PortfolioStore.addPortfolio(
                    normalizeWalletPortfolio(fakeMultichain, address, chainId, portfolioData)
                );
            }

        } catch (fallbackErr) {
            console.error('[WalletTokenIngestion] Both multichain and fallback failed:', fallbackErr);
            setHoldingsMessage('error',
                `⚠️ Could not fetch token balances: <strong>${fallbackErr.message}</strong>. ` +
                `Your wallet is connected and the native balance is shown above. ` +
                `Try clicking 🔄 Refresh Data to retry, or check your internet connection.`
            );
            // Mark store entry as error
            if (window.PortfolioStore) {
                window.PortfolioStore.updatePortfolio(portfolioStoreId, { syncStatus: 'error', lastUpdatedAt: new Date().toISOString() });
            }
        }
    }

    // -------------------------------------------------------------------------
    // Portfolio Store normalization
    // -------------------------------------------------------------------------

    function normalizeWalletPortfolio(multichainResult, address, chainId, portfolioDataObj) {
        const PS = window.PortfolioStore;
        const id = 'wallet:' + address.toLowerCase();
        const holdings = multichainResult.allHoldingsFlat || [];
        const providerLabel = window.ProsperPathProviders?.ConnectionStateManager?.getProviderData?.(
            window.ProsperPathProviders?.ConnectionStateManager?.getActiveProvider?.()
        )?.providerLabel || 'Crypto Wallet';
        const chainCount = multichainResult.activeChains || 0;
        return {
            id,
            sourceType:          PS?.PORTFOLIO_TYPES?.WALLET || 'wallet',
            providerName:        providerLabel,
            displayName:         address.slice(0, 6) + '…' + address.slice(-4) + ' Wallet',
            accountLabel:        chainCount > 1 ? `${chainCount} chains` : (window.ProsperPathProviders?.getChainMeta?.(chainId)?.name || 'Multi-chain'),
            totalValueUsd:       multichainResult.totalPortfolioValueUsd || 0,
            pnlValue:            null,
            pnlPercent:          null,
            pricedAssetsCount:   multichainResult.pricedHoldingsCount || 0,
            unpricedAssetsCount: multichainResult.unpricedHoldingsCount || 0,
            totalAssetsCount:    holdings.length,
            totalChainsCount:    chainCount,
            syncStatus:          'synced',
            lastUpdatedAt:       new Date().toISOString(),
            holdings,
            metadata:            portfolioDataObj || window.portfolioData || null,
            portfolioHash:       PS?.computePortfolioHash(holdings) || 'unknown',
        };
    }

    // -------------------------------------------------------------------------
    // Render-from-cache (for hub detail view — no new network request)
    // -------------------------------------------------------------------------

    function renderFromCachedResult(multichainResult) {
        if (!multichainResult) return;
        renderMultichainHoldings(multichainResult);
        renderMultichainAnalysis(multichainResult);
        updateMultichainSummaryBar(multichainResult);
        updateWalletTotalUSD(multichainResult.totalPortfolioValueUsd, multichainResult.activeChains);
        updateChainCountBadge(multichainResult.activeChains, multichainResult.scannedChains);
        const ds = document.getElementById('dashboard-section');
        if (ds) ds.classList.remove('hidden');
    }

    // -------------------------------------------------------------------------
    // Expose public interface
    // -------------------------------------------------------------------------

    window.WalletTokenIngestion = { fetchAndRender, renderFromCachedResult };

})();
