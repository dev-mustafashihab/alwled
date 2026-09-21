#!/usr/bin/env python3
"""PHASE 2.3 — live Search Morph + Opaque Curtain contract.

This is intentionally a real-browser contract against nginx/public URL:
- Never use file://: the store API base depends on /alwled/ URL routing.
- Fixed DPR=1 and bounded tolerances avoid anti-aliasing/scheduling flakes.
- Every assertion is behavioral/geometry evidence, not source inspection.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Callable

from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path(__file__).resolve().parents[4]
URL = "https://panel.fahd-car.cloud/alwled/shop/?phase23_contract=1"
OUT = Path("/tmp/alwled-search-curtain-contract.json")
PROTECTED = {
    "shop.header.css": ROOT / "frontend/shop/assets/css/shop.header.css",
    "shop.header.js": ROOT / "frontend/shop/assets/js/shop.header.js",
}


@dataclass
class Assertion:
    name: str
    ok: bool
    detail: str


class Contract:
    def __init__(self) -> None:
        self.results: list[Assertion] = []
        self.console_errors: list[str] = []
        self.page_errors: list[str] = []
        self.unhandled: list[str] = []

    def check(self, name: str, condition: bool, detail: str) -> bool:
        self.results.append(Assertion(name, bool(condition), detail))
        return bool(condition)

    def fail(self, name: str, detail: str) -> None:
        self.check(name, False, detail)

    @property
    def failures(self) -> list[Assertion]:
        return [r for r in self.results if not r.ok]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def static_gate(contract: Contract) -> None:
    checks = [
        ("js_syntax", ["node", "--check", str(ROOT / "frontend/shop/assets/js/shop.search.js")]),
        ("python_syntax", [sys.executable, "-m", "py_compile", str(Path(__file__).resolve())]),
    ]
    for name, cmd in checks:
        run = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        contract.check(name, run.returncode == 0, (run.stderr or run.stdout or "OK").strip())

    css = (ROOT / "frontend/shop/assets/css/shop.search-morph.css").read_text(encoding="utf-8")
    depth = 0
    for char in css:
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
    contract.check("css_braces", depth == 0, f"brace_depth={depth}")


def rect(page: Page, selector: str) -> dict[str, Any]:
    return page.locator(selector).evaluate("""el => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return {
        x:r.x, y:r.y, width:r.width, height:r.height,
        display:cs.display, visibility:cs.visibility, opacity:cs.opacity,
        pointerEvents:cs.pointerEvents, zIndex:cs.zIndex,
        hidden:el.hidden, ariaHidden:el.getAttribute('aria-hidden'),
        paddingLeft:parseFloat(cs.paddingLeft) || 0,
        paddingRight:parseFloat(cs.paddingRight) || 0,
        clipPath:cs.clipPath, backgroundColor:cs.backgroundColor
      };
    }""")


def within_viewport(r: dict[str, Any], width: int, height: int, tol: float = 1.0) -> bool:
    return (
        r["width"] > 0 and r["height"] > 0 and
        r["x"] >= -tol and r["y"] >= -tol and
        r["x"] + r["width"] <= width + tol and
        r["y"] + r["height"] <= height + tol
    )


def hit(page: Page, selector: str) -> dict[str, Any] | None:
    return page.locator(selector).evaluate("""el => {
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(innerWidth - 1, r.x + r.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2));
      const n = document.elementFromPoint(x, y);
      return n ? {id:n.id, tag:n.tagName, cls:String(n.className || ''),
                  inside: n === el || el.contains(n)} : null;
    }""")


def setup_page(browser: Browser, contract: Contract, width: int, height: int,
               theme: str, reduced: bool = False) -> tuple[Any, Page]:
    context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
    page = context.new_page()
    page.on("console", lambda msg: contract.console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: contract.page_errors.append(str(err)))
    page.add_init_script("""
      window.__phase23Unhandled = [];
      addEventListener('error', e => window.__phase23Unhandled.push(String(e.message || e.error || 'error')));
      addEventListener('unhandledrejection', e => window.__phase23Unhandled.push(String(e.reason || 'unhandledrejection')));
    """)
    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(700)
    page.evaluate("theme => document.documentElement.setAttribute('data-theme', theme)", theme)
    page.emulate_media(reduced_motion="reduce" if reduced else "no-preference")
    page.wait_for_timeout(100)
    return context, page


def assert_open(contract: Contract, page: Page, label: str, width: int, height: int,
                baseline: dict[str, dict[str, Any]]) -> bool:
    selectors = {
        "row": ".shop-header__inner",
        "logo": ".shop-brand",
        "cart": "#shop-actions",
        "burger": "#shop-burger",
        "quicknav": "#shop-quicknav",
        "trigger": "#shop-search-btn",
        "field": "#shop-search-morph-field",
        "input": "#shop-search-morph-input",
        "close": "#shop-search-morph-close",
        "curtain": "#shop-search-curt",
        "sheet": "#shop-search-sheet",
        "results": "#shop-search-results",
    }
    after = {key: rect(page, selector) for key, selector in selectors.items()}
    good = True

    for sibling in ("logo", "cart", "burger"):
        a, b = baseline[sibling], after[sibling]
        dx, dy = abs(a["x"] - b["x"]), abs(a["y"] - b["y"])
        good &= contract.check(f"{label}_{sibling}_geometry_fixed", dx <= 1 and dy <= 1,
                               f"dx={dx:.2f}, dy={dy:.2f}")

    row_delta = abs(baseline["row"]["height"] - after["row"]["height"])
    good &= contract.check(f"{label}_header_row_height_fixed", row_delta <= 1,
                           f"closed={baseline['row']['height']:.2f}, open={after['row']['height']:.2f}")
    good &= contract.check(f"{label}_quicknav_zero_height",
                           after["quicknav"]["height"] == 0 and after["quicknav"]["display"] == "none",
                           f"height={after['quicknav']['height']}, display={after['quicknav']['display']}")

    good &= contract.check(f"{label}_field_in_viewport", within_viewport(after["field"], width, height),
                           json.dumps(after["field"]))
    expected_field_height = min(48, max(44, after["row"]["height"] - 8))
    expected_field_y = after["row"]["y"] + (after["row"]["height"] - expected_field_height) / 2
    good &= contract.check(f"{label}_field_compact_height",
                           abs(after["field"]["height"] - expected_field_height) <= 1,
                           f"actual={after['field']['height']}, expected={expected_field_height}")
    good &= contract.check(f"{label}_field_centered_in_row",
                           abs(after["field"]["y"] - expected_field_y) <= 1,
                           f"actual_y={after['field']['y']}, expected_y={expected_field_y}")
    good &= contract.check(f"{label}_input_in_viewport", within_viewport(after["input"], width, height),
                           json.dumps(after["input"]))
    good &= contract.check(f"{label}_close_in_viewport", within_viewport(after["close"], width, height),
                           json.dumps(after["close"]))
    field_right = after["field"]["x"] + after["field"]["width"]
    close_right = after["close"]["x"] + after["close"]["width"]
    close_outside_field = close_right <= after["field"]["x"] - 1 or after["close"]["x"] >= field_right + 1
    good &= contract.check(f"{label}_close_outside_search_box", close_outside_field,
                           f"field=[{after['field']['x']},{field_right}], close=[{after['close']['x']},{close_right}]")
    expected_close_x = after["row"]["x"] + after["row"]["paddingLeft"]
    expected_field_right = after["row"]["x"] + after["row"]["width"] - after["row"]["paddingRight"]
    good &= contract.check(f"{label}_responsive_outer_padding_left",
                           abs(after["close"]["x"] - expected_close_x) <= 1,
                           f"close_x={after['close']['x']}, expected={expected_close_x}")
    good &= contract.check(f"{label}_responsive_outer_padding_right",
                           abs(field_right - expected_field_right) <= 1,
                           f"field_right={field_right}, expected={expected_field_right}")

    input_hit, close_hit = hit(page, selectors["input"]), hit(page, selectors["close"])
    good &= contract.check(f"{label}_input_not_blocked", bool(input_hit and input_hit["inside"]),
                           f"hit={input_hit}")
    good &= contract.check(f"{label}_close_not_blocked", bool(close_hit and close_hit["inside"]),
                           f"hit={close_hit}")

    active = page.evaluate("document.activeElement && document.activeElement.id")
    good &= contract.check(f"{label}_input_focused", active == "shop-search-morph-input", f"active={active}")

    row_bottom = after["row"]["y"] + after["row"]["height"]
    curtain_bottom = after["curtain"]["y"] + after["curtain"]["height"]
    good &= contract.check(f"{label}_curtain_starts_under_row",
                           abs(after["curtain"]["y"] - row_bottom) <= 1,
                           f"curtain_top={after['curtain']['y']}, row_bottom={row_bottom}")
    good &= contract.check(f"{label}_curtain_covers_viewport",
                           abs(curtain_bottom - height) <= 1 and after["curtain"]["opacity"] == "1",
                           f"bottom={curtain_bottom}, opacity={after['curtain']['opacity']}")
    expected_bg = "rgb(24, 25, 27)" if page.evaluate("document.documentElement.dataset.theme") == "dark" else "rgb(255, 255, 255)"
    good &= contract.check(f"{label}_curtain_opaque_theme", after["curtain"]["backgroundColor"] == expected_bg,
                           f"actual={after['curtain']['backgroundColor']}, expected={expected_bg}")

    # Search surface must be real visible UI, not a hidden sheet. Empty-query
    # content initially lives in the suggestions host; results start empty.
    good &= contract.check(f"{label}_results_surface_visible", within_viewport(after["sheet"], width, height),
                           f"sheet={after['sheet']}, results={after['results']}")
    return good


def run_mobile_case(browser: Browser, contract: Contract, label: str, width: int,
                    theme: str, compact: bool = False, reduced: bool = False) -> None:
    height = 844
    context, page = setup_page(browser, contract, width, height, theme, reduced)
    try:
        if compact:
            page.mouse.wheel(0, 600)
            page.wait_for_timeout(350)
        selectors = {"row": ".shop-header__inner", "logo": ".shop-brand", "cart": "#shop-actions", "burger": "#shop-burger"}
        baseline = {key: rect(page, sel) for key, sel in selectors.items()}
        scroll_before = page.evaluate("scrollY")
        page.locator("#shop-search-btn").click(timeout=3000)
        page.wait_for_timeout(380 if not reduced else 80)
        opened = assert_open(contract, page, label, width, height, baseline)

        # Real user input path; no fabricated API payload.
        try:
            page.locator("#shop-search-morph-input").fill("ثلاجة", timeout=1500)
            page.wait_for_timeout(750)
            result_text = page.locator("#shop-search-results").inner_text(timeout=1500)
            contract.check(f"{label}_typed_query_has_real_state", bool(result_text.strip()), f"text={result_text[:120]!r}")
        except Exception as exc:
            contract.fail(f"{label}_typed_query_has_real_state", str(exc))

        # × must be a real pointer-close path.
        try:
            page.locator("#shop-search-morph-close").click(timeout=2000)
            page.wait_for_timeout(350 if not reduced else 80)
            closed = rect(page, "#shop-search-morph")
            qn = rect(page, "#shop-quicknav")
            active = page.evaluate("document.activeElement && document.activeElement.id")
            scroll_after = page.evaluate("scrollY")
            contract.check(f"{label}_close_x_hides_overlay", closed["hidden"], json.dumps(closed))
            contract.check(f"{label}_close_x_restores_quicknav", qn["display"] != "none", json.dumps(qn))
            contract.check(f"{label}_close_x_restores_focus", active == "shop-search-btn", f"active={active}")
            contract.check(f"{label}_close_x_restores_scroll", abs(scroll_after - scroll_before) <= 1,
                           f"before={scroll_before}, after={scroll_after}")
        except Exception as exc:
            contract.fail(f"{label}_close_x", str(exc))
            return

        # Escape must independently close.
        page.locator("#shop-search-btn").click(timeout=2000)
        page.wait_for_timeout(300 if not reduced else 60)
        page.keyboard.press("Escape")
        page.wait_for_timeout(350 if not reduced else 80)
        contract.check(f"{label}_escape_hides_overlay", rect(page, "#shop-search-morph")["hidden"],
                       json.dumps(rect(page, "#shop-search-morph")))

        # Ten normal cycles catch stale cleanup timers/listeners.
        cycle_ok = True
        cycle_error = ""
        try:
            for _ in range(10):
                page.locator("#shop-search-btn").click(timeout=1500)
                page.wait_for_timeout(360 if not reduced else 60)
                page.locator("#shop-search-morph-close").click(timeout=2500)
                page.wait_for_timeout(400 if not reduced else 80)
                if not rect(page, "#shop-search-morph")["hidden"]:
                    raise RuntimeError("overlay remained visible after close")
        except Exception as exc:
            cycle_ok, cycle_error = False, str(exc)
        contract.check(f"{label}_repeated_cycles_10x", cycle_ok, cycle_error or "10 cycles passed")
        contract.check(f"{label}_no_horizontal_overflow", page.evaluate("document.documentElement.scrollWidth - innerWidth") == 0,
                       f"overflow={page.evaluate('document.documentElement.scrollWidth - innerWidth')}")
    finally:
        contract.unhandled.extend(page.evaluate("window.__phase23Unhandled || []"))
        context.close()


def run_desktop_case(browser: Browser, contract: Contract, width: int, theme: str) -> None:
    context, page = setup_page(browser, contract, f"desktop{width}", theme) if False else setup_page(browser, contract, width, 844, theme)
    try:
        overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
        button = rect(page, "#shop-search-btn")
        contract.check(f"desktop{width}_{theme}_no_horizontal_overflow", overflow == 0, f"overflow={overflow}")
        contract.check(f"desktop{width}_{theme}_mobile_trigger_hidden", button["display"] == "none", json.dumps(button))
    finally:
        contract.unhandled.extend(page.evaluate("window.__phase23Unhandled || []"))
        context.close()


def main() -> int:
    contract = Contract()
    protected_before = {name: sha256(path) for name, path in PROTECTED.items()}
    static_gate(contract)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--ignore-certificate-errors"])
            try:
                # First case is deliberately the tight red loop for the reported bug.
                run_mobile_case(browser, contract, "mobile390_top_light", 390, "light")
                # Regression matrix only continues on fresh contexts; no state leakage.
                run_mobile_case(browser, contract, "mobile390_top_dark", 390, "dark")
                run_mobile_case(browser, contract, "mobile390_compact_light", 390, "light", compact=True)
                run_mobile_case(browser, contract, "mobile390_reduced_light", 390, "light", reduced=True)
                for width in (360, 430, 600, 768):
                    run_mobile_case(browser, contract, f"mobile{width}_light", width, "light")
                for width, theme in ((1024, "light"), (1366, "light"), (1366, "dark"), (1920, "light")):
                    run_desktop_case(browser, contract, width, theme)
            finally:
                browser.close()
    except Exception as exc:
        contract.fail("playwright_launch_or_runtime", repr(exc))

    protected_after = {name: sha256(path) for name, path in PROTECTED.items()}
    for name in PROTECTED:
        contract.check(f"protected_{name}_unchanged", protected_before[name] == protected_after[name],
                       f"before={protected_before[name]}, after={protected_after[name]}")
    contract.check("console_errors_zero", not contract.console_errors, " | ".join(contract.console_errors[:4]))
    contract.check("page_errors_zero", not contract.page_errors, " | ".join(contract.page_errors[:4]))
    contract.check("unhandled_errors_zero", not contract.unhandled, " | ".join(contract.unhandled[:4]))

    data = {
        "url": URL,
        "passed": sum(x.ok for x in contract.results),
        "failed": len(contract.failures),
        "results": [asdict(x) for x in contract.results],
        "console_errors": contract.console_errors,
        "page_errors": contract.page_errors,
        "unhandled": contract.unhandled,
        "protected_sha256_before": protected_before,
        "protected_sha256_after": protected_after,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"RESULT: {data['passed']} passed / {data['failed']} failed")
    for item in contract.failures:
        print(f"FAIL {item.name}: {item.detail}")
    print(f"REPORT: {OUT}")
    return 1 if contract.failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
