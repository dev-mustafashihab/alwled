import json, sys
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
JS = """(() => {
  const sc = document.getElementById('shop-menu-scroll');
  const scr = sc.getBoundingClientRect();
  const vh = window.innerHeight;
  const rows = Array.from(document.querySelectorAll('.shop-drawer__link')).filter(l => l.getBoundingClientRect().height > 0);
  const theme = document.querySelector('.shop-menu__theme');
  const cta = document.querySelector('.shop-drawer__foot .btn');
  const info = el => { const b = el.getBoundingClientRect();
    return {top: Math.round(b.top), bottom: Math.round(b.bottom),
            inScrollViewport: b.top >= scr.top - 0.5 && b.bottom <= scr.bottom + 0.5,
            inViewport: b.top >= -0.5 && b.bottom <= vh + 0.5, h: Math.round(b.height)}; };
  return {scrollBox: {top: Math.round(scr.top), bottom: Math.round(scr.bottom)},
          maxScroll: Math.round(sc.scrollHeight - sc.clientHeight),
          firstRow: info(rows[0]), lastRow: info(rows[rows.length-1]),
          lastRowText: (rows[rows.length-1].textContent||'').trim().slice(0,20),
          theme: info(theme), cta: cta ? info(cta) : null,
          themeAfterScroll: null};
})()"""
out={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for size in [(390,700),(390,600)]:
        ctx=b.new_context(viewport={'width':size[0],'height':size[1]},locale='ar')
        p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1600)
        p.click('#shop-burger'); p.wait_for_timeout(800); p.mouse.move(195,size[1]-8); p.wait_for_timeout(200)
        k='%dx%d'%size
        out[k]={'top':p.evaluate(JS)}
        p.evaluate("(()=>{const s=document.getElementById('shop-menu-scroll'); if(s) s.scrollTop=s.scrollHeight;})()")
        p.wait_for_timeout(400)
        out[k]['bottom']=p.evaluate(JS)
        out[k]['bottom']['theme']=p.evaluate("""(()=>{const t=document.querySelector('.shop-menu__theme');const b=t.getBoundingClientRect();
          return {top:Math.round(b.top),bottom:Math.round(b.bottom),inViewport:b.bottom<=window.innerHeight+0.5};})()""")
        ctx.close()
    b.close()
print(json.dumps(out,ensure_ascii=False,indent=1))
json.dump(out,open('reach-after.json','w'),ensure_ascii=False,indent=1)
