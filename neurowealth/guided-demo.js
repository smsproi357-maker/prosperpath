/**
 * Guided Demo Framework Engine
 * Phase 3 Implementation
 */

class GuidedDemoEngine {
  constructor() {
    this.currentStep = 0;
    this.isActive = false;

    // Phase 4 Steps
    this.steps = [
      {
        targetSelector: '.panel-backtest',
        title: 'Markets are auctions',
        description: 'Markets are continuous auctions between buyers and sellers. Price moves when participants compete for liquidity. Understanding this auction process is the foundation of all market movement.',
        position: 'center'
      },
      {
        targetSelector: '.pattern-chart',
        title: 'Liquidity drives movement',
        description: 'Markets seek liquidity — areas where orders are concentrated. Large participants need counterparties to execute trades, which causes price to move toward liquidity zones.',
        position: 'bottom-left'
      },
      {
        targetSelector: '.panel-pattern',
        title: 'Structure reveals intent',
        description: 'Market structure reflects the interaction between liquidity and participant behavior. Trends, consolidations, and breakouts all emerge from these interactions.',
        position: 'top'
      },
      {
        targetSelector: '.panel-clarity',
        title: 'Clarity Box analysis',
        description: 'The Clarity Box analyzes market conditions in real time. It identifies liquidity zones, structural shifts, and potential opportunities.',
        position: 'left'
      },
      {
        targetSelector: '.panel-portfolio',
        title: 'Portfolio intelligence',
        description: 'ProsperPath connects market understanding with your portfolio. Strategy, analysis, and execution are integrated into a single system.',
        position: 'top'
      }
    ];

    this.elements = {};
    this.init();
  }

