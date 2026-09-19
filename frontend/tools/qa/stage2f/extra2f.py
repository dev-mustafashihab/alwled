import json, re
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage2f'
JS="""(() => {
  const q=s=>document.querySelector(s); const C=s=>{const e=q(s); return e?getComputedStyle(e):null;};
  const inp=q('.shop-search__input');
  const cs=getComputedStyle(inp);
  const cv=document.createElement('canvas').getContext('2d');
  cv.font = cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
  const textW = cv.measureText(inp.getAttribute('placeholder')).width;
  const contentW = inp.clientWidth - parseFloat(cs.paddingInlineStart) - parseFloat(cs.paddingInlineEnd);
  const navLink=q('.shop-nav__link');
  const act=document.querySelector(".shop-nav__link[aria-current='page']");
  return {
    placeholder: {text: inp.getAttribute('placeholder'), textW: Math.round(textW), contentW: Math.round(contentW),
                  fits: textW <= contentW + 0.5, inputW: Math.round(inp.getBoundingClientRect().width),
                  fs: cs.fontSize, padStart: cs.paddingInlineStart, padEnd: cs.paddingInlineEnd},
    colors: {
      navDefault: {color: navLink?getComputedStyle(navLink).color:null, bg: navLink?getComputedStyle(navLink).backgroundColor:null},
      navActive: act?{color:getComputedStyle(act).color, bg:getComputedStyle(act).backgroundColor, weight:getComputedStyle(act).fontWeight}:null,
      inputBg: cs.backgroundColor, inputBorder: cs.borderTopColor, inputColor: cs.color,
      inputPlaceholder: getComputedStyle(inp,'::placeholder').color,
      searchBtn: (()=>{const b=q('.shop-search__btn'); return b?{bg:getComputedStyle(b).backgroundColor,color:getComputedStyle(b).color}:null})(),
      cart: (()=>{const c=document.getElementById('shop-cart-button'); return c?{bg:getComputedStyle(c).backgroundColor,color:getComputedStyle(c).color,border:getComputedStyle(c).borderTopColor}:null})(),
      register: (()=>{const r=q(".shop-actions > a[href='#/register']"); return r?{bg:getComputedStyle(r).backgroundColor,color:getComputedStyle(r).color}:null})(),
      login: (()=>{const l=q(".shop-actions > a[href='#/login']"); return l?{color:getComputedStyle(l).color}:null})(),
      header: {bg:getComputedStyle(q('.shop-header')).backgroundColor, border:getComputedStyle(q('.shop-header')).borderBottomColor},
      storeTokens: {surface:getComputedStyle(document.body).getPropertyValue('--store-surface').trim(),
                    surfaceSoft:getComputedStyle(document.body).getPropertyValue('--store-surface-soft').trim(),
                    border:getComputedStyle(document.body).getPropertyValue('--store-border').trim(),
                    text:getComputedStyle(document.body).getPropertyValue('--store-text').trim(),
                    textBody:getComputedStyle(document.body).getPropertyValue('--store-text-body').trim(),
                    textMuted:getComputedStyle(document.body).getPropertyValue('--store-text-muted').trim(),
                    primary:getComputedStyle(document.body).getPropertyValue('--store-primary').trim(),
                    primarySoft:getComputedStyle(document.body).getPropertyValue('--store-primary-soft').trim()}
    },
    cssom: (() => {
      const found={};
      const walk=(rules,name)=>{ for(let i=0;i<rules.length;i++){const r=rules[i];
        if(r.media||r.conditionText){walk(r.cssRules,name);continue;}
        if(!r.selectorText) continue;
        const sel=r.selectorText, css=(r.style&&r.style.cssText)||'';
        if(sel.indexOf('shop-header .shop-search')>=0 && /display:\s*flex/.test(css)) found.searchVisible=[name,sel,css.slice(0,60)];
        if(sel.indexOf('--shop-desktop-accent')>=0) found.accent=(found.accent||0)+1;
        if(sel.indexOf('shop-header__spacer')>=0 && /flex/.test(css)) found.spacer=[name,sel,css.slice(0,40)];
      }};
      for(let s=0;s<document.styleSheets.length;s++){const ss=document.styleSheets[s]; let rules;
        try{rules=ss.cssRules}catch(e){continue} walk(rules,(ss.href||'').split('/').slice(-1)[0]);}
      return found;
    })()
  };
})()"""
res={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for theme in ['light','dark']:
        for w in [1024,1366]:
            ctx=b.new_context(viewport={'width':w,'height':900},locale='ar')
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}"%theme)
            p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1700)
            res['%s_%d'%(theme,w)]=p.evaluate(JS)
            ctx.close()
    b.close()
def parse(s):
    m=re.match(r'color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)',s or '')
    if m: return [round(float(x)*255) for x in m.groups()]
    m=re.match(r'rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)',s or '')
    return [float(m.group(1)),float(m.group(2)),float(m.group(3))] if m else None
def lum(c):
    c=[x/255 for x in c]; c=[(x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4) for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(f,bg):
    if not f or not bg: return None
    l1,l2=lum(f),lum(bg); l1,l2=max(l1,l2),min(l1,l2); return round((l1+0.05)/(l2+0.05),2)
for k,v in res.items():
    c=v['colors']
    print('==',k,'placeholder fits:',v['placeholder'])
    print('   contrast: navDefault',cr(parse(c['navDefault']['color']),parse(c['header']['bg'])),
          '| navActive',cr(parse(c['navActive']['color']),parse(c['navActive']['bg'])),
          '| inputText',cr(parse(c['inputColor']),parse(c['inputBg'])),
          '| placeholder',cr(parse(c['inputPlaceholder']),parse(c['inputBg'])),
          '| searchBtn',cr(parse(c['searchBtn']['color']),parse(c['searchBtn']['bg'])),
          '| cartIcon',cr(parse(c['cart']['color']),parse(c['cart']['bg'])),
          '| register',cr(parse(c['register']['color']),parse(c['register']['bg'])),
          '| login',cr(parse(c['login']['color']),parse(c['header']['bg'])))
    print('   tokens:',c['storeTokens'])
    print('   cssom:',v['cssom'])
json.dump(res,open(OUT+'/extra-after.json','w'),ensure_ascii=False,indent=1)
