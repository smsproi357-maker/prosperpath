/**
 * Clarity Box - Financial Sense-Making Engine
 * Conversation-based interface with history, web search, and follow-ups
 */

// ================== API Configuration ==================
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'zhipu/glm-4.5-air';
const DEFAULT_API_KEY = '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';
const TAVILY_API_KEY = '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';
const TAVILY_API_URL = 'https://api.tavily.com/search';

// ================== State ==================
let webSearchEnabled = false;
let isProcessing = false;
let currentPlaceholderIndex = 0;
let placeholderInterval;
let qaCounter = 0;

// ================== DOM Elements ==================
const elements = {
    landing: document.getElementById('clarity-landing'),
    conversation: document.getElementById('clarity-conversation'),
    conversationThread: document.getElementById('conversation-thread'),
    input: document.getElementById('clarity-input'),
    submit: document.getElementById('clarity-submit'),
    suggestions: document.getElementById('clarity-suggestions'),
    bottomBar: document.getElementById('clarity-bottom-bar'),
    bottomInput: document.getElementById('clarity-bottom-input'),
    bottomSubmit: document.getElementById('clarity-bottom-submit'),
    webToggleLanding: document.getElementById('clarity-web-toggle-landing'),
    webToggleBottom: document.getElementById('clarity-web-toggle-bottom'),
    historyBtn: document.getElementById('history-toggle-btn'),
    historySidebar: document.getElementById('history-sidebar'),
    historyOverlay: document.getElementById('history-overlay'),
    historyCloseBtn: document.getElementById('history-close-btn'),
    historyList: document.getElementById('history-list'),
    historyEmpty: document.getElementById('history-empty'),
    historyClearBtn: document.getElementById('history-clear-btn'),
    footer: document.getElementById('clarity-footer'),
};

// ================== Configuration ==================
const PLACEHOLDER_PROMPTS = [
    "How does inflation affect my savings long-term?",
    "What forces drive stock market volatility?",
    "Should I prioritize retirement savings or paying off debt?",
    "How does compound interest really work over decades?",
    "What's the real cost of waiting to invest?",
    "How do interest rates impact my portfolio?",
    "What role does diversification actually play?"
];

const THINKING_PROMPTS = [
    "What if I start investing $500/month at age 30?",
    "How do recessions typically affect different asset classes?",
    "What forces drive cryptocurrency volatility?",
    "Should I rent forever or buy a home?",
    "How does dollar-cost averaging protect me?"
];

// ================== JSON Extraction ==================
function extractJSON(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/{[\s\S]*}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1] || jsonMatch[0]);
            } catch (innerE) {
                console.error("Failed to parse extracted JSON:", innerE);
            }
        }
        throw new Error("MALFORMED_JSON");
    }
}

// ================== Tavily Web Search ==================
async function fetchTavilyResults(query) {
    try {
        console.log("[Tavily] Fetching web results for:", query);
        const response = await fetch(TAVILY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: query,
                search_depth: 'advanced',
                include_answer: true,
                max_results: 5
            })
        });

        if (!response.ok) {
            console.warn("[Tavily] Search failed:", response.status);
            return null;
        }

        const data = await response.json();
        console.log("[Tavily] Got", data.results?.length, "results");
        return data;
    } catch (error) {
        console.warn("[Tavily] Search error:", error);
        return null;
    }
}

function formatTavilyContext(tavilyData) {
    if (!tavilyData) return '';

    let context = '\n\n--- WEB SEARCH RESULTS (use these for more accurate, up-to-date information) ---\n';

    if (tavilyData.answer) {
        context += `\nQuick Answer: ${tavilyData.answer}\n`;
    }

    if (tavilyData.results && tavilyData.results.length > 0) {
        context += '\nSources:\n';
        tavilyData.results.forEach((r, i) => {
            context += `${i + 1}. [${r.title}] ${r.content?.substring(0, 300) || ''}\n   URL: ${r.url}\n`;
        });
    }

    context += '--- END WEB RESULTS ---\n';
    return context;
}

