/**
 * alwled — لوحة الإدارة: السلايدر (صور الواجهة الرئيسية)
 * يستخدم الأنظمة القائمة فقط: ALW.api · ALW.modal · ALW.toast · ALW.forms · ALW.can · ALW.dom · ALW.feedback
 * لا يحذف ملفات تخزين من الواجهة (الحذف عبر الـAPI فقط) · لا مسارات فيزيائية · لا كشف مفاتيح تخزين.
 */
(function (global) {
  'use strict';
  var ALW = global.ALW || (global.ALW = {});
  ALW.pages = ALW.pages || {};

  var REC_DESKTOP = { w: 1920, h: 640, ratio: 3, label: '1920×640', ratioLabel: '3:1' };
  var REC_MOBILE = { w: 1080, h: 900, ratio: 1.2, label: '1080×900', ratioLabel: '6:5' };
  var MAX_BYTES = 8 * 1024 * 1024;
  var OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var RATIO_TOLERANCE = 0.18;

  var dom = ALW.dom, api = ALW.api, ui = ALW.ui, modal = ALW.modal, toast = ALW.toast, can = ALW.can, feedback = ALW.feedback;

  var state = { slides: [], busy: false };

  function style() {
    if (document.getElementById('slider-admin-style')) return;
    var css = [
      '.sl-wrap{display:flex;flex-direction:column;gap:16px}',
      '.sl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}',
      '.sl-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}',
      '.sl-card{border:1px solid var(--border-subtle,#e5e5e2);border-radius:14px;background:var(--bg-surface,#fff);overflow:hidden;display:flex;flex-direction:column}',
      '.sl-thumb{aspect-ratio:3/1;background:var(--bg-surface-2,#f7f7f5);display:flex;align-items:center;justify-content:center;overflow:hidden}',
      '.sl-thumb img{width:100%;height:100%;object-fit:contain}',
      '.sl-body{padding:12px;display:flex;flex-direction:column;gap:8px}',
      '.sl-badges{display:flex;gap:6px;flex-wrap:wrap}',
      '.sl-badge{font-size:12px;padding:3px 8px;border-radius:999px;border:1px solid var(--border-subtle,#e5e5e2)}',
      '.sl-badge--on{background:#FFF6D8;color:#171717;border-color:#FFBF17}',
      '.sl-badge--off{background:var(--bg-surface-2,#f7f7f5);color:#626262}',
      '.sl-alt{font-size:13px;color:#626262;line-height:1.6;margin:0}',
      '.sl-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}',
      '.sl-preview{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}',
      '.sl-drop{border:1px dashed var(--border-strong,#d4d4d0);border-radius:12px;padding:10px;background:var(--bg-surface-2,#f7f7f5)}',
      '.sl-drop img{width:100%;height:auto;max-height:210px;object-fit:contain;border-radius:8px;background:#fff}',
      '.sl-meta{font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.7}', // توكن متغيّر بالثيم (كان #626262 ثابتًا ⇒ تباين 2.6:1 في الداكن)
      '.sl-warn{font-size:12px;color:#92400e;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:6px 8px;margin-top:6px;line-height:1.6}',
      '.sl-help{font-size:12px;color:#626262;line-height:1.7}',
      '.sl-counter{font-size:12px;color:#626262}',
      '.sl-counter--bad{color:#b91c1c}',
      '@media (max-width:520px){.sl-grid{grid-template-columns:1fr}.sl-preview{grid-template-columns:1fr}.sl-actions .btn{min-height:44px;flex:1 1 auto}}',
      '.sl-actions .btn,.sl-head .btn{min-height:44px}',
      '.sl-move{display:inline-flex;gap:6px}',
    ].join('');
    var node = document.createElement('style');
    node.id = 'slider-admin-style';
    node.textContent = css;
    document.head.appendChild(node);
  }

  function apiPath(p) { return p; }
  function publicUrl(u) { return u; }

  function fmtRatio(w, h) { return (w / h).toFixed(2) + ':1'; }
  function hasPermission(p) { return can && typeof can.can === 'function' ? can.can(p) : false; }

  /* ------------------------------ تحميل ------------------------------ */
  /** ALW.api يفكّ غلاف {success,message,data} ويعيد data مباشرة — ندعم الشكلين احتياطًا. */
  function unwrap(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.data)) return res.data;
    return [];
  }

  function load() {
    return api.get(apiPath('/slider/admin')).then(function (res) {
      state.slides = unwrap(res);
      return state.slides;
    });
  }

  /* ------------------------------ بطاقة ------------------------------ */
  function slideCard(slide, index) {
    var canUpdate = hasPermission('slider.update');
    var canDelete = hasPermission('slider.delete');

    var thumbImg = dom.el('img', {
      src: publicUrl(slide.desktopImageUrl),
      alt: slide.altText || 'معاينة صورة الشريحة',
      loading: 'lazy',
    });
    var thumbMeta = dom.el('div', { class: 'sl-meta', text: 'جارٍ قراءة الأبعاد…' });
    thumbImg.addEventListener('load', function () {
      thumbMeta.textContent = 'الأبعاد الفعلية: ' + thumbImg.naturalWidth + ' × ' + thumbImg.naturalHeight +
        ' · النسبة: ' + fmtRatio(thumbImg.naturalWidth, thumbImg.naturalHeight);
    });
    thumbImg.addEventListener('error', function () { thumbMeta.textContent = 'تعذّر عرض الصورة.'; });
    var thumb = dom.el('div', { class: 'sl-thumb' }, [thumbImg]);

    var badges = dom.el('div', { class: 'sl-badges' }, [
      dom.el('span', { class: 'sl-badge ' + (slide.isEnabled ? 'sl-badge--on' : 'sl-badge--off'), text: slide.isEnabled ? 'مفعّلة' : 'معطّلة' }),
      dom.el('span', { class: 'sl-badge', text: 'الترتيب: ' + (index + 1) }),
      dom.el('span', { class: 'sl-badge', text: slide.mobileImageUrl ? 'صورة جوال: موجودة' : 'صورة جوال: لا توجد' }),
      slide.linkUrl ? dom.el('span', { class: 'sl-badge', text: 'رابط مُحدَّد' }) : null,
    ]);

    var actions = dom.el('div', { class: 'sl-actions' });
    if (canUpdate) {
      actions.appendChild(dom.el('button', { type: 'button', class: 'btn btn--sm', text: 'تعديل', 'data-act': 'edit', 'aria-label': 'تعديل الشريحة رقم ' + (index + 1) }));
      actions.appendChild(dom.el('button', { type: 'button', class: 'btn btn--sm btn--ghost', text: slide.isEnabled ? 'تعطيل' : 'تفعيل', 'data-act': 'toggle', 'aria-label': (slide.isEnabled ? 'تعطيل' : 'تفعيل') + ' الشريحة رقم ' + (index + 1) }));
      actions.appendChild(dom.el('div', { class: 'sl-move' }, [
        dom.el('button', { type: 'button', class: 'btn btn--sm btn--ghost', text: '▲', 'data-act': 'up', disabled: index === 0, 'aria-label': 'تحريك الشريحة رقم ' + (index + 1) + ' للأعلى' }),
        dom.el('button', { type: 'button', class: 'btn btn--sm btn--ghost', text: '▼', 'data-act': 'down', disabled: index === state.slides.length - 1, 'aria-label': 'تحريك الشريحة رقم ' + (index + 1) + ' للأسفل' }),
      ]));
    }
    if (canDelete) {
      actions.appendChild(dom.el('button', { type: 'button', class: 'btn btn--sm btn--danger', text: 'حذف', 'data-act': 'delete', 'aria-label': 'حذف الشريحة رقم ' + (index + 1) }));
    }

    return dom.el('article', { class: 'sl-card', 'data-id': String(slide.id) }, [
      thumb,
      dom.el('div', { class: 'sl-body' }, [
        slide.title ? dom.el('strong', { text: slide.title }) : null,
        badges,
        thumbMeta,
        dom.el('p', { class: 'sl-alt', text: slide.altText ? 'النص البديل: ' + slide.altText : 'لا يوجد نص بديل' }),
        actions,
      ]),
    ]);
  }

  function renderList(container) {
    var holder = dom.qs('#sl-list', container);
    dom.clear(holder);
    if (!state.slides.length) {
      holder.appendChild(feedback.empty('لا توجد شرائح في السلايدر بعد.', 'السلايدر'));
      var add = hasPermission('slider.create') ? dom.el('button', {
        type: 'button', class: 'btn btn--primary', text: '+ إضافة شريحة',
        onclick: function () { openEditor(null, container); },
      }) : null;
      if (add) holder.appendChild(dom.el('div', { class: 'sl-head' }, [add]));
      return;
    }
    var grid = dom.el('div', { class: 'sl-grid' });
    state.slides.forEach(function (slide, index) {
      var card = slideCard(slide, index);
      dom.on(card, 'click', '[data-act]', function (event, target) {
        var act = target.getAttribute('data-act');
        if (act === 'edit') openEditor(slide, container);
        else if (act === 'toggle') onToggle(slide, container);
        else if (act === 'delete') onDelete(slide, container);
        else if (act === 'up') onMove(slide, -1, container);
        else if (act === 'down') onMove(slide, 1, container);
      });
      grid.appendChild(card);
    });
    holder.appendChild(grid);
  }

  /* ------------------------------ أفعال ------------------------------ */
  function onToggle(slide, container) {
    if (state.busy) return;
    state.busy = true;
    api.patch(apiPath('/slider/admin/' + slide.id), { isEnabled: !slide.isEnabled })
      .then(function () {
        toast.success(slide.isEnabled ? 'تم تعطيل الشريحة.' : 'تم تفعيل الشريحة.');
        return refresh(container);
      })
      .catch(function (error) { toast.fromError(error, 'تعذّر تغيير حالة الشريحة.'); })
      .then(function () { state.busy = false; });
  }

  function onMove(slide, delta, container) {
    if (state.busy) return;
    var index = state.slides.indexOf(slide);
    var target = index + delta;
    if (target < 0 || target >= state.slides.length) return;
    var ids = state.slides.map(function (s) { return s.id; });
    ids.splice(index, 1);
    ids.splice(target, 0, slide.id);
    state.busy = true;
    api.patch(apiPath('/slider/admin/reorder'), { ids: ids })
      .then(function () {
        toast.success('تم تحديث الترتيب.');
        return refresh(container); // نعتمد ترتيب الخادم لا الـDOM
      })
      .catch(function (error) { toast.fromError(error, 'تعذّر تحديث الترتيب.'); })
      .then(function () { state.busy = false; });
  }

  function onDelete(slide, container) {
    if (state.busy) return;          // حارس ازدواج: لا طلب حذف مكرّر
    state.busy = true;
    modal.confirm({
      title: 'حذف الشريحة',
      message: 'سيتم حذف هذه الشريحة من سلايدر الواجهة الرئيسية نهائيًا' + (slide.title ? ' («' + slide.title + '»)' : '') + '. هل تريد المتابعة؟',
      tone: 'danger',
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      onConfirm: function () {
        return api.del(apiPath('/slider/admin/' + slide.id)).then(function () {
          toast.success('تم حذف الشريحة.');
          return refresh(container);
        }).catch(function (error) {
          toast.fromError(error, 'تعذّر حذف الشريحة.');
          throw error;
        }).then(function (r) { state.busy = false; return r; }, function (e) { state.busy = false; throw e; });
      },
    });
  }

  function refresh(container) {
    return load().then(function () { renderList(container); });
  }

  /* ------------------------------ محرّر ------------------------------ */
  function fileMeta(file, onReady) {
    if (!file) { onReady(null); return; }
    if (OK_TYPES.indexOf(file.type) === -1) { onReady({ error: 'الصيغ المدعومة: JPEG · PNG · WebP فقط.' }); return; }
    if (file.size > MAX_BYTES) { onReady({ error: 'حجم الملف يتجاوز 8MB.' }); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      onReady({
        url: url, width: img.naturalWidth, height: img.naturalHeight,
        ratio: img.naturalWidth / img.naturalHeight,
        dims: img.naturalWidth + ' × ' + img.naturalHeight,
        ratioText: fmtRatio(img.naturalWidth, img.naturalHeight),
        dedupe: '',
      });
    };
    img.onerror = function () { onReady({ error: 'تعذّرت قراءة الصورة — تأكد أن الملف صورة صالحة.' }); };
    img.src = url;
  }

  function ratioWarning(meta, rec) {
    if (!meta || meta.error) return '';
    return Math.abs(meta.ratio - rec.ratio) / rec.ratio > RATIO_TOLERANCE
      ? 'نسبة الصورة تختلف عن المقاس المقترح. قد يختلف توزيع المحتوى حسب حجم الشاشة.'
      : '';
  }

  function openEditor(slide, container) {
    var isEdit = !!slide;
    var body = dom.el('div', { class: 'sl-wrap' });

    // Desktop
    var dInput = dom.el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', id: 'sl-desktop', name: 'desktop' });
    var dPreview = dom.el('div', { class: 'sl-drop' }, [
      dom.el('label', { for: 'sl-desktop', text: isEdit ? 'استبدال صورة سطح المكتب (اختياري)' : 'صورة سطح المكتب (إلزامية) *' }),
      dInput,
      dom.el('p', { class: 'sl-help', text: 'المقاس المقترح: ' + REC_DESKTOP.label + ' — النسبة ' + REC_DESKTOP.ratioLabel }),
      dom.el('div', { id: 'sl-d-meta' }),
    ]);

    // Mobile
    var mInput = dom.el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', id: 'sl-mobile', name: 'mobile' });
    var mModes = [
      dom.el('option', { value: 'keep', text: 'إبقاء الصورة الحالية' }),
      dom.el('option', { value: 'replace', text: 'استبدال بصورة جديدة' }),
      dom.el('option', { value: 'remove', text: 'إزالة صورة الجوال' }),
    ];
    var mSelect = dom.el('select', { id: 'sl-mobile-mode', name: 'mobileMode' }, mModes);
    var mPreview = dom.el('div', { class: 'sl-drop' }, [
      dom.el('strong', { text: 'صورة الجوال (اختيارية)' }),
      isEdit
        ? dom.el('p', { class: 'sl-help', text: slide.mobileImageUrl ? 'توجد صورة مخصصة للجوال حاليًا.' : 'لا توجد صورة مخصصة للجوال — ستُستخدم صورة سطح المكتب كبديل في الواجهة.' })
        : dom.el('p', { class: 'sl-help', text: 'اختياري — المقاس المقترح: ' + REC_MOBILE.label + ' — النسبة ' + REC_MOBILE.ratioLabel }),
      isEdit ? dom.el('label', { for: 'sl-mobile-mode', text: 'إجراء صورة الجوال' }) : null,
      isEdit ? mSelect : null,
      dom.el('label', { for: 'sl-mobile', text: isEdit ? 'ملف صورة الجوال الجديدة' : 'ملف صورة الجوال' }),
      mInput,
      dom.el('p', { class: 'sl-help', text: 'إذا كانت الصورة تحتوي نصوصًا أو عناصر مهمة قرب الأطراف، يُفضّل رفع نسخة مخصصة للجوال.' }),
      dom.el('div', { id: 'sl-m-meta' }),
    ]);

    var fAlt = ALW.forms.textarea({ name: 'altText', label: 'النص البديل', rows: 2, placeholder: 'صف محتوى الصورة باختصار للقارئ الذي لا يستطيع رؤيتها.' });
    var altCounter = dom.el('span', { class: 'sl-counter' });
    var fTitle = ALW.forms.text({ name: 'title', label: 'العنوان (اختياري)' });
    var fSub = ALW.forms.text({ name: 'subtitle', label: 'الوصف الفرعي (اختياري)' });
    var fCta = ALW.forms.text({ name: 'ctaLabel', label: 'نص الزر (اختياري)' });
    var fLink = ALW.forms.text({ name: 'linkUrl', label: 'الرابط (اختياري)' });
    var fEnabled = ALW.forms.checkbox({ name: 'isEnabled', label: 'مفعّلة' });
    var fSort = ALW.forms.number({ name: 'sortOrder', label: 'ترتيب العرض' });
    var errBox = dom.el('div', { class: 'sl-warn', style: 'display:none' });

    if (isEdit) {
      fAlt.setValue(slide.altText || ''); fTitle.setValue(slide.title || '');
      fSub.setValue(slide.subtitle || ''); fCta.setValue(slide.ctaLabel || '');
      fLink.setValue(slide.linkUrl || ''); fSort.setValue(String(slide.sortOrder || 0));
      fEnabled.input.checked = !!slide.isEnabled;
      mSelect.value = 'keep';
    } else {
      fSort.setValue('0'); fEnabled.input.checked = true; mSelect.value = 'keep';
    }
    function syncAlt() {
      var n = fAlt.getValue().length;
      altCounter.textContent = n + ' / 300';
      altCounter.className = 'sl-counter' + (n > 300 || (n > 0 && n < 2) ? ' sl-counter--bad' : '');
    }
    fAlt.input.addEventListener('input', syncAlt);
    syncAlt();

    var linkHelp = dom.el('p', { class: 'sl-help', text: 'الرابط اختياري — يقبل مسارًا داخليًا مثل #/products أو رابطًا خارجيًا https://… · إن تُرك فارغًا لن تكون الشريحة قابلة للنقر.' });

    dom.mount(body, [
      dom.el('div', { class: 'sl-preview' }, [dPreview, mPreview]),
      errBox,
      fAlt.wrap, altCounter,
      fTitle.wrap, fSub.wrap, fCta.wrap, fLink.wrap, linkHelp, fSort.wrap, fEnabled.wrap,
    ]);

    var dialog = modal.create({ title: isEdit ? 'تعديل الشريحة' : 'إضافة شريحة', size: 'lg' });
    dialog.setBody(body);
    dialog.addFooterButton({
      label: 'إلغاء', className: 'btn--secondary', action: 'cancel',
      onClick: function () { dialog.close(); },
    });
    dialog.addFooterButton({
      label: isEdit ? 'حفظ' : 'إضافة', className: 'btn--primary', action: 'save', loading: true,
      onClick: submit,
    });
    dialog.open();

    var dMeta = null, mMeta = null;
    dInput.addEventListener('change', function () {
      var file = dInput.files && dInput.files[0];
      fileMeta(file, function (meta) {
        dMeta = meta;
        var box = dom.qs('#sl-d-meta', body);
        dom.clear(box);
        if (!meta) return;
        if (meta.error) { dom.mount(box, [dom.el('p', { class: 'sl-warn', text: meta.error })]); dMeta = meta; return; } // إبقاء الخطأ ليوقفه الحارس client-side
        var warn = ratioWarning(meta, REC_DESKTOP);
        dom.mount(box, [
          dom.el('img', { src: meta.url, alt: 'معاينة صورة سطح المكتب المختارة' }),
          dom.el('div', { class: 'sl-meta', text: 'الأبعاد: ' + meta.dims + ' · النسبة: ' + meta.ratioText }),
          warn ? dom.el('div', { class: 'sl-warn', text: warn }) : null,
        ]);
      });
    });
    mInput.addEventListener('change', function () {
      var file = mInput.files && mInput.files[0];
      fileMeta(file, function (meta) {
        mMeta = meta;
        var box = dom.qs('#sl-m-meta', body);
        dom.clear(box);
        if (!meta) return;
        if (meta.error) { dom.mount(box, [dom.el('p', { class: 'sl-warn', text: meta.error })]); mMeta = meta; return; } // إبقاء الخطأ ليوقفه الحارس client-side
        var warn = ratioWarning(meta, REC_MOBILE);
        dom.mount(box, [
          dom.el('img', { src: meta.url, alt: 'معاينة صورة الجوال المختارة' }),
          dom.el('div', { class: 'sl-meta', text: 'الأبعاد: ' + meta.dims + ' · النسبة: ' + meta.ratioText }),
          warn ? dom.el('div', { class: 'sl-warn', text: warn }) : null,
        ]);
        if (isEdit) mSelect.value = 'replace';
      });
    });

    function showError(message) {
      errBox.textContent = message;
      errBox.style.display = 'block';
    }

    var submitting = false; // حارس ازدواج للحفظ (Network count = 1)
    function submit() {
      if (submitting || dialog.isBusy()) return null; // منع الإرسال المزدوج
      submitting = true;
      errBox.style.display = 'none';
      var payload = {
        altText: fAlt.getValue().trim(),
        title: fTitle.getValue().trim(),
        subtitle: fSub.getValue().trim(),
        ctaLabel: fCta.getValue().trim(),
        linkUrl: fLink.getValue().trim(),
        isEnabled: !!fEnabled.input.checked,
        sortOrder: parseInt(fSort.getValue(), 10) || 0,
      };
      if (payload.altText && (payload.altText.length < 2 || payload.altText.length > 300)) {
        showError('النص البديل يجب أن يكون بين 2 و300 حرف.');
        submitting = false;
        return null;
      }
      Object.keys(payload).forEach(function (k) { if (payload[k] === '') delete payload[k]; });

      // إزالة صورة الجوال فعل صريح ⇒ تُرسل في مسار JSON بالحقل المدعوم في العقد
      var wantsRemoveMobile = isEdit && mSelect && mSelect.value === 'remove';

      var desktopFile = dInput.files && dInput.files[0];
      var mobileFile = mInput.files && mInput.files[0];
      if (!isEdit && !desktopFile) { showError('صورة سطح المكتب مطلوبة.'); submitting = false; return null; }
      if (dMeta && dMeta.error) { showError(dMeta.error); submitting = false; return null; }
      if (mMeta && mMeta.error) { showError(mMeta.error); submitting = false; return null; }

      var needsMultipart = !!desktopFile || !!mobileFile;
      dialog.setBusy(true);
      var promise;
      if (!needsMultipart) {
        // تعديل نصي/حالة فقط ⇒ JSON
        // العقد الفعلي في UpdateSlideDto يستخدم mobileMode (keep|replace|remove) — لا حقل removeMobileImage
        if (wantsRemoveMobile) payload.mobileMode = 'remove'; // فعل إزالة صريح (بلا ملف)
        else if (isEdit) payload.mobileMode = 'keep';         // KEEP لا يحذف الصورة
        promise = isEdit ? api.patch(apiPath('/slider/admin/' + slide.id), payload)
                         : null; // الإنشاء يتطلب صورة دائمًا
      } else {
        var fd = new FormData();
        Object.keys(payload).forEach(function (k) { fd.append(k, String(payload[k])); });
        if (desktopFile) fd.append('desktop', desktopFile, desktopFile.name);
        if (mobileFile) fd.append('mobile', mobileFile, mobileFile.name);
        if (isEdit) {
          fd.append('mobileMode', mobileFile ? 'replace' : (wantsRemoveMobile ? 'remove' : 'keep'));
          promise = api.patch(apiPath('/slider/admin/' + slide.id), fd);
        } else {
          promise = api.post(apiPath('/slider/admin'), fd);
        }
      }
      if (!promise) { showError('صورة سطح المكتب مطلوبة.'); dialog.setBusy(false); submitting = false; return null; }

      return promise.then(function () {
        toast.success(isEdit ? 'تم تحديث الشريحة.' : 'تمت إضافة الشريحة.');
        dialog.setBusy(false);
        dialog.close();
        return refresh(container);
      }).catch(function (error) {
        dialog.setBusy(false);
        var msg = (error && error.message) || 'تعذّر حفظ الشريحة.';
        showError(msg);
        toast.fromError(error, 'تعذّر حفظ الشريحة.');
        return null;
      }).then(function (r) { submitting = false; return r; });
    }
  }

  /* ------------------------------ الصفحة ------------------------------ */
  function render(container) {
    style();
    dom.mount(container, [
      dom.el('div', { class: 'sl-wrap' }, [
        dom.el('div', { class: 'sl-head' }, [
          dom.el('div', {}, [
            dom.el('h1', { text: 'السلايدر' }),
            dom.el('p', { class: 'sl-help', text: 'إدارة صور الواجهة الرئيسية وترتيب ظهورها.' }),
          ]),
          hasPermission('slider.create')
            ? dom.el('button', { type: 'button', class: 'btn btn--primary', text: '+ إضافة شريحة', onclick: function () { openEditor(null, container); } })
            : null,
        ]),
        (function () {
          var p = dom.el('p', { class: 'sl-help', text: 'الشرائح المعطّلة تبقى هنا ولا تظهر في الواجهة الرئيسية.' });
          if (!hasPermission('slider.create') && !hasPermission('slider.update') && !hasPermission('slider.delete')) {
            p.textContent = 'لديك صلاحية العرض فقط.';
          }
          return p;
        })(),
        dom.el('div', { id: 'sl-list' }, [feedback.skeletonCards(2)]),
      ]),
    ]);

    return load().then(function () {
      renderList(container);
    }).catch(function (error) {
      var holder = dom.qs('#sl-list', container);
      dom.clear(holder);
      holder.appendChild(feedback.errorState(error, function () { refresh(container); }));
    });
  }

  ALW.pages.slider = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);