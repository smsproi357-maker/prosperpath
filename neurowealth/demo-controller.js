// Route-Aware Interactive Demo Controller
// Injects a global overlay, highlights specific DOM elements, and forces sequential flow.

class DemoController {
    constructor() {
        this.steps = [
            {
                id: 'backtest',
                route: 'backtest.html',
                targetSelector: '[data-demo-id="run-backtest"]',
                title: 'Backtesting Engine',
                text: 'Test institutional-grade quantitative strategies with high fidelity. Click the highlighted "Run Backtest" button to begin.',
                actionType: 'click' // The event we are waiting for on the target
            },
            {
                id: 'pattern-hunter',
                route: 'market-detail.html?symbol=BTC-USD',
                targetSelector: '[data-demo-id="run-pattern-hunter"]',
                title: 'Pattern Hunter',
                text: 'Our AI scans live order-book microstructure to detect structural formations. Click "Scan Market Structure" to analyze Bitcoin.',
                actionType: 'click'
            },
            {
                id: 'portfolio',
                route: 'portfolio.html',
                targetSelector: '[data-demo-id="connect-portfolio"]',
                title: 'Portfolio Intelligence',
                text: 'Sync your brokerage for real-time risk attribution. We never store your credentials. Click "Connect Account" to simulate linking.',
                actionType: 'click'
            },
            {
                id: 'clarity-box',
                route: 'clarity-box.html',
                targetSelector: '[data-demo-id="clarity-input-wrapper"]',
                title: 'Clarity Box (AI)',
                text: 'Ask complex financial questions. Click the input bar or submit button to see how ProsperPath aggregates institutional research into clear insights.',
                actionType: 'click' // Often a click on the wrapper or enter key acts as the trigger here visually
            },
            {
                id: 'demo-summary',
                route: 'demo-summary.html',
                targetSelector: 'body',
                title: 'Demo Complete',
                text: 'You’ve completed the guided demo. You can now start with your own data, or exit demo.',
                actionType: 'none',
                isSummary: true
            }
        ];

        this.boundGlobalListener = this.handleGlobalAction.bind(this);
        this.stepCompleted = false;
        this.fallbackTimeout = null;
        this.currentStepIndex = -1;

        this.init();
    }

    init() {
        // Expose globally
        if (typeof window !== 'undefined') {
            window.DemoController = this;
            window.DemoMachine = this; // alias for backwards compat
        }

        // Check if we are currently in an active demo state
        const isDemo = sessionStorage.getItem('demoActive') === 'true';
        if (isDemo) {
            this.handleCurrentRoute();

            // Attach global passive event listeners
            document.addEventListener("click", this.boundGlobalListener, true);
            document.addEventListener("submit", this.boundGlobalListener, true);
            // Listen for 'Enter' key presses inside the clarity box input specifically
            document.addEventListener("keydown", (e) => {
                if (e.key === 'Enter') this.boundGlobalListener(e);
            }, true);
        }
    }

    start() {
        sessionStorage.setItem('demoActive', 'true');
        sessionStorage.setItem('demoStepIndex', '0');
        this.navigateToStep(0);
    }

    exit() {
        sessionStorage.removeItem('demoActive');
        sessionStorage.removeItem('demoStepIndex');
        this.removeOverlay();
        document.removeEventListener("click", this.boundGlobalListener, true);
        document.removeEventListener("submit", this.boundGlobalListener, true);
        window.location.href = 'index.html';
    }

    navigateToStep(index) {
        if (index >= this.steps.length) {
            this.exit();
            return;
        }

        sessionStorage.setItem('demoStepIndex', index.toString());
        const step = this.steps[index];
        window.location.href = step.route;
    }

