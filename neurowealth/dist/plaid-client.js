// Plaid Link Client for NeuroWealth Portfolio

let handler = null;
let accessToken = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Plaid Client initialized');

    // Set up event listeners
    document.getElementById('link-button').addEventListener('click', initPlaidLink);
    document.getElementById('refresh-button').addEventListener('click', fetchPortfolioData);
    document.getElementById('analyze-button').addEventListener('click', analyzePortfolio);

    // Check if we already have a persistent session
    await checkStatus();
});

// Check if an account is already linked
async function checkStatus() {
    try {
        const token = localStorage.getItem('auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api'}/status`, {
            headers: headers
        });
        const data = await response.json();

        if (data.connected) {
            console.log('🔗 Account already linked:', data.item_id);

            // Show connected state
            document.getElementById('disconnected-state').classList.add('hidden');
            document.getElementById('connected-state').classList.remove('hidden');

            // Automatically fetch data
            await fetchPortfolioData();
        }
    } catch (error) {
        console.error('Error checking status:', error);
    }
}

// Initialize Plaid Link
async function initPlaidLink() {
    console.log('🔄 initPlaidLink called');
    try {
        // Enforce Authentication
        const token = localStorage.getItem('auth_token');
        console.log('🔑 Token from localStorage:', token ? (token.substring(0, 10) + '...') : 'NULL');
        if (!token) {
            alert('Please log in with Google first to connect your portfolio account.');
            // Toggle auth menu if available
            if (typeof toggleAuthMenu === 'function') {
                toggleAuthMenu();
            }
            return;
        }

        showLoading(true);

        // Get Link Token from backend
        const headers = { 'Authorization': `Bearer ${token}` };

        const response = await fetch(`${window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api'}/create_link_token`, {
            method: 'POST',
            headers: headers
        });

        const data = await response.json();

        if (!data.link_token) {
            throw new Error('Failed to get link token');
        }

        // Initialize Plaid Link
        handler = Plaid.create({
            token: data.link_token,
            onSuccess: async (public_token, metadata) => {
                console.log('✅ Plaid Link Success!', metadata);
                await exchangePublicToken(public_token);
            },
            onExit: (err, metadata) => {
                if (err) {
                    console.error('❌ Plaid Link Error:', err);
                    alert(`Plaid Link Error: ${err.error_code}\n${err.error_message}`);
                }
                showLoading(false);
            },
            onEvent: (eventName, metadata) => {
                console.log('📊 Plaid Event:', eventName, metadata);
            },
        });

        showLoading(false);
        handler.open();
    } catch (error) {
        console.error('Error initializing Plaid Link:', error);
        alert('Failed to initialize Plaid Link. Please check server connection.');
        showLoading(false);
    }
}

// Exchange Public Token for Access Token
async function exchangePublicToken(publicToken) {
    console.log('🔄 exchangePublicToken called');
    try {
        showLoading(true);

        const token = localStorage.getItem('auth_token');
        console.log('🔑 token for exchange:', token ? (token.substring(0, 10) + '...') : 'NULL');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api'}/set_access_token`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ public_token: publicToken }),
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Your session has expired. Please log in again.');
            }

            const contentType = response.headers.get('content-type');
            let errorMessage = 'Failed to exchange token';

            if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } else {
                errorMessage = await response.text();
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        accessToken = data.access_token;

        console.log('✅ Access Token received');

        // Show connected state
        document.getElementById('disconnected-state').classList.add('hidden');
        document.getElementById('connected-state').classList.remove('hidden');

        // Fetch portfolio data
        await fetchPortfolioData();
    } catch (error) {
        console.error('Error exchanging public token:', error);
        alert(`Failed to exchange token: ${error.message}`);
        showLoading(false);
    }
}

