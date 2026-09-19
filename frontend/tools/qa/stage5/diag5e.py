
import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2300)
    d = p.evaluate("""(() => {
      const s=document.querySelector('.shop-footer__sec > summary'); const cs=getComputedStyle(s);
      const kids=Array.from(s.childNodes).map(n=>n.nodeType===1?[n.tagName,String(n.className).slice(0,18),Math.round(n.getBoundingClientRect().width),getComputedStyle(n).whiteSpace]:[n.nodeType,'text:'+(n.textContent||'').trim().slice(0,12)]);
      return {sw:s.scrollWidth, cw:s.clientWidth, ws:cs.whiteSpace, ov:cs.overflowX, disp:cs.display, gap:cs.gap, pad:cs.paddingInlineStart+'/'+cs.paddingInlineEnd, after:getComputedStyle(s,'::after').content, kids:kids};
    })()""")
    print('SUMMARY:', json.dumps(d, ensure_ascii=False))
    # هدف لمس المسار: elementFromPoint فوق/تحت الرابط
    p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2400)
    hit = p.evaluate("""(() => {
      const a=document.querySelector('#shop-view .shop-crumbs a'); const b=a.getBoundingClientRect();
      const mid=b.left+b.width/2; const out=[];
      for (const dy of [-11,-8,0,8,11]) { const el=document.elementFromPoint(mid, b.top+dy);
        out.push(dy+':'+(el? (el.closest('a')?'LINK':String(el.className).slice(0,16)) : 'null')); }
      return {box:[Math.round(b.width),Math.round(b.height)], hits:out};
    })()""")
    print('CRUMB HIT:', json.dumps(hit, ensure_ascii=False))
    # قصّ 200%
    p.evaluate("document.documentElement.style.fontSize='200%'"); p.wait_for_timeout(800)
    clip = p.evaluate("""(() => { const out=[];
      ['.shop-product','.shop-buy','.shop-buy__facts','.shop-footer__sec > summary','.shop-section'].forEach(s=>{
        const e=document.querySelector(s); if(!e) return; const cs=getComputedStyle(e);
        out.push({s:s, sw:e.scrollWidth, cw:e.clientWidth, ov:cs.overflowX, ws:cs.whiteSpace,
          wide:Array.from(e.querySelectorAll('*')).filter(k=>k.scrollWidth>k.clientWidth+2).slice(0,2).map(k=>String(k.className).slice(0,24)+'|'+(k.textContent||'').trim().slice(0,14))});});
      return out; })()""")
    print('CLIP200:', json.dumps(clip, ensure_ascii=False, indent=1)[:1200])
    ctx.close(); b.close()
