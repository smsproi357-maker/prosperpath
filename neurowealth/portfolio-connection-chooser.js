/**
 * portfolio-connection-chooser.js
 *
 * ProsperPath Connection Chooser — modal controller.
 *
 * Rules:
 * - No browser alert() anywhere in this file.
 * - Errors render inline inside the chooser modal.
 * - Plaid, MetaMask, WalletConnect, and Trust Wallet all have separate
 *   post-connection UI paths.
 * - This file does not touch any section of the page outside its own modal
 *   and the wallet-specific connected state panel it manages.
 * - The native token symbol is NEVER hardcoded to ETH here. It always comes
 *   from CHAIN_METADATA via window.ProsperPathProviders.getChainMeta().
 */

'use strict';

(function () {
    // Guard: providers module must be loaded first
    if (!window.ProsperPathProviders) {
        console.error('[Chooser] portfolio-connection-providers.js must load before this file.');
        return;
    }

    const { PROVIDERS, ConnectionStateManager, updateWalletConnectAvailability, getChainMeta } =
        window.ProsperPathProviders;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    const CHOOSER_ID = 'pp-connection-chooser';
    const ERROR_ID   = 'pp-chooser-error';
    const SPINNER_ID = 'pp-chooser-spinner';

    // -------------------------------------------------------------------------
    // Styles (scoped — injected once into <head>)
    // -------------------------------------------------------------------------

    function injectStyles() {
        if (document.getElementById('pp-chooser-styles')) return;
        const style = document.createElement('style');
        style.id = 'pp-chooser-styles';
        style.textContent = `
/* ── Chooser Modal Overlay ───────────────────────────────────────────────── */
#${CHOOSER_ID} {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 9000;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(8, 14, 26, 0.82);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: pp-fade-in 0.18s ease;
}
#${CHOOSER_ID}.pp-open {
    display: flex;
}
@keyframes pp-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}

/* ── Modal Shell ─────────────────────────────────────────────────────────── */
.pp-chooser-modal {
    background: var(--color-bg-elevated, #0f1a2b);
    border: 1px solid var(--color-border, rgba(255,255,255,0.08));
    border-radius: var(--radius-md, 12px);
    padding: 36px 32px 32px;
    width: 100%;
    max-width: 500px;
    position: relative;
    animation: pp-slide-up 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
}
@keyframes pp-slide-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Close button ────────────────────────────────────────────────────────── */
.pp-chooser-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    color: var(--color-text-secondary, #94a3b8);
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    line-height: 1;
    transition: color 0.15s ease, background 0.15s ease;
}
.pp-chooser-close:hover {
    color: #fff;
    background: rgba(255,255,255,0.06);
}

/* ── Heading ─────────────────────────────────────────────────────────────── */
.pp-chooser-heading {
    font-size: 1.35rem;
    font-weight: 600;
    color: #fff;
    margin: 0 0 6px;
    line-height: 1.3;
    font-family: var(--font-heading, 'Outfit', sans-serif);
}
.pp-chooser-subtext {
    font-size: 0.875rem;
    color: var(--color-text-secondary, #94a3b8);
    margin: 0 0 28px;
    line-height: 1.5;
}

/* ── Provider group label ────────────────────────────────────────────────── */
.pp-group-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-gold, #D4AF37);
    margin: 0 0 10px;
}

/* ── Provider button grid ────────────────────────────────────────────────── */
.pp-provider-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
}

.pp-provider-btn {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--color-border, rgba(255,255,255,0.08));
    border-radius: 10px;
    padding: 14px 16px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;
    font-family: inherit;
    color: inherit;
}
.pp-provider-btn:hover:not(:disabled) {
    border-color: rgba(212, 175, 55, 0.35);
    background: rgba(255,255,255,0.055);
    transform: translateY(-1px);
}
.pp-provider-btn:active:not(:disabled) {
    transform: translateY(0);
}
.pp-provider-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.pp-provider-icon {
    font-size: 22px;
    flex-shrink: 0;
    line-height: 1;
    width: 32px;
    text-align: center;
}
.pp-provider-meta {
    flex: 1;
    min-width: 0;
}
.pp-provider-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 2px;
}
.pp-provider-desc {
    font-size: 0.78rem;
    color: var(--color-text-secondary, #94a3b8);
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.pp-provider-tag {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    padding: 3px 8px;
    border-radius: 20px;
    border: 1px solid;
    flex-shrink: 0;
}
.pp-tag-available {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
    background: rgba(74, 222, 128, 0.07);
}
.pp-tag-unavailable {
    color: var(--color-text-secondary, #94a3b8);
    border-color: rgba(148, 163, 184, 0.2);
    background: transparent;
}

/* ── Error message ───────────────────────────────────────────────────────── */
#${ERROR_ID} {
    display: none;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 0.83rem;
    color: #fca5a5;
    line-height: 1.5;
    margin-bottom: 16px;
}
#${ERROR_ID}.pp-visible {
    display: block;
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
#${SPINNER_ID} {
    display: none;
    justify-content: center;
    align-items: center;
    gap: 10px;
    padding: 8px 0 4px;
    font-size: 0.83rem;
    color: var(--color-text-secondary, #94a3b8);
}
#${SPINNER_ID}.pp-visible {
    display: flex;
}
.pp-spin {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(212,175,55,0.2);
    border-top-color: var(--color-gold, #D4AF37);
    border-radius: 50%;
    animation: pp-spin 0.7s linear infinite;
}
@keyframes pp-spin {
    to { transform: rotate(360deg); }
}

/* ── Divider ─────────────────────────────────────────────────────────────── */
.pp-chooser-divider {
    height: 1px;
    background: var(--color-border, rgba(255,255,255,0.08));
    margin: 16px 0;
}

/* ── Footer note ─────────────────────────────────────────────────────────── */
.pp-chooser-footer {
    font-size: 0.73rem;
    color: var(--color-text-secondary, #64748b);
    text-align: center;
    margin-top: 4px;
    line-height: 1.5;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 540px) {
    .pp-chooser-modal {
        padding: 28px 18px 24px;
    }
    .pp-provider-desc {
        white-space: normal;
    }
}
        `;
        document.head.appendChild(style);
    }


    // -------------------------------------------------------------------------
    // Modal DOM builder
    // -------------------------------------------------------------------------

    function buildModal() {
        const traditional = PROVIDERS.filter(p => p.group === 'traditional');
        const crypto      = PROVIDERS.filter(p => p.group === 'crypto');

        function renderGroup(providers) {
            return providers.map(p => {
                const tagClass   = p.available ? 'pp-tag-available' : 'pp-tag-unavailable';
                const tagLabel   = p.available ? 'Available' : 'Not detected';
                const showTag    = p.group === 'crypto';
                const tagHtml    = showTag
                    ? `<span class="pp-provider-tag ${tagClass}">${tagLabel}</span>`
                    : '';

                return `
                <button
                    class="pp-provider-btn"
                    data-provider-id="${p.id}"
                    aria-label="Connect with ${p.label}"
                >
                    <span class="pp-provider-icon">${p.icon}</span>
                    <span class="pp-provider-meta">
                        <span class="pp-provider-name">${p.label}</span>
                        <span class="pp-provider-desc">${p.description}</span>
                    </span>
                    ${tagHtml}
                </button>`;
            }).join('');
        }

        const el = document.createElement('div');
        el.id = CHOOSER_ID;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'pp-chooser-title');

        el.innerHTML = `
            <div class="pp-chooser-modal">
                <button class="pp-chooser-close" id="pp-chooser-close-btn" aria-label="Close">✕</button>

                <h2 class="pp-chooser-heading" id="pp-chooser-title">Choose Connection Method</h2>
                <p class="pp-chooser-subtext">
                    Connect a brokerage account or link a crypto wallet to unlock
                    portfolio analysis and wealth insights.
                </p>

                <!-- Inline error display -->
                <div id="${ERROR_ID}" role="alert"></div>

                <!-- Spinner -->
                <div id="${SPINNER_ID}">
                    <div class="pp-spin"></div>
                    <span>Connecting…</span>
                </div>

                <!-- Traditional Accounts -->
                <p class="pp-group-label">Traditional Accounts</p>
                <div class="pp-provider-list" id="pp-group-traditional">
                    ${renderGroup(traditional)}
                </div>

                <div class="pp-chooser-divider"></div>

                <!-- Crypto Wallets -->
                <p class="pp-group-label">Crypto Wallets</p>
                <div class="pp-provider-list" id="pp-group-crypto">
                    ${renderGroup(crypto)}
                </div>

                <p class="pp-chooser-footer">
                    🔒 Read-only access &nbsp;·&nbsp; No transactions sent &nbsp;·&nbsp; More providers coming soon
                </p>
            </div>
        `;

        return el;
    }

    // -------------------------------------------------------------------------
    // Wallet connected state helpers
    // -------------------------------------------------------------------------

    /**
     * Transition the Portfolio page into the connected state for a wallet provider.
     * Updates #connected-state with real provider metadata and makes it visible,
     * hiding the disconnected CTA.
     *
     * Native symbol is derived from CHAIN_METADATA — never hardcoded.
     *
     * @param {string} providerId
     */
    function handleWalletConnectionSuccess(providerId) {
        const data = ConnectionStateManager.getProviderData(providerId);
        if (!data) {
            console.error('[Chooser] No state data for provider:', providerId);
            return;
        }

        const provider = PROVIDERS.find(p => p.id === providerId);
        const chainMeta = getChainMeta(data.chainId);

        // ── 1. Update heading / icon in #connected-state ───────────────────
        const iconEl     = document.getElementById('connected-icon');
        const headingEl  = document.getElementById('connected-heading');
        const subtextEl  = document.getElementById('connected-subtext');

        if (iconEl)    iconEl.textContent    = provider?.icon || '🔗';
        if (headingEl) headingEl.textContent = `${data.providerLabel || 'Wallet'} Connected`;
        if (subtextEl) subtextEl.textContent =
            'Your wallet is linked in read-only mode. Address, balance, and chain are shown below.';

        // ── 2. Populate wallet-summary slots ──────────────────────────────
        const walletSummary = document.getElementById('wallet-summary');
        if (walletSummary) {
            const chainBadgeEl  = document.getElementById('wallet-chain-badge');
            const addressEl     = document.getElementById('wallet-address');
            const balanceEl     = document.getElementById('wallet-balance');
            const balanceLblEl  = document.getElementById('wallet-balance-label');

            if (chainBadgeEl)  chainBadgeEl.textContent  = chainMeta.name;
            if (addressEl)     addressEl.textContent      = data.address || '—';

            // Use the pre-formatted string that includes the correct symbol
            // Fall back gracefully if callers still pass the old shape
            if (balanceEl) {
                if (data.balanceFormatted) {
                    balanceEl.textContent = data.balanceFormatted;
                } else if (data.balance != null) {
                    balanceEl.textContent = `${data.balance} ${chainMeta.nativeSymbol}`;
                } else if (data.balanceETH != null) {
                    balanceEl.textContent = `${data.balanceETH} ${chainMeta.nativeSymbol}`;
                } else {
                    balanceEl.textContent = '—';
                }
            }

            // Dynamic native balance label — shows correct symbol
            if (balanceLblEl) {
                balanceLblEl.textContent =
                    `${chainMeta.nativeSymbol} balance · Read-only · No transactions sent`;
            }

            // Hide the stale "not yet available" note — ingestion will update it
            const holdingsNote = document.getElementById('wallet-holdings-note');
            if (holdingsNote) holdingsNote.classList.add('hidden');

            walletSummary.classList.remove('hidden');
        }

        // ── 3. Show Disconnect button ──────────────────────────────────────
        const disconnectBtn = document.getElementById('wallet-disconnect-btn');
        if (disconnectBtn) disconnectBtn.classList.remove('hidden');

        // ── 4. Perform the UI state transition ────────────────────────────
        const disconnectedState = document.getElementById('disconnected-state');
        const connectedState    = document.getElementById('connected-state');

        if (disconnectedState) disconnectedState.classList.add('hidden');
        if (connectedState)    connectedState.classList.remove('hidden');

        // ── 5. Hide marketing sections — show the clean connected dashboard view
        const marketingSection = document.getElementById('marketing-features-section');
        if (marketingSection) marketingSection.classList.add('hidden');

        console.info('[ProsperPath] Wallet connected state shown for provider:', providerId, data);
    }

    /**
     * Revert the page to disconnected state and clean up wallet-specific slots.
     */
    function resetToDisconnectedState() {
        const walletSummary    = document.getElementById('wallet-summary');
        const disconnectBtn    = document.getElementById('wallet-disconnect-btn');
        const headingEl        = document.getElementById('connected-heading');
        const subtextEl        = document.getElementById('connected-subtext');
        const iconEl           = document.getElementById('connected-icon');
        const totalUsdEl       = document.getElementById('wallet-total-usd');
        const holdingsNote     = document.getElementById('wallet-holdings-note');
        const chainCountEl     = document.getElementById('wallet-chain-count');

        if (walletSummary)  walletSummary.classList.add('hidden');
        if (disconnectBtn)  disconnectBtn.classList.add('hidden');
        if (headingEl)      headingEl.textContent  = 'Portfolio Connected';
        if (subtextEl)      subtextEl.textContent  = 'Your institutional data is synced and ready for AI enrichment.';
        if (iconEl)         iconEl.textContent      = '✅';
        if (totalUsdEl)     totalUsdEl.textContent  = '';
        if (chainCountEl) { chainCountEl.textContent = ''; chainCountEl.style.display = 'none'; }
        if (holdingsNote) {
            holdingsNote.classList.remove('hidden');
            holdingsNote.textContent = '🧩 Token portfolio data is not yet available for on-chain wallets.';
        }

        // Hide portfolio data sections (correct element IDs from the refactored HTML)
        const dashboardSection   = document.getElementById('dashboard-section');
        const holdingsSection    = document.getElementById('holdings-section');
        const summaryBar         = document.getElementById('portfolio-summary-bar');
        const marketingSection   = document.getElementById('marketing-features-section');
        if (dashboardSection)  dashboardSection.classList.add('hidden');
        if (holdingsSection)   holdingsSection.classList.add('hidden');
        if (summaryBar)        summaryBar.classList.add('hidden');
        // Restore marketing feature cards
        if (marketingSection)  marketingSection.classList.remove('hidden');

        // Transition back
        const disconnectedState = document.getElementById('disconnected-state');
        const connectedState    = document.getElementById('connected-state');
        if (connectedState)    connectedState.classList.add('hidden');
        if (disconnectedState) disconnectedState.classList.remove('hidden');
    }

    function onWalletDisconnected(providerId) {
        ConnectionStateManager.setDisconnected(providerId);
        resetToDisconnectedState();
    }

    function openChooser() {
        if (!_modalEl) return;
        clearError();
        setSpinner(false);
        setBusy(false);
        _modalEl.classList.add('pp-open');
        const firstBtn = _modalEl.querySelector('.pp-provider-btn');
        if (firstBtn) firstBtn.focus();
    }

    function closeChooser() {
        if (!_modalEl) return;
        _modalEl.classList.remove('pp-open');
        clearError();
        setSpinner(false);
        setBusy(false);
    }

    function showError(message) {
        const el = document.getElementById(ERROR_ID);
        if (!el) return;
        el.textContent = message;
        el.classList.add('pp-visible');
        setSpinner(false);
    }

    function clearError() {
        const el = document.getElementById(ERROR_ID);
        if (!el) return;
        el.textContent = '';
        el.classList.remove('pp-visible');
    }

    function setSpinner(show) {
        const el = document.getElementById(SPINNER_ID);
        if (!el) return;
        el.classList.toggle('pp-visible', show);
    }

    function setBusy(busy) {
        _busy = busy;
        if (!_modalEl) return;
        _modalEl.querySelectorAll('.pp-provider-btn').forEach(btn => {
            btn.disabled = busy;
        });
    }


    // -------------------------------------------------------------------------
    // Provider launch
    // -------------------------------------------------------------------------

    let _modalEl = null;
    let _busy = false;

    async function launchProvider(providerId) {
        if (_busy) return;

        const provider = PROVIDERS.find(p => p.id === providerId);
        if (!provider) {
            showError(`Unknown provider: ${providerId}`);
            return;
        }

        clearError();
        setBusy(true);
        setSpinner(true);

        const context = {
            onError(message) {
                showError(message);
                setBusy(false);
                setSpinner(false);
            },

            onSuccess(message) {
                console.info(`[Chooser] Provider success: ${message}`);
            },

            onComplete() {
                closeChooser();
                setBusy(false);
                setSpinner(false);

                if (providerId !== 'plaid') {
                    // 1. Transition the page to connected state with wallet metadata
                    handleWalletConnectionSuccess(providerId);

                    // 2. Kick off on-chain token ingestion immediately after connect
                    const providerData = ConnectionStateManager.getProviderData(providerId);
                    if (providerData?.address && typeof window.WalletTokenIngestion?.fetchAndRender === 'function') {
                        console.info('[Chooser] Starting token ingestion for', providerData.address, 'chainId', providerData.chainId);
                        window.WalletTokenIngestion.fetchAndRender(providerData.address, providerData.chainId || 1);
                    }
                }
                // Plaid: plaid-client.js manages #connected-state in its onSuccess path
            },
        };

        await provider.launch(context);
    }

    // -------------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------------

    function init() {
        injectStyles();

        _modalEl = buildModal();
        document.body.appendChild(_modalEl);

        // Intercept the existing "Connect Account" button click
        const linkBtn = document.getElementById('link-button');
        if (linkBtn) {
            linkBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openChooser();
            });
        } else {
            console.warn('[Chooser] #link-button not found; chooser will not be triggered.');
        }

        // Provider button clicks
        _modalEl.querySelectorAll('.pp-provider-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.providerId;
                launchProvider(id);
            });
        });

        // Close button
        document.getElementById('pp-chooser-close-btn')?.addEventListener('click', closeChooser);

        // Close on backdrop click
        _modalEl.addEventListener('click', (e) => {
            if (e.target === _modalEl) closeChooser();
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _modalEl.classList.contains('pp-open')) {
                closeChooser();
            }
        });

        // Wallet disconnect button (inside #connected-state in portfolio.html)
        document.getElementById('wallet-disconnect-btn')?.addEventListener('click', () => {
            const activeProvider = ConnectionStateManager.getActiveProvider();
            if (activeProvider && activeProvider !== 'plaid') {
                onWalletDisconnected(activeProvider);
            }
        });

        // ── Refresh Data button ────────────────────────────────────────────
        // For wallet providers: re-triggers token ingestion (bypasses cache).
        // For Plaid: plaid-client.js also listens; its guard ensures it only
        //   fires fetchPortfolioData when Plaid is the active provider.
        document.getElementById('refresh-button')?.addEventListener('click', () => {
            const activeProvider = ConnectionStateManager.getActiveProvider();
            if (activeProvider && activeProvider !== 'plaid') {
                const providerData = ConnectionStateManager.getProviderData(activeProvider);
                if (providerData?.address && typeof window.WalletTokenIngestion?.fetchAndRender === 'function') {
                    console.info('[Chooser] Refresh triggered for wallet provider', activeProvider);
                    // Pass noCache=true to bypass the 5-min server cache on explicit refresh
                    window.WalletTokenIngestion.fetchAndRender(
                        providerData.address,
                        providerData.chainId || 1,
                        { noCache: true }
                    );
                }
            }
            // Plaid refresh is handled by plaid-client.js
        });
    }

    // -------------------------------------------------------------------------
    // WalletConnect CDN load callback
    // -------------------------------------------------------------------------

    function onWalletConnectLoaded() {
        updateWalletConnectAvailability();
        const wcBtn = _modalEl?.querySelector('[data-provider-id="walletconnect"]');
        if (!wcBtn) return;
        const wcProvider = PROVIDERS.find(p => p.id === 'walletconnect');
        const tag = wcBtn.querySelector('.pp-provider-tag');
        if (tag && wcProvider) {
            tag.className = wcProvider.available ? 'pp-provider-tag pp-tag-available' : 'pp-provider-tag pp-tag-unavailable';
            tag.textContent = wcProvider.available ? 'Available' : 'Not detected';
        }
    }

    // -------------------------------------------------------------------------
    // Boot
    // -------------------------------------------------------------------------

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose public interface
    window.portfolioConnectionChooser = {
        openChooser,
        closeChooser,
        onWalletDisconnected,
        onWalletConnectLoaded,
        // triggerIngestion: re-runs multichain scan for the active wallet provider.
        // The active chainId is passed through for badge display but does NOT
        // restrict which chains are scanned — all SUPPORTED_PORTFOLIO_CHAINS are scanned.
        triggerIngestion() {
            const activeProvider = ConnectionStateManager.getActiveProvider();
            if (activeProvider && activeProvider !== 'plaid') {
                const providerData = ConnectionStateManager.getProviderData(activeProvider);
                if (providerData?.address) {
                    window.WalletTokenIngestion?.fetchAndRender(providerData.address, providerData.chainId || 1);
                }
            }
        },
    };

})();