    handleCurrentRoute() {
        const indexStr = sessionStorage.getItem('demoStepIndex');
        if (!indexStr) return;

        this.currentStepIndex = parseInt(indexStr, 10);
        const step = this.steps[this.currentStepIndex];

        if (!step) {
            this.exit();
            return;
        }

        this.stepCompleted = false;

        // Slight delay to allow base page components to render
        setTimeout(() => {
            this.renderOverlay(step, this.currentStepIndex);

            if (!step.isSummary) {
                this.setupSpotlight(step, this.currentStepIndex);
                this.startFallbackTimer();
            }

            // Hold blur to read text, then fade out so the user can interact clearly
            setTimeout(() => {
                const darkness = document.getElementById('demo-global-darkness');
                if (darkness) {
                    darkness.classList.add('fade-out');
                }

                // Remove the Crisp Clone when blur finishes so hover states work naturally
                if (this.currentClone) {
                    this.currentClone.style.opacity = '0';
                    setTimeout(() => {
                        if (this.currentClone) this.currentClone.remove();
                        this.currentClone = null;
                        if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler, true);
                    }, 500);
                }
            }, 4000);
        }, 800);
    }

    startFallbackTimer() {
        clearTimeout(this.fallbackTimeout);
        this.fallbackTimeout = setTimeout(() => {
            if (!this.stepCompleted) {
                const continueBtn = document.getElementById('demo-continue-btn');
                const fallbackMsg = document.getElementById('demo-fallback-msg');
                if (continueBtn) {
                    continueBtn.disabled = false;
                    continueBtn.textContent = 'Continue Anyway →';
                }
                if (fallbackMsg) {
                    fallbackMsg.style.display = 'block';
                }
            }
        }, 12000); // 12 seconds fallback
    }

    handleGlobalAction(e) {
        if (!this.steps[this.currentStepIndex] || this.stepCompleted) return;

        const step = this.steps[this.currentStepIndex];
        const targetSelector = step.targetSelector;

        // Extract the raw data attribute value to check against (e.g. [data-demo-id="backtest-run"] -> "backtest-run")
        const idMatch = targetSelector.match(/\[data-demo-id="([^"]+)"\]/);
        const targetId = idMatch ? idMatch[1] : null;

        if (targetId) {
            // Check if the event target or any of its parents have the tracking ID
            const clickedEl = e.target.closest(`[data-demo-id="${targetId}"]`);
            if (clickedEl) {
                this.markStepCompleted();
            }
        } else {
            // Fallback selector handling if not using data-demo-id
            const clickedEl = e.target.closest(targetSelector);
            if (clickedEl) {
                this.markStepCompleted();
            }
        }
    }

    markStepCompleted() {
        if (this.stepCompleted) return;
        this.stepCompleted = true;

        const continueBtn = document.getElementById('demo-continue-btn');
        if (continueBtn) {
            continueBtn.disabled = false;
            continueBtn.textContent = 'Continue →';
            continueBtn.classList.add('ready');
        }

        const fallbackMsg = document.getElementById('demo-fallback-msg');
        if (fallbackMsg) fallbackMsg.style.display = 'none';

        // Remove spotlight to signify recognition
        const target = document.querySelector(this.steps[this.currentStepIndex].targetSelector);
        if (target) {
            target.classList.remove('demo-spotlight-target');
            target.classList.add('demo-spotlight-success');
        }
    }

    renderOverlay(step, index) {
        if (document.getElementById('demo-global-assistant')) return;

        // Inject Styles
        if (!document.getElementById('demo-controller-styles')) {
            const style = document.createElement('style');
            style.id = 'demo-controller-styles';
            style.textContent = `
                .demo-global-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(10, 10, 12, 0.85);
                    backdrop-filter: blur(8px);
                    z-index: 9998;
                    pointer-events: none; /* Crucial: clicks passthrough to the actual app */
                    transition: all 1.5s ease-in-out;
                }

                .demo-global-overlay.fade-out {
                    background: rgba(10, 10, 12, 0);
                    backdrop-filter: blur(0px);
                    opacity: 0;
                }

                .demo-assistant-panel {
                    position: fixed;
                    bottom: 40px;
                    right: 40px;
                    width: 380px;
                    background: rgba(20, 20, 25, 0.95);
                    border: 1px solid rgba(0, 212, 170, 0.3);
                    border-radius: 16px;
                    padding: 24px;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
                    z-index: 10000;
                    backdrop-filter: blur(20px);
                    font-family: 'Inter', sans-serif;
                    color: #fff;
                    animation: demoSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                .demo-assistant-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .demo-ai-avatar {
                    width: 36px; height: 36px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #00d4aa 0%, #0088ff 100%);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 18px;
                    box-shadow: 0 0 15px rgba(0, 212, 170, 0.4);
                }

                .demo-assistant-title-group {
                    display: flex;
                    flex-direction: column;
                }

                .demo-assistant-title {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 600;
                    font-size: 1.1rem;
                    margin: 0;
                }
                
                .demo-step-counter {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.5);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .demo-assistant-text {
                    font-size: 0.95rem;
                    line-height: 1.6;
                    color: rgba(255, 255, 255, 0.85);
                    margin-bottom: 8px;
                }

                .demo-fallback-msg {
                    font-size: 0.8rem;
                    color: #fbbf24;
                    margin-bottom: 16px;
                    display: none;
                    animation: fadeIn 0.3s ease;
                }

                .demo-assistant-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 24px;
                }

                .demo-actions-left {
                    display: flex;
                    gap: 12px;
                }

                .demo-btn-secondary {
                    background: transparent;
                    color: rgba(255, 255, 255, 0.6);
                    border: none;
                    cursor: pointer;
                    font-size: 0.85rem;
                    font-weight: 500;
                    transition: color 0.2s;
                }
                .demo-btn-secondary:hover { color: #fff; }

                .demo-btn-primary {
                    background: rgba(0, 212, 170, 0.1);
                    color: #00d4aa;
                    border: 1px solid rgba(0, 212, 170, 0.3);
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                }
                .demo-btn-primary:disabled {
                    background: rgba(255,255,255,0.05);
                    color: rgba(255,255,255,0.3);
                    border-color: rgba(255,255,255,0.1);
                    cursor: not-allowed;
                }
                .demo-btn-primary.ready {
                    background: var(--color-accent);
                    color: #000;
                    border-color: var(--color-accent);
                    box-shadow: 0 0 15px rgba(0, 212, 170, 0.4);
                }

                /* Highlight Ring - Note: Pointer-events none allows clicking through the ring to the target */
                .demo-spotlight-target {
                    position: relative;
                    z-index: 9999 !important; /* Bring above the 9998 blur overlay */
                }
                .demo-spotlight-target::after {
                    content: '';
                    position: absolute;
                    top: -6px; left: -6px; right: -6px; bottom: -6px;
                    border: 2px solid var(--color-accent);
                    border-radius: inherit;
                    pointer-events: none !important;
                    z-index: 10000;
                    animation: demoPulseRing 2s infinite;
                }
                
                .demo-spotlight-success::after {
                    content: '';
                    position: absolute;
                    top: -4px; left: -4px; right: -4px; bottom: -4px;
                    border: 2px solid #22c55e;
                    border-radius: inherit;
                    pointer-events: none !important;
                    z-index: 10000;
                    opacity: 0;
                    animation: successFade 1s forwards;
                }

                @keyframes demoPulseRing {
                    0% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(0, 212, 170, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0); }
                }

                @keyframes successFade {
                    0% { opacity: 1; transform: scale(1); }
                    100% { opacity: 0; transform: scale(1.05); }
                }

                @keyframes demoSlideUp {
                    from { opacity: 0; transform: translateY(40px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                /* Nav Badge */
                .demo-nav-badge {
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 212, 170, 0.15);
                    border: 1px solid rgba(0, 212, 170, 0.4);
                    color: #00d4aa;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-weight: 600;
                    font-size: 0.85rem;
                    z-index: 10000;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                    pointer-events: none;
                }
            `;
            document.head.appendChild(style);
        }

        const isLastStep = index === this.steps.length - 1;

        let actionsHtml = '';
        if (step.isSummary) {
            actionsHtml = `
                <div class="demo-assistant-actions">
                    <button class="demo-btn-secondary" id="demo-exit-btn-summary">End Demo</button>
                    <button class="demo-btn-primary ready" id="demo-get-started-btn">Get Started</button>
                </div>
            `;
        } else {
            actionsHtml = `
                <div class="demo-fallback-msg" id="demo-fallback-msg">Can't find the button? You can continue anyway.</div>
                
                <div class="demo-assistant-actions">
                    <div class="demo-actions-left">
                        ${index > 0 ? `<button class="demo-btn-secondary" id="demo-back-btn">&larr; Back</button>` : ''}
                        <button class="demo-btn-secondary" id="demo-skip-btn">Skip Step</button>
                    </div>
                    <button class="demo-btn-primary" id="demo-continue-btn" disabled>Continue</button>
                </div>
                <div style="text-align: center; margin-top: 16px;">
                    <button class="demo-btn-secondary" id="demo-exit-btn" style="font-size: 0.8rem; opacity: 0.6;">Exit Demo</button>
                </div>
            `;
        }

        const overlay = document.createElement('div');
        overlay.id = 'demo-global-assistant';
        overlay.innerHTML = `
            <div class="demo-global-overlay" id="demo-global-darkness"></div>
            <div class="demo-nav-badge">Demo Mode Active — Step ${index + 1}/${this.steps.length}</div>
            <div class="demo-assistant-panel">
                <div class="demo-assistant-header">
                    <div class="demo-ai-avatar">🤖</div>
                    <div class="demo-assistant-title-group">
                        <span class="demo-step-counter">Step ${index + 1} of ${this.steps.length}</span>
                        <h3 class="demo-assistant-title">${step.title}</h3>
                    </div>
                </div>
                <div class="demo-assistant-text">${step.text}</div>
                ${actionsHtml}
            </div>
        `;
        document.body.appendChild(overlay);

        // Bind panel buttons
        if (step.isSummary) {
            document.getElementById('demo-exit-btn-summary').addEventListener('click', () => {
                this.exit();
            });
            document.getElementById('demo-get-started-btn').addEventListener('click', () => {
                sessionStorage.removeItem('demoActive');
                sessionStorage.removeItem('demoStepIndex');
                this.removeOverlay();
                document.removeEventListener("click", this.boundGlobalListener, true);
                document.removeEventListener("submit", this.boundGlobalListener, true);
                window.location.href = 'app.html';
            });
        } else {
            document.getElementById('demo-skip-btn').addEventListener('click', () => {
                this.navigateToStep(index + 1);
            });

            const backBtn = document.getElementById('demo-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    this.navigateToStep(index - 1);
                });
            }

            document.getElementById('demo-continue-btn').addEventListener('click', () => {
                this.navigateToStep(index + 1);
            });

            document.getElementById('demo-exit-btn').addEventListener('click', () => {
                this.exit();
            });
        }
    }

    setupSpotlight(step, index) {
        // Wait a bit and try to find target (Pattern Hunter renders dynamically)
        let attempts = 0;
        const interval = setInterval(() => {
            const target = document.querySelector(step.targetSelector);
            if (target) {
                clearInterval(interval);
                this.applySpotlight(target);
            } else if (attempts > 10) {
                clearInterval(interval);
            }
            attempts++;
        }, 250);
    }

    applySpotlight(targetEl) {
        // Add the class which uses an ::after pseudo-element to draw the ring.
        // The ::after element has pointer-events: none, so clicks pass through to the real button.
        targetEl.classList.add('demo-spotlight-target');

        // Ensure the element's position allows for absolute pseudo-element positioning
        const computedStyle = window.getComputedStyle(targetEl);
        if (computedStyle.position === 'static') {
            targetEl.style.position = 'relative';
        }

        // Ensure the highlighted element is visible within its scroll container
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait a small frame for scrolling to settle, then clone the element to punch through the blur
        setTimeout(() => {
            this.createSpotlightClone(targetEl);
        }, 350);
    }

    createSpotlightClone(targetEl) {
        if (this.currentClone) this.currentClone.remove();

        const rect = targetEl.getBoundingClientRect();
        const clone = targetEl.cloneNode(true);

        clone.removeAttribute('data-demo-id');
        clone.id = 'demo-spotlight-clone';

        // Absolute position it perfectly above the original
        clone.style.position = 'fixed';
        clone.style.top = rect.top + 'px';
        clone.style.left = rect.left + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.margin = '0';
        clone.style.zIndex = '10005';
        clone.style.pointerEvents = 'none'; // Critical: Let clicks fall through to the real button under the overlay
        clone.style.transition = 'opacity 0.4s ease';

        document.body.appendChild(clone);
        this.currentClone = clone;

        // Keep it sync'd on scroll
        this.scrollHandler = () => {
            if (this.currentClone && targetEl) {
                const updatedRect = targetEl.getBoundingClientRect();
                this.currentClone.style.top = updatedRect.top + 'px';
                this.currentClone.style.left = updatedRect.left + 'px';
            }
        };
        window.addEventListener('scroll', this.scrollHandler, true);
    }

    removeOverlay() {
        const overlay = document.getElementById('demo-global-assistant');
        if (overlay) overlay.remove();

        const targets = document.querySelectorAll('.demo-spotlight-target, .demo-spotlight-success');
        targets.forEach(el => {
            el.classList.remove('demo-spotlight-target');
            el.classList.remove('demo-spotlight-success');
        });

        if (this.currentClone) {
            this.currentClone.remove();
            this.currentClone = null;
        }
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler, true);
        }
    }
}

// Global Instantiate
new DemoController();