// ================== AI Fetch ==================
async function fetchClarityMap(query, useWebSearch = false) {
    let apiKey = localStorage.getItem('prosporous_api_key') || DEFAULT_API_KEY;

    if (apiKey === 'null' || apiKey === 'undefined' || !apiKey.trim()) {
        apiKey = DEFAULT_API_KEY;
    }
    apiKey = apiKey.trim();

    if (!apiKey) throw new Error("API_KEY_MISSING");

    let webContext = '';
    if (useWebSearch) {
        const tavilyData = await fetchTavilyResults(query);
        webContext = formatTavilyContext(tavilyData);
    }

    const systemPrompt = `You are the ProsperPath Clarity Engine, an elite financial sense-making AI. 
Provide a deep, structured analysis for the following user query. 
Your tone must be calm, minimal, premium, and intelligent.
${webContext}

CRITICAL: You MUST respond ONLY with a valid JSON object. Do not include any other text.
The JSON structure must be EXACTLY:
{
  "framing": "HTML-formatted string (use <p> and <strong>) providing context for the question.",
  "forces": [
    {"title": "Name of force", "desc": "Brief explanation"},
    ... (at least 3-4 forces)
  ],
  "timeImpact": {
    "1": "Impact over 1 year",
    "2": "Impact over 5 years",
    "3": "Impact over 10 years",
    "4": "Impact over 20+ years"
  },
  "risks": [
    {"type": "Risk" or "Tradeoff", "title": "Brief title", "desc": "Concise detail"},
    ... (at least 3-4 items)
  ],
  "scenarios": [
    {"type": "optimistic", "title": "Scenario name", "desc": "Short description"},
    {"type": "balanced", "title": "Scenario name", "desc": "Short description"},
    {"type": "pessimistic", "title": "Scenario name", "desc": "Short description"}
  ],
  "nextSteps": [
    "Actionable step 1",
    "Actionable step 2",
    "Actionable step 3",
    "Actionable step 4"
  ]
}

Ensure the content is specific to the query: "${query}"`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 45000);

    try {
        const selectedModel = localStorage.getItem('prosporous_selected_model') || DEFAULT_MODEL;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin || 'https://prosperpath.ai',
                'X-Title': 'ProsperPath Clarity Box',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API Error: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error?.message || errorMessage;
            } catch (e) { }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0]) throw new Error("EMPTY_RESPONSE");

        return extractJSON(data.choices[0].message.content);
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error("The request timed out. Please try again.");
        }
        throw error;
    }
}

// ================== History Management ==================
function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('clarity_history') || '[]');
    } catch (e) {
        return [];
    }
}

function saveToHistory(query, data, usedWebSearch) {
    const history = getHistory();
    history.unshift({
        id: Date.now(),
        query: query,
        data: data,
        usedWebSearch: usedWebSearch,
        timestamp: new Date().toISOString()
    });
    // Keep only last 50 entries
    if (history.length > 50) history.length = 50;
    localStorage.setItem('clarity_history', JSON.stringify(history));
    updateHistoryBadge();
}

function clearHistory() {
    localStorage.removeItem('clarity_history');
    renderHistoryList();
    updateHistoryBadge();
}

function updateHistoryBadge() {
    const count = getHistory().length;
    const existingBadge = elements.historyBtn.querySelector('.history-badge');
    if (existingBadge) existingBadge.remove();

    if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'history-badge';
        badge.textContent = count > 9 ? '9+' : count;
        elements.historyBtn.appendChild(badge);
    }
}

