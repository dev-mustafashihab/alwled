import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    def scan(tag):
        return p.evaluate("""(() => { const out=[];
          Array.from(document.querySelectorAll('button, a.btn, .btn, input, select, [role=button]')).forEach(el=>{
            const cs=getComputedStyle(el); const b=el.getBoundingClientRect();
            if(!b.width||!b.height||cs.display==='none'||cs.visibility==='hidden') return;
            const bg=cs.backgroundColor||''; const bc=cs.borderColor||''; const col=cs.color||'';
            const teal = /20, ?184, ?166|15, ?118, ?110|13, ?148, ?136|17, ?94, ?89/.test(bg+bc+col);
            if (teal) out.push({cls:String(el.className).slice(0,34), text:(el.textContent||'').trim().slice(0,22), bg:bg, color:col, box:Math.round(b.width)+'x'+Math.round(b.height)}); });
          return out; })()""")
    R['products']=scan('products')
    p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2500); R['pdp']=scan('pdp')
    # السلة
    p.evaluate('location.hash = "#/cart"'); p.wait_for_timeout(2500); R['cart']=scan('cart')
    # checkout
    p.evaluate('location.hash = "#/checkout"'); p.wait_for_timeout(2500); R['checkout']=scan('checkout')
    # طلبات/إشعارات/حساب
    for h,name in [('#/orders','orders'),('#/notifications','notifs'),('#/account','account')]:
        p.evaluate('location.hash = "%s"' % h); p.wait_for_timeout(2300); R[name]=scan(name)
    # نافذة المصادقة (زائر)
    p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2500)
    p.click('#shop-add-to-cart'); p.wait_for_timeout(1200); R['auth_dialog']=scan('auth')
    print(json.dumps(R, ensure_ascii=False, indent=1)[:2600])
    ctx.close(); b.close()
json.dump(R, open('/root/alwled/frontend/tools/qa/stage5a/teal-check.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
