import json,sys,os
from playwright.sync_api import sync_playwright
MODE=sys.argv[1] if len(sys.argv)>1 else 'before'
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3g/focus-sheet-%s.json'%MODE
JS=r"""(() => {
  const parse = c => { const m=String(c).match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(parseFloat); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const effBg = el => { let cur=el, st=[]; while(cur){ const c=parse(getComputedStyle(cur).backgroundColor); if(c&&c.a>0) st.push(c); if(c&&c.a>=1) break; cur=cur.parentElement; }
    let base={r:255,g:255,b:255}; for(let i=st.length-1;i>=0;i--){ const s=st[i]; base={r:s.r*s.a+base.r*(1-s.a),g:s.g*s.a+base.g*(1-s.a),b:s.b*s.a+base.b*(1-s.a)}; } return base; };
  const parentBg = el => { const p = el.parentElement; return p ? effBg(p) : effBg(el); };
  const lum = c => { const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const ratio = (fg,bg) => { const a=lum(fg),b=lum(bg),hi=Math.max(a,b),lo=Math.min(a,b); return Math.round(((hi+0.05)/(lo+0.05))*100)/100; };
  const probe = (sel,label) => { const el=document.querySelector(sel); if(!el) return null; el.focus();
    const cs=getComputedStyle(el); const bg=parentBg(el); const oc=parse(cs.outlineColor)||{r:0,g:0,b:0,a:1};
    const ocs = oc.a<1?{r:oc.r*oc.a+bg.r*(1-oc.a),g:oc.g*oc.a+bg.g*(1-oc.a),b:oc.b*oc.a+bg.b*(1-oc.a)}:oc;
    const sh=String(cs.boxShadow); const shc=parse(sh);
    return {label:label, outline:cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, style:cs.outlineStyle, offset:cs.outlineOffset,
      shadow: sh.slice(0,46), ringVsParent: ratio(ocs,bg), shadowVsParent: shc? ratio(shc,bg):null,
      bgParent:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')'}; };
  const out={};
  out.sheetClose = probe('.shop-filters__sheet-close','زر إغلاق اللوحة');
  out.toggle = probe('#shop-filters-toggle','زر الفلاتر');
  out.search = probe('#shop-filter-search','حقل البحث');
  out.category = probe('#shop-filter-category','التصنيف');
  out.brand = probe('#shop-filter-brand','العلامة');
  out.sort = probe('#shop-filter-sort','الترتيب');
  out.minprice = probe('#shop-filter-minprice','أقل سعر');
  out.instock = probe('#shop-filter-instock','المتوفر فقط');
  out.offers = probe('#shop-filter-offers','عليها خصم');
  out.done = probe('.shop-filters__done','عرض النتائج');
  out.clear = probe('.shop-filters__clear','تفريغ الفلاتر');
  out.checkLabel = (() => { const l=document.querySelector('.shop-check'); if(!l) return null; const b=l.getBoundingClientRect();
    return {h:Math.round(b.height), w:Math.round(b.width)}; })();
  return out; })()"""
res={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for theme in ('light','dark'):
        ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar')
        if theme=='dark': ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        p=ctx.new_page(); p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1900)
        p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(800)
        res[theme]=p.evaluate(JS)
        for k,v in res[theme].items():
            if isinstance(v,dict) and 'ringVsParent' in v:
                print('%-6s %-16s outline=%-28s style=%-6s ring/parent=%-6s shadow/parent=%s'%(theme,k,v['outline'],v['style'],v['ringVsParent'],v['shadowVsParent']))
        ctx.close()
    b.close()
json.dump(res, open(OUT,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
