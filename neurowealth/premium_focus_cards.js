const fs = require('fs');
const path = require('path');
const dir = path.join('c:', 'Users', 'smspr', 'Downloads', 'kebo1dd', 'neurowealth');
const cssPath = path.join(dir, 'styles.css');

let css = fs.readFileSync(cssPath, 'utf8');

// The reference image for "Our Core Focus Areas" shows a very specific visual:
// 1. Extreme dark glass with a subtle lighter gradient from the top left.
// 2. A very subtle inner shadow (white at the top to simulate physical thickness).
// 3. A subtle noise/grain texture on the cards to make them feel like physical frosted glass.
// 4. Pure white crisp serif headers, muted gray body text.
// 5. The icon is inside an ultra-thin border box with a slight background.

const institutionalPremiumOverrides = `
/* ================== CORE FOCUS AREAS (INSTITUTIONAL GRADE) ================== */

/* Subtle noise texture base64 for that physical premium matte feel */
:root {
  --texture-noise: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opactiy='0.08'/%3E%3C/svg%3E");
}

.features .section-header h2 {
    font-family: var(--font-display);
    font-size: 2.8rem;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
}

.features .section-header p {
    color: var(--color-text-muted);
    font-size: 1.1rem;
    max-width: 600px;
    margin: 0 auto;
}

.focus-card {
    position: relative;
    overflow: hidden;
    /* Base dark color + subtle top-left gradient */
    background: linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%), #050506 !important;
    /* Physical border */
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    /* Specular inner highlight simulating glass thickness */
    box-shadow: 
        0 40px 80px rgba(0, 0, 0, 0.8),
        inset 0 1px 1px rgba(255, 255, 255, 0.15),
        inset 0 0 40px rgba(0, 0, 0, 0.5) !important;
    backdrop-filter: blur(32px) !important;
    -webkit-backdrop-filter: blur(32px) !important;
    padding: 3rem 2rem !important;
    border-radius: 12px !important; /* Slightly sharper premium corner */
}

/* Injecting the noise texture strictly as an overlay */
.focus-card::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.03; /* Extremely subtle */
    background-image: var(--texture-noise);
    pointer-events: none;
    z-index: 0;
}

.focus-card > * {
    position: relative;
    z-index: 1;
}

.focus-icon-box {
    width: 48px !important;
    height: 48px !important;
    border-radius: 8px !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%) !important;
    color: rgba(255,255,255,0.9) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.1) !important;
}

.focus-card h3 {
    font-family: var(--font-display) !important;
    font-size: 1.45rem !important;
    font-weight: 500 !important;
    letter-spacing: -0.01em !important;
    color: var(--color-text-primary) !important;
    margin-bottom: 1.2rem !important;
}

.focus-card p {
    font-family: var(--font-sans) !important;
    font-size: 0.9rem !important;
    line-height: 1.6 !important;
    color: rgba(255,255,255,0.5) !important; /* Very specifically muted gray */
    margin: 0 !important;
}
`;

fs.writeFileSync(cssPath, css + "\n" + institutionalPremiumOverrides);
console.log('Appended ultra-premium focus card overrides to styles.css');
