/* ============================================================
   PROSPERPATH INTERACTIVE DEMO — Overlay & Tooltip Subsystem
   Provides: spotlight/blur, tooltips, and full-screen panels.
   Fully self-contained. Injects its own DOM. Removes cleanly.
   ============================================================ */

(function () {
  'use strict';

  // Prevent double-init
  if (window.PPDemoOverlay) return;

  // ── State ────────────────────────────────────────────────
  let _overlay = null;
  let _tooltip = null;
  let _panel = null;
  let _exitBtn = null;
  let _rafId = null;
  let _currentTargets = [];
  let _currentOptions = {};
  let _resizeHandler = null;
  let _scrollHandler = null;

  // ── DOM Creation Helpers ─────────────────────────────────
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') e.className = v;
        else if (k === 'textContent') e.textContent = v;
        else if (k === 'innerHTML') e.innerHTML = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
        else e.setAttribute(k, v);
      }
    }
    if (children) {
      for (const c of children) {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
      }
    }
    return e;
  }

  // ── Overlay ──────────────────────────────────────────────

  function getOrCreateOverlay() {
    if (_overlay && document.body.contains(_overlay)) return _overlay;
    _overlay = el('div', { id: 'pp-demo-overlay' });
    document.body.appendChild(_overlay);
    return _overlay;
  }

  function buildClipPath(targets, options) {
    // Full viewport rect
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!targets || targets.length === 0) {
      return 'none'; // No cutouts — full overlay
    }

    // Build an SVG-like path: outer rect (clockwise) + cutout rects (counter-clockwise)
    // Outer rect
    let path = `M 0 0 L ${vw} 0 L ${vw} ${vh} L 0 ${vh} Z `;

    for (const t of targets) {
      const rect = t.getBoundingClientRect();
      const px = (options.paddingX != null) ? options.paddingX : 12;
      const py = (options.paddingY != null) ? options.paddingY : 12;
      const br = (options.borderRadius != null) ? options.borderRadius : 14;

      const x = rect.left - px;
      const y = rect.top - py;
      const w = rect.width + px * 2;
      const h = rect.height + py * 2;
      const r = Math.min(br, w / 2, h / 2);

      // Counter-clockwise rounded rect cutout
      path += `M ${x + r} ${y} `;
      path += `L ${x + w - r} ${y} `;
      path += `Q ${x + w} ${y} ${x + w} ${y + r} `;
      path += `L ${x + w} ${y + h - r} `;
      path += `Q ${x + w} ${y + h} ${x + w - r} ${y + h} `;
      path += `L ${x + r} ${y + h} `;
      path += `Q ${x} ${y + h} ${x} ${y + h - r} `;
      path += `L ${x} ${y + r} `;
      path += `Q ${x} ${y} ${x + r} ${y} Z `;
    }

    return `path(evenodd, "${path}")`;
  }

  function updateSpotlightPositions() {
    if (!_overlay || _currentTargets.length === 0) return;
    const clipPath = buildClipPath(_currentTargets, _currentOptions);
    _overlay.style.clipPath = clipPath;
    _overlay.style.webkitClipPath = clipPath;
  }

  function startPositionTracking() {
    stopPositionTracking();

    function tick() {
      updateSpotlightPositions();
      updateTooltipPosition();
      _rafId = requestAnimationFrame(tick);
    }
    _rafId = requestAnimationFrame(tick);

    _resizeHandler = () => { /* RAF handles it */ };
    _scrollHandler = () => { /* RAF handles it */ };
    window.addEventListener('resize', _resizeHandler, { passive: true });
    window.addEventListener('scroll', _scrollHandler, { passive: true, capture: true });
  }

  function stopPositionTracking() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }
    if (_scrollHandler) {
      window.removeEventListener('scroll', _scrollHandler, { capture: true });
      _scrollHandler = null;
    }
  }

  // ── Resolve Targets ──────────────────────────────────────

  function resolveTargets(selectors) {
    if (!selectors) return [];
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    const results = [];
    for (const s of arr) {
      if (s instanceof Element) {
        results.push(s);
      } else if (typeof s === 'string') {
        const found = document.querySelector(s);
        if (found) results.push(found);
        else console.warn('[Demo Overlay] Target not found:', s);
      }
    }
    return results;
  }

  // ── Public: showSpotlight ────────────────────────────────

  function showSpotlight(selectors, options = {}) {
    const targets = resolveTargets(selectors);
    _currentTargets = targets;
    _currentOptions = options;

    const overlay = getOrCreateOverlay();

    if (targets.length > 0) {
      updateSpotlightPositions();
      startPositionTracking();
    } else {
      // Full overlay, no cutouts
      overlay.style.clipPath = 'none';
      overlay.style.webkitClipPath = 'none';
    }

    // Block clicks on the overlay except through cutouts
    overlay.onclick = (e) => {
      if (e.target === overlay && options.onOverlayClick) {
        options.onOverlayClick();
      }
    };

    // Fade in
    requestAnimationFrame(() => {
      overlay.classList.add('pp-visible');
    });

    console.log(`[Demo Overlay] Spotlight shown for ${targets.length} target(s)`);
  }

  function hideSpotlight() {
    if (_overlay) {
      _overlay.classList.remove('pp-visible');
      setTimeout(() => {
        if (_overlay && _overlay.parentNode) {
          _overlay.parentNode.removeChild(_overlay);
        }
        _overlay = null;
      }, 220);
    }
    stopPositionTracking();
    _currentTargets = [];
    _currentOptions = {};
    console.log('[Demo Overlay] Spotlight hidden');
  }

  // ── Tooltip ──────────────────────────────────────────────

  function getOrCreateTooltip() {
    if (_tooltip && document.body.contains(_tooltip)) return _tooltip;
    _tooltip = el('div', { id: 'pp-demo-tooltip' });
    document.body.appendChild(_tooltip);
    return _tooltip;
  }

  function updateTooltipPosition() {
    if (!_tooltip || !_tooltip.classList.contains('pp-visible')) return;
    if (_currentTargets.length === 0) return;

    const anchor = _currentTargets[0];
    const anchorRect = anchor.getBoundingClientRect();
    const tipRect = _tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;
    const px = (_currentOptions.paddingX != null) ? _currentOptions.paddingX : 12;
    const py = (_currentOptions.paddingY != null) ? _currentOptions.paddingY : 12;

    let top, left;

    // Prefer below the target
    if (anchorRect.bottom + py + gap + tipRect.height < vh) {
      top = anchorRect.bottom + py + gap;
      left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    }
    // Try above
    else if (anchorRect.top - py - gap - tipRect.height > 0) {
      top = anchorRect.top - py - gap - tipRect.height;
      left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    }
    // Try right
    else if (anchorRect.right + px + gap + tipRect.width < vw) {
      top = anchorRect.top + anchorRect.height / 2 - tipRect.height / 2;
      left = anchorRect.right + px + gap;
    }
    // Fallback: left
    else {
      top = anchorRect.top + anchorRect.height / 2 - tipRect.height / 2;
      left = anchorRect.left - px - gap - tipRect.width;
    }

    // Clamp to viewport
    left = Math.max(12, Math.min(left, vw - tipRect.width - 12));
    top = Math.max(12, Math.min(top, vh - tipRect.height - 12));

    _tooltip.style.left = left + 'px';
    _tooltip.style.top = top + 'px';
  }

  function showTooltip({ title, body, actions, stepIndicator }) {
    const tooltip = getOrCreateTooltip();
    tooltip.innerHTML = '';

    if (stepIndicator) {
      tooltip.appendChild(el('div', { className: 'pp-tooltip-step-indicator', textContent: stepIndicator }));
    }
    if (title) {
      tooltip.appendChild(el('div', { className: 'pp-tooltip-title', textContent: title }));
    }
    if (body) {
      tooltip.appendChild(el('div', { className: 'pp-tooltip-body', innerHTML: body.replace(/\n/g, '<br>') }));
    }
    if (actions && actions.length > 0) {
      const actionsDiv = el('div', { className: 'pp-tooltip-actions' });
      for (const a of actions) {
        const btnClass = a.primary ? 'pp-btn pp-btn-primary' :
                         a.ghost ? 'pp-btn pp-btn-ghost' : 'pp-btn pp-btn-secondary';
        const btn = el('button', { className: btnClass, textContent: a.label, onClick: a.onClick });
        actionsDiv.appendChild(btn);
      }
      tooltip.appendChild(actionsDiv);
    }

    // Position & show
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    requestAnimationFrame(() => {
      tooltip.classList.add('pp-visible');
      // Need a frame for size to be computed
      requestAnimationFrame(() => {
        updateTooltipPosition();
      });
    });

    console.log(`[Demo Overlay] Tooltip shown: "${title}"`);
  }

  function hideTooltip() {
    if (_tooltip) {
      _tooltip.classList.remove('pp-visible');
      setTimeout(() => {
        if (_tooltip && _tooltip.parentNode) {
          _tooltip.parentNode.removeChild(_tooltip);
        }
        _tooltip = null;
      }, 220);
    }
    console.log('[Demo Overlay] Tooltip hidden');
  }

  // ── Full-Screen Panel ────────────────────────────────────

  function showPanel({ icon, title, body, secondaryText, buttons }) {
    hidePanel(); // clean any existing

    _panel = el('div', { id: 'pp-demo-panel' });

    const card = el('div', { className: 'pp-panel-card' });

    if (icon) card.appendChild(el('span', { className: 'pp-panel-icon', textContent: icon }));
    if (title) card.appendChild(el('h2', { className: 'pp-panel-title', textContent: title }));
    if (body) card.appendChild(el('p', { className: 'pp-panel-body', innerHTML: body.replace(/\n/g, '<br>') }));
    if (secondaryText) card.appendChild(el('p', { className: 'pp-panel-secondary', textContent: secondaryText }));

    if (buttons && buttons.length > 0) {
      const actionsDiv = el('div', { className: 'pp-panel-actions' });
      for (const b of buttons) {
        const btnClass = b.primary ? 'pp-btn pp-btn-primary' :
                         b.ghost ? 'pp-btn pp-btn-ghost' : 'pp-btn pp-btn-secondary';
        const btn = el('button', { className: btnClass, textContent: b.label, onClick: b.onClick });
        actionsDiv.appendChild(btn);
      }
      card.appendChild(actionsDiv);
    }

    _panel.appendChild(card);
    document.body.appendChild(_panel);

    requestAnimationFrame(() => {
      _panel.classList.add('pp-visible');
    });

    console.log(`[Demo Overlay] Panel shown: "${title}"`);
  }

  function hidePanel() {
    if (_panel) {
      _panel.classList.remove('pp-visible');
      const ref = _panel;
      setTimeout(() => {
        if (ref && ref.parentNode) ref.parentNode.removeChild(ref);
      }, 280);
      _panel = null;
    }
  }

  // ── Exit Demo Button ────────────────────────────────────

  function showExitButton(onExit) {
    hideExitButton();
    _exitBtn = el('button', {
      id: 'pp-demo-exit-btn',
      textContent: '✕  Exit Demo',
      onClick: onExit
    });
    document.body.appendChild(_exitBtn);
  }

  function hideExitButton() {
    if (_exitBtn && _exitBtn.parentNode) {
      _exitBtn.parentNode.removeChild(_exitBtn);
    }
    _exitBtn = null;
  }

  // ── Full Teardown ────────────────────────────────────────

  function destroyAll() {
    hideSpotlight();
    hideTooltip();
    hidePanel();
    hideExitButton();
    stopPositionTracking();

    // Force-remove any lingering demo DOM
    ['pp-demo-overlay', 'pp-demo-tooltip', 'pp-demo-panel', 'pp-demo-exit-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    // Remove locked badges
    document.querySelectorAll('.pp-demo-locked-badge').forEach(b => b.remove());

    _overlay = null;
    _tooltip = null;
    _panel = null;
    _exitBtn = null;
    _currentTargets = [];
    _currentOptions = {};

    console.log('[Demo Overlay] Full teardown complete');
  }

  // ── Locked Feature Toast ─────────────────────────────────

  function showLockedMessage(message) {
    // Remove existing
    document.querySelectorAll('.pp-demo-locked-badge').forEach(b => b.remove());

    const badge = el('div', { className: 'pp-demo-locked-badge' }, [
      el('span', { className: 'pp-locked-icon', textContent: '🔒' }),
      el('span', { className: 'pp-locked-text', textContent: message || 'Full access requires an account.' })
    ]);
    document.body.appendChild(badge);

    requestAnimationFrame(() => badge.classList.add('pp-visible'));

    setTimeout(() => {
      badge.classList.remove('pp-visible');
      setTimeout(() => { if (badge.parentNode) badge.remove(); }, 250);
    }, 2500);
  }

  // ── Export ───────────────────────────────────────────────

  window.PPDemoOverlay = {
    showSpotlight,
    hideSpotlight,
    showTooltip,
    hideTooltip,
    showPanel,
    hidePanel,
    showExitButton,
    hideExitButton,
    showLockedMessage,
    destroyAll
  };

  console.log('[Demo Overlay] Subsystem loaded');
})();