function renderHistoryList() {
    const history = getHistory();

    if (history.length === 0) {
        elements.historyEmpty.style.display = 'block';
        // Remove all items but keep the empty message
        const items = elements.historyList.querySelectorAll('.history-item');
        items.forEach(item => item.remove());
        return;
    }

    elements.historyEmpty.style.display = 'none';
    // Clear old items
    const oldItems = elements.historyList.querySelectorAll('.history-item');
    oldItems.forEach(item => item.remove());

    history.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const timeStr = formatTimeAgo(new Date(entry.timestamp));
        const webBadge = entry.usedWebSearch ? ' 🌐' : '';

        item.innerHTML = `
            <span class="history-item-question">${escapeHtml(entry.query)}${webBadge}</span>
            <span class="history-item-time">${timeStr}</span>
        `;

        item.addEventListener('click', () => {
            closeHistorySidebar();
            restoreFromHistory(entry);
        });

        elements.historyList.appendChild(item);
    });
}

function restoreFromHistory(entry) {
    // Switch to conversation view
    elements.landing.classList.add('hidden');
    elements.conversation.classList.remove('hidden');
    elements.bottomBar.classList.remove('hidden');
    if (elements.footer) elements.footer.classList.add('hidden');

    // Append the Q&A block
    appendQABlock(entry.query, entry.data, entry.usedWebSearch);
}

