import re
import traceback

try:
    with open(r'c:\Users\smspr\Downloads\kebo1dd\neurowealth\app.html', 'r', encoding='utf-8') as f:
        content = f.read()

    style_insert = """        body {
            background-color: #0B0B0C;
        }

        .accent {
            color: #EAB308;
            font-style: italic;
        }

        .hero-labels {
            display: flex;
            justify-content: center;
            gap: 24px;
            flex-wrap: wrap;
            margin-top: 32px;
            margin-bottom: 16px;
        }

        .simple-label {
            font-size: 14px;
            color: #EDEDED;
            padding: 8px 16px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.02);
            transition: border-color 0.2s ease;
        }

        .hub-section-label {
            font-size: 12px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: rgba(234, 179, 8, 0.85);
            margin-bottom: 24px;
            margin-top: 80px;
        }

"""
    if "body {" not in content:
        content = content.replace("        /* ============ APPLICATION HUB — INSTITUTIONAL GRADE ============ */",
                                style_insert + "        /* ============ APPLICATION HUB — INSTITUTIONAL GRADE ============ */", 1)

    content = content.replace("padding: 180px 0 80px;", "padding: 180px 0 0px;", 1)
    content = content.replace("padding: 80px 0 120px;", "padding: 0 0 120px;", 1)

    content = re.sub(r'(\.hub-grid\s*\{[^}]*?)overflow:\s*hidden;\s*([^}]*?\})', r'\1/* overflow removed */\2', content)

    new_card = """.hub-card {
            position: relative;
            background: #111214;
            padding: 48px 36px 44px;
            display: flex;
            flex-direction: column;
            transition: all 0.2s ease;
            cursor: pointer;
            text-decoration: none;
            color: #EDEDED;
            border: 1px solid transparent;
        }"""
    content = re.sub(r'\.hub-card\s*\{[^}]*\}', new_card, content, count=1)

    new_card_hover = """.hub-card:hover {
            background: rgba(255, 255, 255, 0.025);
            transform: translateY(-4px);
            border-color: rgba(234, 179, 8, 0.25);
            z-index: 10;
        }"""
    content = re.sub(r'\.hub-card:hover\s*\{[^}]*\}', new_card_hover, content, count=1)

    content = content.replace("color: rgba(255, 255, 255, 0.3);", "color: #9CA3AF;")
    content = content.replace("color: rgba(255, 255, 255, 0.6);", "color: #EAB308;")

    content = re.sub(r'(\.hub-card-title\s*\{[^}]*?color:\s*)rgba\(255,\s*255,\s*255,\s*0\.9\)(;[^}]*\})', r'\1#EDEDED\2', content)
    content = re.sub(r'(\.hub-card:hover\s*\.hub-card-title\s*\{[^}]*?color:\s*)#ffffff(;[^}]*\})', r'\1#EAB308\2', content)

    content = re.sub(r'(\.hub-card-desc\s*\{[^}]*?color:\s*)rgba\(255,\s*255,\s*255,\s*0\.3\)(;[^}]*\})', r'\1#9CA3AF\2', content)
    content = re.sub(r'(\.hub-card:hover\s*\.hub-card-desc\s*\{[^}]*?color:\s*)rgba\(255,\s*255,\s*255,\s*0\.45\)(;[^}]*\})', r'\1#EDEDED\2', content)

    content = re.sub(r'(\.hub-arrow\s*\{[^}]*?color:\s*)rgba\(255,\s*255,\s*255,\s*0\.2\)(;[^}]*\})', r'\1#9CA3AF\2', content)
    content = re.sub(r'(\.hub-card:hover\s*\.hub-arrow\s*\{[^}]*?color:\s*)rgba\(255,\s*255,\s*255,\s*0\.5\)(;[^}]*\})', r'\1#EAB308\2', content)

    content = content.replace("<h1>Application <i>Hub</i></h1>", '<h1>Application <span class="accent">Hub</span></h1>')

    pills_html = """            <div class="hero-labels" data-animate>
                <span class="simple-label">Signal Intelligence</span>
                <span class="simple-label">Strategy Execution</span>
                <span class="simple-label">Market Structure</span>
                <span class="simple-label">Portfolio Systems</span>
            </div>
            <div class="hub-divider"></div>"""
    if "hero-labels" not in content:
        content = content.replace('<div class="hub-divider"></div>', pills_html, 1)

    label_html = """            <div class="hub-section-label">SYSTEM MODULES</div>
            <div class="hub-grid" id="hub-grid">"""
    if "hub-section-label" not in content.split("SYSTEM MODULES")[0]:
        content = content.replace('<div class="hub-grid" id="hub-grid">', label_html, 1)

    with open(r'c:\Users\smspr\Downloads\kebo1dd\neurowealth\app.html', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Success")

except Exception as e:
    print(traceback.format_exc())
