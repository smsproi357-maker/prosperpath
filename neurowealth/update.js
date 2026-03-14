const fs = require('fs');
const path = require('path');

const dir = process.cwd();

function walk(directory) {
    let results = [];
    const list = fs.readdirSync(directory);
    list.forEach(function (file) {
        if (file === 'node_modules' || file.startsWith('.')) return;
        file = path.join(directory, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.html')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(dir);

let modifiedCount = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    if (!content.includes('class="nav-links"') && !content.includes('id="nav-links"')) return;

    if (!content.match(/<a[^>]*href="[^"]*resources\.html"[^>]*>Resources<\/a>/i)) return;

    if (content.includes('class="nav-item-dropdown"')) {
        console.log(`Skipping (already has dropdown): ${file}`);
        return;
    }

    let headerIndex = content.indexOf('nav-links');
    if (headerIndex !== -1) {
        let beforeHeader = content.substring(0, headerIndex);
        let afterHeader = content.substring(headerIndex);

        let replaced = false;
        const newAfterHeader = afterHeader.replace(/^(\s*)(<a\s+[^>]*href="([^"]*?)resources\.html"[^>]*>\s*Resources\s*<\/a>)/im, function (match, whitespace, fullAnchor, relativePrefix) {
            replaced = true;
            return `${whitespace}<div class="nav-item-dropdown">
${whitespace}    ${fullAnchor}
${whitespace}    <div class="dropdown-panel">
${whitespace}        <a href="${relativePrefix || ''}wealth-guides.html" class="dropdown-item">
${whitespace}            <span class="dropdown-item-title">Wealth Guides</span>
${whitespace}            <span class="dropdown-item-desc">Structured frameworks for building financial understanding.</span>
${whitespace}        </a>
${whitespace}        <a href="${relativePrefix || ''}tool-reviews.html" class="dropdown-item">
${whitespace}            <span class="dropdown-item-title">Tool Reviews</span>
${whitespace}            <span class="dropdown-item-desc">Reviews of platforms and financial tools.</span>
${whitespace}        </a>
${whitespace}        <a href="${relativePrefix || ''}ai-calculators.html" class="dropdown-item">
${whitespace}            <span class="dropdown-item-title">AI Calculators</span>
${whitespace}            <span class="dropdown-item-desc">Interactive tools for financial modelling.</span>
${whitespace}        </a>
${whitespace}        <a href="${relativePrefix || ''}blog.html" class="dropdown-item">
${whitespace}            <span class="dropdown-item-title">Insights</span>
${whitespace}            <span class="dropdown-item-desc">Market analysis and commentary.</span>
${whitespace}        </a>
${whitespace}    </div>
${whitespace}</div>`;
        });

        if (replaced) {
            content = beforeHeader + newAfterHeader;
            fs.writeFileSync(file, content, 'utf8');
            modifiedCount++;
            console.log(`Updated: ${file}`);
        }
    }
});
console.log(`Total files updated: ${modifiedCount}`);
