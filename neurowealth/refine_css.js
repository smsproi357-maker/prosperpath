const fs = require('fs');
const path = require('path');
const dir = path.join('c:', 'Users', 'smspr', 'Downloads', 'kebo1dd', 'neurowealth');
const cssPath = path.join(dir, 'styles.css');

let css = fs.readFileSync(cssPath, 'utf8');

// 1. Neutralize Teal (0, 212, 170) -> neutral glass
css = css.replace(/rgba\(\s*0\s*,\s*212\s*,\s*170\s*,\s*([0-9.]+)\s*\)/g, 'rgba(255, 255, 255, $1)');
css = css.replace(/#00d4aa/g, 'var(--color-text-primary)');

// 2. Neutralize remaining Navy/Blue backgrounds to charcoal/black
css = css.replace(/rgba\(\s*10\s*,\s*22\s*,\s*40\s*,\s*0\.85\s*\)/g, 'rgba(5, 5, 6, 0.65)');
css = css.replace(/rgba\(\s*10\s*,\s*22\s*,\s*40\s*,\s*0\.95\s*\)/g, 'rgba(5, 5, 6, 0.85)');
css = css.replace(/rgba\(\s*30\s*,\s*42\s*,\s*58\s*,\s*([0-9.]+)\s*\)/g, 'rgba(15, 15, 18, $1)');

// 3. Reduce Gold (--color-accent and rgb 198, 168, 124) in borders and shadows globally
css = css.replace(/--color-border-accent:\s*rgba\(198,\s*168,\s*124,\s*0\.3\);/g, '--color-border-accent: rgba(255, 255, 255, 0.12);');
css = css.replace(/--shadow-glow:\s*0\s*0\s*20px\s*rgba\(198,\s*168,\s*124,\s*0\.1\);/g, '--shadow-glow: 0 4px 24px rgba(0, 0, 0, 0.4);');
css = css.replace(/--shadow-glow-lg:\s*0\s*0\s*40px\s*rgba\(198,\s*168,\s*124,\s*0\.15\);/g, '--shadow-glow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);');

// 4. Update the core variables to glassmorphism standards
css = css.replace(/--color-surface:\s*#0f0f11;/g, '--color-surface: rgba(255, 255, 255, 0.03);');
css = css.replace(/--color-surface-elevated:\s*#161619;/g, '--color-surface-elevated: rgba(255, 255, 255, 0.06);');

// 5. Inject global glassmorphism rules at the bottom of the file to override non-premium styles
const glassOverrides = `
/* ================== OVERRIDES FOR INSTITUTIONAL GLASSMORPHISM ================== */
.card, .tool-review-card, .glass-panel, .glass-card, .expert-tip, .blog-card, .feature-card, .pricing-card {
  background: var(--color-surface) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid var(--color-border) !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
  transition: all var(--transition-base);
}

.card:hover, .tool-review-card:hover, .blog-card:hover, .feature-card:hover, .pricing-card:hover {
  background: var(--color-surface-elevated) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
}

.header {
  background: rgba(5, 5, 6, 0.7) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border-bottom: 1px solid var(--color-border) !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2) !important;
}

.header.scrolled {
  background: rgba(5, 5, 6, 0.9) !important;
}

/* Neutralize table glass */
.comparison-table-wrapper {
  background: var(--color-surface) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid var(--color-border) !important;
}
.comparison-table thead {
  background: rgba(255, 255, 255, 0.03) !important;
}
.comparison-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.04) !important;
}
.feature-tag {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: var(--color-text-secondary) !important;
}

/* Neutralize nav dropdowns / auth menus */
.auth-rolldown-container, .settings-wrapper .dropdown-menu {
  background: rgba(15, 15, 18, 0.85) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

/* Base styling updates */
.settings-icon-btn, .logo-icon, .card-icon, .expert-tip-icon {
  background: var(--color-surface) !important;
  border: 1px solid var(--color-border) !important;
  box-shadow: none !important;
  color: var(--color-text-primary) !important;
}

.settings-icon-btn:hover {
  background: var(--color-surface-elevated) !important;
}

.nav-links a::after {
  background: var(--color-border-accent) !important;
  height: 2px !important;
  bottom: -2px !important;
}
.nav-links a:hover, .nav-links a.active {
  color: var(--color-text-primary) !important;
}
`;

fs.writeFileSync(cssPath, css + glassOverrides);
console.log('Successfully updated styles.css');
