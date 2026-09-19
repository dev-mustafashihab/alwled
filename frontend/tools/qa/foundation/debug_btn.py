import os
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
HARNESS = open('/root/alwled/frontend/tools/qa/foundation/harness.js', encoding='utf-8').read()
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 900, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2600)
    p.evaluate(HARNESS); p.evaluate("window.__stwHarness.mount()"); p.wait_for_timeout(600)
    r = p.evaluate("""(() => {
      const el = document.querySelector('#stw-t-primary');
      const cs = getComputedStyle(el);
      // ابحث عن كل القواعد المطابقة لهذا العنصر
      const matched = [];
      for (const ss of document.styleSheets) {
        let rules; try { rules = ss.cssRules; } catch (e) { continue; }
        const walk = (list, layer) => { for (const rule of list) {
          if (rule.cssRules && rule.constructor.name === 'CSSLayerBlockRule') { walk(rule.cssRules, rule.name); continue; }
          if (rule.selectorText) { try { if (el.matches(rule.selectorText)) matched.push({ sheet: (ss.href||'').split('/').pop(), layer: layer || '-', sel: rule.selectorText.slice(0,40), css: rule.style.cssText.slice(0,90) }); } catch (e) {} }
        } }; walk(rules, null);
      }
      return { matched: matched.filter(m => /stw-btn/.test(m.sel) || /button/.test(m.sel)).slice(0, 8),
        tokens: { primary: cs.getPropertyValue('--color-primary'), onPrimary: cs.getPropertyValue('--color-on-primary'), stwRadius: cs.getPropertyValue('--stw-radius-md') },
        computed: { bg: cs.backgroundColor, color: cs.color, borderColor: cs.borderTopColor },
        matches: el.matches('.stw-btn--primary'), sheetCount: document.styleSheets.length };
    })()""")
    import json
    print(json.dumps(r, ensure_ascii=False, indent=1)[:2200])
    ctx.close(); b.close()