import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
JS="""(() => {
  const out={sheets:[],found:{}};
  const walk=(list,sheetName)=>{ for (const r of list) {
    if (r.cssRules && r.cssRules.length!==undefined) { walk(r.cssRules, sheetName); continue; }
    if (!r.selectorText) continue;
    const css=r.style ? r.style.cssText : '';
    if (r.selectorText.indexOf('shop-search-row__media img')>=0) out.found.objectFit=[sheetName, r.selectorText, css.slice(0,80)];
    if (r.selectorText.indexOf('shop-search-sheet__input::placeholder')>=0) out.found.placeholder=[sheetName, r.selectorText, css.slice(0,80)];
    if (css.indexOf('--shop-search-accent')>=0) out.found.accent=(out.found.accent||0)+1;
    if (r.selectorText.indexOf('shop-search-sheet__clear')>=0) out.found.clear=(out.found.clear||0)+1;
  } };
  for (const ss of document.styleSheets) {
    let rules=null; try { rules=ss.cssRules; } catch(e) { out.sheets.push([ss.href,'BLOCKED']); continue; }
    out.sheets.push([(ss.href||'inline').split('/').slice(-1)[0], rules.length]);
    walk(rules, (ss.href||'inline').split('/').slice(-1)[0]);
  }
  const input=document.getElementById('shop-search-sheet-input');
  out.placeholderComputed = getComputedStyle(input,'::placeholder').color;
  out.inputComputed = getComputedStyle(input).borderTopColor;
  return out;
})()"""
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},locale='ar')
    p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1600)
    p.click('#shop-search-btn'); p.wait_for_timeout(1100)
    p.type('#shop-search-sheet-input','ثلاجة',delay=30); p.wait_for_timeout(1400)
    r=p.evaluate(JS)
    print(json.dumps(r,ensure_ascii=False,indent=1))
    json.dump(r,open('cssom-after.json','w'),ensure_ascii=False,indent=1)
    b.close()
