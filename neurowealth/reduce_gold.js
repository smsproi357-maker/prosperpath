const fs = require('fs');
const path = require('path');
const dir = path.join('c:', 'Users', 'smspr', 'Downloads', 'kebo1dd', 'neurowealth');
const cssPath = path.join(dir, 'styles.css');

let css = fs.readFileSync(cssPath, 'utf8');

// 1. Desaturate base gold slightly so when it IS used, it's more subtle and neutral.
// Original: #b39b70 / rgb 198, 168, 124
// New: #9e8e7a (more grayish-gold)
css = css.replace(/--color-accent:\s*#b39b70;/g, '--color-accent: #9e8e7a;');
css = css.replace(/--color-accent-dark:\s*#8f7954;/g, '--color-accent-dark: #807669;');
css = css.replace(/198,\s*168,\s*124/g, '158, 142, 122');

// 2. Remove gold from default links. Links should be white, hover to gold.
css = css.replace(/a\s*{\s*color:\s*var\(--color-accent\);\s*text-decoration:\s*none;\s*transition:\s*color\s*var\(--transition-fast\);\s*}/g, 'a { color: var(--color-text-primary); text-decoration: none; transition: color var(--transition-fast); }');

// 3. Remove gold from .text-accent entirely where it's not strictly necessary (like stat values or small badges)
// Let's add an override block at the end that forces white/neutral on common elements that were gold
const strictNeutralOverrides = `
/* ================== EXTRA NEUTRAL OVERRIDES (MINIMAL GOLD) ================== */
.hero-badge {
    color: var(--color-text-secondary) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.stat-value {
    color: var(--color-text-primary) !important;
}

.text-accent, .blog-category, .badge-best-for {
    color: var(--color-text-secondary) !important;
}

.btn-ghost {
    color: var(--color-text-primary) !important;
}

.btn-ghost:hover {
    color: var(--color-accent) !important;
}

.feature-tag, .pricing-name, .logo {
    color: var(--color-text-primary) !important;
}

.nav-links a.active::after {
    background: var(--color-accent) !important; 
    opacity: 0.5 !important;
}
`;

fs.writeFileSync(cssPath, css + strictNeutralOverrides);
console.log('Successfully further reduced gold from styles.css');
