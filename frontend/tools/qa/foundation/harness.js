/* PHASE 1 — حاضنة QA للأساس الجديد (تُحقَن في الصفحة الحيّة أثناء الاختبارات فقط).
   الغرض: (1) تُمسح من Tailwind لتوليد الأدوات المستخدمة، (2) تُركَّب داخل .stw للتحقق البصري/القياسي. */
(function () {
  'use strict';
  var HARNESS_ID = 'stw-foundation-harness';

  function build() {
    var wrap = document.createElement('div');
    wrap.id = HARNESS_ID;
    wrap.className = 'stw';
    wrap.setAttribute('dir', 'rtl');
    wrap.style.cssText = 'position:fixed;inset-inline-start:0;inset-block-start:0;z-index:99999;width:100%;max-width:520px;';
    wrap.innerHTML = [
      '<div class="stw-container">',
      '  <div class="stw-elevated p-4 flex flex-col gap-3">',
      '    <p class="stw-t-section">أساس المتجر الجديد</p>',
      '    <p class="stw-t-body text-ink-muted">نص المتن — Cairo — بلا تباعد حروف.</p>',
      '    <p class="stw-t-meta text-ink-subtle">ميتا 13px · <span class="stw-num">350.00 $</span></p>',
      '    <p class="stw-t-price-lg stw-price">350.00 $</p>',
      '    <div class="grid gap-2 grid-cols-2">',
      '      <button type="button" class="stw-btn stw-btn--primary" id="stw-t-primary">أضف إلى السلة</button>',
      '      <button type="button" class="stw-btn stw-btn--secondary" id="stw-t-secondary">ثانوي</button>',
      '      <button type="button" class="stw-btn stw-btn--outline" id="stw-t-outline">محدَّد</button>',
      '      <button type="button" class="stw-btn stw-btn--ghost" id="stw-t-ghost">شبح</button>',
      '      <button type="button" class="stw-btn stw-btn--danger" id="stw-t-danger">خطر</button>',
      '      <button type="button" class="stw-btn stw-btn--primary" id="stw-t-disabled" disabled>غير متوفر حاليًا</button>',
      '    </div>',
      '    <label class="stw-label" for="stw-t-input">البريد الإلكتروني</label>',
      '    <input id="stw-t-input" class="stw-field" type="email" placeholder="name@example.com" />',
      '    <input id="stw-t-invalid" class="stw-field" aria-invalid="true" value="خطأ" />',
      '    <p class="stw-error">رسالة خطأ</p>',
      '    <select id="stw-t-select" class="stw-field stw-select"><option>الأحدث</option><option>السعر</option></select>',
      '    <label class="stw-choice"><input type="checkbox" id="stw-t-check" checked /><span>عليها خصم فقط</span></label>',
      '    <a href="#/" class="stw-btn stw-btn--outline stw-btn--sm">رابط زر</a>',
      '    <a href="#/products" class="skip-link">تجاوز إلى المحتوى</a>',
      '    <span class="sr-only">نص لقارئ الشاشة</span>',
      '    <div class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">',
      '      <span class="stw-t-caption text-ink-muted">شارة</span>',
      '      <span class="rounded-full bg-primary-soft px-2 py-0.5 stw-t-caption font-semibold text-ink">-16.67%</span>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    return wrap;
  }

  window.__stwHarness = {
    mount: function () {
      var el = document.getElementById(HARNESS_ID) || build();
      if (!el.parentNode) document.body.appendChild(el);
      return el;
    },
    unmount: function () {
      var el = document.getElementById(HARNESS_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },
    id: HARNESS_ID
  };
})();
