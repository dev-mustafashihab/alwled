import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
JS="""(() => {
  const sc = document.getElementById('shop-menu-scroll');
  const kids = Array.from(sc.children).filter(el => el.getBoundingClientRect().height > 0 || el.classList.contains('shop-menu__divider'));
  const last = kids[kids.length - 1];
  const scr = sc.getBoundingClientRect();
  const lb = last ? last.getBoundingClientRect() : null;
  return {viewport: window.innerWidth + 'x' + window.innerHeight,
          scrollClientH: Math.round(sc.clientHeight),
          lastChild: last ? last.className : null,
          slackPx: lb ? Math.round(scr.bottom - lb.bottom) : null,
          viewportH: window.innerHeight};
})()"""
out={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w,h in [(360,780),(390,844),(390,700),(430,900),(600,900),(768,1000)]:
        ctx=b.new_context(viewport={'width':w,'height':h},locale='ar')
        p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1500)
        p.click('#shop-burger'); p.wait_for_timeout(800)
        out['%dx%d'%(w,h)]=p.evaluate(JS)
        ctx.close()
    b.close()
print(json.dumps(out,ensure_ascii=False,indent=1))
json.dump(out,open('slack-after.json','w'),ensure_ascii=False,indent=1)