  init() {
    // Check if we should auto-start the demo
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tour') === 'start' || sessionStorage.getItem('guidedDemoActive') === 'true') {
      // Clean URL if we started from ?tour=start
      if (urlParams.get('tour') === 'start') {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        sessionStorage.setItem('guidedDemoActive', 'true');
      }
      
      // Small delay to allow initial DOM rendering/animations
      setTimeout(() => this.startDemo(), 500);
    }
  }

  createBaseUI() {
    if (document.getElementById('guided-demo-overlay')) return;

    // 1. Overlay
    this.elements.overlay = document.createElement('div');
    this.elements.overlay.id = 'guided-demo-overlay';
    this.elements.overlay.className = 'guided-demo-overlay';
    document.body.appendChild(this.elements.overlay);

    // 2. Tooltip Panel
    this.elements.tooltip = document.createElement('div');
    this.elements.tooltip.id = 'guided-demo-tooltip';
    this.elements.tooltip.className = 'guided-demo-tooltip';
    this.elements.tooltip.innerHTML = `
      <h3 class="guided-demo-title" id="gd-title"></h3>
      <p class="guided-demo-desc" id="gd-desc"></p>
      <div class="guided-demo-actions">
        <button class="guided-demo-btn guided-demo-btn-skip" id="gd-btn-skip">Skip Tour</button>
        <div class="guided-demo-btn-group">
          <button class="guided-demo-btn guided-demo-btn-secondary" id="gd-btn-prev">Previous</button>
          <button class="guided-demo-btn guided-demo-btn-primary" id="gd-btn-next">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.elements.tooltip);

    // 3. Progress Indicator
    this.elements.progressContainer = document.createElement('div');
    this.elements.progressContainer.id = 'guided-demo-progress';
    this.elements.progressContainer.className = 'guided-demo-progress-container';
    document.body.appendChild(this.elements.progressContainer);

    // 4. Exit Button
    this.elements.exitBtn = document.createElement('button');
    this.elements.exitBtn.id = 'guided-demo-exit';
    this.elements.exitBtn.className = 'guided-demo-exit-btn';
    this.elements.exitBtn.textContent = 'Exit Demo';
    document.body.appendChild(this.elements.exitBtn);

    this.bindEvents();
  }

  bindEvents() {
    this.elements.exitBtn.addEventListener('click', () => this.exitDemo());
    document.getElementById('gd-btn-skip').addEventListener('click', () => this.exitDemo());
    document.getElementById('gd-btn-prev').addEventListener('click', () => this.navigate(-1));
    document.getElementById('gd-btn-next').addEventListener('click', () => this.navigate(1));

    // Keyboard accessibility
    this._handleKeydown = (e) => {
      if (!this.isActive) return;
      if (e.key === 'Escape') this.exitDemo();
      if (e.key === 'ArrowRight') this.navigate(1);
      if (e.key === 'ArrowLeft') this.navigate(-1);
      
      // Focus trapping logic can be expanded here
    };
    document.addEventListener('keydown', this._handleKeydown);
  }

  startDemo() {
    this.currentStep = 0;
    this.isActive = true;
    sessionStorage.setItem('guidedDemoActive', 'true');
    
    this.createBaseUI();
    
    // Defer visual activation slightly to ensure DOM insertion is registered for CSS transitions
    requestAnimationFrame(() => {
      this.elements.overlay.classList.add('active');
      this.elements.tooltip.classList.add('active');
      this.elements.progressContainer.classList.add('active');
      this.elements.exitBtn.classList.add('active');
      this.renderStep();
    });
  }

  exitDemo() {
    this.isActive = false;
    sessionStorage.removeItem('guidedDemoActive');
    
    this.clearSpotlight();

    if (this.elements.overlay) {
      this.elements.overlay.classList.remove('active');
      this.elements.tooltip.classList.remove('active');
      this.elements.progressContainer.classList.remove('active');
      this.elements.exitBtn.classList.remove('active');
      
      // Cleanup after transition
      setTimeout(() => {
        this.elements.overlay.remove();
        this.elements.tooltip.remove();
        this.elements.progressContainer.remove();
        this.elements.exitBtn.remove();
        this.elements = {};
      }, 300);
    }

    document.removeEventListener('keydown', this._handleKeydown);

    // Note: If they exit during demo-start, return to plain index
    // Handled by removing session storage and cleaning UI
  }

  navigate(direction) {
    const nextIndex = this.currentStep + direction;
    if (nextIndex >= 0 && nextIndex < this.steps.length) {
      this.currentStep = nextIndex;
      this.renderStep();
    } else if (nextIndex >= this.steps.length) {
      // Completed last step -> Exit for now (Phase 4 will link to summary)
      this.exitDemo();
    }
  }

  clearSpotlight() {
    if (this.currentTarget) {
      this.currentTarget.classList.remove('guided-demo-target');
      this.currentTarget = null;
    }
  }

  renderStep() {
    const step = this.steps[this.currentStep];
    
    // Update Tooltip Content
    document.getElementById('gd-title').textContent = step.title;
    document.getElementById('gd-desc').textContent = step.description;
    
    // Update Button States
    const prevBtn = document.getElementById('gd-btn-prev');
    const nextBtn = document.getElementById('gd-btn-next');
    
    prevBtn.style.display = 'block';
    if (this.currentStep === 0) {
      prevBtn.style.visibility = 'hidden'; 
    } else {
      prevBtn.style.visibility = 'visible';
    }
    
    if (this.currentStep === this.steps.length - 1) {
      nextBtn.textContent = 'Finish';
    } else {
      nextBtn.textContent = 'Next';
    }

    // Update Progress Indicator
    this.renderProgress();

    // Handle Spotlight Target
    this.clearSpotlight();
    
    // Find target (retry slightly if dynamic)
    const targetEl = document.querySelector(step.targetSelector);
    if (targetEl) {
      this.currentTarget = targetEl;
      this.currentTarget.classList.add('guided-demo-target');
      
      // Auto-scroll to ensure target is visible
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      
      // Position tooltip after scroll settles
      setTimeout(() => this.positionTooltip(targetEl), 300);
    } else {
      // Fallback centering if target not found
      this.positionTooltip(null, 'center');
    }
  }

  renderProgress() {
    let html = `<span class="guided-demo-step-text">Step ${this.currentStep + 1} of ${this.steps.length}</span>`;
    html += `<div class="guided-demo-dots">`;
    for (let i = 0; i < this.steps.length; i++) {
        html += `<span class="guided-demo-dot ${i <= this.currentStep ? 'active' : ''}"></span>`;
    }
    html += `</div>`;
    this.elements.progressContainer.innerHTML = html;
  }

  positionTooltip(targetEl) {
    const tooltip = this.elements.tooltip;
    
    if (!targetEl || window.innerWidth <= 768) {
      // Mobile or no target: center at bottom
      tooltip.className = 'guided-demo-tooltip active tooltip-animate tooltip-pos-bottom';
      tooltip.style.top = 'auto';
      tooltip.style.bottom = '24px';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%)';
      this.triggerTooltipAnimation();
      return;
    }

    const targetRect = targetEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 14; // 12-16px gap

    // Reset base transform
    tooltip.style.transform = 'none';

    // Calculate available space
    const spaceBottom = window.innerHeight - targetRect.bottom;
    const spaceRight = window.innerWidth - targetRect.right;
    const spaceLeft = targetRect.left;
    const spaceTop = targetRect.top;

    const tooltipHeight = tooltipRect.height;
    const tooltipWidth = tooltipRect.width;

    let position = 'bottom';

    if (spaceBottom >= tooltipHeight + margin) {
        position = 'bottom';
    } else if (spaceRight >= tooltipWidth + margin) {
        position = 'right';
    } else if (spaceLeft >= tooltipWidth + margin) {
        position = 'left';
    } else if (spaceTop >= tooltipHeight + margin) {
        position = 'top';
    } else {
        // Fallback to bottom, will clamp later
        position = 'bottom';
    }

    let top = 0;
    let left = 0;

    switch (position) {
      case 'bottom':
        top = targetRect.bottom + margin;
        left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
        break;
      case 'right':
        top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
        left = targetRect.right + margin;
        break;
      case 'left':
        top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
        left = targetRect.left - tooltipWidth - margin;
        break;
      case 'top':
        top = targetRect.top - tooltipHeight - margin;
        left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
        break;
    }

    // Boundary checks (clamp to viewport)
    const viewportMargin = 16;
    if (top < viewportMargin) top = viewportMargin;
    if (left < viewportMargin) left = viewportMargin;
    if (top + tooltipHeight > window.innerHeight - viewportMargin) {
        top = window.innerHeight - tooltipHeight - viewportMargin;
    }
    if (left + tooltipWidth > window.innerWidth - viewportMargin) {
        left = window.innerWidth - tooltipWidth - viewportMargin;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.bottom = 'auto';

    // Apply arrow class
    tooltip.className = `guided-demo-tooltip active tooltip-pos-${position}`;

    // Apply animation
    this.triggerTooltipAnimation();
  }

  triggerTooltipAnimation() {
    const tooltip = this.elements.tooltip;
    // Trigger animation explicitly
    tooltip.classList.remove('tooltip-animate');
    void tooltip.offsetWidth; // Force reflow
    tooltip.classList.add('tooltip-animate');
  }
}

// Instantiate on load
document.addEventListener('DOMContentLoaded', () => {
    window.guidedDemoEngine = new GuidedDemoEngine();
});
