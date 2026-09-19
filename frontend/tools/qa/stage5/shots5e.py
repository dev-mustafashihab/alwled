
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2600)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2400)
    el=p.query_selector('.shop-footer'); el.scroll_into_view_if_needed(); p.wait_for_timeout(600)
    el.screenshot(path='/root/alwled/frontend/tools/qa/stage5/footer-390.png')
    p.evaluate("document.documentElement.style.fontSize='200%'"); p.wait_for_timeout(900)
    el=p.query_selector('.shop-footer'); el.scroll_into_view_if_needed(); p.wait_for_timeout(600)
    el.screenshot(path='/root/alwled/frontend/tools/qa/stage5/footer-390-zoom200.png')
    p.evaluate("document.documentElement.style.fontSize=''"); p.wait_for_timeout(400)
    p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2500)
    p.evaluate("document.documentElement.style.fontSize='200%'"); p.wait_for_timeout(900)
    p.screenshot(path='/root/alwled/frontend/tools/qa/stage5/pdp-390-zoom200.png', full_page=False)
    print('shots ok')
    ctx.close(); b.close()
