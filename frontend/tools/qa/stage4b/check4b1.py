from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':900}, locale='ar'); p=ctx.new_page()
    errs=[]; p.on('pageerror', lambda e: errs.append(str(e)[:100])); p.on('console', lambda m: errs.append('C:'+m.text[:100]) if m.type=='error' else None)
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products/633"'); p.wait_for_timeout(2400)
    print('disabled CTA click/Enter ⇒')
    p.evaluate("document.getElementById('shop-add-to-cart').click()"); p.wait_for_timeout(400)
    p.evaluate("document.getElementById('shop-add-to-cart').focus()")
    p.keyboard.press('Enter'); p.wait_for_timeout(600)
    print(' ', p.evaluate("""(() => ({ promptVisible: (()=>{const el=document.querySelector('.shop-prompt'); if(!el) return false; const b=el.getBoundingClientRect(); return b.width>0&&b.height>0;})(),
      anyVisibleDialog: Array.from(document.querySelectorAll('[role=dialog]')).filter(el=>{const b=el.getBoundingClientRect(); return b.width>0&&b.height>0&&getComputedStyle(el).visibility!=='hidden';}).length,
      searchSheetOpen: !!document.querySelector('.shop-search-sheet.is-open'), body: getComputedStyle(document.body).overflowY }))()"""))
    print('hidden tabbable (بلا أي نافذة مفتوحة):', p.evaluate("""(() => {
      const TAB='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
      return Array.from(document.querySelectorAll(TAB)).filter(el=>{const b=el.getBoundingClientRect(); const cs=getComputedStyle(el);
        return b.width===0&&b.height===0&&cs.visibility!=='hidden'&&cs.display!=='none';}).map(el=>el.tagName+'.'+String(el.className).slice(0,20)); })()"""))
    print('console:', errs)
    b.close()
