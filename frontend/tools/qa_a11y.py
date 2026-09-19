#!/usr/bin/env python3
"""Stage 13 — Accessibility smoke test على اللوحة الحقيقية.

يفحص: تسميات الأزرار/الروابط · تسميات الحقول · ترتيب التركيز ومؤشر التركيز المرئي ·
حصر التركيز داخل الـmodal + Escape · سمات aria الأساسية · prefers-reduced-motion ·
وجود skip-link ومعالم HTML · تباين لوني لعناصر أساسية.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ENV = dict(re.findall(r'^(\w+)=(.*)$', Path('/root/alwled/.env').read_text(), re.M))
URL = 'https://panel.fahd-car.cloud/alwled/admin/'
OUT = Path(__file__).resolve().parent / 'qa'
OUT.mkdir(parents=True, exist_ok=True)


def contrast(rgb1, rgb2):
    def lum(color):
        def channel(value):
            v = value / 255
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])
    l1, l2 = lum(rgb1), lum(rgb2)
    hi, lo = max(l1, l2), min(l1, l2)
    return round((hi + 0.05) / (lo + 0.05), 2)


def main() -> int:
    findings = []
    report = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        context = browser.new_context(locale='ar', timezone_id='UTC', viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page = context.new_page()
        page.goto(URL, wait_until='networkidle')
        page.wait_for_selector('.auth-card', timeout=30000)

        # ---- login page a11y ----
        report['login'] = page.evaluate("""() => {
          // a control counts as labelled with label[for], aria-label, placeholder, or an implicit (wrapping) <label>
          const labelled = [...document.querySelectorAll('input')].every((i) =>
            (i.id && document.querySelector('label[for="' + i.id + '"]')) || i.getAttribute('aria-label') ||
            i.getAttribute('placeholder') || i.closest('label'));
          const unlabelled = [...document.querySelectorAll('input')].filter((i) =>
            !((i.id && document.querySelector('label[for="' + i.id + '"]')) || i.getAttribute('aria-label') ||
              i.getAttribute('placeholder') || i.closest('label'))).map((i) => i.name || i.type);
          const explicit = [...document.querySelectorAll('input')].filter((i) => i.id && document.querySelector('label[for="' + i.id + '"]')).length;
          const named = [...document.querySelectorAll('button, a[href]')].filter((el) => {
            const t = (el.textContent || '').trim();
            return !t && !el.getAttribute('aria-label') && !el.getAttribute('title');
          }).map((el) => el.className);
          return { inputsLabelled: labelled, unlabelledControls: unlabelled, explicitlyAssociated: explicit, unnamedControls: named,
                   hasSkipLink: !!document.querySelector('.skip-link'),
                   dir: document.documentElement.getAttribute('dir'),
                   lang: document.documentElement.getAttribute('lang') };
        }""")

        # reduced motion: animations must be effectively disabled
        report['reducedMotion'] = page.evaluate("""() => {
          const spinner = document.createElement('span'); spinner.className = 'spinner';
          document.body.appendChild(spinner);
          const duration = getComputedStyle(spinner).animationDuration;
          spinner.remove();
          return duration;
        }""")

        # ---- login and inspect the app shell ----
        page.fill('input[name="identifier"]', ENV['SEED_OWNER_PHONE'].strip())
        page.fill('input[name="password"]', ENV['SEED_OWNER_PASSWORD'].strip())
        page.click('.auth-card .btn--primary')
        page.wait_for_selector('.app-sidebar:not([hidden])', timeout=30000)
        page.wait_for_timeout(2000)

        report['shell'] = page.evaluate("""() => {
          const unnamed = [...document.querySelectorAll('button, a[href]')].filter((el) => {
            const t = (el.textContent || '').trim();
            return !t && !el.getAttribute('aria-label') && !el.getAttribute('title');
          }).map((el) => el.className.toString().slice(0, 40));
          const aria = {
            navLabel: document.querySelector('.app-sidebar')?.getAttribute('aria-label'),
            navElement: !!document.querySelector('nav#main-nav'),
            mainLandmark: !!document.querySelector('main#content'),
            bannerLandmark: !!document.querySelector('header.app-header'),
            bellExpanded: document.querySelector('.bell .icon-btn')?.getAttribute('aria-expanded'),
            bellHasPopup: document.querySelector('.bell .icon-btn')?.getAttribute('aria-haspopup'),
            toastLive: document.querySelector('.toast-stack')?.getAttribute('aria-live'),
            tableSortable: document.querySelectorAll('th[aria-sort]').length,
          };
          return { unnamedControls: unnamed.slice(0, 5), unnamedCount: unnamed.length, aria };
        }""")

        # focus visibility + tab order
        page.evaluate("() => window.ALW.nav.go('/products')")
        page.wait_for_timeout(2000)
        focus_chain = []
        for _ in range(12):
            page.keyboard.press('Tab')
            focus_chain.append(page.evaluate("""() => {
              const el = document.activeElement;
              if (!el || el === document.body) return { tag: 'body' };
              const s = getComputedStyle(el);
              const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
              return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 32), focusVisible: visible };
            }"""))
        report['focus'] = {
            'chain': focus_chain,
            'allVisible': all(item.get('focusVisible') for item in focus_chain if item['tag'] != 'body'),
            'distinctTargets': len({(item['tag'], item.get('cls')) for item in focus_chain}),
        }
        if not report['focus']['allVisible']:
            findings.append('بعض عناصر التركيز بلا مؤشر مرئي')

        # modal focus handling
        page.locator('#content .table__cell-actions button').first.click()
        page.wait_for_timeout(1200)
        report['modal'] = page.evaluate("""() => {
          const panel = document.querySelector('.modal__panel');
          return {
            role: panel?.closest('.modal')?.getAttribute('role'),
            ariaModal: panel?.closest('.modal')?.getAttribute('aria-modal'),
            focusInsideOnOpen: !!panel && panel.contains(document.activeElement),
            bodyLocked: document.body.classList.contains('no-scroll'),
          };
        }""")
        # tab must stay inside the dialog
        trapped = True
        for _ in range(14):
            page.keyboard.press('Tab')
            inside = page.evaluate("() => { const m = document.querySelector('.modal__panel'); return m ? m.contains(document.activeElement) : false; }")
            if not inside:
                trapped = False
                break
        report['modal']['focusTrapped'] = trapped
        if not trapped:
            findings.append('التركيز يخرج من نافذة الحوار')
        page.keyboard.press('Escape')
        page.wait_for_timeout(400)
        report['modal']['escapeClosed'] = page.locator('.modal__panel').count() == 0
        report['modal']['focusRestored'] = page.evaluate("() => !!document.activeElement && document.activeElement !== document.body")

        # contrast for key pairs
        report['contrast'] = page.evaluate("""() => {
          const parse = (value) => (value.match(/\\d+/g) || []).slice(0, 3).map(Number);
          const pairs = [];
          const push = (label, el) => {
            if (!el) return;
            const s = getComputedStyle(el);
            pairs.push({ label, fg: parse(s.color), bg: parse(s.backgroundColor), fontSize: s.fontSize });
          };
          push('primary button', document.querySelector('.btn--primary'));
          push('body text', document.querySelector('#content'));
          push('card heading', document.querySelector('.card__title'));
          push('table header', document.querySelector('.table thead th'));
          push('muted text', document.querySelector('.page-head__desc'));
          push('nav item', document.querySelector('.nav-item'));
          push('badge text', document.querySelector('.badge'));
          return pairs;
        }""")
        for pair in report['contrast']:
            if pair['bg'] and len(pair['bg']) == 3 and pair['bg'] != [0, 0, 0]:
                ratio = contrast(pair['fg'], pair['bg'])
                pair['ratio'] = ratio
                if ratio < 3:
                    findings.append(f"تباين منخفض ({ratio}) لعنصر {pair['label']}")

        # error state + empty state sanity (404 route + a page with no data)
        page.evaluate("() => window.ALW.nav.go('/does-not-exist')")
        page.wait_for_timeout(1200)
        report['notFound'] = page.evaluate("() => ({ states: document.querySelectorAll('.state').length, title: document.querySelector('.state__title')?.textContent || '' })")

        page.screenshot(path=str(OUT / 'a11y-final-state.png'))
        browser.close()

    (OUT / 'a11y-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps({k: report[k] for k in ('login', 'reducedMotion', 'focus', 'modal', 'notFound')}, ensure_ascii=False, indent=1)[:2200])
    print('\nshell.aria:', json.dumps(report['shell']['aria'], ensure_ascii=False))
    print('unnamed controls:', report['shell']['unnamedCount'])
    print('contrast:', json.dumps(report['contrast'], ensure_ascii=False)[:600])
    print('\nFINDINGS:', findings or 'none')
    return 1 if findings else 0


if __name__ == '__main__':
    sys.exit(main())
