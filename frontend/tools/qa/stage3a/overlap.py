from playwright.sync_api import sync_playwright
import json
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
    d=p.evaluate("""(() => {
      const R = el => { const b=el.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),bottom:Math.round(b.bottom)}; };
      const card=document.querySelector('.shop-card');
      const media=card.querySelector('.shop-card__media');
      const body=card.querySelector('.shop-card__body');
      const name=card.querySelector('.shop-card__name a');
      const mediaR=R(media), bodyR=R(body), nameR=R(name);
      const overlap = !(nameR.bottom < mediaR.top || nameR.top > mediaR.bottom);
      const cx = mediaR.x + mediaR.w/2, cy = mediaR.y + mediaR.h/2;
      const hit = document.elementFromPoint(cx, cy);
      return {card:R(card), media:mediaR, body:bodyR, name:nameR,
        bodyOverlapsMedia: bodyR.top < mediaR.bottom,
        nameOverlapsMedia: overlap,
        mediaCss: {position:getComputedStyle(media).position, margin:getComputedStyle(media).margin, display:getComputedStyle(media).display, aspect:getComputedStyle(media).aspectRatio},
        bodyCss: {margin:getComputedStyle(body).margin, padding:getComputedStyle(body).padding, position:getComputedStyle(body).position},
        hitAtMediaCenter: hit ? {tag:hit.tagName, cls:hit.className, text:(hit.textContent||'').slice(0,20)} : null,
        scrollY: Math.round(window.scrollY)}; })()""")
    print(json.dumps(d, ensure_ascii=False, indent=1))
    p.screenshot(path='/root/alwled/frontend/tools/qa/stage3a/card-overlap-1366.png')
    b.close()
