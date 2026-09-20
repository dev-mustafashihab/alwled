# اختبار حقل الصورة في لوحة الأدمن (تصنيفات): المعاينة + الرفع + ملء الرابط
from playwright.sync_api import sync_playwright
import json, time

BASE = "https://panel.fahd-car.cloud/alwled/admin/"
with sync_playwright() as p:
    b = p.chromium.launch(args=['--ignore-certificate-errors'])
    pg = b.new_page(viewport={'width': 1366, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
    # تسجيل الدخول
    pg.goto(BASE, wait_until='networkidle')
    pg.wait_for_timeout(1500)
    if pg.locator('input[type=password]').count() > 0:
        pg.fill('input[name=identifier]', '0938045496')
        pg.fill('input[type=password]', open('/root/alwled/.env').read().split('SEED_OWNER_PASSWORD=')[1].split('\n')[0])
        # زر الدخول: type=button بنص «تسجيل الدخول»
        pg.evaluate("""(() => {
          const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('تسجيل الدخول'));
          btn?.click();
        })()""")
        pg.wait_for_timeout(2500)
    # فتح التصنيفات
    pg.goto(BASE + '#/categories', wait_until='networkidle')
    pg.wait_for_timeout(2500)
    # فتح نموذج الإضافة
    pg.evaluate("""(() => {
      const btn = [...document.querySelectorAll('button, a')].find(b => b.textContent.includes('إضافة تصنيف'));
      btn?.click();
    })()""")
    pg.wait_for_timeout(1200)
    info = pg.evaluate("""(() => {
      const modal = document.querySelector('.modal, [role=dialog]');
      const fileBtn = [...(modal?.querySelectorAll('button') || [])].find(b => b.textContent.includes('اختيار صورة'));
      const preview = modal?.querySelector('.imagefield__preview');
      const urlInput = modal?.querySelector('input[name=image]');
      return {modalOpen: !!modal, hasUploadBtn: !!fileBtn, hasPreview: !!preview, hasUrlInput: !!urlInput,
              urlPlaceholder: urlInput?.placeholder};
    })()""")
    # رفع فعلي عبر set_input_files
    pg.set_input_files('.imagefield input[type=file]', '/root/alwled/frontend/assets/icons/categories/washing-machine.png')
    pg.wait_for_timeout(3000)
    info['afterUpload'] = pg.evaluate("""(() => {
      const modal = document.querySelector('.modal, [role=dialog]');
      const urlInput = modal?.querySelector('input[name=image]');
      const status = modal?.querySelector('.imagefield__status');
      const img = modal?.querySelector('.imagefield__preview img');
      return {url: urlInput?.value, status: status?.textContent,
              previewImg: img ? img.src.split('/').pop() : null};
    })()""")
    info['errors'] = len(errs)
    pg.screenshot(path='/root/alwled/frontend/tools/qa/stage5/admin-imagefield.png')
    b.close()
print(json.dumps(info, ensure_ascii=False, indent=1))
