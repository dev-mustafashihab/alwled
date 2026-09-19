import json, re
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage2e'
res={}
JS_CAP="""(() => {
  const px=v=>Math.round(v);
  const body=document.querySelector('.shop-search-sheet__body');
  const rows=Array.from(document.querySelectorAll('.shop-search-row'));
  const label=document.querySelector('.shop-search-sheet__label');
  const b=body.getBoundingClientRect();
  const cs=getComputedStyle(body);
  const inner=b.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const labelH = label ? label.getBoundingClientRect().height + 8 : 0;
  const pitch = rows.length>1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : 98;
  const rowH = rows.length ? rows[0].getBoundingClientRect().height : 90;
  return {bodyH: px(b.height), bodyPadding: cs.padding, innerH: px(inner), labelH: px(labelH),
          rowH: px(rowH), pitch: px(pitch), capacity: Math.floor((inner - labelH) / pitch),
          rowsNow: rows.length, visibleRows: rows.filter(r=>{const x=r.getBoundingClientRect();
            return x.top>=b.top-0.5 && x.bottom<=b.bottom+0.5;}).length,
          headH: px(document.querySelector('.shop-search-sheet__head').getBoundingClientRect().height),
          sheetH: px(document.getElementById('shop-search-sheet').getBoundingClientRect().height)};
})()"""
JS_CSSOM="""(() => {
  const want=['object-fit','::placeholder','color-mix','--shop-search-accent'];
  const found={objectFitRules:[],placeholderRules:[],accentRules:0};
  for (const ss of document.styleSheets) {
    let rules; try { rules = ss.cssRules; } catch(e) { continue; }
    const walk = list => { for (const r of list) {
      if (r.cssRules) { walk(r.cssRules); continue; }
      if (!r.selectorText) continue;
      if (/shop-search-row__media img/.test(r.selectorText) && /object-fit/.test(r.style.cssText)) found.objectFitRules.push(r.selectorText+' { '+r.style.objectFit+' }');
      if (/shop-search-sheet__input::placeholder/.test(r.selectorText)) found.placeholderRules.push(r.selectorText+' { color: '+r.style.color+' }');
      if (/--shop-search-accent/.test(r.style.cssText)) found.accentRules++;
    } };
    walk(rules);
  }
  return found;
})()"""
def contrast(fg,bg):
    def lum(c):
        c=[x/255 for x in c]; c=[(x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4) for x in c]
        return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
    l1,l2=lum(fg),lum(bg); l1,l2=max(l1,l2),min(l1,l2); return round((l1+0.05)/(l2+0.05),2)
def parse(s):
    m=re.match(r'color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)',s)
    if m: return [round(float(x)*255) for x in m.groups()]
    m=re.match(r'rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)',s)
    return [float(m.group(1)),float(m.group(2)),float(m.group(3))] if m else None
