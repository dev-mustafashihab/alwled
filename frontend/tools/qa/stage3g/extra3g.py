import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    errs=[]; p.on('pageerror', lambda e: errs.append(str(e)[:120])); p.on('console', lambda m: errs.append('C:'+m.text[:100]) if m.type=='error' else None)
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    # 1) تحميل: دور رسالة التحميل + aria-busy
    p.route('**/products?*', lambda r: None)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1600)
    R['loading']=p.evaluate("""(() => { const s=document.querySelector('#shop-view > .shop-section'); const n=document.querySelector('#shop-view .shop-note');
      return {busy: s&&s.getAttribute('aria-busy'), note: n?n.textContent.trim():null, noteRole: n&&n.getAttribute('role'),
        skelHidden: Array.from(document.querySelectorAll('.skeleton')).every(x=>x.getAttribute('aria-hidden')==='true'),
        viewLive: document.getElementById('shop-view').getAttribute('aria-live')}; })()""")
    p.unroute('**/products?*')
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2000)
    # 2) زر «عرض النتائج»: إرجاع التركيز
    p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(700)
    p.evaluate("document.querySelector('.shop-filters__done').click()"); p.wait_for_timeout(700)
    R['done_focus']=p.evaluate("({focus: document.activeElement ? (document.activeElement.id||String(document.activeElement.className).slice(0,30)) : null, body: getComputedStyle(document.body).overflowY, expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded')})")
    # 3) checkbox: Space + label + مساحة اللمس
    p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(700)
    R['check_space_before']=p.evaluate("document.getElementById('shop-filter-instock').checked")
    p.evaluate("document.getElementById('shop-filter-instock').focus()")
    p.keyboard.press('Space'); p.wait_for_timeout(250)
    R['check_space_after']=p.evaluate("document.getElementById('shop-filter-instock').checked")
    R['check_label_h']=p.evaluate("(() => { const l=document.querySelector('.shop-check'); const b=l.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height)}; })()")
    p.wait_for_timeout(1500)
    R['after_space_render']=p.evaluate("({hash: location.hash, cards: document.querySelectorAll('#shop-view > .shop-grid .shop-card').length})")
    p.keyboard.press('Escape'); p.wait_for_timeout(600)
    # 4) مسار التنقّل: مساحة النقر الفعلية (نقطة 5px فوق حدّ الرابط)
    R['crumb_hit']=p.evaluate("""(() => { const a=document.querySelector('#shop-view .shop-crumbs a'); if(!a) return null; const b=a.getBoundingClientRect();
      const el=document.elementFromPoint(b.x+b.width/2, b.y-4);
      return {rect:{w:Math.round(b.width),h:Math.round(b.height)}, hitAbove: el ? el.tagName+'.'+String(el.className).slice(0,20) : null, isLink: !!(el && el.closest('.shop-crumbs a'))}; })()""")
    # 5) حلقة التركيز على زر السلة/البطاقة (فاتح+داكن)
    for theme in ('light','dark'):
        ctx2=b.new_context(viewport={'width':390,'height':844}, locale='ar')
        if theme=='dark': ctx2.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        q=ctx2.new_page(); q.goto(SHOP, wait_until='load'); q.wait_for_timeout(1400)
        q.evaluate('location.hash = "#/products"'); q.wait_for_timeout(1900)
        R['ring_%s'%theme]=q.evaluate(r"""(() => {
          const parse=c=>{const m=String(c).match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(parseFloat);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
          const effBg=el=>{let cur=el,st=[];while(cur){const c=parse(getComputedStyle(cur).backgroundColor);if(c&&c.a>0)st.push(c);if(c&&c.a>=1)break;cur=cur.parentElement;}
            let base={r:255,g:255,b:255};for(let i=st.length-1;i>=0;i--){const s=st[i];base={r:s.r*s.a+base.r*(1-s.a),g:s.g*s.a+base.g*(1-s.a),b:s.b*s.a+base.b*(1-s.a)};}return base;};
          const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
          const ratio=(fg,bg)=>{const a=lum(fg),b=lum(bg),hi=Math.max(a,b),lo=Math.min(a,b);return Math.round(((hi+0.05)/(lo+0.05))*100)/100;};
          const probe=(sel)=>{const el=document.querySelector(sel);if(!el)return null;el.focus();const cs=getComputedStyle(el);
            const bg=effBg(el.parentElement||el);const oc=parse(cs.outlineColor)||{r:0,g:0,b:0,a:1};
            const ocs=oc.a<1?{r:oc.r*oc.a+bg.r*(1-oc.a),g:oc.g*oc.a+bg.g*(1-oc.a),b:oc.b*oc.a+bg.b*(1-oc.a)}:oc;
            return {outline:cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor,ratio:ratio(ocs,bg)};};
          const r={}; r.add=probe('.shop-card__add'); r.media=probe('.shop-card__media'); r.name=probe('.shop-card__name a'); r.crumb=probe('#shop-view .shop-crumbs a'); return r; })()""")
        print(theme,'ring:',R['ring_%s'%theme])
        ctx2.close()
    R['console']=errs
    print(json.dumps({k:R[k] for k in ['loading','done_focus','check_space_before','check_space_after','check_label_h','after_space_render','crumb_hit','console']},ensure_ascii=False,indent=1))
    b.close()
json.dump(R, open('/root/alwled/frontend/tools/qa/stage3g/extra3g-after.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