function formatTimeAgo(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ================== History Sidebar Toggle ==================
function openHistorySidebar() {
    renderHistoryList();
    elements.historySidebar.classList.add('active');
    elements.historyOverlay.classList.add('active');
}

function closeHistorySidebar() {
    elements.historySidebar.classList.remove('active');
    elements.historyOverlay.classList.remove('active');
}

// ================== Q&A Block Rendering ==================
function createLoadingBlock(query, usedWebSearch) {
    qaCounter++;
    const blockId = `qa-block-${qaCounter}`;

    const block = document.createElement('div');
    block.className = 'qa-block';
    block.id = blockId;

    const webBadge = usedWebSearch ? '<span class="qa-web-badge">🌐 Web Enhanced</span>' : '';

    block.innerHTML = `
        <div class="qa-question">
            <span class="qa-question-icon">Q</span>
            <span class="qa-question-text">${escapeHtml(query)}${webBadge}</span>
        </div>
        <div class="qa-answer">
            <div class="qa-loading">
                <div class="qa-loading-bar"></div>
                <div class="qa-loading-bar"></div>
                <div class="qa-loading-bar"></div>
                <div class="qa-loading-bar"></div>
            </div>
        </div>
    `;

    return { block, blockId };
}

function appendQABlock(query, data, usedWebSearch) {
    qaCounter++;
    const blockId = `qa-block-${qaCounter}`;

    const block = document.createElement('div');
    block.className = 'qa-block';
    block.id = blockId;

    const webBadge = usedWebSearch ? '<span class="qa-web-badge">🌐 Web Enhanced</span>' : '';

    block.innerHTML = `
        <div class="qa-question">
            <span class="qa-question-icon">Q</span>
            <span class="qa-question-text">${escapeHtml(query)}${webBadge}</span>
        </div>
        <div class="qa-answer">
            ${buildClarityMapHTML(data, blockId)}
        </div>
        <hr class="qa-divider">
    `;

    elements.conversationThread.appendChild(block);

    // Attach time slider listener
    const slider = block.querySelector('.time-slider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            const timeContent = block.querySelector('.time-impact-content');
            if (timeContent && data.timeImpact) {
                timeContent.innerHTML = `<p>${data.timeImpact[e.target.value]}</p>`;
            }
        });
    }

    // Attach next-step click listeners
    block.querySelectorAll('.next-item').forEach(item => {
        item.addEventListener('click', () => {
            const step = item.dataset.step;
            if (step) {
                elements.bottomInput.value = step;
                elements.bottomInput.focus();
            }
        });
    });

    // Scroll to the new block
    setTimeout(() => {
        block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    return blockId;
}

function populateLoadingBlock(blockId, query, data, usedWebSearch) {
    const block = document.getElementById(blockId);
    if (!block) return;

    const answerDiv = block.querySelector('.qa-answer');
    if (!answerDiv) return;

    answerDiv.innerHTML = buildClarityMapHTML(data, blockId);

    // Add divider
    const divider = document.createElement('hr');
    divider.className = 'qa-divider';
    block.appendChild(divider);

    // Attach time slider listener
    const slider = block.querySelector('.time-slider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            const timeContent = block.querySelector('.time-impact-content');
            if (timeContent && data.timeImpact) {
                timeContent.innerHTML = `<p>${data.timeImpact[e.target.value]}</p>`;
            }
        });
    }

    // Attach next-step click listeners
    block.querySelectorAll('.next-item').forEach(item => {
        item.addEventListener('click', () => {
            const step = item.dataset.step;
            if (step) {
                elements.bottomInput.value = step;
                elements.bottomInput.focus();
            }
        });
    });

    // Scroll the answer into view
    setTimeout(() => {
        block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function buildClarityMapHTML(data, blockId) {
    const forcesHTML = (data.forces || []).map(f => `
        <div class="force-card">
            <div class="force-title">${f.title}</div>
            <div class="force-desc">${f.desc}</div>
        </div>
    `).join('');

    const risksHTML = (data.risks || []).map(r => `
        <div class="risk-card">
            <div class="risk-type">${r.type}</div>
            <div class="risk-title">${r.title}</div>
            <div class="risk-desc">${r.desc}</div>
        </div>
    `).join('');

    const scenariosHTML = (data.scenarios || []).map(s => `
        <div class="scenario-card scenario-${s.type}">
            <div class="scenario-label">${s.type}</div>
            <div class="scenario-title">${s.title}</div>
            <div class="scenario-desc">${s.desc}</div>
        </div>
    `).join('');

    const nextStepsHTML = (data.nextSteps || []).map((step, i) => `
        <div class="next-item" data-step="${escapeHtml(step)}">
            <span class="next-number">${i + 1}</span>
            <span class="next-text">${step}</span>
        </div>
    `).join('');

    const timeImpactValue = data.timeImpact ? (data.timeImpact['2'] || '') : '';

    return `
        <!-- Framing -->
        <section class="clarity-section">
            <div class="section-label">
                <span class="label-icon">🎯</span>
                <span class="label-text">Framing</span>
            </div>
            <div class="section-content">${data.framing || ''}</div>
        </section>

        <!-- Forces at Play -->
        <section class="clarity-section">
            <div class="section-label">
                <span class="label-icon">⚡</span>
                <span class="label-text">Forces at Play</span>
            </div>
            <div class="section-content forces-grid">${forcesHTML}</div>
        </section>

        <!-- Time Horizon Impact -->
        <section class="clarity-section">
            <div class="section-label">
                <span class="label-icon">⏱️</span>
                <span class="label-text">Time Horizon Impact</span>
            </div>
            <div class="section-content">
                <div class="time-slider-wrapper">
                    <div class="time-labels">
                        <span>1 Year</span>
                        <span>5 Years</span>
                        <span>10 Years</span>
                        <span>20+ Years</span>
                    </div>
                    <input type="range" min="1" max="4" value="2" class="time-slider">
                </div>
                <div class="time-impact-content"><p>${timeImpactValue}</p></div>
            </div>
        </section>

        <!-- Risks & Tradeoffs -->
        <section class="clarity-section">
            <div class="section-label">
                <span class="label-icon">⚠️</span>
                <span class="label-text">Risks & Tradeoffs</span>
            </div>
            <div class="section-content risks-grid">${risksHTML}</div>
        </section>

        <!-- Scenarios -->
        <section class="clarity-section">
            <div class="section-label">
                <span class="label-icon">🔮</span>
                <span class="label-text">Scenarios</span>
                <span class="label-note">(not predictions)</span>
            </div>
            <div class="section-content scenarios-grid">${scenariosHTML}</div>
        </section>

        <!-- What to Think About Next -->
        <section class="clarity-section">
            <div class="section-label">
                <span class="label-icon">🧭</span>
                <span class="label-text">What to Think About Next</span>
            </div>
            <div class="section-content next-steps">${nextStepsHTML}</div>
        </section>
    `;
}

// ================== Core: Ask a Question ==================
async function askQuestion(query) {
    if (!query || !query.trim() || isProcessing) return;
    query = query.trim();
    isProcessing = true;

    console.log("[ClarityUI] askQuestion:", query, "webSearch:", webSearchEnabled);

    // Switch to conversation view
    elements.landing.classList.add('hidden');
    elements.conversation.classList.remove('hidden');
    elements.bottomBar.classList.remove('hidden');
    if (elements.footer) elements.footer.classList.add('hidden');

    // Create loading block
    const { block, blockId } = createLoadingBlock(query, webSearchEnabled);
    elements.conversationThread.appendChild(block);

    // Scroll to loading block
    setTimeout(() => {
        block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // Disable inputs
    setBottomBarLoading(true);

    try {
        const data = await fetchClarityMap(query, webSearchEnabled);
        if (!data) throw new Error("No data returned from analytical engine.");

        populateLoadingBlock(blockId, query, data, webSearchEnabled);

        // Save to history
        saveToHistory(query, data, webSearchEnabled);

    } catch (error) {
        console.error("[ClarityUI] Error:", error);
        handleClarityError(error);
        // Remove the failed loading block
        const failedBlock = document.getElementById(blockId);
        if (failedBlock) failedBlock.remove();

        // If no blocks left, go back to landing
        if (elements.conversationThread.children.length === 0) {
            elements.landing.classList.remove('hidden');
            elements.conversation.classList.add('hidden');
            elements.bottomBar.classList.add('hidden');
            if (elements.footer) elements.footer.classList.remove('hidden');
        }
    } finally {
        isProcessing = false;
        setBottomBarLoading(false);
        elements.bottomInput.value = '';
        elements.bottomInput.focus();
    }
}

function setBottomBarLoading(loading) {
    if (loading) {
        elements.bottomSubmit.innerHTML = '<span class="cb-spinner"></span>';
        elements.bottomSubmit.disabled = true;
        elements.bottomInput.disabled = true;
    } else {
        elements.bottomSubmit.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>`;
        elements.bottomSubmit.disabled = false;
        elements.bottomInput.disabled = false;
    }
}

// ================== Error Handling ==================
function handleClarityError(error) {
    let message = "Something went wrong while synthesizing clarity.";
    if (error.message === "API_KEY_MISSING") {
        message = "Please configure your <strong>OpenRouter API Key</strong> in the settings to use Clarity Box.";
    } else if (error.message === "MALFORMED_JSON") {
        message = "The AI returned an invalid format. Please try rephrasing your question.";
    } else if (error.message.includes("429")) {
        message = "Rate limit exceeded. Please wait a moment and try again.";
    } else if (error.message.includes("timed out")) {
        message = "The synthesis took too long. Please check your connection and try again.";
    } else {
        message = `Synthesis failed: ${error.message.substring(0, 80)}${error.message.length > 80 ? '...' : ''}`;
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'cb-error-toast';
    errorDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; font-family: sans-serif;">
            <span>${message}</span>
            <button onclick="this.closest('.cb-error-toast').remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">Dismiss</button>
        </div>
    `;
    document.body.appendChild(errorDiv);

    setTimeout(() => {
        errorDiv.classList.add('fade-out');
        setTimeout(() => errorDiv.remove(), 500);
    }, 8000);
}

// ================== Web Toggle ==================
function toggleWebSearch() {
    webSearchEnabled = !webSearchEnabled;

    // Sync both toggle buttons
    [elements.webToggleLanding, elements.webToggleBottom].forEach(btn => {
        if (btn) {
            if (webSearchEnabled) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    console.log("[Clarity] Web search:", webSearchEnabled ? "ON" : "OFF");
}

// ================== Placeholder Rotation ==================
function rotatePlaceholder() {
    if (!elements.input) return;
    elements.input.classList.add('placeholder-fade');
    setTimeout(() => {
        currentPlaceholderIndex = (currentPlaceholderIndex + 1) % PLACEHOLDER_PROMPTS.length;
        elements.input.placeholder = PLACEHOLDER_PROMPTS[currentPlaceholderIndex];
        elements.input.classList.remove('placeholder-fade');
    }, 200);
}

function startPlaceholderRotation() {
    placeholderInterval = setInterval(rotatePlaceholder, 4000);
}

function stopPlaceholderRotation() {
    clearInterval(placeholderInterval);
}

// ================== Dynamic Suggestions ==================
function updateSuggestions(inputValue) {
    if (!inputValue.trim()) {
        elements.suggestions.innerHTML = THINKING_PROMPTS.slice(0, 3).map((prompt, i) => `
            <div class="suggestion-item" data-query="${escapeHtml(prompt)}">
                <span class="suggestion-icon">${['💡', '📊', '⚖️'][i]}</span>
                <span>${prompt}</span>
            </div>
        `).join('');
        attachSuggestionListeners();
        return;
    }

    const filtered = [...PLACEHOLDER_PROMPTS, ...THINKING_PROMPTS]
        .filter(p => p.toLowerCase().includes(inputValue.toLowerCase()))
        .slice(0, 3);

    if (filtered.length > 0) {
        elements.suggestions.innerHTML = filtered.map((prompt, i) => `
            <div class="suggestion-item" data-query="${escapeHtml(prompt)}">
                <span class="suggestion-icon">${['🔍', '💡', '📊'][i]}</span>
                <span>${prompt}</span>
            </div>
        `).join('');
        attachSuggestionListeners();
    }
}

function attachSuggestionListeners() {
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const query = item.dataset.query;
            if (elements.input) elements.input.value = query;
            askQuestion(query);
        });
    });
}

// ================== Event Listeners ==================
function initEventListeners() {
    // Landing submit button
    elements.submit?.addEventListener('click', () => {
        askQuestion(elements.input.value);
    });

    // Landing Enter key
    elements.input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') askQuestion(elements.input.value);
    });

    // Bottom bar submit
    elements.bottomSubmit?.addEventListener('click', () => {
        askQuestion(elements.bottomInput.value);
    });

    // Bottom bar Enter key
    elements.bottomInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') askQuestion(elements.bottomInput.value);
    });

    // Web toggle buttons
    elements.webToggleLanding?.addEventListener('click', toggleWebSearch);
    elements.webToggleBottom?.addEventListener('click', toggleWebSearch);

    // History sidebar
    elements.historyBtn?.addEventListener('click', openHistorySidebar);
    elements.historyCloseBtn?.addEventListener('click', closeHistorySidebar);
    elements.historyOverlay?.addEventListener('click', closeHistorySidebar);
    elements.historyClearBtn?.addEventListener('click', () => {
        clearHistory();
    });

    // Suggestion clicks
    attachSuggestionListeners();

    // Placeholder rotation
    elements.input?.addEventListener('focus', stopPlaceholderRotation);
    elements.input?.addEventListener('blur', () => {
        if (!elements.input.value) startPlaceholderRotation();
    });

    // Dynamic suggestions
    elements.input?.addEventListener('input', (e) => {
        updateSuggestions(e.target.value);
    });
}

// ================== URL Query Handling ==================
function checkUrlQuery() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (query) {
        elements.input.value = query;
        askQuestion(query);
    }
}

// ================== Initialize ==================
function init() {
    startPlaceholderRotation();
    initEventListeners();
    updateHistoryBadge();
    checkUrlQuery();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
