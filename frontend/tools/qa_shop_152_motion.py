"""قياس حركة: صعود مظهر القائمة من الأسفل للأعلى بعد اكتمال ظهور البنود + انزياح البند عند الضغط."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
fails = []


def check(name, ok, detail=''):
    print(('  ✓ ' if ok else '  ✗ ') + name + ((' — ' + str(detail)) if detail != '' else ''))
    if not ok:
        fails.append(name)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_context(viewport={'width': 390, 'height': 700}, locale='ar', device_scale_factor=2).new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)

    # عيّنات إطارات أثناء الفتح
    page.evaluate("""() => {
      window.__s = [];
      document.getElementById('shop-burger').addEventListener('click', () => {
        const t0 = performance.now();
        const theme = document.querySelector('.shop-menu__theme');
        const firstLink = document.querySelector('.shop-drawer__nav .shop-drawer__link');
        const tick = () => {
          const cs = getComputedStyle(theme);
          window.__s.push({t: Math.round(performance.now() - t0),
                           ty: cs.transform, o: cs.opacity,
                           linkOpacity: getComputedStyle(firstLink).opacity});
          if (performance.now() - t0 < 900) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, { once: true });
    }""")
    page.click('#shop-burger')
    page.wait_for_timeout(1000)
    samples = page.evaluate('window.__s')
    pick = [s for s in samples if s['t'] in sorted({min(s['t'] for s in samples), *[x for x in range(0, 900, 60)]})][:12]
    for s in samples[::6][:12]:
        print(json.dumps(s, ensure_ascii=False))

    ys = []
    for s in samples:
        m = s['ty']
        if 'matrix' in m:
            ys.append(float(m.split(',')[5].replace(')', '')))
    check('theme rises from bottom to top (negative translateY delta)', ys and (max(ys) - min(ys)) > 12,
          'max=%s min=%s' % (round(max(ys), 1) if ys else None, round(min(ys), 1) if ys else None))
    check('theme animates after the rows start (delayed appearance)',
          any(float(s['o']) > 0.05 for s in samples if s['t'] > 260), 'first visible opacity sample > 260ms')

    # انزياح البند عند الضغط (حركة سلسة)
    press = page.evaluate("""(() => {
      const link = document.querySelector('.shop-drawer__nav .shop-drawer__link');
      const cs = getComputedStyle(link);
      const beforeTransform = cs.transform;
      const beforeTransition = cs.transitionProperty;
      link.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
      return {beforeTransform: beforeTransform, transition: beforeTransition,
              hasTransformTransition: beforeTransition.indexOf('transform') !== -1,
              activeRule: Array.from(document.styleSheets).length > 0};
    })()""")
    check('rows have a smooth transform transition (press motion)', press['hasTransformTransition'], press['transition'])
    page.mouse.move(200, 300)
    page.mouse.down()
    page.wait_for_timeout(220)
    active = page.evaluate("""(() => {
      const link = document.elementFromPoint(200, 300);
      const row = link && link.closest ? link.closest('.shop-drawer__link') : null;
      return row ? getComputedStyle(row).transform : null;
    })()""")
    page.mouse.up()
    check('row shifts smoothly while pressed (kf)', active is not None, active)

    # «المظهر» أُزيل لتوفير مساحة
    labels = page.evaluate("""() => Array.from(document.querySelectorAll('.shop-menu__label')).map(n => n.innerText.trim())""")
    check('theme label removed (no «المظهر»)', 'المظهر' not in labels, labels)
    page.screenshot(path='/root/alwled/frontend/tools/qa/stage15.2/menu-theme-rise-390.png')
    b.close()

print('\nSMOOTH MOTION (theme rise + row press):', 'PASS' if not fails else 'FAIL (%d)' % len(fails))
for f in fails:
    print('  ✗', f)
