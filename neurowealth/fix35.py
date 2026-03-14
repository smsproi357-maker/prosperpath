content = open('module-3-5.html', 'r', encoding='utf-8').read()

# Fix font-family single quotes (two occurrences: bS5 done state, bReview)
content = content.replace("font-family:'Outfit'", "font-family:\\'Outfit\\'")

# Fix onclick single-quote args in sim buttons
content = content.replace("doPick('impulse')", "doPick(\\'impulse\\')")
content = content.replace("doPick('pullback')", "doPick(\\'pullback\\')")
content = content.replace("doPred('hh')", "doPred(\\'hh\\')")
content = content.replace("doPred('hl')", "doPred(\\'hl\\')")
content = content.replace("doPred('ll')", "doPred(\\'ll\\')")

open('module-3-5.html', 'w', encoding='utf-8').write(content)
print('Done. Affected lines:')
for i, ln in enumerate(content.splitlines(), 1):
    if "Outfit" in ln or "doPick" in ln or "doPred" in ln:
        print(f"  {i}: {ln[:100]}")
