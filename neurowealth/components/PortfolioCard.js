/**
 * PortfolioCard.js
 *
 * Creates DOM node cards for each connected portfolio.
 * Uses createNode() — not innerHTML strings with inline handlers.
 *
 * Exposed as: window.PortfolioCard
 */
'use strict';

(function () {
    const SOURCE_ICONS = {
        wallet:    `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>
            </svg>`,
        plaid:     `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                <line x1="2" x2="22" y1="10" y2="10"></line>
            </svg>`,
        exchange:  `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21 16-4 4-4-4"></path>
                <path d="M17 20V4"></path>
                <path d="m3 8 4-4 4 4"></path>
                <path d="M7 4v16"></path>
            </svg>`,
        brokerage: `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>`,
        manual:    `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m18 5-3-3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2"></path>
                <path d="M8 18h1"></path>
                <path d="M18.4 9.6a2 2 0 1 1 3 3L17 17l-4 1 1-4Z"></path>
            </svg>`,
    };

    function fmtUsd(v) {
        if (v == null || isNaN(v)) return '—';
        return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtAgo(isoStr) {
        if (!isoStr) return '';
        const mins = Math.floor((Date.now() - Date.parse(isoStr)) / 60000);
        if (mins < 1)  return 'Updated just now';
        if (mins < 60) return `Updated ${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24)  return `Updated ${hrs}h ago`;
        return `Updated ${Math.floor(hrs / 24)}d ago`;
    }

    /**
     * @param {Object}   portfolio  Normalized portfolio object
     * @param {Function} onClick    Called with portfolioId on click/Enter
     * @returns {HTMLElement}
     */
    function createNode(portfolio, onClick) {
        const icon    = SOURCE_ICONS[portfolio.sourceType] || SOURCE_ICONS['wallet'];
        const status  = portfolio.syncStatus || 'synced';
        let pnlPos = false;
        let pnlSign = '';
        let hasPnl = false;
        
        // Ensure accurate pnl display
        if (portfolio.pnlValue != null && portfolio.pnlValue !== 0) {
            hasPnl = true;
            pnlPos = portfolio.pnlValue >= 0;
            pnlSign = pnlPos ? '+' : '-';
        }

        const pricingPct = portfolio.totalAssetsCount > 0
            ? Math.round((portfolio.pricedAssetsCount / portfolio.totalAssetsCount) * 100)
            : 0;

        const card = document.createElement('div');
        card.className = 'ph-portfolio-card';
        card.setAttribute('data-portfolio-id', portfolio.id);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Open ${portfolio.displayName || portfolio.providerName} portfolio`);
        
        // Apply inline premium styles mapping to existing css structure or enriching it
        card.style.cssText = "display: flex; flex-direction: column; padding: 24px; border-radius: 16px; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative; overflow: hidden;";
        
        // Hover effects are managed by css classes mainly, but inline structure guarantees elements
        card.onmouseover = () => {
            card.style.transform = 'translateY(-4px)';
            card.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
            card.style.borderColor = 'rgba(212, 175, 55, 0.4)';
            card.style.boxShadow = '0 12px 24px -10px rgba(0, 0, 0, 0.5), 0 0 20px rgba(212, 175, 55, 0.1)';
        };
        card.onmouseout = () => {
            card.style.transform = 'translateY(0)';
            card.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
            card.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            card.style.boxShadow = 'none';
        };

        const providerSubName = portfolio.accountLabel || portfolio.providerName || '';
        const mainDisplayName = portfolio.displayName || portfolio.providerName || 'Unnamed Portfolio';
        const sourceTypeUpper = (portfolio.sourceType || 'portfolio').toUpperCase();

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: rgba(255, 255, 255, 0.05); color: #D4AF37;">
                        ${icon}
                    </div>
                    <div style="display: flex; flex-direction: column; justify-content: center;">
                        <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 4px;">
                            ${providerSubName}
                        </span>
                        <span style="font-size: 1.1rem; font-weight: 600; color: #fff; line-height: 1.2;">
                            ${mainDisplayName}
                        </span>
                    </div>
                </div>
                <div style="padding: 4px 10px; border-radius: 20px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); color: #D4AF37;">
                    ${sourceTypeUpper}
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <div style="font-size: 2rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; line-height: 1.1;">
                    ${fmtUsd(portfolio.totalValueUsd)}
                </div>
                ${hasPnl ? `
                    <div style="font-size: 0.9rem; font-weight: 500; margin-top: 8px; color: ${pnlPos ? '#4ade80' : '#f87171'};">
                        ${pnlSign}${fmtUsd(Math.abs(portfolio.pnlValue))}
                        ${portfolio.pnlPercent != null ? `<span style="opacity: 0.8; margin-left: 4px; font-weight: 400;">(${pnlSign}${portfolio.pnlPercent.toFixed(1)}%)</span>` : ''}
                    </div>
                ` : ''}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 1px solid rgba(255, 255, 255, 0.08); border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 16px;">
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Assets</span>
                    <span style="font-size: 0.95rem; font-weight: 600; color: #e2e8f0;">${portfolio.totalAssetsCount || 0}</span>
                </div>
                <div style="width: 1px; height: 30px; background: rgba(255, 255, 255, 0.08);"></div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Priced</span>
                    <span style="font-size: 0.95rem; font-weight: 600; color: #e2e8f0;">${pricingPct}%</span>
                </div>
                <div style="width: 1px; height: 30px; background: rgba(255, 255, 255, 0.08);"></div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Chains</span>
                    <span style="font-size: 0.95rem; font-weight: 600; color: #e2e8f0;">${portfolio.totalChainsCount || 0}</span>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${status === 'syncing' ? '#fbbf24' : status === 'error' ? '#f87171' : '#4ade80'}; ${status === 'syncing' ? 'animation: pulse 1.5s infinite;' : ''}"></span>
                    <span style="font-size: 0.75rem; color: #94a3b8;">${status === 'syncing' ? 'Syncing...' : status === 'error' ? 'Sync error' : fmtAgo(portfolio.lastUpdatedAt)}</span>
                </div>
                <span style="font-size: 0.8rem; font-weight: 600; color: #D4AF37; opacity: 0; transform: translateX(-5px); transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 4px;" class="ph-card-cta-hover">
                    View Details
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                </span>
            </div>
            
            <style>
                .ph-portfolio-card:hover .ph-card-cta-hover {
                    opacity: 1 !important;
                    transform: translateX(0) !important;
                }
            </style>
        `;

        function handleActivate(e) {
            e.preventDefault();
            if (typeof onClick === 'function') onClick(portfolio.id);
        }
        card.addEventListener('click', handleActivate);
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') handleActivate(e);
        });

        return card;
    }

    window.PortfolioCard = { createNode };
    console.info('[PortfolioCard] Loaded.');
})();
