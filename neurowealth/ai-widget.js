/**
 * Prosporous - AI Assistant Widget
 * Integrates with OpenRouter to provide free access to various AI models.
 */

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getAuthToken() {
    return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || '';
}

class ProsporousWidget {
    constructor() {
        window.prosporousWidget = this;
        // API keys live exclusively in the server-side Worker environment.
        // No user-entered keys are read or stored client-side.
        this.apiKey = ''; // reserved field for dormant OpenRouter direct path only
        this.tavilyKey = ''; // reserved; Tavily integration is user-optional and not required
        this.models = [];
        this.selectedModel = localStorage.getItem('prosporous_selected_model') || 'zhipu/glm-4.5-air'; // Default: GLM 4.5 Air
        this.sessions = JSON.parse(localStorage.getItem('prosporous_sessions') || '[]');
        this.currentSessionId = null;
        this.isHistoryOpen = false;
        this.isSyncing = false;

        // Migrate legacy history if exists
        const legacyHistory = JSON.parse(localStorage.getItem('prosporous_chat_history') || '[]');
        if (legacyHistory.length > 0 && this.sessions.length === 0) {
            this.sessions.push({
                id: 'legacy-' + Date.now(),
                title: 'Legacy Chat',
                messages: legacyHistory,
                timestamp: Date.now()
            });
            localStorage.removeItem('prosporous_chat_history');
            this.saveSessionsToStorage();
        }
        this.pendingImage = null; // Store base64 of the image to be sent
        this.isOpen = false;
        this.isSearchEnabled = false;
        this.isFullScreen = false;

        // Base API URL
        this.workerUrl = window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api';
        this.openRouterUrl = 'https://openrouter.ai/api/v1';
        this.tavilyUrl = 'https://api.tavily.com/search';
        this.guideInitialized = false;
        this.blogInitialized = false;
        this.stockInitialized = false;

        this.init();
    }

    async asyncInit() {
        this.injectStyles();
        this.buildUI();
        this.attachEvents();

        // TEMPORARY: When using Worker proxy, the API key lives server-side.
        // Enable the send button immediately without waiting for fetchModels.
        // When USE_WORKER_AI_PROXY = false (restored), this branch is skipped and
        // fetchModels() re-gates the button as before.
        const USE_WORKER_AI_PROXY_INIT = true; // TEMPORARY — SARVAM FORCED ROUTING
        if (USE_WORKER_AI_PROXY_INIT) {
            // Enable chatbot immediately — no local key required
            if (this.sendBtn) this.sendBtn.disabled = false;
            if (this.input) this.input.disabled = false;
        } else {
            // Original path: If we have an API key, fetch models. Otherwise prompting happens in UI.
            if (this.apiKey) {
                await this.fetchModels();
            }
        }

        // Initialize Sessions
        this.initSession();

        // Guide specific auto-open
        this.initGuideAssistant();

        // Coin specific auto-open
        this.initCoinAssistant();

        // Stock specific auto-open
        this.initStockAssistant();

        // Blog specific auto-open
        this.initBlogAssistant();

        // Listen for Auth Events
        window.addEventListener('auth-login-success', () => this.syncWithCloud());
    }

    initSession() {
        // Every refresh starts a new session per request
        this.createNewSession();
    }

    createNewSession() {
        // Prevent multiple empty sessions
        const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
        if (currentSession && currentSession.messages.length === 0) {
            this.renderCurrentSession();
            return;
        }

        const id = 'session-' + Date.now();
        const newSession = {
            id: id,
            title: 'New Chat',
            messages: [],
            timestamp: Date.now()
        };
        this.sessions.unshift(newSession); // Newest first
        this.currentSessionId = id;
        // Don't save to storage yet - only save on activity
        this.renderCurrentSession();
        this.renderHistoryList();
    }

    switchToSession(id) {
        this.currentSessionId = id;
        this.renderCurrentSession();
        this.toggleHistory(false);
    }

    deleteSession(id, event) {
        if (event) event.stopPropagation();
        this.sessions = this.sessions.filter(s => s.id !== id);
        if (this.currentSessionId === id) {
            if (this.sessions.length > 0) {
                this.currentSessionId = this.sessions[0].id;
            } else {
                this.createNewSession();
            }
        }
        this.saveSessionsToStorage();
        this.renderCurrentSession();
        this.renderHistoryList();
    }

    saveSessionsToStorage() {
        // Only save sessions that have at least one message
        const sessionsToSave = this.sessions.filter(s => s.messages && s.messages.length > 0);

        // Limit total sessions to prevent storage bloating
        const limitedSessions = sessionsToSave.slice(0, 30);

        localStorage.setItem('prosporous_sessions', JSON.stringify(limitedSessions));

        // Sync with Cloud if authenticated
        this.syncSessionsToCloud(limitedSessions);
    }

