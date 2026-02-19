require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_FILE = path.join(__dirname, 'plaid_session.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Plaid Configuration
const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});

const plaidClient = new PlaidApi(configuration);

// Store access tokens (in production, use a database)
let accessToken = null;
let itemId = null;

// Load session from file if it exists
if (fs.existsSync(SESSION_FILE)) {
    try {
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        accessToken = sessionData.access_token;
        itemId = sessionData.item_id;
        console.log('📂 Loaded persistent session from file');
    } catch (err) {
        console.error('❌ Error loading session file:', err);
    }
}

// ============= PLAID ENDPOINTS =============

// Check Connection Status
app.get('/api/status', (req, res) => {
    res.json({
        connected: !!accessToken,
        item_id: itemId
    });
});

// Create Link Token
app.post('/api/create_link_token', async (req, res) => {
    try {
        const configs = {
            user: {
                client_user_id: 'user-' + Date.now(),
            },
            client_name: 'NeuroWealth',
            products: ['investments'],
            country_codes: ['US'],
            language: 'en',
        };

        const createTokenResponse = await plaidClient.linkTokenCreate(configs);
        res.json(createTokenResponse.data);
    } catch (error) {
        console.error('Error creating link token:', error);
        res.status(500).json({ error: error.message });
    }
});

// Exchange Public Token for Access Token
app.post('/api/set_access_token', async (req, res) => {
    const { public_token } = req.body;

    try {
        const tokenResponse = await plaidClient.itemPublicTokenExchange({
            public_token: public_token,
        });

        accessToken = tokenResponse.data.access_token;
        itemId = tokenResponse.data.item_id;

        // Save session to file for persistence across server restarts
        fs.writeFileSync(SESSION_FILE, JSON.stringify({
            access_token: accessToken,
            item_id: itemId
        }, null, 2));

        console.log('Access Token:', accessToken);
        console.log('Item ID:', itemId);
        console.log('💾 Session saved to file');

        res.json({
            access_token: accessToken,
            item_id: itemId,
        });
    } catch (error) {
        console.error('Error exchanging public token:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Investment Holdings
app.get('/api/holdings', async (req, res) => {
    try {
        if (!accessToken) {
            return res.status(400).json({ error: 'No access token available. Please link an account first.' });
        }

        const holdingsResponse = await plaidClient.investmentsHoldingsGet({
            access_token: accessToken,
        });

        const { holdings, securities, accounts } = holdingsResponse.data;

        // Map securities for easy lookup
        const securityMap = {};
        securities.forEach(s => {
            securityMap[s.security_id] = s;
        });

        // Join holdings with securities
        const joinedHoldings = holdings.map(h => ({
            ...h,
            security: securityMap[h.security_id] || { name: 'Unknown Security' }
        }));

        res.json({
            holdings: joinedHoldings,
            accounts: accounts,
            securities: securities
        });
    } catch (error) {
        console.error('Error fetching holdings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Investment Transactions
app.get('/api/transactions', async (req, res) => {
    try {
        if (!accessToken) {
            return res.status(400).json({ error: 'No access token available. Please link an account first.' });
        }

        // Get transactions from last 90 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        const transactionsResponse = await plaidClient.investmentsTransactionsGet({
            access_token: accessToken,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
        });

        const { investment_transactions, securities } = transactionsResponse.data;

        // Map securities for easy lookup
        const securityMap = {};
        securities.forEach(s => {
            securityMap[s.security_id] = s;
        });

        // Join transactions with securities
        const joinedTransactions = investment_transactions.map(t => ({
            ...t,
            security: securityMap[t.security_id] || { name: 'Unknown Security' }
        }));

        res.json({
            investment_transactions: joinedTransactions,
            securities: securities
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= SERVE FRONTEND =============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`✅ NeuroWealth Server running at http://localhost:${PORT}/`);
    console.log(`📊 Plaid Environment: ${process.env.PLAID_ENV}`);
});
