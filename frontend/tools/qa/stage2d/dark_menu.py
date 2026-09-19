import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
JS="""(() => {
  const cs = el => el ? getComputedStyle(el) : null;
  const g = (el, ps) => { if(!el) return null; const c=cs(el); const o={}; ps.forEach(p=>o[p]=c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    drawerBg: cs(document.getElementById('shop-drawer')).backgroundColor,
    rowBg: cs(q('.shop-drawer__link')).backgroundColor,
    rowColor: cs(q('.shop-drawer__link')).color,
    rowIcon: cs(q('.shop-drawer__link__icon')).color,
    currentBg: cs(q(".shop-drawer__link[aria-current='page']")).backgroundColor,
    currentColor: cs(q(".shop-drawer__link[aria-current='page']")).color,
    labelColor: cs(q('.shop-menu__label')).color,
    dividerBg: cs(q('.shop-menu__divider')).backgroundColor,
    themeBoxBg: cs(q('.shop-menu__theme')).backgroundColor,
    themeBtnColor: cs(q(".shop-menu__theme-btn[data-theme-mode='light']")).color,
    thumbBg: cs(q('.shop-menu__theme-thumb')).backgroundColor,
    noteColor: cs(q('.shop-drawer__foot .shop-note')).color,
    ctaBg: cs(q('.shop-drawer__foot .btn--primary')).backgroundColor,
    ctaColor: cs(q('.shop-drawer__foot .btn--primary')).color,
    vars: {storeSurface: cs(document.body).getPropertyValue('--store-surface').trim(),
           storeSurfaceSoft: cs(document.body).getPropertyValue('--store-surface-soft').trim(),
           storeBorder: cs(document.body).getPropertyValue('--store-border').trim(),
           storeText: cs(document.body).getPropertyValue('--store-text').trim(),
           storeTextMuted: cs(document.body).getPropertyValue('--store-text-muted').trim(),
           storePrimary: cs(document.body).getPropertyValue('--store-primary').trim(),
           storePrimarySoft: cs(document.body).getPropertyValue('--store-primary-soft').trim()}
  };
})()"""
out={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for theme in ['light','dark']:
        ctx=b.new_context(viewport={'width':390,'height':844},locale='ar',device_scale_factor=2)
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}"%theme)
        p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1700)
        p.click('#shop-burger'); p.wait_for_timeout(800); p.mouse.move(195,836); p.wait_for_timeout(200)
        out[theme]=p.evaluate(JS)
        p.screenshot(path='menu-darkcheck-%s.png'%theme)
        ctx.close()
    b.close()
def lum(c):
    c=[int(x)/255 for x in c]; c=[(x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4) for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def rgb(s): return [int(x) for x in s[s.find('(')+1:s.find(')')].split(',')[:3]]
def cr(f,bg):
    l1,l2=lum(rgb(f)),lum(rgb(bg)); l1,l2=max(l1,l2),min(l1,l2); return round((l1+0.05)/(l2+0.05),2)
for t in ['light','dark']:
    d=out[t]
    print('==',t,'==')
    print(' vars',d['vars'])
    print(' drawer',d['drawerBg'],'rowBg',d['rowBg'],'rowColor',d['rowColor'],'-> contrast',cr(d['rowColor'],d['rowBg']))
    print(' icon',d['rowIcon'],'on drawer ->',cr(d['rowIcon'],d['drawerBg']))
    print(' current',d['currentBg'],d['currentColor'],'-> contrast',cr(d['currentColor'],d['currentBg']))
    print(' label',d['labelColor'],'on drawer ->',cr(d['labelColor'],d['drawerBg']))
    print(' divider',d['dividerBg'],'on drawer ->',cr(d['dividerBg'],d['drawerBg']))
    print(' themeBox',d['themeBoxBg'],'btnColor',d['themeBtnColor'],'-> contrast',cr(d['themeBtnColor'],d['themeBoxBg']),'thumb',d['thumbBg'])
    print(' note',d['noteColor'],'on drawer ->',cr(d['noteColor'],d['drawerBg']))
    print(' cta',d['ctaBg'],d['ctaColor'],'-> contrast',cr(d['ctaColor'],d['ctaBg']))
json.dump(out,open('dark-menu-after.json','w'),ensure_ascii=False,indent=1)
