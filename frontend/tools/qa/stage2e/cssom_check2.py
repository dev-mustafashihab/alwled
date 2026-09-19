import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
JS="""(() => {
  const found={};
  const walk=(rules, name)=>{ for (let i=0;i<rules.length;i++){ const r=rules[i];
    if (r.media || r.conditionText) { walk(r.cssRules, name); continue; }
    if (!r.selectorText) continue;
    const sel=r.selectorText, css=(r.style&&r.style.cssText)||'';
    if (sel.indexOf('shop-search-row__media img')>=0 && css.indexOf('object-fit')>=0) found.objectFit=[name,sel,css];
    if (sel.indexOf('shop-search-sheet__input::placeholder')>=0) found.placeholder=[name,sel,css];
    if (css.indexOf('--shop-search-accent')>=0) found.accent=(found.accent||0)+1;
  } };
  for (let s=0;s<document.styleSheets.length;s++){ const ss=document.styleSheets[s];
    let rules; try { rules=ss.cssRules } catch(e){ continue }
    walk(rules,(ss.href||'inline').split('/').slice(-1)[0]); }
  return found;
})()"""
JS_IMG="""(() => {
  // فحص عرضي فقط: صورة اختبار داخل حاوية الصف الحقيقية (لا تُضاف بيانات للمتجر)
  const media=document.querySelector('.shop-search-row__media');
  if(!media) return null;
  const img=document.createElement('img');
  img.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><rect width="10" height="20" fill="%23000"/></svg>';
  media.appendChild(img);
  const cs=getComputedStyle(img);
  const r=img.getBoundingClientRect();
  const mr=media.getBoundingClientRect();
  const out={objectFit:cs.objectFit, w:Math.round(r.width), h:Math.round(r.height),
             mediaW:Math.round(mr.width), mediaH:Math.round(mr.height)};
  img.remove();
  return out;
})()"""
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},locale='ar')
    p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1600)
    p.click('#shop-search-btn'); p.wait_for_timeout(1100)
    p.type('#shop-search-sheet-input','ثلاجة',delay=30); p.wait_for_timeout(1400)
    out={'cssom':p.evaluate(JS),'imgtest':p.evaluate(JS_IMG)}
    print(json.dumps(out,ensure_ascii=False,indent=1))
    json.dump(out,open('cssom-after.json','w'),ensure_ascii=False,indent=1)
    b.close()
