#!/usr/bin/env python3
"""
Stage 14.3 — فحص أمني ثابت لملفات المتجر (بلا أي نداء شبكة).

البنود: أسرار/مفاتيح · JWT · CDN خارجي · fetch خارج العميل المركزي · مسارات إدارية ·
نجاح وهمي (SUCCEEDED/VERIFIED) · تخزين توكن/كلمة مرور · XSS عبر html/outerHTML · بيانات وهمية.

يكتب frontend/tools/qa/shop143/shop143-scan-report.json
"""
from __future__ import annotations

import json
import re
from pathlib import Path

SHOP_DIR = Path("/root/alwled/frontend/shop")
OUT = Path("/root/alwled/frontend/tools/qa/shop143")
OUT.mkdir(parents=True, exist_ok=True)
JS_FILES = sorted((SHOP_DIR / "assets" / "js").glob("*.js")) + [SHOP_DIR / "index.html"]
checks: list[dict] = []


def source_of(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*[\s\S]*?\*/", "", text)
    text = re.sub(r"(?<!:)//[^\n]*", "", text)
    return text


def check(name: str, count: int, detail: str = "") -> None:
    ok = count == 0
    checks.append({"check": name, "violations": count, "status": "PASS" if ok else "FAIL", "detail": detail[:300]})
    print(("PASS  " if ok else "FAIL  ") + name + ("  count=%d" % count if count else ""))


def main() -> int:
    raw = {path.name: source_of(path) for path in JS_FILES}
    clean = {name: strip_comments(text) for name, text in raw.items()}

    # 1) secrets / credentials / keys
    secret_patterns = {
        "hardcoded JWT (eyJ…)": r"eyJ[A-Za-z0-9_-]{10,}",
        "api key assignment": r"(api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['\"][^'\"]{6,}",
        "password literal": r"password\s*[:=]\s*['\"][^'\"]{4,}",
        "bearer literal": r"Bearer\s+[A-Za-z0-9._-]{12,}",
        "SHAMCASH_/env secret read": r"SHAMCASH_[A-Z_]*\s*[:=]",
        "private key block": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    }
    for label, pattern in secret_patterns.items():
        hits = [(name, len(re.findall(pattern, text))) for name, text in raw.items() if re.search(pattern, text)]
        # the payment/verification QA fixtures live in tools/, never in shop/
        check("no %s in store sources" % label, sum(count for _, count in hits), json.dumps(hits))

    # 2) external references (no CDN, fonts, images, analytics)
    external = []
    for name, text in raw.items():
        for match in re.findall(r"https?://[^\s'\"<>)]+", text):
            external.append("%s: %s" % (name, match[:80]))
    check("no external URLs/CDN/fonts/images in store sources", len(external), json.dumps(external[:5]))

    # 3) network + admin surface
    fetch_hits = [name for name, text in clean.items() if re.search(r"\bfetch\s*\(", text)]
    check("no raw fetch() outside the central client", len(fetch_hits), json.dumps(fetch_hits))
    admin_hits = [name for name, text in clean.items() if re.search(r"['\"`]/admin", text)]
    check("no /admin endpoint reachable from the store", len(admin_hits), json.dumps(admin_hits))
    staff_hits = [name for name, text in clean.items() if re.search(r"/(employees|roles|permissions|audit|dashboard|analytics|inventory)\b", text)]
    check("no employee/role/audit/dashboard endpoint from the store", len(staff_hits), json.dumps(staff_hits))

    # 4) fake success markers (a store page must never write a final state)
    fake = []
    for name, text in clean.items():
        for pattern in (r"status\s*[:=]\s*['\"](SUCCEEDED|VERIFIED)['\"]", r"payment\.success", r"verifySuccess", r"fake[A-Z]?[Pp]ayment", r"mockPayment", r"fakeVerification"):
            if re.search(pattern, text):
                fake.append("%s: %s" % (name, pattern))
    check("no fake success / fake provider / fake verification code", len(fake), json.dumps(fake[:5]))

    # 5) storage hygiene
    storage_findings = []
    allowed_keys = {"'alwled.theme'", "'alwled.session'", "'alwled.shop.pendingAdd'", "'alwled.shop.idem.'"}
    for name, text in clean.items():
        for match in re.findall(r"(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*([^,\)]+)", text):
            token = match.strip()
            if token.startswith("IDEM_PREFIX") or token in allowed_keys or "slot" in token or "key" in token.lower():
                continue
            storage_findings.append("%s: %s" % (name, token[:60]))
    check("only documented storage keys are used", len(storage_findings), json.dumps(storage_findings[:6]))
    token_storage = [name for name, text in clean.items()
                     if re.search(r"(localStorage|sessionStorage)\.setItem\([^)]*(token|password|amount|secret)", text, re.I)]
    check("no token/password/amount written to browser storage", len(token_storage), json.dumps(token_storage))

    # 6) XSS surface: the only innerHTML allowed is the generic el() helper feeding static SVG markup
    xss = []
    helper_assignments = 0
    for name, text in clean.items():
        for match in re.finditer(r"(innerHTML|outerHTML)\s*=", text):
            line = text[max(0, match.start() - 120): match.start()].split("\n")[-1]
            if name == "shop.js" and "key === 'html'" in line:
                helper_assignments += 1     # el(tag, {html}) — call sites are asserted below to be static SVGs
                continue
            xss.append("%s: %s" % (name, line.strip()[:70]))
        for match in re.finditer(r"html:\s*([^,}]+)", text):
            value = match.group(1).strip()
            if not (value.startswith("'") or value.startswith('"') or "productIconSvg(" in value):
                xss.append("%s: html: %s" % (name, value[:60]))
    check("no dynamic HTML injection (text content only)", len(xss), json.dumps(xss[:6]))
    checks.append({"check": "the only innerHTML sink is the documented el({html}) helper with static SVG",
                   "violations": 0 if helper_assignments == 1 else 1, "status": "PASS" if helper_assignments == 1 else "FAIL",
                   "detail": "helper occurrences=%d" % helper_assignments})

    # 7) money arithmetic in the browser
    money_math = [name for name, text in clean.items() if re.search(r"parseFloat|Number\([^)]*price|toFixed\(", text)]
    check("no client-side money arithmetic (prices come from the backend as strings)", len(money_math), json.dumps(money_math))

    # 8) fake product/price data
    fake_data = [name for name, text in clean.items() if re.search(r"(mockProducts|sampleProducts|dummyProduct|seedProducts)", text, re.I)]
    check("no mock/sample/dummy product data in the store", len(fake_data), json.dumps(fake_data))

    # 9) proof upload invention
    upload = [name for name, text in clean.items() if re.search(r"FormData|type=['\"]file['\"]|\.files\b|FileReader", text)]
    check("no invented file-upload path (the API contract takes a link)", len(upload), json.dumps(upload))

    report = {
        "stage": "14.3",
        "scope": "store static security scan",
        "files": [path.name for path in JS_FILES],
        "total": len(checks),
        "passed": sum(1 for item in checks if item["status"] == "PASS"),
        "failed": sum(1 for item in checks if item["status"] == "FAIL"),
        "checks": checks,
    }
    (OUT / "shop143-scan-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== 14.3 scan: %d/%d PASS ===" % (report["passed"], report["total"]))
    for item in checks:
        if item["status"] == "FAIL":
            print("  ✗ %s -> %s" % (item["check"], item["detail"]))
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
