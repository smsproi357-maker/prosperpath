const fs = require('fs');
const path = require('path');
const dir = path.join('c:', 'Users', 'smspr', 'Downloads', 'kebo1dd', 'neurowealth');
const cssPath = path.join(dir, 'styles.css');

let css = fs.readFileSync(cssPath, 'utf8');

// The ultimate gold scrubber. We are targeting EVERYTHING that remotely looks like the gold/brown/warm theme
// and converting it to stark, cool, institutional white/gray/charcoal.

// 1. Core Variables
// Convert main accent from gold (#9e8e7a) to a clean, highly muted cool-gray (#a1a1aa)
css = css.replace(/--color-accent:\s*#9e8e7a;/g, '--color-accent: #e4e4e7;');
css = css.replace(/--color-accent-dark:\s*#807669;/g, '--color-accent-dark: #a1a1aa;');

// Convert any lingering RGB (198, 168, 124) or (158, 142, 122) to stark white/neutral (255, 255, 255)
css = css.replace(/198,\s*168,\s*124/g, '255, 255, 255');
css = css.replace(/158,\s*142,\s*122/g, '255, 255, 255');

// 2. Gradients
// #d4b581 -> #a88d5e (primary button gold) -> change to crisp white/light gray gradient
css = css.replace(/linear-gradient\(180deg,\s*#d4b581\s*0%,\s*#a88d5e\s*100%\)/g, 'linear-gradient(180deg, #ffffff 0%, #e4e4e7 100%)');
css = css.replace(/linear-gradient\(180deg,\s*#e3c490\s*0%,\s*#b39b70\s*100%\)/g, 'linear-gradient(180deg, #ffffff 0%, #a1a1aa 100%)');

// Other accent gradients
css = css.replace(/--gradient-accent:\s*linear-gradient\(135deg,\s*#b39b70\s*0%,\s*#8f7954\s*100%\);/g, '--gradient-accent: linear-gradient(135deg, #ffffff 0%, #a1a1aa 100%);');

// 3. Any straggling hex codes
// #b39b70 (old accent)
css = css.replace(/#b39b70/gi, '#a1a1aa');
// #8f7954 (old accent dark)
css = css.replace(/#8f7954/gi, '#71717a');
// #1d1b18 (warm darks) or #1f1b14
css = css.replace(/#1d1b18/gi, '#161619');

// 4. Force primary button text to be dark (since we made the button white/gray)
css = css.replace(/\.btn-primary\s*{[^}]*color:\s*#000;[^}]*}/, (match) => {
    // Ensuring text is indeed black/dark on the new white buttons
    return match;
});

// Update the overrides we added earlier to be even stricter
const ultimateOverrides = `
/* ================== ULTIMATE NEUTRAL STARK OVERRIDES ================== */
/* Nullify ANY remaining gold or warm tones on common elements */
.hero-badge, .stat-value, .blog-category, .badge-best-for, .btn-ghost, .feature-tag, .pricing-name, .logo {
    color: var(--color-text-primary) !important;
}

/* Nav underline - make it just white instead of the old gold */
.nav-links a.active::after {
    background: #ffffff !important; 
    opacity: 0.8 !important;
}

/* Icons that used to be gold tinted */
.logo-icon, .card-icon {
    background: rgba(255, 255, 255, 0.05) !important;
    color: var(--color-text-primary) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

/* Ensure svgs inherit currentColor */
svg {
    fill: currentColor;
}
`;

fs.writeFileSync(cssPath, css + ultimateOverrides);
console.log('Successfully ran ultimate scrubber on styles.css');