// Fetch Portfolio Data (Holdings + Transactions)
async function fetchPortfolioData() {
    try {
        console.log('🔄 Fetching portfolio data...');
        showLoading(true);

        const token = localStorage.getItem('auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Fetch Holdings
        const holdingsResponse = await fetch(`${window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api'}/holdings`, {
            headers: headers
        });
        if (!holdingsResponse.ok) {
            const errorData = await holdingsResponse.json();
            throw new Error(errorData.error || 'Failed to fetch holdings');
        }
        const holdingsData = await holdingsResponse.json();

        // Fetch Transactions
        const transactionsResponse = await fetch(`${window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api'}/transactions`, {
            headers: headers
        });
        if (!transactionsResponse.ok) {
            const errorData = await transactionsResponse.json();
            throw new Error(errorData.error || 'Failed to fetch transactions');
        }
        const transactionsData = await transactionsResponse.json();

        console.log('✅ Data fetched successfully');
        console.log('📊 Holdings:', holdingsData);
        console.log('💸 Transactions:', transactionsData);

        // Store for AI analysis
        window.portfolioData = {
            holdings: holdingsData,
            transactions: transactionsData,
        };

        // Render data
        renderHoldings(holdingsData);
        renderTransactions(transactionsData);
        updateSummaryBar(holdingsData);
        renderAnalysis(holdingsData);

        showLoading(false);
    } catch (error) {
        console.error('❌ Error fetching portfolio data:', error);
        alert(`Failed to fetch portfolio data: ${error.message}`);
        showLoading(false);
    }
}

// Update the Top Summary Bar
function updateSummaryBar(data) {
    const summaryBar = document.getElementById('portfolio-summary-bar');
    const totalValueEl = document.getElementById('summary-total-value');
    const countEl = document.getElementById('summary-holdings-count');

    if (!data.holdings || data.holdings.length === 0) {
        summaryBar.classList.add('hidden');
        return;
    }

    let totalValue = 0;
    data.holdings.forEach(holding => {
        totalValue += (holding.quantity * holding.institution_price);
    });

    totalValueEl.textContent = `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    countEl.textContent = data.holdings.length;
    summaryBar.classList.remove('hidden');
}

// Global variable to keep track of the chart instance
let distributionChart = null;

// Render Portfolio Analysis (Pie Chart + Detailed Breakdown)
function renderAnalysis(data) {
    const analysisSection = document.getElementById('analysis-section');
    const detailsContainer = document.getElementById('allocation-details-container');

    if (!data.holdings || data.holdings.length === 0) {
        analysisSection.classList.add('hidden');
        return;
    }

    analysisSection.classList.remove('hidden');

    // 1. Aggregate data by security type
    const distribution = {};
    let totalPortfolioValue = 0;

    data.holdings.forEach(holding => {
        const type = holding.security.type || 'Other';
        const value = holding.quantity * holding.institution_price;
        totalPortfolioValue += value;

        if (!distribution[type]) {
            distribution[type] = 0;
        }
        distribution[type] += value;
    });

    // 2. Prepare data for Chart.js
    const labels = Object.keys(distribution);
    const values = Object.values(distribution);

    // Define ProsperPath theme colors
    const colors = [
        '#00d4aa', // Primary accent
        '#00ffbd', // Lighter accent
        '#1a2d44', // Dark blue
        '#2a3e56', // Medium blue
        '#3a4f68', // Light blue
        '#4a607a'  // Lighter blue
    ];

    // 3. Render Pie Chart
    const ctx = document.getElementById('distribution-chart').getContext('2d');

    // Destroy previous chart if it exists
    if (distributionChart) {
        distributionChart.destroy();
    }

    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        padding: 20,
                        font: {
                            family: 'Inter',
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.raw;
                            const percentage = ((value / totalPortfolioValue) * 100).toFixed(1);
                            return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });

    // 4. Render Detailed Breakdown List
    let detailsHtml = '';

    // Sort by value descending
    const sortedAllocation = Object.entries(distribution).sort((a, b) => b[1] - a[1]);

    sortedAllocation.forEach(([type, value], index) => {
        const percentage = ((value / totalPortfolioValue) * 100).toFixed(1);
        const color = colors[index % colors.length];

        detailsHtml += `
            <div class="allocation-item">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: ${color};"></div>
                        <span style="font-weight: 600; font-size: 0.95rem;">${type}</span>
                    </div>
                    <span style="font-weight: 700; color: var(--color-text-primary);">$${value.toLocaleString()}</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(148, 163, 184, 0.1); border-radius: 10px; overflow: hidden;">
                    <div style="width: ${percentage}%; height: 100%; background: ${color}; border-radius: 10px;"></div>
                </div>
                <div style="text-align: right; margin-top: 4px;">
                    <span style="font-size: 0.8rem; color: var(--color-text-muted);">${percentage}% of Portfolio</span>
                </div>
            </div>
        `;
    });

    detailsContainer.innerHTML = detailsHtml;
}

// Render Holdings
function renderHoldings(data) {
    const container = document.getElementById('holdings-container');
    const section = document.getElementById('holdings-section');

    if (!data.holdings || data.holdings.length === 0) {
        container.innerHTML = '<div class="loading-state"><p>No holdings found in this account.</p></div>';
        section.classList.remove('hidden');
        return;
    }

    let html = '';
    data.holdings.forEach(holding => {
        const value = (holding.quantity * holding.institution_price).toFixed(2);
        html += `
            <div class="card feature-card holding-card" data-animate>
                <div class="holding-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem;">${holding.security.name}</h3>
                        <span class="text-muted" style="font-size: 0.8rem;">${holding.security.type || 'Equity'}</span>
                    </div>
                    <span class="badge-best-for" style="margin: 0; background: var(--color-accent); color: var(--color-primary);">${holding.security.ticker_symbol || 'N/A'}</span>
                </div>
                <div class="holding-details" style="display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-muted">Quantity</span>
                        <span>${holding.quantity}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-muted">Price</span>
                        <span>$${holding.institution_price.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--color-border);">
                        <span style="font-weight: 600;">Total Value</span>
                        <span class="text-accent" style="font-weight: 700;">$${parseFloat(value).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    section.classList.remove('hidden');

    // Re-initialize animations for new elements
    if (typeof initAnimations === 'function') initAnimations();
    if (typeof initScrollEffects === 'function') initScrollEffects();
}

// Render Transactions
function renderTransactions(data) {
    const container = document.getElementById('transactions-container');
    const section = document.getElementById('transactions-section');

    if (!data.investment_transactions || data.investment_transactions.length === 0) {
        container.innerHTML = '<p class="empty-state">No recent transactions found.</p>';
        section.classList.remove('hidden');
        return;
    }

    let html = `
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Security</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.investment_transactions.slice(0, 20).forEach(tx => {
        const amount = tx.amount ? `$${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'N/A';
        const type = tx.type || 'N/A';
        const typeClass = type.toLowerCase().includes('buy') ? 'val-greed' : (type.toLowerCase().includes('sell') ? 'val-fear' : '');

        html += `
            <tr>
                <td>${tx.date}</td>
                <td style="font-weight: 600;">${tx.security.name || 'N/A'}</td>
                <td><span class="feature-tag ${typeClass}">${type}</span></td>
                <td>${tx.quantity || '0'}</td>
                <td class="${typeClass}" style="font-weight: 700;">${amount}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
    section.classList.remove('hidden');

    // Re-initialize animations for new elements
    if (typeof initAnimations === 'function') initAnimations();
    if (typeof initScrollEffects === 'function') initScrollEffects();
}

// Analyze Portfolio with AI
function analyzePortfolio() {
    if (!window.portfolioData) {
        alert('Please load portfolio data first.');
        return;
    }

    // Open AI widget with portfolio context
    if (window.prosporousWidget) {
        window.prosporousWidget.toggleChat(true);

        // Send a natural language prompt. The widget will pull full portfolio context automatically.
        setTimeout(() => {
            const prompt = `Please analyze my investment portfolio and provide some insights on my current holdings and allocation.`;

            window.prosporousWidget.input.value = prompt;
            window.prosporousWidget.sendMessage();
        }, 500);
    } else {
        alert('AI Assistant not available. Please ensure ai-widget.js is loaded.');
    }
}

// Normalize Portfolio Data for AI Analysis
function normalizePortfolioForAI(data) {
    const normalized = {
        summary: {
            totalHoldings: data.holdings.holdings.length,
            totalValue: 0,
            accounts: data.holdings.accounts.length,
        },
        holdings: [],
        recentTransactions: [],
    };

    // Process holdings
    data.holdings.holdings.forEach(holding => {
        const value = holding.quantity * holding.institution_price;
        normalized.totalValue += value;

        normalized.holdings.push({
            name: holding.security.name,
            ticker: holding.security.ticker_symbol,
            type: holding.security.type,
            quantity: holding.quantity,
            price: holding.institution_price,
            value: value,
            costBasis: holding.cost_basis,
        });
    });

    // Process transactions (last 10)
    if (data.transactions.investment_transactions) {
        normalized.recentTransactions = data.transactions.investment_transactions
            .slice(0, 10)
            .map(tx => ({
                date: tx.date,
                security: tx.security.name,
                type: tx.type,
                quantity: tx.quantity,
                amount: tx.amount,
            }));
    }

    return normalized;
}

// Show/Hide Loading
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}
