const fs = require('fs');
const path = require('path');
const dir = path.join('c:', 'Users', 'smspr', 'Downloads', 'kebo1dd', 'neurowealth');
const cssPath = path.join(dir, 'styles.css');
const heroMockPath = path.join(dir, 'hero-mock.css');

// 1. Update styles.css
let css = fs.readFileSync(cssPath, 'utf8');

// Increase base surface opacities for more visible glass
css = css.replace(/--color-surface:\s*rgba\(255,\s*255,\s*255,\s*0\.03\);/g, '--color-surface: rgba(255, 255, 255, 0.05);');
css = css.replace(/--color-surface-elevated:\s*rgba\(255,\s*255,\s*255,\s*0\.06\);/g, '--color-surface-elevated: rgba(255, 255, 255, 0.09);');

// Increase blur globally from 12px/16px/20px to 24px/32px
css = css.replace(/blur\(12px\)/g, 'blur(24px)');
css = css.replace(/blur\(16px\)/g, 'blur(32px)');
css = css.replace(/blur\(20px\)/g, 'blur(32px)');

// Slightly increase border opacity to define the panels better
css = css.replace(/--color-border:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);/g, '--color-border: rgba(255, 255, 255, 0.12);');
css = css.replace(/border: 1px solid rgba\(255,\s*255,\s*255,\s*0\.08\)/g, 'border: 1px solid rgba(255, 255, 255, 0.12)');

fs.writeFileSync(cssPath, css);
console.log('Updated styles.css for stronger glassmorphism.');

// 2. Update hero-mock.css
if (fs.existsSync(heroMockPath)) {
    let heroCss = fs.readFileSync(heroMockPath, 'utf8');
    heroCss = heroCss.replace(/blur\(12px\)/g, 'blur(24px)');
    heroCss = heroCss.replace(/rgba\(255,\s*255,\s*255,\s*0\.03\)/g, 'rgba(255, 255, 255, 0.05)');
    heroCss = heroCss.replace(/rgba\(255,\s*255,\s*255,\s*0\.08\)/g, 'rgba(255, 255, 255, 0.12)');
    fs.writeFileSync(heroMockPath, heroCss);
    console.log('Updated hero-mock.css for stronger glassmorphism.');
}

// 3. Force glassmorphism classes on all standard structural panels across HTML files
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

for (const file of files) {
    let p = path.join(dir, file);
    let html = fs.readFileSync(p, 'utf8');
    let changed = false;

    // Find any elements containing background grays/darks locally and append the global glass class
    // Many pages might have inline styles like `background: #111` or specific classes. 
    // We will instead forcibly ensure the "card", "glass-panel" classes exist on major structural divs. 
    // To avoid breaking layout, we'll scan for common patterns.

    // Example: 'bg-surface' or hardcoded backgrounds -> 'card'
    // Actually, replacing inline backgrounds with nothing and adding 'card' class.
    if (html.includes('style="')) {
        html = html.replace(/style="([^"]*)(background(?:-color)?:\s*(?:#0f0f11|#161619|var\(--color-surface\)|var\(--color-surface-elevated\)|rgba?\([^)]+\)));?([^"]*)"/g, (match, prefix, bgStyle, suffix) => {
            changed = true;
            // remove the background style completely
            let newStyle = (prefix + suffix).trim();
            if (newStyle.length > 0) {
                return 'style="' + newStyle + '" class="glass-panel"';
            }
            return 'class="glass-panel"';
        });
    }

    // To ensure the class attribute merges properly if we appended class="glass-panel" above, 
    // we do a cleanup pass: class="existing" class="glass-panel" -> class="existing glass-panel"
    if (html.includes('class="glass-panel"')) {
        html = html.replace(/class="([^"]+)"\s+class="glass-panel"/g, 'class="$1 glass-panel"');
    }

    if (changed) {
        fs.writeFileSync(p, html);
        console.log('Increased glassmorphism in', file);
    }
}
