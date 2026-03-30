/* ============================================================
   PROSPERPATH INTERACTIVE DEMO — Central Controller
   Single source of truth for all demo state and step logic.
   Depends on: guided-demo-overlay.js (PPDemoOverlay)
   ============================================================ */

(function () {
  'use strict';

  // Prevent double-init
  if (window.ProsperDemo && window.ProsperDemo._initialized) return;

  // ── Storage Key ──────────────────────────────────────────
  const STORAGE_KEY = 'pp_demo_state';

  // ── State ────────────────────────────────────────────────
  const _state = {
    appMode: 'normal',          // "normal" | "guidedWalkthrough" | "guidedSandbox" | "sandboxFreeExplore"
    currentStage: null,         // 1 or 2
    currentStepIndex: -1,
    pendingSandboxStep2: false,
    pendingMarketMechanicsStep: false,
    freeExploreStartTime: null,
    accountPromptShown: false,
    _initialized: true
  };

  // ── Persist / Restore State ──────────────────────────────
  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        appMode: _state.appMode,
        currentStage: _state.currentStage,
        currentStepIndex: _state.currentStepIndex,
        pendingSandboxStep2: _state.pendingSandboxStep2,
        pendingMarketMechanicsStep: _state.pendingMarketMechanicsStep,
        freeExploreStartTime: _state.freeExploreStartTime,
        accountPromptShown: _state.accountPromptShown
      }));
    } catch (e) { /* private browsing fallback */ }
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(_state, saved);
        console.log('[Demo] State restored:', _state.appMode);
      }
    } catch (e) { /* ignore */ }
  }

  function clearState() {
    _state.appMode = 'normal';
    _state.currentStage = null;
    _state.currentStepIndex = -1;
    _state.pendingSandboxStep2 = false;
    _state.pendingMarketMechanicsStep = false;
    _state.freeExploreStartTime = null;
    _state.accountPromptShown = false;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* */ }
  }

  // ── Step Configurations ──────────────────────────────────

  const STAGE1_STEPS = [
    {
      id: 's1-1',
      target: '[data-demo-card="backtest"]',
      title: 'Backtest',
      body: 'Test strategies against historical markets and see how they would have performed.',
      spotlightOptions: { paddingX: 12, paddingY: 12, borderRadius: 16 }
    },
    {
      id: 's1-2',
      target: '[data-demo-card="pattern-hunter"]',
      title: 'Pattern Hunter',
      body: 'Detect repeatable patterns and setups across markets.',
      spotlightOptions: { paddingX: 12, paddingY: 12, borderRadius: 16 }
    },
    {
      id: 's1-3',
      target: '[data-demo-card="market-intelligence"]',
      title: 'Market Intelligence',
      body: 'Understand what the market is actually doing beneath the surface.',
      spotlightOptions: { paddingX: 12, paddingY: 12, borderRadius: 16 }
    },
    {
      id: 's1-4',
      target: '[data-demo-card="portfolio"]',
      title: 'Portfolio',
      body: 'Track assets and understand your exposure across markets.',
      spotlightOptions: { paddingX: 12, paddingY: 12, borderRadius: 16 }
    },
    {
      id: 's1-5',
      target: '[data-demo-card="clarity-box"]',
      title: 'Clarity Box',
      body: 'Ask questions and get structured explanations instantly.',
      spotlightOptions: { paddingX: 12, paddingY: 12, borderRadius: 16 }
    }
  ];

  // ── Free-Explore Timer ───────────────────────────────────
  let _accountPromptTimer = null;

  function startAccountPromptTimer() {
    if (_accountPromptTimer) return;
    const delay = (3 + Math.random() * 2) * 60 * 1000; // 3–5 min
    console.log(`[Demo] Account prompt timer set: ${Math.round(delay / 1000)}s`);

    _accountPromptTimer = setTimeout(() => {
      if (_state.appMode === 'sandboxFreeExplore' && !_state.accountPromptShown) {
        showAccountPrompt();
      }
    }, delay);
  }

  function clearAccountPromptTimer() {
    if (_accountPromptTimer) {
      clearTimeout(_accountPromptTimer);
      _accountPromptTimer = null;
    }
  }

  // ── Nav target resolution helpers ────────────────────────

  function findVisibleNavLinks() {
    const all = document.querySelectorAll('.nav-links a, #nav-links a');
    const visible = [];
    for (const a of all) {
      // Skip dropdown children
      if (a.closest('.dropdown-panel')) continue;
      // Use getBoundingClientRect for reliable visibility detection
      // (offsetParent is null inside position:fixed headers, making it unreliable)
      const rect = a.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      visible.push(a);
    }
    return visible;
  }

  function findNavLinkByText(text) {
    const links = findVisibleNavLinks();
    const normalized = text.trim().toUpperCase();
    // Primary match: normalized text includes the keyword
    for (const a of links) {
      const linkText = a.textContent.trim().toUpperCase();
      if (linkText.includes(normalized)) return a;
    }
    // Fallback: href match
    for (const a of links) {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (normalized === 'CLARITY BOX' && href.includes('clarity-box')) return a;
      if (normalized === 'MARKET MECHANICS' && href.includes('market-mechanics')) return a;
      if (normalized === 'PORTFOLIO' && href.includes('portfolio')) return a;
    }
    return null;
  }

  // ── Module target resolution for Market Mechanics ────────

  function findModuleCards() {
    // Look for module cards on market-mechanics.html
    const cards = document.querySelectorAll('.mm-module-card');
    const d1m1 = [];
    const d2entry = [];

    for (const card of cards) {
      const text = card.textContent || '';
      const numEl = card.querySelector('.mm-module-num');
      const numText = numEl ? numEl.textContent.trim() : '';

      if (numText.includes('1.1') || text.includes('What Markets Actually Are')) {
        d1m1.push(card);
      }
    }

    // Domain II entry card
    const allCards = document.querySelectorAll('.mm-card');
    for (const card of allCards) {
      const title = card.querySelector('.mm-card-title');
      if (title && title.textContent.trim().toLowerCase().includes('market context')) {
        d2entry.push(card);
      }
    }

    return { d1m1: d1m1[0] || null, d2entry: d2entry[0] || null };
  }

  // ═══════════════════════════════════════════════════════════
  //  STAGE 1 — GUIDED WALKTHROUGH (homepage)
  // ═══════════════════════════════════════════════════════════

  function startDemo() {
    console.log('[Demo] Starting demo...');
    _state.appMode = 'guidedWalkthrough';
    _state.currentStage = 1;
    _state.currentStepIndex = -1;
    saveState();

    PPDemoOverlay.showExitButton(exitDemo);

    // Show intro panel
    PPDemoOverlay.showPanel({
      icon: '⚡',
      title: 'ProsperPath Interactive Demo',
      body: 'This is a guided preview of the platform.\nYou will see how markets actually work.',
      secondaryText: 'Demo time: ~2 minutes',
      buttons: [
        { label: 'Begin Demo', primary: true, onClick: () => { PPDemoOverlay.hidePanel(); beginStage1(); } },
        { label: 'Cancel', ghost: true, onClick: exitDemo }
      ]
    });
  }

  function beginStage1() {
    console.log('[Demo] Begin Stage 1');
    _state.currentStepIndex = 0;
    saveState();
    showStage1Step(0);
  }

  // ── Hero card activation helpers ─────────────────────────

  function clearHeroCardActive() {
    document.querySelectorAll('.mock-panel').forEach(el => {
      el.classList.remove('demo-active', 'depth-active', 'depth-inactive');
    });
  }

  function activateHeroCard(targetSelector) {
    clearHeroCardActive();
    const card = document.querySelector(targetSelector);
    if (card) {
      card.classList.add('demo-active');
      // Apply depth effect to siblings during demo
      document.querySelectorAll('.mock-panel').forEach(el => {
        if (el !== card) {
          el.classList.add('depth-inactive');
        }
      });
    }
  }

  function showStage1Step(index) {
    if (index < 0 || index >= STAGE1_STEPS.length) return;

    const step = STAGE1_STEPS[index];
    _state.currentStepIndex = index;
    saveState();

    console.log(`[Demo] Stage 1 Step ${index + 1}: ${step.title}`);

    // Resolve the target hero card
    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
      const cardName = step.target.replace('[data-demo-card="', '').replace('"]', '');
      console.warn(`[Demo] Stage 1 target not found: ${cardName}`);
    }

    // Activate the current hero card (pop-forward using existing hover behavior)
    activateHeroCard(step.target);

    // Ensure hero section is visible — only minimal scroll, do NOT scroll to lower sections
    const heroSection = document.getElementById('hero');
    if (heroSection) {
      const heroRect = heroSection.getBoundingClientRect();
      if (heroRect.top < -100 || heroRect.bottom < 200) {
        heroSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Small delay for scroll to settle
    setTimeout(() => {
      PPDemoOverlay.showSpotlight(step.target, step.spotlightOptions || {});

      const actions = [];

      // Back button (not on first step)
      if (index > 0) {
        actions.push({
          label: '← Back',
          ghost: true,
          onClick: () => {
            PPDemoOverlay.hideTooltip();
            PPDemoOverlay.hideSpotlight();
            showStage1Step(index - 1);
          }
        });
      }

      // Next or Finish button
      if (index < STAGE1_STEPS.length - 1) {
        actions.push({
          label: 'Next →',
          primary: true,
          onClick: () => {
            PPDemoOverlay.hideTooltip();
            PPDemoOverlay.hideSpotlight();
            showStage1Step(index + 1);
          }
        });
      } else {
        actions.push({
          label: 'Continue →',
          primary: true,
          onClick: () => {
            PPDemoOverlay.hideTooltip();
            PPDemoOverlay.hideSpotlight();
            clearHeroCardActive();
            showHandoff();
          }
        });
      }

      PPDemoOverlay.showTooltip({
        title: step.title,
        body: step.body,
        stepIndicator: `Step ${index + 1} of ${STAGE1_STEPS.length}`,
        actions
      });
    }, 400);
  }

  // ── Handoff Panel ────────────────────────────────────────

  function showHandoff() {
    console.log('[Demo] Stage 1 complete. Showing handoff.');

    PPDemoOverlay.showPanel({
      icon: '✓',
      title: "You've seen the fundamentals.",
      body: 'Now explore the platform yourself.',
      buttons: [
        {
          label: 'Enter Demo Environment →',
          primary: true,
          onClick: () => {
            PPDemoOverlay.hidePanel();
            enterSandbox();
          }
        },
        {
          label: 'Exit Demo',
          ghost: true,
          onClick: exitDemo
        }
      ]
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  STAGE 2 — GUIDED SANDBOX
  // ═══════════════════════════════════════════════════════════

  function enterSandbox() {
    console.log('[Demo] Entering sandbox...');
    _state.appMode = 'guidedSandbox';
    _state.currentStage = 2;
    _state.currentStepIndex = 0;
    _state.pendingSandboxStep2 = true;
    saveState();

    // Navigate to app.html with demo flag
    window.location.href = 'app.html?demo=sandbox';
  }

  // Called on app.html load
  function onAppHubReady() {
    loadState();
    console.log('[Demo] onAppHubReady — appMode:', _state.appMode, 'pendingSandboxStep2:', _state.pendingSandboxStep2);

    if (_state.appMode !== 'guidedSandbox' && _state.appMode !== 'sandboxFreeExplore') {
      console.log('[Demo] App Hub loaded, not in demo mode. Skipping.');
      return;
    }

    console.log('[Demo] App Hub ready. Mode:', _state.appMode);
    PPDemoOverlay.showExitButton(exitDemo);

    if (_state.appMode === 'sandboxFreeExplore') {
      setupFreeExploreOnPage();
      return;
    }

    if (_state.pendingSandboxStep2) {
      console.log('[Demo] Step 2 pending detected');
      _state.pendingSandboxStep2 = false;
      saveState();
      showSandboxStep2();
    }
  }

  // Stage 2 Step 2: Highlight 3 nav items
  function showSandboxStep2() {
    console.log('[Demo] Step 2 triggered');

    // Use requestAnimationFrame retry loop to wait for navbar readiness
    // instead of a fragile fixed timeout
    let frameCount = 0;
    const MAX_FRAMES = 60; // ~1 second at 60fps

    function attemptStep2() {
      frameCount++;

      // Find nav links using robust visibility detection
      const clarityLink = findNavLinkByText('Clarity Box');
      const mechanicsLink = findNavLinkByText('Market Mechanics');
      const portfolioLink = findNavLinkByText('Portfolio');

      const targets = [clarityLink, mechanicsLink, portfolioLink].filter(Boolean);
      const found = targets.length;

      if (found < 3 && frameCount < MAX_FRAMES) {
        // Not all targets found yet, retry next frame
        requestAnimationFrame(attemptStep2);
        return;
      }

      console.log(`[Demo] Step 2 targets found: ${found}/3 (after ${frameCount} frames)`);

      if (found === 0) {
        console.warn('[Demo] Targets not found — skipping Step 2');
        enterFreeExplore();
        return;
      }

      PPDemoOverlay.showSpotlight(targets, {
        paddingX: 8,
        paddingY: 6,
        borderRadius: 10
      });

      PPDemoOverlay.showTooltip({
        title: 'Available in the demo',
        body: 'These sections are available in the demo.\n\nStart exploring here.',
        stepIndicator: 'Demo Environment',
        actions: [
          {
            label: 'Got it',
            primary: true,
            onClick: () => {
              PPDemoOverlay.hideTooltip();
              PPDemoOverlay.hideSpotlight();
              setupDemoNavInterception();
              enterFreeExplore();
            }
          }
        ]
      });

      // Also dismiss on clicking any of the 3 allowed nav items
      for (const link of targets) {
        link.addEventListener('click', function onNavClick(e) {
          link.removeEventListener('click', onNavClick);
          PPDemoOverlay.hideTooltip();
          PPDemoOverlay.hideSpotlight();

          // Check if this is Market Mechanics
          const href = (link.getAttribute('href') || '').toLowerCase();
          if (href.includes('market-mechanics')) {
            _state.pendingMarketMechanicsStep = true;
            saveState();
          }
        }, { once: true });
      }
    }

    // Start the retry loop after a short initial delay for DOM settle
    requestAnimationFrame(attemptStep2);
  }

  // ── Demo Nav Interception ────────────────────────────────
  // Intercept clicks to non-demo pages and show locked message

  function setupDemoNavInterception() {
    // This is now handled per-page via the page-ready hooks
    console.log('[Demo] Nav interception set up');
  }

  // Stage 2 Step 3: Market Mechanics module spotlight
  function onMarketMechanicsReady() {
    loadState();

    if (_state.appMode !== 'guidedSandbox' && _state.appMode !== 'sandboxFreeExplore') {
      console.log('[Demo] Market Mechanics loaded, not in demo mode.');
      return;
    }

    console.log('[Demo] Market Mechanics ready. Mode:', _state.appMode);
    PPDemoOverlay.showExitButton(exitDemo);

    if (_state.pendingMarketMechanicsStep) {
      _state.pendingMarketMechanicsStep = false;
      saveState();
      showMarketMechanicsStep();
    } else if (_state.appMode === 'sandboxFreeExplore') {
      setupFreeExploreOnPage();
    }
  }

  function showMarketMechanicsStep() {
    console.log('[Demo] Stage 2 Step 3: Market Mechanics modules');

    setTimeout(() => {
      const modules = findModuleCards();
      const targets = [modules.d1m1, modules.d2entry].filter(Boolean);
      const found = targets.length;

      console.log(`[Demo] MM step targets found: ${found}/2`);

      if (found === 0) {
        console.warn('[Demo] No module targets found, entering free explore');
        enterFreeExplore();
        return;
      }

      PPDemoOverlay.showSpotlight(targets, {
        paddingX: 10,
        paddingY: 10,
        borderRadius: 10
      });

      PPDemoOverlay.showTooltip({
        title: 'Start with these lessons',
        body: 'These two modules are available in the demo.\n\nThey explain the foundations of market behavior.',
        stepIndicator: 'Demo Environment',
        actions: [
          {
            label: 'Got it',
            primary: true,
            onClick: () => {
              PPDemoOverlay.hideTooltip();
              PPDemoOverlay.hideSpotlight();
              enterFreeExplore();
            }
          }
        ]
      });
    }, 600);
  }

  // ═══════════════════════════════════════════════════════════
  //  FREE EXPLORE MODE
  // ═══════════════════════════════════════════════════════════

  function enterFreeExplore() {
    console.log('[Demo] Entering sandboxFreeExplore');
    _state.appMode = 'sandboxFreeExplore';
    _state.freeExploreStartTime = Date.now();
    saveState();
    startAccountPromptTimer();
    setupFreeExploreOnPage();
  }

  function setupFreeExploreOnPage() {
    // Intercept nav links that are not allowed in demo
    const allNavLinks = findVisibleNavLinks();
    const allowedHrefs = ['clarity-box', 'market-mechanics', 'portfolio', 'app.html'];

    for (const link of allNavLinks) {
      const href = (link.getAttribute('href') || '').toLowerCase();
      const isAllowed = allowedHrefs.some(h => href.includes(h));

      if (!isAllowed) {
        link.addEventListener('click', function lockHandler(e) {
          if (_state.appMode !== 'sandboxFreeExplore' && _state.appMode !== 'guidedSandbox') return;
          e.preventDefault();
          e.stopPropagation();
          PPDemoOverlay.showLockedMessage('Full access requires an account.');
        });
      }
    }

    // Also intercept hub cards if on app.html
    const hubCards = document.querySelectorAll('.hub-card');
    for (const card of hubCards) {
      const href = (card.getAttribute('href') || '').toLowerCase();
      const isAllowed = allowedHrefs.some(h => href.includes(h));

      if (!isAllowed) {
        card.addEventListener('click', function lockHandler(e) {
          if (_state.appMode !== 'sandboxFreeExplore' && _state.appMode !== 'guidedSandbox') return;
          e.preventDefault();
          e.stopPropagation();
          PPDemoOverlay.showLockedMessage('Full access requires an account.');
        });
      }
    }

    // Resume account prompt timer if time remaining
    if (_state.appMode === 'sandboxFreeExplore' && !_state.accountPromptShown && _state.freeExploreStartTime) {
      const elapsed = Date.now() - _state.freeExploreStartTime;
      const targetDelay = 4 * 60 * 1000; // ~4 min
      const remaining = targetDelay - elapsed;
      if (remaining > 0) {
        clearAccountPromptTimer();
        _accountPromptTimer = setTimeout(() => {
          if (_state.appMode === 'sandboxFreeExplore' && !_state.accountPromptShown) {
            showAccountPrompt();
          }
        }, remaining);
        console.log(`[Demo] Account prompt in ${Math.round(remaining / 1000)}s`);
      } else if (!_state.accountPromptShown) {
        showAccountPrompt();
      }
    }

    console.log('[Demo] Free explore setup complete on this page');
  }

  // ── Account Prompt ──────────────────────────────────────

  function showAccountPrompt() {
    console.log('[Demo] Showing account prompt');
    _state.accountPromptShown = true;
    saveState();

    PPDemoOverlay.showPanel({
      icon: '🚀',
      title: 'Ready to start learning properly?',
      body: 'Create your ProsperPath account to unlock all domains.',
      buttons: [
        {
          label: 'Create Account',
          primary: true,
          onClick: () => {
            PPDemoOverlay.hidePanel();
            // In demo, just close — real implementation would navigate to signup
            PPDemoOverlay.showLockedMessage('Account creation coming soon.');
          }
        },
        {
          label: 'Continue Demo',
          ghost: false,
          onClick: () => {
            PPDemoOverlay.hidePanel();
          }
        }
      ]
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  EXIT / RESET
  // ═══════════════════════════════════════════════════════════

  function exitDemo() {
    console.log('[Demo] Exiting demo...');

    clearAccountPromptTimer();
    clearHeroCardActive();

    // ── Clear demo portfolio data from PortfolioStore ──────────────────
    if (window.DemoPortfolioData) {
      window.DemoPortfolioData.clearDemoPortfolios();
    }

    clearState();

    if (window.PPDemoOverlay) {
      PPDemoOverlay.destroyAll();
    }

    // Clean URL if on app.html with demo param
    if (window.location.search.includes('demo=')) {
      const url = new URL(window.location);
      url.searchParams.delete('demo');
      window.history.replaceState({}, '', url.pathname);
    }

    console.log('[Demo] Exit complete. Site is normal.');
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE-SPECIFIC INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function initOnCurrentPage() {
    loadState();

    // Determine which page we're on.
    // Handles both .html (localhost) and extensionless (Cloudflare Pages) URLs.
    // e.g. /app.html and /app both match isAppHub.
    const path = window.location.pathname.toLowerCase();
    const pathSeg = path.replace(/\.html$/, ''); // strip extension for uniform compare
    const isHomepage = pathSeg.endsWith('/') || pathSeg === '' || pathSeg.endsWith('/index');
    const isAppHub = pathSeg.endsWith('/app');
    const isMarketMechanics = pathSeg.endsWith('/market-mechanics');
    const isClarityBox = pathSeg.endsWith('/clarity-box');
    const isPortfolio = pathSeg.endsWith('/portfolio');
    console.log('[Demo] initOnCurrentPage — path:', path, '| isAppHub:', isAppHub);

    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const demoParam = params.get('demo');

    // If demo mode is active, show exit button
    if (_state.appMode !== 'normal') {
      PPDemoOverlay.showExitButton(exitDemo);
    }

    // Page-specific hooks
    if (isAppHub) {
      if (demoParam === 'sandbox' || _state.appMode === 'guidedSandbox') {
        onAppHubReady();
      } else if (_state.appMode === 'sandboxFreeExplore') {
        onAppHubReady();
      }
    } else if (isMarketMechanics) {
      if (_state.appMode === 'guidedSandbox' || _state.appMode === 'sandboxFreeExplore') {
        onMarketMechanicsReady();
      }
    } else if ((isClarityBox || isPortfolio) && 
               (_state.appMode === 'guidedSandbox' || _state.appMode === 'sandboxFreeExplore')) {
      PPDemoOverlay.showExitButton(exitDemo);
      setupFreeExploreOnPage();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════

  window.ProsperDemo = {
    _initialized: true,

    // State accessors
    get appMode() { return _state.appMode; },
    get state() { return { ..._state }; },

    // Actions
    startDemo,
    exitDemo,

    // Page hooks (called from page scripts)
    onAppHubReady,
    onMarketMechanicsReady,

    // Init
    initOnCurrentPage
  };

  // ── Auto-init on DOMContentLoaded ────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnCurrentPage);
  } else {
    // DOM already loaded
    setTimeout(initOnCurrentPage, 50);
  }

  console.log('[Demo] Controller loaded');
})();