with sync_playwright() as pw:
    b=pw.chromium.launch()
    # capacity + CSSOM (light 390x844)
    ctx=b.new_context(viewport={'width':390,'height':844},locale='ar',device_scale_factor=2)
    p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1600)
    p.click('#shop-search-btn'); p.wait_for_timeout(1100)
    p.type('#shop-search-sheet-input','ثلاجة',delay=30); p.wait_for_timeout(1500)
    res['capacity']=p.evaluate(JS_CAP)
    res['cssom']=p.evaluate(JS_CSSOM)
    # لون الحقل بدون تركيز
    p.evaluate("document.getElementById('shop-search-sheet-input').blur()")
    p.wait_for_timeout(300)
    res['input_blur']=p.evaluate("""(() => { const i=document.getElementById('shop-search-sheet-input');
      const c=getComputedStyle(i); return {border:c.borderTopColor, bg:c.backgroundColor, color:c.color,
      font:c.fontSize, radius:c.borderTopLeftRadius, outline:c.outlineStyle}; })()""")
    # placeholder color (عبر عنصر مؤقت للقياس فقط — لا يُضاف للصفحة)
    res['placeholder_css']=p.evaluate("""(() => { const s=[...document.styleSheets].flatMap(ss=>{try{return [...ss.cssRules]}catch(e){return []}})
      .filter(r=>r.selectorText && r.selectorText.includes('shop-search-sheet__input::placeholder'));
      return s.map(r=>r.style.color); })()""")
    # القياسات البصرية للثيمين
    for theme in ['light','dark']:
        c2=b.new_context(viewport={'width':390,'height':844},locale='ar',device_scale_factor=2)
        c2.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}"%theme)
        pg=c2.new_page(); pg.goto(SHOP,wait_until='load'); pg.wait_for_timeout(1600)
        pg.click('#shop-search-btn'); pg.wait_for_timeout(1100)
        pg.type('#shop-search-sheet-input','ثلاجة',delay=30); pg.wait_for_timeout(1500)
        res['colors_'+theme]=pg.evaluate("""(() => { const q=s=>document.querySelector(s); const C=s=>{const e=q(s); return e?getComputedStyle(e):null;};
          const sheet=C('#shop-search-sheet'), input=C('#shop-search-sheet-input'), row=C('.shop-search-row'),
                name=C('.shop-search-row__name'), meta=C('.shop-search-row__meta'), price=C('.shop-search-row__price'),
                label=C('.shop-search-sheet__label'), media=C('.shop-search-row__media'), close=C('#shop-search-close');
          return {sheetBg:sheet.backgroundColor, inputBg:input.backgroundColor, inputBorder:input.borderTopColor, inputColor:input.color,
                  rowBg:row.backgroundColor, rowBorder:row.borderTopColor, name:name.color, meta:meta.color, price:price.color,
                  label:label.color, mediaBg:media.backgroundColor, closeBg:close.backgroundColor, closeColor:close.color,
                  textMuted:getComputedStyle(document.body).getPropertyValue('--store-text-muted').trim(),
                  storePrimary:getComputedStyle(document.body).getPropertyValue('--store-primary').trim()}; })()""")
        c2.close()
    # شاشة قصيرة (محاكاة لوحة المفاتيح)
    ctx3=b.new_context(viewport={'width':390,'height':420},locale='ar',device_scale_factor=2)
    p3=ctx3.new_page(); p3.goto(SHOP,wait_until='load'); p3.wait_for_timeout(1600)
    p3.click('#shop-search-btn'); p3.wait_for_timeout(1100)
    p3.type('#shop-search-sheet-input','ثلاجة',delay=30); p3.wait_for_timeout(1500)
    res['short_420_top']=p3.evaluate("""(() => { const b=document.querySelector('.shop-search-sheet__body').getBoundingClientRect();
      const head=document.querySelector('.shop-search-sheet__head').getBoundingClientRect();
      const rows=Array.from(document.querySelectorAll('.shop-search-row'));
      const close=document.getElementById('shop-search-close').getBoundingClientRect();
      return {headBottom:Math.round(head.bottom), bodyH:Math.round(b.height), maxScroll:Math.round(document.querySelector('.shop-search-sheet__body').scrollHeight-document.querySelector('.shop-search-sheet__body').clientHeight),
              rows:rows.length, visible:rows.filter(r=>{const x=r.getBoundingClientRect(); return x.top>=b.top-0.5&&x.bottom<=b.bottom+0.5;}).length,
              closeInView: close.bottom<=window.innerHeight+0.5, closeTop:Math.round(close.top),
              inputFocused: document.activeElement && document.activeElement.id,
              pageScrollY: Math.round(window.scrollY)}; })()""")
    p3.screenshot(path=OUT+'/after-390x420-keyboard.png')
    p3.evaluate("""(() => { const b=document.querySelector('.shop-search-sheet__body'); b.scrollTop=b.scrollHeight; })()""")
    p3.wait_for_timeout(400)
    res['short_420_bottom']=p3.evaluate("""(() => { const b=document.querySelector('.shop-search-sheet__body');
      const rows=Array.from(document.querySelectorAll('.shop-search-row'));
      const last=rows[rows.length-1].getBoundingClientRect(); const bb=b.getBoundingClientRect();
      return {scrollTop:Math.round(b.scrollTop), maxScroll:Math.round(b.scrollHeight-b.clientHeight),
              lastRowReachable: last.bottom<=bb.bottom+0.5, closeStillInView: document.getElementById('shop-search-close').getBoundingClientRect().bottom<=window.innerHeight+0.5}; })()""")
    ctx3.close(); b.close()
# الحسابات
for theme in ['light','dark']:
    c=res['colors_'+theme]
    def cr(f,bg): return contrast(parse(f),parse(bg))
    res['contrast_'+theme]={
      'name_on_row': cr(c['name'],c['rowBg']), 'meta_on_row': cr(c['meta'],c['rowBg']),
      'price_on_row': cr(c['price'],c['rowBg']), 'label_on_sheet': cr(c['label'],c['sheetBg']),
      'input_text_on_input': cr(c['inputColor'],c['inputBg']), 'close_icon_on_close': cr(c['closeColor'],c['closeBg']),
      'muted_token': c['textMuted'], 'primary_token': c['storePrimary']}
json.dump(res,open(OUT+'/extra-after.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(res,ensure_ascii=False,indent=1))
