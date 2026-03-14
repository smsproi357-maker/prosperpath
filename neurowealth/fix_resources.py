import os

file_path = "c:/Users/smspr/Downloads/kebo1dd/neurowealth/resources.html"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Chunk 1: Hero Labels
hero_old = """            <div class="hero-labels">
                <span class="simple-label">Wealth Guides</span>
                <span class="simple-label">Tool Reviews</span>
                <span class="simple-label">AI Calculators</span>
                <span class="simple-label">Insights</span>
            </div>"""
hero_new = """            <div class="hero-labels">
                <a href="wealth-guides.html" class="simple-label" style="text-decoration: none; display: inline-block;">Wealth Guides</a>
                <a href="tool-reviews.html" class="simple-label" style="text-decoration: none; display: inline-block;">Tool Reviews</a>
                <a href="ai-calculators.html" class="simple-label" style="text-decoration: none; display: inline-block;">AI Calculators</a>
                <a href="blog.html" class="simple-label" style="text-decoration: none; display: inline-block;">Insights</a>
            </div>"""
content = content.replace(hero_old, hero_new)

# Chunk 2: Featured Resource Card
card_old = """                <a href="portfolio-risk-overlay.js" class="strict-card" style="pointer-events: none;">"""
card_new = """                <a href="blog.html" class="strict-card">"""
content = content.replace(card_old, card_new)

# Chunk 3: All Resources ID
all_old = """    <!-- SECTION 5 — BROWSE ALL -->
    <section class="layout-section">
        <div class="container">
            <h2 class="section-title">All Resources</h2>"""
all_new = """    <!-- SECTION 5 — BROWSE ALL -->
    <section class="layout-section" id="all-resources">
        <div class="container">
            <h2 class="section-title">All Resources</h2>"""
content = content.replace(all_old, all_new)

# Chunk 4: Remove Load More
load_more_old = """            <div style="text-align: center; margin-top: var(--space-8);">
                <button class="btn btn-secondary">Load More</button>
            </div>"""
content = content.replace(load_more_old, "")

# Chunk 5: Explore Resources Button
explore_old = """            <a href="resources.html" class="btn btn-primary"
                style="padding: var(--space-4) var(--space-8); font-size: var(--text-lg);">Explore Resources</a>"""
explore_new = """            <a href="#all-resources" class="btn btn-primary"
                style="padding: var(--space-4) var(--space-8); font-size: var(--text-lg); scroll-behavior: smooth;">Explore Resources</a>"""
content = content.replace(explore_old, explore_new)

# Chunk 6: Add Filter & Scroll Script
script_old = """    <script src="script.js"></script>
    <script src="ai-widget.js"></script>"""
script_new = """    <script>
        document.addEventListener('DOMContentLoaded', () => {
            // Smooth scroll for internal links
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    const href = this.getAttribute('href');
                    if (href === '#') return;
                    
                    const target = document.querySelector(href);
                    if (target) {
                        e.preventDefault();
                        target.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            });

            // Filter Tabs Logic
            const filterTabs = document.querySelectorAll('.filter-tab');
            const browseCards = document.querySelectorAll('.browse-card');

            if (filterTabs.length > 0 && browseCards.length > 0) {
                filterTabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        // Update active tab
                        filterTabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');

                        const filterText = tab.textContent.trim().toUpperCase();

                        // Filter cards
                        browseCards.forEach(card => {
                            const metaElem = card.querySelector('.browse-meta');
                            if (!metaElem) return;
                            
                            const metaLabel = metaElem.textContent.trim().toUpperCase();
                            
                            if (filterText === 'ALL' || 
                                filterText.includes(metaLabel) || 
                                metaLabel.includes(filterText) ||
                                (filterText === 'WEALTH GUIDES' && metaLabel === 'WEALTH GUIDE') || 
                                (filterText === 'TOOL REVIEWS' && metaLabel === 'TOOL REVIEW') || 
                                (filterText === 'AI CALCULATORS' && metaLabel === 'AI CALCULATOR') || 
                                (filterText === 'INSIGHTS' && metaLabel === 'INSIGHT')) {
                                card.style.display = 'flex';
                            } else {
                                card.style.display = 'none';
                            }
                        });
                    });
                });
            }
        });
    </script>
    <script src="script.js"></script>
    <script src="ai-widget.js"></script>"""
content = content.replace(script_old, script_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
