/**
 * portfolio-connection-providers.js
 *
 * Provider registry for ProsperPath Portfolio connection.
 *
 * Each provider object describes one connection method and owns its own
 * `launch()` handler.  The chooser UI reads this registry to render options
 * and delegates execution back here.
 *
 * Architecture rules:
 * - No provider assumes a shared "connected" state structure.
 * - Each provider fires its own connection lifecycle callbacks.
 * - No transaction signing or message signing is attempted anywhere in this file.
 * - No browser alert() calls. Errors surface via the chooser's inline UI.
 * - CHAIN_METADATA is the single source of truth for chain names + native symbols.
 */

'use strict';

// ---------------------------------------------------------------------------
// Centralized Chain Metadata
// ---------------------------------------------------------------------------
// This is the SINGLE source of truth for chain-aware display info.
// Add new chains here — providers, the chooser, and the ingestion module will
// all pick them up automatically.

const CHAIN_METADATA = {
    1:        { name: 'Ethereum Mainnet',   nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    5:        { name: 'Goerli Testnet',     nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    11155111: { name: 'Sepolia Testnet',    nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    56:       { name: 'BNB Chain',          nativeSymbol: 'BNB',  geckoId: 'binancecoin'  },
    137:      { name: 'Polygon',            nativeSymbol: 'MATIC', geckoId: 'matic-network'},
    80001:    { name: 'Mumbai',             nativeSymbol: 'MATIC', geckoId: 'matic-network'},
    42161:    { name: 'Arbitrum One',       nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    421614:   { name: 'Arbitrum Sepolia',   nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    8453:     { name: 'Base',               nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    84532:    { name: 'Base Sepolia',       nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    10:       { name: 'Optimism',           nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    11155420: { name: 'Optimism Sepolia',   nativeSymbol: 'ETH',  geckoId: 'ethereum'     },
    43114:    { name: 'Avalanche C-Chain',  nativeSymbol: 'AVAX', geckoId: 'avalanche-2'  },
    43113:    { name: 'Avalanche Fuji',     nativeSymbol: 'AVAX', geckoId: 'avalanche-2'  },
};

/**
 * Returns chain metadata for the given chainId, with a safe generic fallback.
 * @param {number|string} chainId
 * @returns {{ name: string, nativeSymbol: string, geckoId: string }}
 */
function getChainMeta(chainId) {
    const id = parseInt(chainId, 10);
    return CHAIN_METADATA[id] || {
        name: `Chain ${id}`,
        nativeSymbol: 'ETH',
        geckoId: 'ethereum',
    };
}

// ---------------------------------------------------------------------------
// Connection State Manager
// ---------------------------------------------------------------------------

const _connectionState = {
    /** @type {null | 'plaid' | 'metamask' | 'walletconnect' | 'trustwallet'} */
    activeProvider: null,

    /**
     * Per-provider metadata.  Shape is intentionally provider-specific.
     * @type {Object.<string, object>}
     */
    providerData: {},
};

/**
 * Public API for reading/writing connection state.
 * The chooser and UI controllers use this instead of window globals.
 */
const ConnectionStateManager = {
    /**
     * Record a successful provider connection.
     * @param {string} providerId
     * @param {object} meta - Provider-specific metadata (address, item_id, etc.)
     */
    setConnected(providerId, meta) {
        _connectionState.activeProvider = providerId;
        _connectionState.providerData[providerId] = { ...meta, connectedAt: Date.now() };
        console.info(`[ProsperPath] Provider "${providerId}" connected`, meta);
    },

    /**
     * Update specific fields in the stored provider data without a full reconnect.
     * Used for chain-switch and account-switch updates.
     * @param {string} providerId
     * @param {object} patch
     */
    patchProviderData(providerId, patch) {
        if (_connectionState.providerData[providerId]) {
            Object.assign(_connectionState.providerData[providerId], patch);
            console.info(`[ProsperPath] Provider "${providerId}" state patched`, patch);
        }
    },

    /**
     * Mark a provider as disconnected / clear its metadata.
     * @param {string} providerId
     */
    setDisconnected(providerId) {
        if (_connectionState.activeProvider === providerId) {
            _connectionState.activeProvider = null;
        }
        delete _connectionState.providerData[providerId];
        console.info(`[ProsperPath] Provider "${providerId}" disconnected`);
    },

    /** @returns {boolean} */
    isConnected() {
        return _connectionState.activeProvider !== null;
    },

    /** @returns {string|null} */
    getActiveProvider() {
        return _connectionState.activeProvider;
    },

    /**
     * Get stored metadata for a specific provider.
     * @param {string} providerId
     * @returns {object|null}
     */
    getProviderData(providerId) {
        return _connectionState.providerData[providerId] || null;
    },
};

// ---------------------------------------------------------------------------
// Ethereum provider resolution helpers
// ---------------------------------------------------------------------------

/**
 * Return true if the given ethereum provider object belongs to MetaMask.
 * @param {object} provider
 * @returns {boolean}
 */
function isMetaMaskProvider(provider) {
    return !!(
        provider &&
        provider.isMetaMask &&
        !provider.isTrustWallet &&
        !provider.isCoinbaseWallet &&
        !provider.isBraveWallet
    );
}

/**
 * Return true if the given ethereum provider belongs to Trust Wallet.
 * @param {object} provider
 * @returns {boolean}
 */
function isTrustWalletProvider(provider) {
    return !!(provider && (provider.isTrustWallet || provider.isTrust));
}

/**
 * Attempt to resolve a specific provider from the injected providers list
 * (EIP-6963 / window.ethereum.providers array) or fall back to window.ethereum.
 *
 * @param {'metamask'|'trustwallet'} targetId
 * @returns {object|null}
 */
function resolveInjectedProvider(targetId) {
    const providers =
        (window.ethereum && Array.isArray(window.ethereum.providers))
            ? window.ethereum.providers
            : (window.ethereum ? [window.ethereum] : []);

    if (providers.length === 0) return null;

    for (const p of providers) {
        if (targetId === 'metamask' && isMetaMaskProvider(p)) return p;
        if (targetId === 'trustwallet' && isTrustWalletProvider(p)) return p;
    }

    if (providers.length === 1) {
        const single = providers[0];
        if (targetId === 'metamask' && single.isMetaMask) return single;
        if (targetId === 'trustwallet' && (single.isTrustWallet || single.isTrust)) return single;
    }

    return null;
}

// ---------------------------------------------------------------------------
// EVM read-only helpers (no signing, no transactions)
// ---------------------------------------------------------------------------

/**
 * Request account access and return the first account address.
 * Uses eth_requestAccounts (EIP-1102). Read-only.
 * @param {object} provider
 * @returns {Promise<string>}
 */
async function requestEVMAccount(provider) {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned by wallet.');
    }
    return accounts[0];
}

/**
 * Fetch native balance for address. Returns { balance: string, nativeSymbol: string }.
 * The symbol is derived from the chain ID to avoid hardcoding ETH.
 * @param {object} provider
 * @param {string} address
 * @param {number} chainId
 * @returns {Promise<{ balance: string, nativeSymbol: string, balanceFormatted: string }>}
 */
async function fetchEVMBalance(provider, address, chainId) {
    const hexBalance = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
    });
    const wei = BigInt(hexBalance);
    const amount = Number(wei) / 1e18;
    const balance = amount.toFixed(6);
    const { nativeSymbol } = getChainMeta(chainId);
    const balanceFormatted = `${balance} ${nativeSymbol}`;
    return { balance, nativeSymbol, balanceFormatted };
}

/**
 * Fetch the current chain ID.
 * @param {object} provider
 * @returns {Promise<number>}
 */
async function fetchEVMChainId(provider) {
    const hexChainId = await provider.request({ method: 'eth_chainId' });
    return parseInt(hexChainId, 16);
}

// ---------------------------------------------------------------------------
// Wallet event handler helpers
// ---------------------------------------------------------------------------
// These are called by the provider launch functions after successful connect.
// They handle live chain/account switch events so the UI stays in sync.

/**
 * Handle wallet account change event.
 * Updates state, UI, and re-runs token ingestion for the new address.
 * @param {string} providerId
 * @param {object} evmProvider
 * @param {string[]} accounts
 */
async function handleAccountChange(providerId, evmProvider, accounts) {
    if (!accounts || accounts.length === 0) {
        // Wallet disconnected
        console.info(`[ProsperPath] accountsChanged: empty accounts — treating as disconnect`);
        window.portfolioConnectionChooser?.onWalletDisconnected(providerId);
        return;
    }

    const newAddress = accounts[0];
    const currentData = ConnectionStateManager.getProviderData(providerId);
    if (!currentData) return;

    const chainId = currentData.chainId || 1;
    const { balance, nativeSymbol, balanceFormatted } = await fetchEVMBalance(evmProvider, newAddress, chainId);

    ConnectionStateManager.patchProviderData(providerId, {
        address: newAddress,
        balance,
        nativeSymbol,
        balanceFormatted,
        // keep legacy field for any code that references balanceETH
        balanceETH: balance,
    });

    console.info(`[ProsperPath] accountsChanged → ${newAddress} on chain ${chainId}`);

    // Update UI slots
    _patchWalletUI({
        address: newAddress,
        balanceFormatted,
        chainId,
    });

    // Re-ingest token holdings for new account
    if (typeof window.WalletTokenIngestion?.fetchAndRender === 'function') {
        window.WalletTokenIngestion.fetchAndRender(newAddress, chainId);
    }
}

/**
 * Handle wallet chain change event.
 * Updates state, re-fetches native balance, updates UI, and re-runs ingestion.
 * @param {string} providerId
 * @param {object} evmProvider
 * @param {string} hexChainId
 */
async function handleChainChange(providerId, evmProvider, hexChainId) {
    const newChainId = parseInt(hexChainId, 16);
    const currentData = ConnectionStateManager.getProviderData(providerId);
    if (!currentData) return;

    const address = currentData.address;
    const { balance, nativeSymbol, balanceFormatted } = await fetchEVMBalance(evmProvider, address, newChainId);

    ConnectionStateManager.patchProviderData(providerId, {
        chainId: newChainId,
        balance,
        nativeSymbol,
        balanceFormatted,
        balanceETH: balance,
    });

    console.info(`[ProsperPath] chainChanged → chainId=${newChainId} (${getChainMeta(newChainId).name})`);

    _patchWalletUI({
        address,
        balanceFormatted,
        chainId: newChainId,
    });

    // Re-ingest token holdings for new chain
    if (typeof window.WalletTokenIngestion?.fetchAndRender === 'function') {
        window.WalletTokenIngestion.fetchAndRender(address, newChainId);
    }
}

/**
 * Patch the live wallet UI slots without a full state transition.
 * Minimal DOM surgery — only updates what changed.
 * @param {{ address: string, balanceFormatted: string, chainId: number }} opts
 */
function _patchWalletUI({ address, balanceFormatted, chainId }) {
    const { name: chainDisplayName } = getChainMeta(chainId);

    const addressEl   = document.getElementById('wallet-address');
    const balanceEl   = document.getElementById('wallet-balance');
    const chainBadge  = document.getElementById('wallet-chain-badge');
    const balanceLbl  = document.getElementById('wallet-balance-label');

    if (addressEl)  addressEl.textContent  = address || '—';
    if (balanceEl)  balanceEl.textContent  = balanceFormatted || '—';
    if (chainBadge) chainBadge.textContent = chainDisplayName;
    if (balanceLbl) balanceLbl.textContent = `${getChainMeta(chainId).nativeSymbol} balance · Read-only · No transactions sent`;
}

// ---------------------------------------------------------------------------
// Provider Definitions
// ---------------------------------------------------------------------------

const PROVIDERS = [
    // -------------------------------------------------------------------------
    // 1. Plaid — Traditional brokerage / bank accounts
    // -------------------------------------------------------------------------
    {
        id: 'plaid',
        label: 'Connect with Plaid',
        group: 'traditional',
        icon: '🏦',
        description: 'Link brokerage or bank accounts (US)',
        available: true,

        async launch({ onError, onSuccess, onComplete }) {
            if (typeof initPlaidLink !== 'function') {
                onError('Plaid integration is not available. Please refresh the page.');
                return;
            }
            try {
                await initPlaidLink();
                onComplete();
            } catch (err) {
                onError(`Plaid connection failed: ${err.message}`);
            }
        },
    },

    // -------------------------------------------------------------------------
    // 2. MetaMask — Direct browser extension wallet
    // -------------------------------------------------------------------------
    {
        id: 'metamask',
        label: 'MetaMask',
        group: 'crypto',
        icon: '🦊',
        description: 'Connect your MetaMask browser extension wallet',
        available: false,

        async launch({ onError, onSuccess, onComplete }) {
            const provider = resolveInjectedProvider('metamask');

            if (!provider) {
                onError(
                    'MetaMask is not installed or not detected in this browser. ' +
                    'Install the MetaMask extension and refresh to try again.'
                );
                return;
            }

            try {
                const address = await requestEVMAccount(provider);
                console.info(`[ProsperPath] MetaMask address resolved: ${address}`);

                const chainId = await fetchEVMChainId(provider);
                console.info(`[ProsperPath] MetaMask chain resolved: ${chainId} (${getChainMeta(chainId).name})`);

                const { balance, nativeSymbol, balanceFormatted } = await fetchEVMBalance(provider, address, chainId);
                console.info(`[ProsperPath] MetaMask native balance fetched: ${balanceFormatted}`);

                ConnectionStateManager.setConnected('metamask', {
                    address,
                    balance,
                    nativeSymbol,
                    balanceFormatted,
                    balanceETH: balance,  // legacy alias
                    chainId,
                    providerLabel: 'MetaMask',
                });

                // ── Register live wallet events ────────────────────────────
                provider.on('accountsChanged', (accounts) => {
                    handleAccountChange('metamask', provider, accounts);
                });
                provider.on('chainChanged', (hexId) => {
                    handleChainChange('metamask', provider, hexId);
                });

                onSuccess(`MetaMask connected: ${address.slice(0, 6)}…${address.slice(-4)}`);
                onComplete();
            } catch (err) {
                if (err.code === 4001) {
                    onError('Connection request was rejected in MetaMask.');
                } else {
                    onError(`MetaMask error: ${err.message}`);
                }
            }
        },
    },

    // -------------------------------------------------------------------------
    // 3. WalletConnect — QR-based protocol, supports many wallets
    // -------------------------------------------------------------------------
    {
        id: 'walletconnect',
        label: 'WalletConnect',
        group: 'crypto',
        icon: '🔗',
        description: 'Scan a QR code with any WalletConnect-compatible wallet',
        available: false,

        async launch({ onError, onSuccess, onComplete }) {
            const wcMod = window['@walletconnect/ethereum-provider'];
            const WCProvider = wcMod?.default || wcMod;

            if (!WCProvider) {
                onError(
                    'WalletConnect library failed to load. Check your internet connection and refresh.'
                );
                return;
            }

            const PROJECT_ID = '126e722d00d09fed4904bdc2862e849f';

            try {
                const wcProvider = await WCProvider.init({
                    projectId: PROJECT_ID,
                    chains: [1],
                    // All chains the user might be on (non-mandatory)
                    optionalChains: [56, 137, 42161, 8453, 10, 43114],
                    showQrModal: true,
                    optionalMethods: ['eth_accounts', 'eth_chainId', 'eth_getBalance'],
                    optionalEvents: ['chainChanged', 'accountsChanged'],
                    // ── Explicit RPC map ──────────────────────────────────────
                    // CRITICAL: Without this, WalletConnect falls back to its
                    // relay session URL (bsc.twnodes.com/naas/session/...) as
                    // the chain RPC endpoint. Trust Wallet and other wallets
                    // reject that URL as "Invalid RPC URL". Always supply real
                    // public RPC endpoints for every supported chain.
                    rpcMap: {
                        1:     'https://cloudflare-eth.com',
                        56:    'https://bsc-dataseed.binance.org',
                        137:   'https://polygon-rpc.com',
                        42161: 'https://arb1.arbitrum.io/rpc',
                        8453:  'https://mainnet.base.org',
                        10:    'https://mainnet.optimism.io',
                        43114: 'https://api.avax.network/ext/bc/C/rpc',
                    },
                    metadata: {
                        name: 'ProsperPath Insights',
                        description: 'Portfolio analysis and wealth insights',
                        // Use runtime origin so QR-code verification works from
                        // localhost:3000, localhost:3005, AND production without
                        // any hardcoded domain mismatch.
                        url: window.location.origin,
                        icons: [],
                    },
                });

                await wcProvider.connect();

                const accounts = wcProvider.accounts || [];
                if (!accounts.length) {
                    throw new Error('No accounts received from WalletConnect.');
                }

                const address = accounts[0];
                const chainId = wcProvider.chainId || 1;
                console.info(`[ProsperPath] WalletConnect address: ${address}, chain: ${chainId}`);

                const { balance, nativeSymbol, balanceFormatted } = await fetchEVMBalance(wcProvider, address, chainId);
                console.info(`[ProsperPath] WalletConnect native balance: ${balanceFormatted}`);

                ConnectionStateManager.setConnected('walletconnect', {
                    address,
                    balance,
                    nativeSymbol,
                    balanceFormatted,
                    balanceETH: balance,
                    chainId,
                    providerLabel: 'WalletConnect',
                    wcProvider,
                });

                // ── WalletConnect events ───────────────────────────────────
                wcProvider.on('accountsChanged', (accs) => {
                    handleAccountChange('walletconnect', wcProvider, accs);
                });
                wcProvider.on('chainChanged', (hexId) => {
                    handleChainChange('walletconnect', wcProvider, typeof hexId === 'number'
                        ? `0x${hexId.toString(16)}`
                        : hexId);
                });
                wcProvider.on('disconnect', () => {
                    ConnectionStateManager.setDisconnected('walletconnect');
                    window.portfolioConnectionChooser?.onWalletDisconnected('walletconnect');
                });

                onSuccess(`WalletConnect connected: ${address.slice(0, 6)}…${address.slice(-4)}`);
                onComplete();
            } catch (err) {
                if (err.message?.includes('User closed') || err.message?.includes('cancelled')) {
                    onError('WalletConnect session was cancelled.');
                } else {
                    onError(`WalletConnect error: ${err.message}`);
                }
            }
        },
    },

    // -------------------------------------------------------------------------
    // 4. Trust Wallet
    // -------------------------------------------------------------------------
    {
        id: 'trustwallet',
        label: 'Trust Wallet',
        group: 'crypto',
        icon: '🛡️',
        description: 'Connect via Trust Wallet browser or extension',
        available: false,

        async launch({ onError, onSuccess, onComplete }) {
            const provider = resolveInjectedProvider('trustwallet');

            if (!provider) {
                onError(
                    'Trust Wallet was not detected in this browser. ' +
                    'To connect Trust Wallet: open this page inside the Trust Wallet mobile app ' +
                    '(using its built-in browser), or install the Trust Wallet browser extension. ' +
                    'Alternatively, use WalletConnect to scan a QR code with your Trust Wallet app.'
                );
                return;
            }

            try {
                const address = await requestEVMAccount(provider);
                console.info(`[ProsperPath] Trust Wallet address resolved: ${address}`);

                const chainId = await fetchEVMChainId(provider);
                console.info(`[ProsperPath] Trust Wallet chain resolved: ${chainId} (${getChainMeta(chainId).name})`);

                const { balance, nativeSymbol, balanceFormatted } = await fetchEVMBalance(provider, address, chainId);
                console.info(`[ProsperPath] Trust Wallet native balance: ${balanceFormatted}`);

                ConnectionStateManager.setConnected('trustwallet', {
                    address,
                    balance,
                    nativeSymbol,
                    balanceFormatted,
                    balanceETH: balance,
                    chainId,
                    providerLabel: 'Trust Wallet',
                });

                // ── Register live wallet events ────────────────────────────
                provider.on('accountsChanged', (accounts) => {
                    handleAccountChange('trustwallet', provider, accounts);
                });
                provider.on('chainChanged', (hexId) => {
                    handleChainChange('trustwallet', provider, hexId);
                });

                onSuccess(`Trust Wallet connected: ${address.slice(0, 6)}…${address.slice(-4)}`);
                onComplete();
            } catch (err) {
                if (err.code === 4001) {
                    onError('Connection request was rejected in Trust Wallet.');
                } else {
                    onError(`Trust Wallet error: ${err.message}`);
                }
            }
        },
    },
];

// ---------------------------------------------------------------------------
// Runtime availability detection
// ---------------------------------------------------------------------------

(function detectAvailability() {
    const metamask = resolveInjectedProvider('metamask');
    const metamaskProvider = PROVIDERS.find(p => p.id === 'metamask');
    if (metamaskProvider) metamaskProvider.available = !!metamask;

    const trust = resolveInjectedProvider('trustwallet');
    const trustProvider = PROVIDERS.find(p => p.id === 'trustwallet');
    if (trustProvider) trustProvider.available = !!trust;
})();

/**
 * Called by portfolio-connection-chooser.js after WalletConnect script loads.
 */
function updateWalletConnectAvailability() {
    const wcProvider = PROVIDERS.find(p => p.id === 'walletconnect');
    if (wcProvider) {
        const wcMod = window['@walletconnect/ethereum-provider'];
        wcProvider.available = !!(wcMod?.default || wcMod);
    }
}

// ---------------------------------------------------------------------------
// Public exports (module-style, no bundler)
// ---------------------------------------------------------------------------
window.ProsperPathProviders = {
    PROVIDERS,
    ConnectionStateManager,
    updateWalletConnectAvailability,
    CHAIN_METADATA,
    getChainMeta,
};
