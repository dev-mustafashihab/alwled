"""قياس أداء حقيقي للصفحة الحيّة: الأحجام، الطلبات، التوقيت، الكاش."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
R = {'resources': [], 'timing': {}, 'requests': 0, 'transferred': 0}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    sizes = []

    def on_resp(resp):
        try:
            h = resp.headers
            sizes.append({'url': resp.url[-58:], 'type': h.get('content-type', '')[:28],
                          'len': int(h.get('content-length') or 0), 'enc': h.get('content-encoding') or '-',
                          'cc': (h.get('cache-control') or '-')[:28]})
        except Exception:
            pass
    p.on('response', on_resp)
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(3000)
    R['requests'] = len(sizes)
    R['transferred'] = sum(s['len'] for s in sizes)
    R['timing'] = p.evaluate("""(() => { const t = performance.timing || {}; const n = performance.getEntriesByType('navigation')[0] || {};
      return { dcl_ms: Math.round(n.domContentLoadedEventEnd || 0), load_ms: Math.round(n.loadEventEnd || 0),
        ttfb_ms: Math.round(n.responseStart || 0), fcp_ms: (() => { const f = performance.getEntriesByName('first-contentful-paint')[0]; return f ? Math.round(f.startTime) : null; })(),
        resources: performance.getEntriesByType('resource').length }; })()""")
    by = {}
    for s in sizes:
        k = s['type'].split(';')[0]
        by.setdefault(k, {'n': 0, 'bytes': 0, 'gz': 0})
        by[k]['n'] += 1
        by[k]['bytes'] += s['len']
        if s['enc'] not in ('-', ''):
            by[k]['gz'] += s['len']
    R['by_type'] = by
    R['css_js'] = [s for s in sizes if 'css' in s['type'] or 'javascript' in s['type']]
    R['html'] = [s for s in sizes if 'html' in s['type']]
    ctx.close(); b.close()
json.dump(R, open('/root/alwled/frontend/tools/qa/stage7/perf.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok')
