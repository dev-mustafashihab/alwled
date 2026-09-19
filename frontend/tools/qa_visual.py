#!/usr/bin/env python3
"""Stage 13 — Visual QA نهائي: 8 مقاسات × 9 صفحات + فحوص تخطيط فعلية + لقطات للمراجعة.

يفحص: horizontal overflow · sidebar · drawer · modal داخل الشاشة · جداول على الموبايل ·
أزرار داخل حاوياتها · RTL · تداخل الهيدر مع المحتوى · toasts · skeleton/empty/error states.

يُشغَّل: python3 frontend/tools/qa_visual.py [--url https://panel.fahd-car.cloud/alwled/admin/]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'qa' / 'visual'
OUT.mkdir(parents=True, exist_ok=True)
ENV = dict(re.findall(r'^(\w+)=(.*)$', Path('/root/alwled/.env').read_text(), re.M))

VIEWPORTS = [
    ('1920x1080', 1920, 1080, 'desktop'),
    ('1440x900', 1440, 900, 'desktop'),
    ('1280x800', 1280, 800, 'desktop'),
    ('1024x768', 1024, 768, 'tablet'),
    ('768x1024', 768, 1024, 'tablet'),
    ('430x932', 430, 932, 'mobile'),
    ('390x844', 390, 844, 'mobile'),
    ('375x812', 375, 812, 'mobile'),
]
PAGES = ['dashboard', 'products', 'orders', 'payments', 'notifications', 'employees', 'roles', 'account']

PROBE = """() => {
  const de = document.documentElement;
  const content = document.querySelector('#content');
  const header = document.querySelector('.app-header');
  const sidebar = document.querySelector('.app-sidebar');
  const rect = (el) => el ? el.getBoundingClientRect() : null;
  const headerRect = rect(header);
  const contentRect = rect(content);

  // elements sticking out horizontally (ignoring intentionally scrollable wrappers)
  const overflowing = [];
  const scrollHosts = new Set([...document.querySelectorAll('.table-wrap, .modal__body, .notif-panel__list, .app-sidebar__nav')]);
  const isInsideScrollHost = (el) => {
    let node = el.parentElement;
    while (node) { if (scrollHosts.has(node)) return true; node = node.parentElement; }
    return false;
  };
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > de.clientWidth + 1 || r.left < -1) {
      if (isInsideScrollHost(el)) return;
      if (el.classList.contains('app-sidebar') && el.getBoundingClientRect().left === 0 && !el.classList.contains('is-open')) return;
      overflowing.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]);
    }
  });

  const buttons = [...document.querySelectorAll('.btn, .icon-btn, .pagination__btn')];
  const clippedButtons = buttons.filter((b) => {
    if (b.offsetParent === null) return false;
    if (b.querySelector('.bell__count')) return false; // decorative counter badge overlaps on purpose
    return b.scrollWidth > b.clientWidth + 2;
  }).length;

  const unlabeledButtons = [...document.querySelectorAll('button')].filter((b) => {
    const text = (b.textContent || '').trim();
    return !text && !b.getAttribute('aria-label') && !b.getAttribute('title');
  }).length;

  // mobile: tables must switch to the card layout
  const mobile = window.innerWidth <= 900;
  const cardMode = mobile ? getComputedStyle(document.querySelector('.table-wrap--cards .table') || document.body).display : 'n/a';

  return {
    doc: de.scrollWidth, win: de.clientWidth,
    horizontalOverflow: de.scrollWidth > de.clientWidth + 1,
    overflowing: overflowing.slice(0, 6),
    dir: de.getAttribute('dir'), theme: de.getAttribute('data-theme'),
    sidebar: sidebar ? { visible: !sidebar.hasAttribute('hidden') && sidebar.getBoundingClientRect().width > 0, open: sidebar.classList.contains('is-open'), width: Math.round(sidebar.getBoundingClientRect().width) } : null,
    headerHeight: headerRect ? Math.round(headerRect.height) : 0,
    headerOverlapsContent: !!(headerRect && contentRect && headerRect.bottom > contentRect.top + 1 && getComputedStyle(header).position !== 'sticky' && getComputedStyle(header).position !== 'fixed'),
    cards: document.querySelectorAll('#content .card').length,
    rows: document.querySelectorAll('#content .table tbody tr').length,
    emptyStates: document.querySelectorAll('#content .state').length,
    errorStates: document.querySelectorAll('#content .state--error').length,
    skeletons: document.querySelectorAll('#content .skeleton').length,
    kpis: document.querySelectorAll('.kpi').length,
    navItems: document.querySelectorAll('.nav-item').length,
    clippedButtons, unlabeledButtons, mobileCardMode: cardMode,
  };
}"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='https://panel.fahd-car.cloud/alwled/admin/')
    args = parser.parse_args()

    report = {'url': args.url, 'results': [], 'issues': [], 'console': [], 'shots': []}
    phone = ENV['SEED_OWNER_PHONE'].strip()
    password = ENV['SEED_OWNER_PASSWORD'].strip()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        context = browser.new_context(locale='ar', timezone_id='UTC', viewport={'width': 1440, 'height': 900})
        page = context.new_page()
        page.on('pageerror', lambda e: report['console'].append('pageerror: ' + str(e)[:160]))
        page.on('console', lambda m: report['console'].append(f'{m.type}: {m.text[:160]}') if m.type == 'error' else None)

        # ---- login once (also a login-page visual check per viewport later) ----
        page.goto(args.url, wait_until='networkidle')
        page.wait_for_selector('.auth-card', timeout=30000)
        page.fill('input[name="identifier"]', phone)
        page.fill('input[name="password"]', password)
        page.click('.auth-card .btn--primary')
        page.wait_for_selector('.app-sidebar:not([hidden])', timeout=30000)
        page.wait_for_timeout(1500)

        # ---- modal fits the screen (per viewport group) + toast position ----
        def modal_and_toast_checks(label):
            page.evaluate("() => window.ALW.nav.go('/products')")
            page.wait_for_timeout(1600)
            page.locator('#content .table__cell-actions button').first.click()
            page.wait_for_timeout(1200)
            modal = page.evaluate("""() => {
              const panel = document.querySelector('.modal__panel');
              if (!panel) return { open: false };
              const r = panel.getBoundingClientRect();
              return { open: true, fitsW: r.width <= window.innerWidth + 1, fitsH: r.height <= window.innerHeight + 1,
                       left: Math.round(r.left), right: Math.round(r.right) };
            }""")
            # Escape closes it (a11y requirement, checked here as behaviour)
            page.keyboard.press('Escape')
            page.wait_for_timeout(500)
            closed = page.locator('.modal__panel').count() == 0
            page.evaluate("() => window.ALW.toast.success('فحص موضع التنبيه')")
            page.wait_for_timeout(600)
            toast = page.evaluate("""() => {
              const stack = document.querySelector('.toast-stack');
              const t = document.querySelector('.toast');
              if (!stack || !t) return { shown: false };
              const tr = t.getBoundingClientRect();
              const header = document.querySelector('.app-header').getBoundingClientRect();
              const actions = document.querySelector('#content .page-head__actions');
              const ar = actions ? actions.getBoundingClientRect() : null;
              const overlap = (a, b) => a && b && !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
              return { shown: true, coversHeader: overlap(tr, header), coversActions: overlap(tr, ar) };
            }""")
            page.wait_for_timeout(4200)
            return modal, closed, toast

        for label, width, height, group in VIEWPORTS:
            page.set_viewport_size({'width': width, 'height': height})
            page.evaluate("() => window.ALW.nav.go('/dashboard')")
            page.wait_for_timeout(1400)
            entry = {'viewport': label, 'group': group, 'pages': []}

            for name in PAGES:
                page.evaluate(f"() => window.ALW.nav.go('/{name}')")
                page.wait_for_timeout(1600)
                probe = page.evaluate(PROBE)
                probe['page'] = name
                entry['pages'].append(probe)
                page.screenshot(path=str(OUT / f'{label}-{name}.png'))
                report['shots'].append(f'{label}-{name}.png')

                problems = []
                if probe['horizontalOverflow']:
                    problems.append(f"horizontal overflow ({probe['doc']}>{probe['win']}) {probe['overflowing']}")
                if probe['dir'] != 'rtl':
                    problems.append('dir is not rtl')
                if probe['errorStates']:
                    problems.append(f"{probe['errorStates']} error state(s)")
                if probe['clippedButtons']:
                    problems.append(f"{probe['clippedButtons']} clipped button(s)")
                if probe['win'] <= 900 and probe['rows'] > 0 and probe['mobileCardMode'] != 'block':
                    problems.append('table not in card mode on small screen')
                if not probe['sidebar'] or not probe['sidebar']['visible']:
                    problems.append('sidebar hidden on desktop')
                if group == 'desktop' and probe['sidebar']['width'] < 200:
                    problems.append('desktop sidebar collapsed unexpectedly')
                if problems:
                    report['issues'].append({'viewport': label, 'page': name, 'problems': problems})

            # drawer behaviour on compact viewports
            if group != 'desktop':
                try:
                    page.evaluate("() => window.ALW.nav.go('/dashboard')")
                    page.wait_for_timeout(1200)
                    # make sure any previously opened drawer is closed before clicking the toggle
                    page.evaluate("() => { document.querySelector('.app-sidebar')?.classList.remove('is-open'); document.querySelector('.sidebar-scrim')?.remove(); }")
                    page.wait_for_timeout(300)
                    page.click('.sidebar-toggle-mobile')
                    page.wait_for_timeout(700)
                    drawer = page.evaluate("() => ({ open: !!document.querySelector('.app-sidebar.is-open'), scrim: !!document.querySelector('.sidebar-scrim') })")
                    if not drawer['open'] or not drawer['scrim']:
                        report['issues'].append({'viewport': label, 'page': 'drawer', 'problems': [f'drawer {drawer}']})
                    page.screenshot(path=str(OUT / f'{label}-drawer.png'))
                    report['shots'].append(f'{label}-drawer.png')
                    page.evaluate("() => { document.querySelector('.sidebar-scrim')?.click(); }")
                    page.wait_for_timeout(400)
                    closed_state = page.evaluate("() => document.querySelector('.app-sidebar').classList.contains('is-open')")
                    if closed_state:
                        report['issues'].append({'viewport': label, 'page': 'drawer', 'problems': ['drawer did not close via the scrim']})
                except Exception as error:
                    report['issues'].append({'viewport': label, 'page': 'drawer', 'problems': [f'drawer check failed: {str(error)[:110]}']})

            try:
                modal, closed, toast = modal_and_toast_checks(label)
            except Exception as error:
                modal, closed, toast = {'open': False}, True, {'shown': False}
                report['issues'].append({'viewport': label, 'page': 'modal', 'problems': [f'modal check failed: {str(error)[:110]}']})
            entry['modal'] = dict(modal, escapeClosed=closed)
            entry['toast'] = toast
            if modal.get('open') and (not modal.get('fitsW') or not modal.get('fitsH')):
                report['issues'].append({'viewport': label, 'page': 'modal', 'problems': [f"modal does not fit: {modal}"]})
            if not closed:
                report['issues'].append({'viewport': label, 'page': 'modal', 'problems': ['Escape did not close the modal']})
            if toast.get('coversHeader') or toast.get('coversActions'):
                report['issues'].append({'viewport': label, 'page': 'toast', 'problems': [f'toast overlaps important UI: {toast}']})

            # login page at this viewport
            try:
                fresh = context.new_page()  # same context shares localStorage → clear the session to see the login page
                fresh.set_viewport_size({'width': width, 'height': height})
                fresh.goto(args.url, wait_until='domcontentloaded')
                fresh.evaluate("() => { try { localStorage.clear(); } catch (error) {} }")
                fresh.reload(wait_until='networkidle')  # goto() to the same URL would be a no-op
                fresh.wait_for_selector('.auth-card', timeout=25000)
                login_probe = fresh.evaluate(PROBE)
                entry['login'] = {'overflow': login_probe['horizontalOverflow'], 'cards': fresh.locator('.auth-card').count()}
                fresh.screenshot(path=str(OUT / f'{label}-login.png'))
                report['shots'].append(f'{label}-login.png')
                if login_probe['horizontalOverflow']:
                    report['issues'].append({'viewport': label, 'page': 'login', 'problems': ['horizontal overflow on login']})
                fresh.close()
            except Exception as error:  # never let one viewport abort the whole QA
                report['issues'].append({'viewport': label, 'page': 'login', 'problems': [f'login check failed: {str(error)[:120]}']})

            report['results'].append(entry)
            print(f"[{label}] issues={len([i for i in report['issues'] if i['viewport'] == label])} pages={len(entry['pages'])}")

        browser.close()

    (OUT / 'visual-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print('\n=== summary ===')
    print('screenshots:', len(report['shots']))
    print('issues:', len(report['issues']))
    for issue in report['issues'][:20]:
        print(' -', issue)
    print('console errors:', report['console'][:5] or 'none')
    return 1 if report['issues'] or report['console'] else 0


if __name__ == '__main__':
    sys.exit(main())
