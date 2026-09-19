"""QUICK NAV + HEADER — فحص القبول: صف واحد · ارتفاعات · لاصق · إزالة الشريط · اللقطات."""
import json
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/foundation'
RES, FAIL, M = [], [], {}


def chk(n, ok, d=''):
    RES.append((n, bool(ok), d)); print('%s %-50s %s' % ('✓' if ok else '✗', n, str(d)[:96]))
    if not ok:
        FAIL.append(n + ' :: ' + str(d))


PROBE = """(() => {
  const hdr = document.querySelector('.shop-header');
  const qn = document.querySelector('#shop-quicknav');
  const inner = document.querySelector('.shop-header__inner');
  const box = (e) => { if (!e) return null; const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), cy: +(r.top + r.height / 2).toFixed(1) }; };
  const links = qn ? Array.from(qn.querySelectorAll('.shop-quicknav__link')) : [];
  const boxes = links.map(box);
  const active = qn ? qn.querySelector('.shop-quicknav__link[aria-current="page"]') : null;
  const activeAfter = active ? getComputedStyle(active, '::after') : null;
  const ticker = document.querySelector('.shop-home-ticker');
  return {
    hdrH: Math.round(hdr.getBoundingClientRect().height),
    headerRowH: inner ? Math.round(inner.getBoundingClientRect().height) : 0,
    qnH: qn ? Math.round(qn.getBoundingClientRect().height) : 0,
    qnVisible: qn ? getComputedStyle(qn).display !== 'none' : false,
    qnRows: boxes.filter(Boolean).length ? (new Set(boxes.filter(Boolean).map(b => Math.round(b.cy / 12))).size) : 0,
    qnLinkH: boxes.filter(Boolean).length ? boxes.filter(Boolean)[0].h : null,
    qnLinkGapDev: boxes.filter(Boolean).length > 1 ? +(Math.max(...boxes.filter(Boolean).map(b => b.cy)) - Math.min(...boxes.filter(Boolean).map(b => b.cy))).toFixed(1) : 0,
    qnOverflow: qn ? qn.scrollWidth - qn.clientWidth : 0,
    qnFs: links.length ? getComputedStyle(links[0]).fontSize : null,
    qnFw: links.length ? getComputedStyle(links[0]).fontWeight : null,
    qnBg: qn ? getComputedStyle(qn).backgroundColor : null,
    activeText: active ? active.textContent.trim() : null,
    activeAccent: activeAfter ? activeAfter.backgroundColor : null,
    activeBarW: activeAfter ? activeAfter.width : null,
    tickerHidden: ticker ? getComputedStyle(ticker).display === 'none' : true, // غير مرسوم ⇒ مُزال من الموضع
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollDownClass: document.documentElement.classList.contains('stw-scroll-down')
  };
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---- 390: أعلى الصفحة ثم بعد التمرير ----
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2500)
    top = p.evaluate(PROBE); M['390_top'] = top
    p.screenshot(path=OUT + '/qn-390-light-top.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 420})
    chk('[390] الهيدر الأساسي ~68–78px', 68 <= top['headerRowH'] <= 78, 'row=%d hdr=%d' % (top['headerRowH'], top['hdrH']))
    chk('[390] شريط سريع 44–48px', top['qnVisible'] and 44 <= top['qnH'] <= 48, 'qn=%s' % top['qnH'])
    chk('[390] الشريط السريع صف واحد', top['qnRows'] == 1, 'rows=%d' % top['qnRows'])
    chk('[390] بلا تمرير داخلي (المساحة تكفي)', top['qnOverflow'] == 0, 'ov=%d' % top['qnOverflow'])
    chk('[390] خط 13–14px / وزن 600', top['qnFs'] in ('13px', '13.5px', '14px') and top['qnFw'] in ('600', '700'), '%s/%s' % (top['qnFs'], top['qnFw']))
    chk('[390] النشط: مؤشّر #FFBF17', top['activeAccent'] == 'rgb(255, 191, 23)', '%s w=%s active=%s' % (top['activeAccent'], top['activeBarW'], top['activeText']))
    chk('[390] محاذاة أفقية موحّدة (انحراف ≤1px)', top['qnLinkGapDev'] <= 1, 'dev=%s' % top['qnLinkGapDev'])
    chk('[390] بلا فائض أفقي', top['ov'] == 0, 'ov=%d' % top['ov'])
    chk('[390] الشريط الإعلاني مُزال من الموضع', (top['tickerHidden'] is True) or (top.get('tickerAbsent') is True), 'ticker display != none' if (top['tickerHidden'] is not True and top.get('tickerAbsent') is not True) else 'display:none/absent')
    combined = top['hdrH']
    # بعد التمرير للأسفل
    p.evaluate('window.scrollTo(0, 1200)'); p.wait_for_timeout(700)
    sc = p.evaluate(PROBE); M['390_scrolled'] = sc
    p.screenshot(path=OUT + '/qn-390-light-scrolled.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 420})
    chk('[390] بعد التمرير: الهيدر ينكمش والشريط السريع يبقى',
        sc['scrollDownClass'] and sc['qnVisible'] and sc['hdrH'] <= 52,
        'hdr=%d qn=%d scrolled=%s' % (sc['hdrH'], sc['qnH'], sc['scrollDownClass']))
    p.evaluate('window.scrollTo(0, 0)'); p.wait_for_timeout(700)
    back = p.evaluate(PROBE)
    chk('[390] عند العودة للأعلى: الهيدر يُستعاد', (not back['scrollDownClass']) and back['hdrH'] >= 110, 'hdr=%d' % back['hdrH'])
    M['390_combined'] = top['hdrH']
    ctx.close()

    # ---- 390 داكن ----
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2300)
    p.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    p.evaluate("try{localStorage.setItem('shop-theme','dark')}catch(e){}"); p.wait_for_timeout(500)
    dk = p.evaluate(PROBE); M['390_dark'] = dk
    p.screenshot(path=OUT + '/qn-390-dark-top.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 420})
    chk('[390 داكن] سطح داكن + مؤشّر ذهبي', dk['qnBg'] in ('rgb(24, 25, 27)', 'rgb(30, 31, 34)') and dk['activeAccent'] == 'rgb(255, 191, 23)', '%s / %s' % (dk['qnBg'], dk['activeAccent']))
    ctx.close()

    # ---- 430 / 768 ----
    for w, h, name in [(430, 932, 'qn-430-light-top'), (768, 1024, 'qn-768-light')]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2300)
        r = p.evaluate(PROBE); M[str(w)] = r
        p.screenshot(path='%s/%s.png' % (OUT, name), clip={'x': 0, 'y': 0, 'width': w, 'height': 420})
        chk('[%d] صف واحد · بلا فائض · المقاسات' % w,
            r['qnRows'] == 1 and r['ov'] == 0 and r['qnOverflow'] == 0 and 44 <= r['qnH'] <= 48,
            'rows=%d qn=%d ov=%d qnOv=%d' % (r['qnRows'], r['qnH'], r['ov'], r['qnOverflow']))
        chk('[%d] بلا التفاف الهيدر' % w, r['headerRowH'] >= 68, 'row=%d' % r['headerRowH'])
        ctx.close()

    # ---- 1366 ديسكتوب: الشريط السريع مخفي ----
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2400)
    d = p.evaluate(PROBE); M['1366'] = d
    p.screenshot(path=OUT + '/qn-1366-desktop.png', clip={'x': 0, 'y': 0, 'width': 1366, 'height': 420})
    chk('[1366] الشريط السريع مخفٍ (لا تكرار للديسكتوب)', not d['qnVisible'], 'visible=%s' % d['qnVisible'])
    chk('[1366] الهيدر 73px وبلا فائض', d['hdrH'] == 73 and d['ov'] == 0, 'hdr=%d ov=%d' % (d['hdrH'], d['ov']))
    ctx.close()
    b.close()

print('\n=== QUICK NAV + HEADER: %d/%d ===' % (len(RES) - len(FAIL), len(RES)))
for f in FAIL:
    print('  ✗', f)
print('الأعلى المجمّع (390):', M['390_top']['hdrH'], 'px = هيدر', M['390_top']['headerRowH'], '+ سريع', M['390_top']['qnH'])
print('بعد التمرير (390):', M['390_scrolled']['hdrH'], 'px')
json.dump(M, open(OUT + '/quicknav-report.json', 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if FAIL else 0)