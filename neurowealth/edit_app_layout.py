import re
import traceback

try:
    file_path = r'c:\Users\smspr\Downloads\kebo1dd\neurowealth\app.html'
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    # Apply margin top to labels and remove margin-bottom to clear constraints
    text = re.sub(
        r'(\.hero-labels\s*\{[^}]*?margin-top:\s*)32px(;\s*margin-bottom:\s*)16px(;[^}]*\})',
        r'\1 36px\2 0px\3',
        text
    )

    # Remove margin top off hub section label since we are managing it with hero padding
    text = re.sub(
        r'(\.hub-section-label\s*\{[^}]*?margin-bottom:\s*24px;\s*margin-top:\s*)80px(;[^}]*\})',
        r'\1 0px\2',
        text
    )

    # Increase hero padding bottom from 0px to 56px. 
    # With label margin-bottom: 24px, the gap from pills to grid is 80px (target 72px-96px)
    text = re.sub(
        r'(\.hub-hero\s*\{[^}]*?padding:\s*180px 0 )0px(;[^}]*\})',
        r'\1 56px\2',
        text
    )

    # Remove the divider, it's not present in the design layout requirements
    text = text.replace('<div class="hub-divider"></div>', '')

    # Ensure JS sequence includes pills for smooth entry instead of them popping in
    if 'const labels = heroEl.querySelector(".hero-labels");' not in text:
        text = text.replace(
            'const divider = heroEl.querySelector(".hub-divider");',
            'const labels = heroEl.querySelector(".hero-labels");\n            const divider = heroEl.querySelector(".hub-divider");'
        )
        text = text.replace(
            'const sequence = [eyebrow, h1, sub, divider].filter(Boolean);',
            'const sequence = [eyebrow, h1, sub, labels].filter(Boolean);'
        )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)

    print("Success")

except Exception as e:
    print(traceback.format_exc())
