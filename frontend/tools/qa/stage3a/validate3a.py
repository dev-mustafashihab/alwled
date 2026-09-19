import re, json
from playwright.sync_api import sync_playwright
srcs = {}
for f, key in [('audit_pages.py','MEASURE'), ('audit_filters.py','FILTERS')]:
    txt = open(f, encoding='utf-8').read()
    m = re.search(key + r'\s*=\s*"""(.*?)"""', txt, re.S)
    srcs[key] = m.group(1)
with sync_playwright() as pw:
    b = pw.chromium.launch(); p = b.new_page(); p.goto('about:blank')
    for k, v in srcs.items():
        try:
            p.evaluate('(src) => { new Function(src); return "OK"; }', v)
            print(k, 'SYNTAX OK', len(v), 'chars')
        except Exception as e:
            print(k, 'SYNTAX FAIL:', str(e)[:300])
    b.close()