    async syncSessionsToCloud(sessions) {
        if (!window.currentUser || this.isSyncing) return;

        try {
            this.isSyncing = true;
        const token = getAuthToken();
            if (!token) return;

            const response = await fetch(`${this.workerUrl}/user/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ sessions })
            });

            if (!response.ok) throw new Error('Cloud sync failed');
            console.log('Chat sessions synced to cloud.');
        } catch (e) {
            console.warn('Chat Sync Error:', e);
        } finally {
            this.isSyncing = false;
        }
    }

    async syncWithCloud() {
        if (!window.currentUser) return;

        try {
        const token = getAuthToken();
            const res = await fetch(`${this.workerUrl}/user/data`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const cloudData = await res.json();
                if (cloudData.chat_sessions && cloudData.chat_sessions.length > 0) {
                    console.log('Merging cloud chat sessions...');

                    // Simple merge: filter out any cloud sessions that are already present locally by ID
                    const localIds = new Set(this.sessions.map(s => s.id));
                    const newSessions = cloudData.chat_sessions.filter(s => !localIds.has(s.id));

                    if (newSessions.length > 0) {
                        this.sessions = [...newSessions, ...this.sessions];
                        this.sessions = this.sessions.slice(0, 30); // Maintain limit
                        this.saveSessionsToStorage();
                        this.renderHistoryList();
                    }
                }
            }
        } catch (e) {
            console.warn('Initial session sync error:', e);
        }
    }

    init() {
        this.asyncInit();
    }

    injectStyles() {
        // Injected CSS for Tavily sources block (rendered when webMode is ON and search returns results).
        const style = document.createElement('style');
        style.textContent = `
            .prosporous-sources {
                margin-top: 8px;
                padding: 8px 10px;
                background: rgba(99,179,237,0.08);
                border-left: 3px solid rgba(99,179,237,0.6);
                border-radius: 4px;
                font-size: 0.78rem;
            }
            .prosporous-sources-label {
                font-weight: 600;
                color: rgba(99,179,237,0.9);
                margin-bottom: 4px;
            }
            .prosporous-sources-list {
                margin: 0;
                padding-left: 16px;
            }
            .prosporous-sources-list li { margin-bottom: 2px; }
            .prosporous-sources-list a {
                color: rgba(99,179,237,0.85);
                text-decoration: none;
                word-break: break-all;
            }
            .prosporous-sources-list a:hover { text-decoration: underline; }
        `;
        document.head.appendChild(style);
    }

    buildUI() {
        const widgetContainer = document.createElement('div');
        widgetContainer.id = 'prosporous-widget';
        widgetContainer.innerHTML = `
            <!-- Floating Toggle Button -->
            <button id="prosporous-toggle" class="prosporous-toggle">
                <div class="prosporous-toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
                </div>
            </button>

            <!-- Chat Window -->
            <div id="prosporous-chat-window" class="prosporous-chat-window hidden">
                <div class="prosporous-header">
                    <div class="prosporous-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="m19 5-1.5 1.5"/><path d="m5 5 1.5 1.5"/><path d="M12 18v4"/><path d="m19 19-1.5-1.5"/><path d="m5 19 1.5-1.5"/><path d="M22 12h-4"/><path d="M6 12H2"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>Prosporous AI</span>
                    </div>
                    <div class="prosporous-header-actions">
                        <button id="prosporous-history-toggle" class="prosporous-icon-btn" title="Chat History">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
                        </button>
                        <button id="prosporous-fullscreen-toggle" class="prosporous-icon-btn" title="Toggle Full Screen">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="maximize-icon"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                        </button>
                        <button id="prosporous-settings-toggle" class="prosporous-icon-btn" title="API Settings">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        </button>
                        <button id="prosporous-close" class="prosporous-close-btn">&times;</button>
                    </div>
                </div>

                <div id="prosporous-history-panel" class="prosporous-history-panel hidden">
                    <div class="prosporous-history-header">
                        <span>Chat History</span>
                        <button id="prosporous-new-chat" class="btn-xs">New Chat</button>
                    </div>
                    <div id="prosporous-history-list" class="prosporous-history-list">
                        <!-- History items injected here -->
                    </div>
                </div>

                <div class="prosporous-settings">
                    <!-- API key entry removed: AI calls route through the server-side Worker only. -->
                    <div class="prosporous-key-config collapsed" id="key-config-section" style="display:none;"></div>
                    <div class="prosporous-model-selector">
                        <select id="prosporous-model-select" disabled>
                            <option>AI Ready</option>
                        </select>
                    </div>
                </div>

                <div id="prosporous-messages" class="prosporous-messages">
                    <div class="message system">
                        <p>Hello! I am Prosporous, your financial AI assistant. Ask me anything about markets, investing, or your portfolio.</p>
                    </div>
                </div>

                <div class="prosporous-input-area">
                    <div class="prosporous-input-controls">
                        <button id="prosporous-search-toggle" class="prosporous-tool-btn" title="Web Search">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        </button>
                        <button id="prosporous-image-btn" class="prosporous-tool-btn" title="Upload Image">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                        </button>
                        <input type="file" id="prosporous-image-input" accept="image/*" style="display: none;">
                    </div>
                    <div id="prosporous-image-preview" class="prosporous-image-preview hidden"></div>
                    <div class="prosporous-input-main">
                        <textarea id="prosporous-input" placeholder="Ask about markets..."></textarea>
                        <button id="prosporous-send" disabled>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(widgetContainer);

        // Elements
        this.toggleBtn = document.getElementById('prosporous-toggle');
        this.chatWindow = document.getElementById('prosporous-chat-window');
        this.closeBtn = document.getElementById('prosporous-close');
        // Key input/save references set to null — UI elements no longer exist
        this.keyInput = null;
        this.tavilyKeyInput = null;
        this.saveKeyBtn = null;
        this.modelSelect = document.getElementById('prosporous-model-select');
        this.messagesContainer = document.getElementById('prosporous-messages');
        this.input = document.getElementById('prosporous-input');
        this.sendBtn = document.getElementById('prosporous-send');
        this.keyConfigSection = document.getElementById('key-config-section');
        this.searchToggle = document.getElementById('prosporous-search-toggle');
        this.imageBtn = document.getElementById('prosporous-image-btn');
        this.imageInput = document.getElementById('prosporous-image-input');
        this.imagePreview = document.getElementById('prosporous-image-preview');
        this.settingsToggle = document.getElementById('prosporous-settings-toggle');
        this.historyToggle = document.getElementById('prosporous-history-toggle');
        this.historyPanel = document.getElementById('prosporous-history-panel');
        this.historyList = document.getElementById('prosporous-history-list');
        this.newChatBtn = document.getElementById('prosporous-new-chat');
        this.fsToggle = document.getElementById('prosporous-fullscreen-toggle');

        // Initial textarea state
        // TEMPORARY: When using Worker proxy, key lives server-side — always enable textarea.
        // To restore original gating: set USE_WORKER_AI_PROXY_BUILD = false.
        const USE_WORKER_AI_PROXY_BUILD = true; // TEMPORARY — SARVAM FORCED ROUTING
        this.input.disabled = USE_WORKER_AI_PROXY_BUILD ? false : !this.apiKey;
        this.updateSendButton();
    }

    attachEvents() {
        this.toggleBtn.addEventListener('click', () => this.toggleChat());
        this.closeBtn.addEventListener('click', () => this.toggleChat(false));

        this.fsToggle.addEventListener('click', () => this.toggleFullScreen());

        this.settingsToggle.addEventListener('click', () => {
            // Settings panel is hidden — no user-configurable keys remain.
            // Button kept to avoid DOM errors; click opens history instead.
            this.toggleHistory();
        });

        this.historyToggle.addEventListener('click', () => {
            this.toggleHistory();
        });

        this.newChatBtn.addEventListener('click', () => {
            this.createNewSession();
        });

        // saveKeyBtn no longer rendered — event listener skipped

        this.modelSelect.addEventListener('change', (e) => {
            this.selectedModel = e.target.value;
            localStorage.setItem('prosporous_selected_model', this.selectedModel);
        });

        this.searchToggle.addEventListener('click', () => {
            this.isSearchEnabled = !this.isSearchEnabled;
            this.searchToggle.classList.toggle('active', this.isSearchEnabled);
        });

        this.sendBtn.addEventListener('click', () => this.sendMessage());

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
            // Small delay to let input value update if needed, or just update button
            setTimeout(() => this.updateSendButton(), 10);
        });

        this.imageBtn.addEventListener('click', () => this.imageInput.click());

        this.imageInput.addEventListener('change', (e) => this.handleImageSelect(e));

        // Auto-resize textarea
        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = (this.input.scrollHeight) + 'px';
            this.updateSendButton();
        });
    }

    toggleChat(forceState) {
        this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
        if (this.isOpen) {
            this.chatWindow.classList.remove('hidden');
            this.toggleBtn.classList.add('active');
            this.scrollToBottom();
            this.input.focus();
        } else {
            this.chatWindow.classList.add('hidden');
            this.toggleBtn.classList.remove('active');
            this.toggleHistory(false);
            // Exit fullscreen if closing
            if (this.isFullScreen) this.toggleFullScreen(false);
        }
    }

    toggleHistory(forceState) {
        this.isHistoryOpen = forceState !== undefined ? forceState : !this.isHistoryOpen;
        this.historyPanel.classList.toggle('hidden', !this.isHistoryOpen);
        if (this.isHistoryOpen) {
            this.keyConfigSection.classList.add('collapsed');
            this.renderHistoryList();
        }
    }

    toggleFullScreen(forceState) {
        this.isFullScreen = forceState !== undefined ? forceState : !this.isFullScreen;
        this.chatWindow.classList.toggle('full-screen', this.isFullScreen);

        // Update Icon
        if (this.isFullScreen) {
            this.fsToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="minimize-icon"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
        } else {
            this.fsToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="maximize-icon"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
        }

        this.scrollToBottom();
    }

    saveApiKeys() {
        // API key entry has been removed. All AI calls go through the server-side Worker.
        // This method is preserved as a safe stub to avoid any residual call-site errors.
        console.info('[Prosporous] saveApiKeys() called but is a no-op. Keys are managed server-side.');
    }

    async performTavilySearch(query) {
        if (!this.tavilyKey) return null;

        // Enhance query if looking for financial data
        let enhancedQuery = query;
        if (this.isFinanceQuery(query)) {
            enhancedQuery = `${query} live financial data yahoo finance bloomberg reuters`;
        }

        try {
            const response = await fetch(this.tavilyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: this.tavilyKey,
                    query: enhancedQuery,
                    search_depth: "advanced",
                    include_answer: true,
                    max_results: 5
                })
            });

            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();
            return {
                answer: data.answer || "No direct answer available.",
                results: (data.results || []).map(r => ({ title: r.title || "No Title", content: r.content || "", url: r.url || "#" }))
            };
        } catch (e) {
            console.error('Tavily Search Error:', e);
            return null;
        }
    }

    async fetchModels() {
        if (!this.apiKey) return;

        try {
            this.modelSelect.innerHTML = '<option>Loading...</option>';

            const response = await fetch(`${this.openRouterUrl}/models`, {
                method: 'GET',
                // OpenRouter doesn't always strictly require auth for listing public models, 
                // but good practice if we have the key.
            });

            if (!response.ok) throw new Error('Failed to fetch models');

            const data = await response.json();
            const allModels = data.data || [];

            // Filter for free models (usually have :free in id or specified as 0 pricing)
            // Or roughly filtering by IDs known to be free if pricing info is complex.
            // Using a loose filter for ":free" suffix which is common on OpenRouter for free variants.
            this.models = allModels.filter(m => m && (m.id?.endsWith(':free') || m.pricing?.prompt === "0"));

            this.populateModelSelect();
            this.modelSelect.disabled = false;
            this.sendBtn.disabled = false;

        } catch (error) {
            console.error(error);
            this.appendMessage('system', 'Error fetching models. Please check your key or internet.');
            this.modelSelect.innerHTML = '<option>Error loading models</option>';
            this.modelSelect.disabled = true;
        }
    }

    populateModelSelect() {
        this.modelSelect.innerHTML = '';
        if (!this.models || this.models.length === 0) {
            this.modelSelect.innerHTML = '<option>No free models found</option>';
            this.modelSelect.disabled = true; // Also disable if no models
            return;
        }

        this.models.forEach(model => {
            if (!model || !model.id) return;
            const option = document.createElement('option');
            option.value = model.id;
            // Clean up name slightly
            option.textContent = model.name || model.id.split('/')[1] || model.id;
            this.modelSelect.appendChild(option);
        });

        // Select previously selected if exists in list, else first
        const modelExists = this.models.some(m => m && m.id === this.selectedModel);
        if (modelExists) {
            this.modelSelect.value = this.selectedModel;
        } else if (this.models[0] && this.models[0].id) {
            this.selectedModel = this.models[0].id;
            this.modelSelect.value = this.selectedModel;
        }

        // Save initial default if needed
        localStorage.setItem('prosporous_selected_model', this.selectedModel);
    }

    getPageContext() {
        const context = {
            url: window.location.href,
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content || '',
            timestamp: new Date().toLocaleString(),
            visibleStats: {},
            pageType: this.detectPageType()
        };

        // Extract Global Stats if available in DOM
        const globalCap = document.getElementById('global-cap')?.innerText;
        const btcDom = document.getElementById('btc-dominance')?.innerText;
        const fng = document.getElementById('global-fng')?.innerText;

        if (globalCap) context.visibleStats.globalMarketCap = globalCap;
        if (btcDom) context.visibleStats.btcDominance = btcDom;
        if (fng) context.visibleStats.fearAndGreedIndex = fng;

        // Scrape specific details based on page type
        if (context.pageType === 'crypto-detail') {
            const coinName = document.querySelector('.detail-title h1')?.innerText;
            const price = document.querySelector('.price-main')?.innerText;
            const verdict = document.querySelector('.verdict-value')?.innerText;
            if (coinName) context.currentAsset = { name: coinName, price, verdict };
        }

        // Stock / Market Detail Context
        if (context.pageType === 'market-detail') {
            const stockName = document.querySelector('#market-hero h1')?.innerText;
            const price = document.querySelector('#market-hero div[style*="font-size: 3.5rem"]')?.innerText;
            const verdict = document.getElementById('ai-verdict-badge')?.innerText;
            const sentiment = document.getElementById('ai-sentiment-score')?.innerText;
            if (stockName) context.currentAsset = { name: stockName, price, verdict, sentiment };
        }

        // Guide Context
        if (context.pageType === 'guide') {
            const title = document.getElementById('guide-title')?.innerText;
            const intro = document.getElementById('guide-intro')?.innerText;
            const body = document.getElementById('guide-body')?.innerText;
            context.guideData = {
                title: title || document.title,
                intro: intro || '',
                body: (body || '').substring(0, 5000) // Limit body length for context
            };
        }

        // Blog Post Context
        if (context.pageType === 'blog-post') {
            const title = document.getElementById('post-title')?.innerText;
            const category = document.getElementById('post-category')?.innerText;
            const content = document.getElementById('post-content')?.innerText;
            context.blogData = {
                title: title || document.title,
                category: category || '',
                content: (content || '').substring(0, 5000)
            };
        }

        // Check for window.aiAnalysis (exposed for AI)
        if (window.aiAnalysis) {
            context.siteAnalysisData = window.aiAnalysis;
        }

        // Scrape Portfolio Summary Bar
        const displayedTotal = document.getElementById('summary-total-value')?.innerText;
        const displayedCount = document.getElementById('summary-holdings-count')?.innerText;
        if (displayedTotal) context.visibleStats.portfolioTotalMarketValue = displayedTotal;
        if (displayedCount) context.visibleStats.portfolioHoldingsCount = displayedCount;


        // Portfolio Context - Enhanced for cleaner model understanding
        if (window.portfolioData) {
            try {
                const raw = window.portfolioData;
                const actualHoldings = raw.holdings?.holdings || [];
                const actualTransactions = raw.transactions?.investment_transactions || [];
                const accounts = raw.holdings?.accounts || [];

                context.portfolioSummary = {
                    totalHoldingsValue: 0,
                    totalAccountBalances: 0,
                    holdingsCount: actualHoldings.length,
                    accounts: accounts.map(a => ({
                        name: a.name,
                        officialName: a.official_name,
                        type: a.type,
                        subtype: a.subtype,
                        balance: a.balances.current,
                        available: a.balances.available
                    })),
                    holdings: Array.isArray(actualHoldings) ? actualHoldings.map(h => ({
                        name: h?.security?.name || 'Unknown',
                        ticker: h?.security?.ticker_symbol || 'N/A',
                        value: (h?.quantity || 0) * (h?.institution_price || 0),
                        type: h?.security?.type || 'Other'
                    })) : [],
                    recentTransactions: Array.isArray(actualTransactions) ? actualTransactions.slice(0, 5).map(t => ({
                        date: t?.date || '',
                        name: t?.security?.name || 'Unknown',
                        type: t?.type || 'Other',
                        amount: t?.amount || 0
                    })) : []
                };

                // Calculate total values
                if (Array.isArray(actualHoldings)) {
                    actualHoldings.forEach(h => {
                        context.portfolioSummary.totalHoldingsValue += ((h?.quantity || 0) * (h?.institution_price || 0));
                    });
                }

                if (Array.isArray(accounts)) {
                    accounts.forEach(a => {
                        context.portfolioSummary.totalAccountBalances += (a.balances.current || 0);
                    });
                }

                context.portfolioSummary.totalPortfolioWealth = context.portfolioSummary.totalHoldingsValue + context.portfolioSummary.totalAccountBalances;
            } catch (pErr) {
                console.error('Context extraction failed', pErr);
                context.portfolioSummary = { error: 'Data link pending' };
            }
        }

        return context;
    }

    detectPageType() {
        const path = window.location.pathname;
        const search = window.location.search;
        const hash = window.location.hash;

        if (path.includes('crypto-detail')) return 'crypto-detail';
        if (path.includes('stocks')) return 'stocks';
        if (path.includes('commodities')) return 'commodities';
        if (path.includes('market-detail')) return 'market-detail';
        if (path.includes('ai-calculators')) return 'calculators';

        // More robust guide detection (checks path, search, and hash for 'id=')
        if (path.includes('guide-template') ||
            search.includes('id=') && path.includes('guide') ||
            hash.includes('id=') && path.includes('guide')) {
            return 'guide';
        }
        if (path.includes('blog-post')) return 'blog-post';
        return 'general';
    }

    initGuideAssistant() {
        const pageType = this.detectPageType();
        if (pageType !== 'guide' || this.guideInitialized) return;

        // Wait for page specific loader to finish (initGuideLoader in script.js)
        setTimeout(() => {
            const title = document.getElementById('guide-title')?.innerText || "this guide";

            // Auto open on guide pages regardless of history to ensure "the work" is done
            if (!this.isOpen) {
                this.toggleChat(true);
            }

            const msgId = this.appendMessage('assistant', `Hi there! I see you're reading **${title}**. How can I help you today?`);

            // Add suggested action buttons
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'suggested-actions';
            actionsDiv.innerHTML = `
                    <button class="action-pill" data-action="summarize">Summarize Guide</button>
                    <button class="action-pill" data-action="insights">More Insights</button>
                    <button class="action-pill" data-action="explain">Explain a Topic</button>
                `;

            const container = document.getElementById(msgId);
            if (container) {
                container.appendChild(actionsDiv);

                // Attach event listeners to pills
                actionsDiv.querySelectorAll('.action-pill').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const action = e.target.dataset.action;
                        this.handleGuideAction(action);
                        // Disable buttons after click
                        actionsDiv.style.pointerEvents = 'none';
                        actionsDiv.style.opacity = '0.7';
                    });
                });
            }
            this.guideInitialized = true;
        }, 1500);
    }

    initCoinAssistant() {
        const pageType = this.detectPageType();
        if (pageType !== 'crypto-detail' || this.coinInitialized) return;

        setTimeout(() => {
            const coinName = document.querySelector('.coin-hero h1')?.innerText || "this crypto";

            if (!this.isOpen) {
                this.toggleChat(true);
            }

            const msgId = this.appendMessage('assistant', `Hello! Analyzing **${coinName}** for you. What would you like to explore?`);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'suggested-actions';
            actionsDiv.innerHTML = `
                <button class="action-pill" data-action="signal">Quick Signal Check</button>
                <button class="action-pill" data-action="investment">Investment Analysis</button>
                <button class="action-pill" data-action="bias">Bias Check</button>
            `;

            const container = document.getElementById(msgId);
            if (container) {
                container.appendChild(actionsDiv);

                actionsDiv.querySelectorAll('.action-pill').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const action = e.target.dataset.action;
                        this.handleCoinAction(action);
                        actionsDiv.style.pointerEvents = 'none';
                        actionsDiv.style.opacity = '0.7';
                    });
                });
            }
            this.coinInitialized = true;
        }, 1500);
    }

    async handleCoinAction(action) {
        let prompt = "";
        const coinName = document.querySelector('.coin-hero h1')?.innerText || "this asset";

        if (action === 'signal') {
            prompt = `Give me a quick technical signal check for ${coinName}. What do the indicators say?`;
        } else if (action === 'investment') {
            prompt = `Provide a deep investment analysis for ${coinName}. Is it a good long-term hold?`;
        } else if (action === 'bias') {
            prompt = `Run a psychological bias check for ${coinName}. Are there any common traps like FOMO or FUD affecting sentiment right now?`;
        }

        if (prompt) {
            this.input.value = prompt;
            this.sendMessage();
        }
    }

    initStockAssistant() {
        const pageType = this.detectPageType();
        if (pageType !== 'market-detail' || this.stockInitialized) return;

        // Poll for the stock name to be loaded (Finnhub data is async)
        let attempts = 0;
        const maxAttempts = 15;
        const poll = setInterval(() => {
            attempts++;
            const heroH1 = document.querySelector('#market-hero h1');
            const stockName = heroH1?.innerText;
            if ((stockName && stockName.trim().length > 0) || attempts >= maxAttempts) {
                clearInterval(poll);
                const displayName = (stockName && stockName.trim().length > 0) ? stockName : "this stock";

                if (!this.isOpen) {
                    this.toggleChat(true);
                }

                const msgId = this.appendMessage('assistant', `Hello! Analyzing **${stockName}** for you. What would you like to explore?`);

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'suggested-actions';
                actionsDiv.innerHTML = `
                <button class="action-pill" data-action="signal">Quick Signal Check</button>
                <button class="action-pill" data-action="investment">Investment Analysis</button>
                <button class="action-pill" data-action="bias">Bias Check</button>
            `;

                const container = document.getElementById(msgId);
                if (container) {
                    container.appendChild(actionsDiv);

                    actionsDiv.querySelectorAll('.action-pill').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const action = e.target.dataset.action;
                            this.handleStockAction(action);
                            actionsDiv.style.pointerEvents = 'none';
                            actionsDiv.style.opacity = '0.7';
                        });
                    });
                }
                this.stockInitialized = true;
            }
        }, 2000);
    }

    async handleStockAction(action) {
        let prompt = "";
        const stockName = document.querySelector('#market-hero h1')?.innerText || "this stock";

        if (action === 'signal') {
            prompt = `Give me a quick technical signal check for ${stockName}. What do the key indicators like RSI, MACD, and moving averages say?`;
        } else if (action === 'investment') {
            prompt = `Provide a deep investment analysis for ${stockName}. Cover fundamentals, valuation, competitive position, and whether it's a good long-term hold.`;
        } else if (action === 'bias') {
            prompt = `Run a psychological bias check for ${stockName}. Are there any common traps like FOMO, anchoring bias, or herd mentality affecting sentiment right now?`;
        }

        if (prompt) {
            this.input.value = prompt;
            this.sendMessage();
        }
    }

    async handleGuideAction(action) {
        let prompt = "";
        const guideTitle = document.getElementById('guide-title')?.innerText || "the guide";

        if (action === 'summarize') {
            prompt = `Can you provide a clear and concise summary of the key takeaways from "${guideTitle}"?`;
        } else if (action === 'insights') {
            prompt = `What are the most deep or actionable insights found in "${guideTitle}"?`;
        } else if (action === 'explain') {
            prompt = `I'd like to understand the main concepts in "${guideTitle}" better. Can you explain the core topics in simple terms?`;
        }

        if (prompt) {
            this.input.value = prompt;
            this.sendMessage();
        }
    }

    initBlogAssistant() {
        const pageType = this.detectPageType();
        if (pageType !== 'blog-post' || this.blogInitialized) return;

        setTimeout(() => {
            const title = document.getElementById('post-title')?.innerText || "this article";

            if (!this.isOpen) {
                this.toggleChat(true);
            }

            const msgId = this.appendMessage('assistant', `Hi! Reading **${title}**? I can help you summarize it, find key insights, or dive deeper into the topics discussed here.`);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'suggested-actions';
            actionsDiv.innerHTML = `
                    <button class="action-pill" data-action="summarize">Summarize Post</button>
                    <button class="action-pill" data-action="insights">Key Insights</button>
                    <button class="action-pill" data-action="explore">Explore Topic</button>
                `;

            const container = document.getElementById(msgId);
            if (container) {
                container.appendChild(actionsDiv);

                actionsDiv.querySelectorAll('.action-pill').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const action = e.target.dataset.action;
                        this.handleBlogAction(action);
                        actionsDiv.style.pointerEvents = 'none';
                        actionsDiv.style.opacity = '0.7';
                    });
                });
            }
            this.blogInitialized = true;
        }, 1500);
    }

    async handleBlogAction(action) {
        let prompt = "";
        const blogTitle = document.getElementById('post-title')?.innerText || "the article";

        if (action === 'summarize') {
            prompt = `Can you provide a concise summary of the main points in "${blogTitle}"?`;
        } else if (action === 'insights') {
            prompt = `What are the most important or surprising insights from "${blogTitle}"?`;
        } else if (action === 'explore') {
            prompt = `I'd like to explore the core topics of "${blogTitle}" further. What else should I know about this?`;
        }

        if (prompt) {
            this.input.value = prompt;
            this.sendMessage();
        }
    }

    isFinanceQuery(text) {
        const keywords = ['price', 'market', 'stock', 'crypto', 'yahoo', 'bloomberg', 'google finance', 'live', 'now', 'today', 'news', 'earnings', 'fed', 'rate'];
        return keywords.some(k => text.toLowerCase().includes(k));
    }

    isDataInPulse(text) {
        // Symbols and common names we already track in getMarketPulse()
        const trackedNames = [
            'spy', 's&p', '500',
            'qqq', 'nasdaq',
            'gld', 'gold',
            'uso', 'oil',
            'eurusd', 'euro', 'forex',
            'coin', 'coinbase'
        ];

        const lowerText = text.toLowerCase();

        // If query is ONLY asking for a price of something we track, we don't need search
        const isBasicPriceQuery = (lowerText.includes('price') || lowerText.includes('value')) &&
            trackedNames.some(name => lowerText.includes(name));

        // If it's more complex (news, sentiment, specific details/tickers), we might still need search
        return isBasicPriceQuery && !lowerText.includes('news') && !lowerText.includes('why') && !lowerText.includes('sentiment');
    }

    triggerPatternHunt(contextData) {
        if (!this.isOpen) {
            this.toggleChat(true);
        }

        const { symbol, price, type } = contextData;
        const prompt = `
[PROSPEROUS PATTERN HUNTER ANALYSIS REQUEST]

Target Asset: ${symbol}
Current Price: ${price}
Market Type: ${type}

Please perform a deep technical analysis on the ${symbol} chart (assuming standard daily/4h structure) and provide a report following these EXACT steps:

1. **Identify Market Regime**:
   - Trending (Up/Down) / Ranging / Transitioning

2. **Detect Valid Patterns**:
   - Check for: Head & Shoulders, Double Top/Bottom, Triangles, Flags, Wedges, Channels, Cup & Handle.

3. **Extract Key Levels**:
   - Nearest Support & Resistance
   - Breakout / Breakdown Levels

4. **Define Bias**:
   - Bullish / Bearish / Neutral
   - Continuation or Reversal

5. **Define Invalidation**:
   - What price action invalidates this setup?

6. **Suggest Risk-Managed Trade Zones**:
   - Entry Zone
   - Stop-Loss Level
   - Take-Profit Targets (TP1: Conservative, TP2: Structure-based, TP3: Runner)

7. **Confidence Score (0-100)**:
   - Based on structure clarity, volatility, and trend quality.

CRITICAL: At the end of your response, you MUST provide a strictly formatted block for my dashboard system. Use EXACTLY this format:
[DASHBOARD_DATA]
SIDE: [BUY/SELL]
ENTRY: [Brief Price/Zone]
SL: [Brief Price]
TP: [Brief Targets]
CONFIDENCE: [Number only, 0-100]
[/DASHBOARD_DATA]

Provide the full analysis first, then this block.
        `.trim();

        // Send as a hidden message to keep UI clean
        this.sendMessage(prompt, true);
        this.appendMessage('system', `<strong>Pattern Hunter:</strong> Analyzing market structure for <em>${symbol}</em>...`);
    }

    extractAndNotifyPatternResults(text) {
        // 1. Try to find the [DASHBOARD_DATA] block first (Most reliable)
        const dataBlock = text.match(/\[DASHBOARD_DATA\]([\s\S]*?)\[\/DASHBOARD_DATA\]/i);

        let results = {
            side: "NEUTRAL",
            entry: "Seeking Value",
            stopLoss: "Strategic Exit",
            takeProfit: "Growth Targets",
            confidence: "N/A"
        };

        if (dataBlock && dataBlock[1]) {
            const blockText = dataBlock[1];
            results.side = blockText.match(/SIDE:\s*(BUY|SELL|LONG|SHORT|NEUTRAL)/i)?.[1]?.toUpperCase() || results.side;
            results.entry = blockText.match(/ENTRY:\s*(.*)/i)?.[1]?.trim() || results.entry;
            results.stopLoss = blockText.match(/SL:\s*(.*)/i)?.[1]?.trim() || results.stopLoss;
            results.takeProfit = blockText.match(/TP:\s*(.*)/i)?.[1]?.trim() || results.takeProfit;
            results.confidence = blockText.match(/CONFIDENCE:\s*(\d+)/i)?.[1] || results.confidence;
        } else {
            // 2. Fallback to flexible patterns if block missing
            const clean = (val) => {
                if (!val) return null;
                return val
                    .replace(/\*\*/g, '')
                    .replace(/^[#\-\*\s•]+/, '')
                    .split('\n')[0] // Take only first line for fallback
                    .trim();
            };

            const findMatch = (patternList) => {
                for (const p of patternList) {
                    const m = text.match(p);
                    if (m && m[1] && m[1].trim().length > 1) return clean(m[1]);
                }
                return null;
            };

            const patterns = {
                side: [/SIDE:\s*(BUY|SELL|LONG|SHORT|NEUTRAL)/i, /Bias:\s*(Bullish|Bearish|Neutral)/i, /Technical Bias:\s*(Bullish|Bearish|Neutral)/i],
                entry: [/\*\*Entry Zone\*\*:\s*([\s\S]*?)(?=\n|$)/i, /Entry Zone:\s*([\s\S]*?)(?=\n|$)/i],
                stopLoss: [/\*\*Stop-Loss Level\*\*:\s*([\s\S]*?)(?=\n|$)/i, /Stop-Loss:\s*([\s\S]*?)(?=\n|$)/i],
                takeProfit: [/\*\*Take-Profit Targets\*\*:\s*([\s\S]*?)(?=\n|$)/i, /Take-Profit:\s*([\s\S]*?)(?=\n|$)/i],
                confidence: [/\*\*Confidence Score\*\*:\s*(\d+)/i, /Confidence:\s*(\d+)/i]
            };

            results.side = findMatch(patterns.side) || results.side;
            results.entry = findMatch(patterns.entry) || results.entry;
            results.stopLoss = findMatch(patterns.stopLoss) || results.stopLoss;
            results.takeProfit = findMatch(patterns.takeProfit) || results.takeProfit;
            results.confidence = findMatch(patterns.confidence) || results.confidence;
        }

        // Standardize Side
        if (results.side.includes('BULL') || results.side.includes('LONG') || results.side.includes('BUY')) results.side = 'BUY';
        if (results.side.includes('BEAR') || results.side.includes('SHORT') || results.side.includes('SELL')) results.side = 'SELL';

        // Final UI Cleanup (remove any trailing markdown or symbols)
        const finalClean = (str) => typeof str === 'string' ? str.replace(/[\[\]\*]/g, '').trim() : str;
        results.entry = finalClean(results.entry);
        results.stopLoss = finalClean(results.stopLoss);
        results.takeProfit = finalClean(results.takeProfit);

        // Dispatch Custom Event
        window.dispatchEvent(new CustomEvent('prosporousPatternResult', { detail: results }));
    }


    async getMarketPulse() {
        // ...
        if (!window.fetchFinnhubData) return 'Live market feed initializing...';

        // Expanded list: Indices, Forex, Commodities, Bonds, Crypto
        // Using BINANCE: prefix for more reliable crypto data on Finnhub free tier
        const symbols = ['SPY', 'QQQ', 'GLD', 'USO', 'EURUSD', 'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'];

        try {
            const data = await window.fetchFinnhubData(symbols);
            if (!Array.isArray(data) || data.length === 0) {
                return 'Live market feeds currently syncing (data pending)...';
            }
            // Strip BINANCE: prefix for cleaner display in prompt
            return data.map(item => `${item.symbol.replace('BINANCE:', '')}: $${item.regularMarketPrice.toLocaleString()} (${(item.regularMarketChangePercent || 0).toFixed(2)}%)`).join(', ');
        } catch (e) {
            console.error('Pulse fetch failed', e);
            return 'Market data feed momentarily offline.';
        }
    }

    async getMarketNews() {
        if (!window.fetchGlobalNews) return 'Financial news wire syncing...';

        try {
            const news = await window.fetchGlobalNews();
            if (!Array.isArray(news) || news.length === 0) {
                return 'Financial news wire currently syncing...';
            }
            // Format top 3 headlines for prompt density
            return news.slice(0, 3).map(n => `- ${n.headline} (${n.source})`).join('\n');
        } catch (e) {
            console.error('News fetch failed', e);
            return 'Real-time headlines temporarily unavailable.';
        }
    }

    async sendMessage(overrideText = null, isHidden = false) {
        const text = overrideText !== null ? overrideText : this.input.value.trim();
        const imageBase64 = this.pendingImage;
        const hasImage = !!imageBase64;

        if (!text && !hasImage) return;

        // TEMPORARY — SARVAM FORCED ROUTING
        // When true, all AI calls go through the server-side Worker proxy (Sarvam active).
        // To restore direct OpenRouter: set USE_WORKER_AI_PROXY = false.
        const USE_WORKER_AI_PROXY = true;

        // Detect text-only query while still on vision model
        const defaultTextModel = 'google/gemma-3-27b-it:free';
        const visionModel = 'google/gemini-2.0-flash-exp:free';

        if (!hasImage && this.selectedModel === visionModel) {
            this.selectedModel = defaultTextModel;
            localStorage.setItem('prosporous_selected_model', defaultTextModel);
            if (this.modelSelect) this.modelSelect.value = defaultTextModel;
            this.appendMessage('system', `<strong>Reset:</strong> Switched to <em>Gemma 3 27B</em> for text analysis.`);
        }

        // Check for API Key before proceeding
        // TEMPORARY: Skip local key check when using Worker proxy (key lives server-side).
        if (!USE_WORKER_AI_PROXY && !this.apiKey) {
            if (!isHidden) this.appendMessage('user', text || 'Sent an image');
            this.input.value = '';
            this.input.style.height = 'auto';
            const msgId = this.appendLoadingMessage();
            setTimeout(() => {
                this.updateMessage(msgId, 'Please configure your **OpenRouter API Key** in the settings (gear icon) to start chatting.');
            }, 600);
            return;
        }

        // Clear input and pending image
        this.input.value = '';
        this.input.style.height = 'auto';
        this.clearPendingImage();

        // Add user message to UI (if not hidden)
        if (!isHidden) {
            this.appendMessage('user', text, imageBase64);
        }

        // Save to history (text only to maintain localStorage/payload limits)
        const historyText = text + (hasImage ? '\n\n[Image Uploaded]' : '');
        this.saveHistory('user', historyText);

        // UI Loading state
        const loadingId = this.appendLoadingMessage();

        // Safety timeout to prevent "forever loading"
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

        try {
            console.log('📝 Preparing AI context...');
            const pageContext = this.getPageContext();

            // Limit context size if needed
            console.log('🔍 Market data fetch...');
            const [marketPulse, marketNews] = await Promise.all([
                this.getMarketPulse().catch(() => 'Market data unavailable'),
                this.getMarketNews().catch(() => 'Headlines unavailable')
            ]);

            const searchContext = ""; // Web search is now handled server-side via Tavily (webMode flag)

            // Show searching indicator when web mode is ON
            if (this.isSearchEnabled) {
                this.updateLoadingMessage(loadingId, true);
            }

            // Simplify system prompt if image is present
            let systemPrompt = `You are Prosporous, an elite financial AI assistant.`;

            if (!hasImage) {
                systemPrompt += `\n\nCurrent Context:\n- Page: ${pageContext.title}\n- Time: ${pageContext.timestamp}\n- Prices: ${marketPulse}\n- News: ${marketNews}\n- Visible Screen Stats: ${JSON.stringify(pageContext.visibleStats)}\n${pageContext.portfolioSummary ? `- Full Backend Wealth Data: ${JSON.stringify(pageContext.portfolioSummary)}` : ''}\n${searchContext ? `- Search: ${searchContext}` : ''}\n\nData Interpretation Rules:\n1. Reconcile "Full Backend Wealth Data" with "Visible Screen Stats".\n2. Note that "Visible Screen Stats" only shows Market Value of holdings. Large "Account Balances" in the backend data typically represent Cash, Savings, or Brokerage Cash - these are IDENTIFIED assets, not missing data.\n3. Provide a unified assessment of both market holdings and cash balances.\n4. Jan 2026.`;
            } else {
                systemPrompt += ` Analyze image. Reference Jan 2026.`;
            }

            const userContent = [];
            const finalPrompt = text || (hasImage ? "Analyze this image." : "");
            if (finalPrompt) userContent.push({ type: 'text', text: finalPrompt });
            if (hasImage) {
                userContent.push({ type: 'image_url', image_url: { url: imageBase64 } });
            }

            // Build messages array — two separate paths for Sarvam vs OpenRouter.
            let messages;

            if (USE_WORKER_AI_PROXY) {
                // --- SARVAM PATH ---
                // Sarvam requirements:
                //   1. No "system" role — merge into the first user message.
                //   2. Turns must start with "user" and strictly alternate (user → assistant → user…).
                //   3. All content must be plain strings (no arrays).

                // Flatten history: only user/assistant roles, plain string content.
                const historyMsgs = this.getCurrentSessionMessages().slice(-10)
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .map(m => ({
                        role: m.role,
                        content: typeof m.content === 'string'
                            ? m.content
                            : (Array.isArray(m.content)
                                ? m.content.filter(p => p.type === 'text').map(p => p.text || '').join('\n').trim()
                                : String(m.content ?? ''))
                    }));

                // New user message content (plain string, image stripped with a note)
                const newUserText = hasImage
                    ? (text || '') + '\n[Note: User attempted to upload an image. Image analysis is unavailable via this provider.]'
                    : (finalPrompt || '');

                // Prepend system prompt into the very first user turn
                let allMsgs = [...historyMsgs, { role: 'user', content: newUserText }];

                // Find the first user message and prepend the system prompt to it
                const firstUserIdx = allMsgs.findIndex(m => m.role === 'user');
                if (firstUserIdx !== -1) {
                    allMsgs[firstUserIdx] = {
                        role: 'user',
                        content: `[System Instructions: ${systemPrompt}]\n\n${allMsgs[firstUserIdx].content}`
                    };
                }

                // Strip leading assistant messages (must start with user)
                while (allMsgs.length > 0 && allMsgs[0].role === 'assistant') {
                    allMsgs.shift();
                }

                // Enforce strict alternation: collapse consecutive same-role messages by merging content
                const deduplicated = [];
                for (const msg of allMsgs) {
                    if (deduplicated.length > 0 && deduplicated[deduplicated.length - 1].role === msg.role) {
                        // Merge into the previous message of the same role
                        deduplicated[deduplicated.length - 1].content += '\n' + msg.content;
                    } else {
                        deduplicated.push({ role: msg.role, content: msg.content });
                    }
                }

                messages = deduplicated;
            } else {
                // --- OPENROUTER PATH (unchanged) ---
                messages = [
                    { role: 'system', content: systemPrompt },
                    ...this.getCurrentSessionMessages().slice(-10).map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    { role: 'user', content: userContent }
                ];
            }

            let response;

            if (USE_WORKER_AI_PROXY) {
                // TEMPORARY — SARVAM FORCED ROUTING via Worker proxy.
                // The Worker decides which provider to use (currently Sarvam).
                // Model selection from UI is intentionally ignored at the Worker layer.
                console.log('📡 Sending to Worker AI proxy (Sarvam active)... webMode:', this.isSearchEnabled);
                response = await fetch(`${this.workerUrl}/ai/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messages: messages,
                        model: this.selectedModel,  // sent but overridden by Worker when Sarvam is active
                        webMode: this.isSearchEnabled  // controls server-side Tavily search
                    }),
                    signal: controller.signal
                });
            } else {
                // PRESERVED — Original OpenRouter direct call (dormant while USE_WORKER_AI_PROXY=true).
                // To restore: set USE_WORKER_AI_PROXY = false above.
                console.log('📡 Sending to OpenRouter...');
                response = await fetch(`${this.openRouterUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'Prosporous AI Widget',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: this.selectedModel,
                        messages: messages
                    }),
                    signal: controller.signal
                });
            }

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error('AI Provider Error:', errData);
                throw new Error(errData.error?.message || `API Error ${response.status}`);
            }

            const data = await response.json();
            if (!data.choices?.length) throw new Error('Invalid AI response');

            const aiText = data.choices[0].message.content || "...";
            // Update AI message with actual content
            this.updateMessage(loadingId, aiText);
            this.saveHistory('assistant', aiText);
            // Render sources from any retrieval tier (baseline finance OR enhanced web search).
            // Baseline retrieval runs automatically for finance queries even when web icon is OFF,
            // mirroring the old OpenRouter behavior. Enhanced runs additionally when web icon is ON.
            if (Array.isArray(data.sources) && data.sources.length > 0) {
                // Label: if all sources are baseline tier = "Sources"; if enhanced = "Web Sources"
                const hasEnhanced = data.sources.some(s => s.tier === 'enhanced');
                const label = hasEnhanced ? 'Web Sources' : 'Sources';
                console.log('[Sources] Rendering', data.sources.length, 'sources (label:', label + ')');
                let srcHtml = '<div class="prosporous-sources"><div class="prosporous-sources-label">' + escapeHtml(label) + '</div><ul class="prosporous-sources-list">';
                for (const s of data.sources) {
                    srcHtml += '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(s.title) + '</a></li>';
                }
                srcHtml += '</ul></div>';
                const msgEl = this.messagesContainer.querySelector('#' + CSS.escape(loadingId));
                if (msgEl) {
                    const tmpDiv = document.createElement('div');
                    tmpDiv.innerHTML = srcHtml;
                    msgEl.appendChild(tmpDiv.firstElementChild);
                }
            } else if (this.isSearchEnabled && (!data.sources || data.sources.length === 0)) {
                console.warn('[Sources] webMode=ON but worker returned no sources - Tavily may have failed or query was not finance-related');
            }

            // Handle Pattern Hunter Result Extraction
            if (isHidden && text.includes('[PROSPEROUS PATTERN HUNTER ANALYSIS REQUEST]')) {
                this.extractAndNotifyPatternResults(aiText);
                // Log the full prompt and AI response for analytics
                if (window.AnalyticsLogger) {
                    const symbolMatch = text.match(/Target Asset:\s*(.*)/);
                    const symbol = symbolMatch ? symbolMatch[1].trim() : 'Unknown';
                    window.AnalyticsLogger.logAIPrompt(symbol, text, aiText);
                }
            }

            if (hasImage && this.selectedModel === visionModel) {
                setTimeout(() => {
                    this.selectedModel = defaultTextModel;
                    localStorage.setItem('prosporous_selected_model', defaultTextModel);
                    if (this.modelSelect) this.modelSelect.value = defaultTextModel;
                    this.appendMessage('system', `Reset to text model.`);
                }, 1000);
            }

        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Final widget failure:', error);

            let errorMsg = "An unexpected error occurred.";
            if (error.name === 'AbortError') {
                errorMsg = "Request timed out. The AI model might be under heavy load. Please try again.";
            } else {
                errorMsg = this.mapErrorMessage(error.message);
            }

            const errorContainerId = 'error-' + Date.now();
            this.updateMessage(loadingId, `
                <div id="${errorContainerId}" class="error-container">
                    <div class="error-message">${errorMsg}</div>
                    ${this.generateRecoveryHtml(errorMsg)}
                </div>
            `);

            // Attach events for recovery buttons after a tiny delay to ensure DOM is ready
            setTimeout(() => {
                const container = document.getElementById(errorContainerId);
                if (container) {
                    const switchBtn = container.querySelector('.prosporous-recovery-btn');
                    if (switchBtn) {
                        switchBtn.addEventListener('click', () => {
                            const newModel = switchBtn.dataset.modelId;
                            if (newModel) {
                                this.selectedModel = newModel;
                                localStorage.setItem('prosporous_selected_model', newModel);
                                if (this.modelSelect) this.modelSelect.value = newModel;
                                this.appendMessage('system', `<strong>Switched:</strong> Now using <em>${switchBtn.dataset.modelName || newModel}</em>. Retrying...`);
                                // Retry the original text
                                this.sendMessage(text);
                            }
                        });
                    }
                }
            }, 100);
        }
    }

    generateRecoveryHtml(errorMsg) {
        const isModelIssue = errorMsg.includes('Limit') || errorMsg.includes('Quota') || errorMsg.includes('Unavailable') || errorMsg.includes('Rate');
        if (!isModelIssue || !this.models || this.models.length <= 1) return '';

        // Find a candidate that isn't the current one and is likely "active" or "popular"
        const others = this.models.filter(m => m.id !== this.selectedModel);
        if (others.length === 0) return '';

        // Prefer Gemma or Llama as reliable fallbacks
        const suggestion = others.find(m => m.id.includes('gemma') || m.id.includes('llama')) || others[0];
        const readableName = suggestion.name || suggestion.id.split('/')[1] || suggestion.id;

        return `
            <div class="prosporous-recovery-area">
                <button class="prosporous-recovery-btn" data-model-id="${suggestion.id}" data-model-name="${readableName}">
                    Try ${readableName} instead
                </button>
            </div>
        `;
    }

    mapErrorMessage(errorText) {
        if (!errorText) return "An unknown error occurred.";
        const lowerError = errorText.toLowerCase();

        if (lowerError.includes('google ai studio') && lowerError.includes('rate limit')) {
            return "<strong>Google AI Studio Limit:</strong> The shared free quota for this model is exhausted. Consider adding your own key in OpenRouter or switch models.";
        }

        if (lowerError.includes('no cookie auth credentials found') || lowerError.includes('unauthorized') || lowerError.includes('401')) {
            return "<strong>Invalid API Key:</strong> Please check your OpenRouter settings. Free models still require a valid (but empty) key usually, or your session may have expired.";
        }

        if (lowerError.includes('insufficient_quota') || lowerError.includes('credit')) {
            return "<strong>Quota/Limit Exceeded:</strong> Free models sometimes hit heavy load. Try again in a few minutes or switch to another free model.";
        }

        if (lowerError.includes('rate limit')) {
            return "<strong>Rate Limited:</strong> Please wait a moment. Free models have tighter limits.";
        }

        if (lowerError.includes('model not found') || lowerError.includes('404')) {
            return "<strong>Model Unavailable:</strong> The selected model might be temporarily offline. Try another free model in settings.";
        }

        return `Error: ${errorText}`;
    }

    async handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.appendMessage('system', 'Please select a valid image file.');
            return;
        }

        // Limit size to ~4MB for API efficiency
        if (file.size > 4 * 1024 * 1024) {
            this.appendMessage('system', 'Image too large. Please select an image under 4MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawBase64 = event.target.result;
            // Compress image to ensure it's under 512KB for maximum compatibility with free models
            try {
                this.pendingImage = await this.compressImage(rawBase64, 800, 800, 0.7);

                // Auto-switch to best vision model
                const visionModel = 'google/gemini-2.0-flash-exp:free';
                if (this.selectedModel !== visionModel) {
                    this.selectedModel = visionModel;
                    localStorage.setItem('prosporous_selected_model', visionModel);

                    if (this.modelSelect) {
                        // Check if option exists, if not, add it temporarily so selection works visually
                        let option = Array.from(this.modelSelect.options).find(opt => opt.value === visionModel);
                        if (!option) {
                            option = document.createElement('option');
                            option.value = visionModel;
                            option.textContent = 'Gemini 2.0 Flash (Experimental)';
                            this.modelSelect.appendChild(option);
                        }
                        this.modelSelect.value = visionModel;
                    }
                    this.appendMessage('system', `<strong>Auto-Switch:</strong> Switched to <em>Gemini 2.0 Flash</em> for best vision analysis.`);
                }

                this.renderImagePreview();
            } catch (err) {
                console.error('Compression failed', err);
                this.pendingImage = rawBase64; // Fallback to raw if compression fails
                this.renderImagePreview();
            }
        };
        reader.readAsDataURL(file);
    }

    async compressImage(base64, maxWidth, maxHeight, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // OpenRouter/Free models work best with moderate resolution JPEG/WebP
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
        });
    }

    renderImagePreview() {
        if (!this.pendingImage) {
            this.imagePreview.innerHTML = '';
            this.imagePreview.classList.add('hidden');
            return;
        }

        this.imagePreview.innerHTML = `
            <div class="preview-item">
                <img src="${this.pendingImage}" alt="Preview">
                <button class="remove-preview">&times;</button>
            </div>
        `;
        this.imagePreview.classList.remove('hidden');

        this.imagePreview.querySelector('.remove-preview').addEventListener('click', () => {
            this.clearPendingImage();
        });

        this.scrollToBottom();
    }

    clearPendingImage() {
        this.imagePreview.innerHTML = '';
        this.imagePreview.classList.add('hidden');
        this.updateSendButton();
    }

    // Creates a loading message with an animated dot indicator (bypasses formatContent/escapeHtml)
    appendLoadingMessage() {
        const div = document.createElement('div');
        div.className = 'message assistant';
        const id = 'msg-' + Date.now() + Math.random().toString(36).substr(2, 9);
        div.id = id;

        const indicator = document.createElement('span');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        div.appendChild(indicator);

        this.messagesContainer.appendChild(div);
        this.scrollToBottom();
        return id;
    }

    // Updates loading message dots (optionally adds 'search' style + label)
    updateLoadingMessage(id, isSearch = false) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        const indicator = document.createElement('span');
        indicator.className = isSearch ? 'typing-indicator search' : 'typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        el.appendChild(indicator);
        if (isSearch) {
            el.appendChild(document.createTextNode(' Searching the web...'));
        }
        this.scrollToBottom();
    }

    appendMessage(role, content, image) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        if (image) div.classList.add('has-image');

        // Use a simple random ID for updates
        const id = 'msg-' + Date.now() + Math.random().toString(36).substr(2, 9);
        div.id = id;

        let html = '';
        if (image) {
            html += `<div class="message-image"><img src="${image}" alt="User uploaded image"></div>`;
        }

        // Basic markdown parsing or text content
        // For safety, start with text content if not "system" containing tags
        if (role === 'user') {
            const textSpan = document.createElement('span');
            textSpan.textContent = content;
            html += textSpan.outerHTML;
        } else {
            // Allow basic HTML for assistant (like line breaks or typing indicator)
            // Ideally sanitize this in production
            html += this.formatContent(content);
        }

        div.innerHTML = html;

        this.messagesContainer.appendChild(div);
        this.scrollToBottom();
        return id;
    }

    updateMessage(id, newContent) {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = this.formatContent(newContent);
            this.scrollToBottom();
        }
    }

    formatContent(text) {
        if (!text) return '';

        let formatted = escapeHtml(text);

        // Headers
        formatted = formatted.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        // Basic Markdown
        // Bold: **text**
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic: *text*
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Bullet points: - text or * text
        formatted = formatted.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');

        // Wrap groups of <li> in <ul>
        // This is a simple regex-based parser, might need refinement for complex cases
        formatted = formatted.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
        // Cleanup redundant nested ULs
        formatted = formatted.replace(/<\/ul>\s*<ul>/g, '');

        // Convert newlines to <br> for HTML rendering 
        // We avoid adding <br> after block elements like </h1>, </h2>, </h3>, </ul> to keep spacing neat
        formatted = formatted.replace(/\n/g, (match, offset, string) => {
            const prevChar = string.substring(0, offset).trim().slice(-1);
            if (prevChar === '>') return ''; // Likely ended a tag
            return '<br>';
        });

        return formatted;
    }

    saveHistory(role, content) {
        const session = this.sessions.find(s => s.id === this.currentSessionId);
        if (!session) return;

        session.messages.push({ role, content, timestamp: Date.now() });

        // Auto-title if it's the first user message
        if (role === 'user' && (session.title === 'New Chat' || !session.title)) {
            session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
            this.renderHistoryList();
        }

        this.saveSessionsToStorage();
    }

    getCurrentSessionMessages() {
        const session = this.sessions.find(s => s.id === this.currentSessionId);
        return session ? session.messages : [];
    }

    renderCurrentSession() {
        this.messagesContainer.innerHTML = '';
        const messages = this.getCurrentSessionMessages();

        if (messages.length === 0) {
            this.appendMessage('system', 'Hello! I am Prosporous, your financial AI assistant. How can I help you today?');
        } else {
            messages.forEach(msg => {
                this.appendMessage(msg.role, msg.content);
            });
        }
    }

    renderHistoryList() {
        if (!this.historyList) return;
        this.historyList.innerHTML = '';

        // Only show sessions that have messages
        const activeSessions = this.sessions.filter(s => s.messages && s.messages.length > 0);

        activeSessions.forEach(session => {
            const item = document.createElement('div');
            item.className = `history-item ${session.id === this.currentSessionId ? 'active' : ''}`;
            item.innerHTML = `
                <div class="history-item-content">
                    <span class="history-item-title">${escapeHtml(session.title || 'New Chat')}</span>
                    <span class="history-item-date">${new Date(session.timestamp).toLocaleDateString()}</span>
                </div>
                <button class="history-item-delete" title="Delete Session">&times;</button>
            `;

            item.addEventListener('click', () => this.switchToSession(session.id));
            item.querySelector('.history-item-delete').addEventListener('click', (e) => this.deleteSession(session.id, e));

            this.historyList.appendChild(item);
        });
    }

    renderHistory() {
        // Obsolete, replaced by renderCurrentSession
        this.renderCurrentSession();
    }

    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    updateSendButton() {
        if (this.sendBtn) {
            const hasText = this.input && this.input.value.trim().length > 0;
            const hasImage = !!this.pendingImage;
            // TEMPORARY — SARVAM FORCED ROUTING
            // When proxy is active, API key lives server-side. Do not gate on local apiKey.
            // To restore original gating: set USE_WORKER_AI_PROXY_BTN = false.
            const USE_WORKER_AI_PROXY_BTN = true; // TEMPORARY — SARVAM FORCED ROUTING
            this.sendBtn.disabled = USE_WORKER_AI_PROXY_BTN
                ? (!hasText && !hasImage)
                : (!this.apiKey || (!hasText && !hasImage));
        }
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.prosporousWidget = new ProsporousWidget();

    // Global helper for opening the assistant
    window.openProsporous = (force) => {
        if (window.prosporousWidget) {
            window.prosporousWidget.toggleChat(force !== undefined ? force : true);
        }
    };
});
