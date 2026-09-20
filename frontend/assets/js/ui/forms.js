/**
 * alwled — مكوّنات النماذج الموحّدة + ربط أخطاء الخادم بالحقول.
 * كل الحقول تُبنى من هنا حتى تبقى الأشكال متسقة في كل الصفحات.
 */
(function (global) {
  'use strict';

  function dom() {
    return global.ALW.dom;
  }

  /** every control gets a stable id so its <label for> always points at it */
  function withId(config) {
    var opts = Object.assign({}, config);
    if (!opts.id) opts.id = 'f-' + (opts.name || Math.random().toString(36).slice(2, 8));
    return opts;
  }

  function fieldWrapper(config) {
    var wrap = document.createElement('div');
    wrap.className = config.full ? 'field w-full' : 'field';
    if (config.name) wrap.dataset.fieldFor = config.name;

    if (config.label) {
      var label = document.createElement('label');
      label.className = 'field__label';
      label.setAttribute('for', config.id);
      label.textContent = config.label;
      if (config.required) {
        var req = document.createElement('span');
        req.className = 'field__req';
        req.textContent = '*';
        label.appendChild(req);
      }
      wrap.appendChild(label);
    }
    return wrap;
  }

  function attachError(wrap, name, message) {
    var existing = wrap.querySelector('.field__error');
    if (existing) existing.remove();
    if (!message) return;
    var error = document.createElement('div');
    error.className = 'field__error';
    error.dataset.errorFor = name;
    error.appendChild(dom().icon('alert-circle', 'icon icon--sm'));
    var text = document.createElement('span');
    text.textContent = message;
    error.appendChild(text);
    wrap.appendChild(error);
  }

  function text(config) {
    var opts = withId(config);
    var wrap = fieldWrapper(opts);
    var input = document.createElement('input');
    input.type = opts.type || 'text';
    input.className = 'input';
    input.id = opts.id || 'f-' + opts.name;
    input.name = opts.name || '';
    if (opts.value !== undefined && opts.value !== null) input.value = opts.value;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.required) input.required = true;
    if (opts.maxLength) input.maxLength = opts.maxLength;
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    if (opts.autocomplete) input.autocomplete = opts.autocomplete;
    if (opts.inputmode) input.inputMode = opts.inputmode;
    if (opts.ariaLabel) input.setAttribute('aria-label', opts.ariaLabel);
    if (opts.disabled) input.disabled = true;
    wrap.appendChild(input);
    if (opts.hint) wrap.appendChild(hintNode(opts.hint));
    return { wrap: wrap, input: input, name: opts.name, getValue: function () { return input.value; }, setValue: function (v) { input.value = v === null || v === undefined ? '' : v; }, focus: function () { input.focus(); } };
  }

  function password(config) {
    var opts = withId(config);
    var wrap = fieldWrapper(opts);
    var group = document.createElement('div');
    group.className = 'input-group';
    var input = document.createElement('input');
    input.type = 'password';
    input.className = 'input';
    input.id = opts.id || 'f-' + opts.name;
    input.name = opts.name || '';
    input.autocomplete = opts.autocomplete || 'current-password';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.required) input.required = true;
    group.appendChild(input);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'input-group__action';
    toggle.setAttribute('aria-label', 'إظهار كلمة المرور');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.appendChild(dom().icon('eye', 'icon'));
    toggle.addEventListener('click', function () {
      var visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggle.setAttribute('aria-pressed', visible ? 'false' : 'true');
      toggle.setAttribute('aria-label', visible ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور');
      dom().mount(toggle, dom().icon(visible ? 'eye' : 'eye-off', 'icon'));
      input.focus();
    });
    group.appendChild(toggle);
    wrap.appendChild(group);
    if (opts.hint) wrap.appendChild(hintNode(opts.hint));
    return { wrap: wrap, input: input, name: opts.name, getValue: function () { return input.value; }, setValue: function (v) { input.value = v || ''; }, focus: function () { input.focus(); } };
  }

  function number(config) {
    return text(Object.assign({}, config, { type: 'number' }));
  }

  function textarea(config) {
    var opts = withId(config);
    var wrap = fieldWrapper(opts);
    var input = document.createElement('textarea');
    input.className = 'textarea';
    input.id = opts.id || 'f-' + opts.name;
    input.name = opts.name || '';
    if (opts.value) input.value = opts.value;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.rows) input.rows = opts.rows;
    if (opts.maxLength) input.maxLength = opts.maxLength;
    if (opts.required) input.required = true;
    wrap.appendChild(input);
    if (opts.hint) wrap.appendChild(hintNode(opts.hint));
    return { wrap: wrap, input: input, name: opts.name, getValue: function () { return input.value; }, setValue: function (v) { input.value = v || ''; }, focus: function () { input.focus(); } };
  }

  /* ============================================================================
     حقل صورة (رفع + معاينة + رابط) — لكل لوحات الإدارة
     - زر «اختيار صورة» يرفع فورًا إلى POST /uploads/image (multipart)
     - الخادم يضبط المقاس تلقائيًا (حد أقصى 2048px بالضلع الأطول) ويحوّل WebP
     - معاينة مصغّرة فورية + حقل الرابط يُملأ تلقائيًا (يبقى قابلًا للتحرير يدويًا)
     - يعمل أيضًا بلصق رابط خارجي مباشرة
     ========================================================================== */
  function imageField(config) {
    var opts = withId(config);
    var wrap = fieldWrapper(opts);
    var state = { url: opts.value || '' };

    var row = document.createElement('div');
    row.className = 'imagefield';
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;';

    var preview = document.createElement('div');
    preview.className = 'imagefield__preview';
    preview.style.cssText = 'inline-size:88px;block-size:88px;border-radius:10px;background:var(--color-surface-muted,#f2f2ef);' +
      'border:1px solid var(--color-line,#e5e5e2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto;';
    function renderPreview(url) {
      preview.innerHTML = '';
      if (url) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.style.cssText = 'max-inline-size:100%;max-block-size:100%;object-fit:contain;';
        img.onerror = function () { preview.textContent = '⚠️'; };
        preview.appendChild(img);
      } else {
        preview.textContent = '🖼️';
        preview.style.opacity = '0.5';
      }
    }
    renderPreview(state.url);
    row.appendChild(preview);

    var col = document.createElement('div');
    col.style.cssText = 'flex:1 1 200px;display:flex;flex-direction:column;gap:8px;min-width:0;';

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.style.display = 'none';

    var pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'btn btn--secondary btn--sm';
    pickBtn.textContent = '📤 اختيار صورة ورفعها';
    pickBtn.addEventListener('click', function () { fileInput.click(); });

    var status = document.createElement('span');
    status.className = 'imagefield__status';
    status.style.cssText = 'font-size:0.75rem;color:var(--color-ink-muted,#626262);';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.id = opts.id || 'f-' + opts.name;
    input.name = opts.name || '';
    input.placeholder = 'https://… (يُملأ تلقائيًا بعد الرفع)';
    if (state.url) input.value = state.url;
    input.addEventListener('input', function () {
      state.url = input.value.trim();
      renderPreview(state.url);
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) === -1) {
        status.textContent = 'الصيغ المدعومة: JPEG · PNG · WebP';
        status.style.color = 'var(--color-danger,#dc2626)';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        status.textContent = 'حجم الملف يتجاوز 8MB';
        status.style.color = 'var(--color-danger,#dc2626)';
        return;
      }
      status.textContent = 'جارٍ الرفع…';
      status.style.color = 'var(--color-ink-muted,#626262)';
      pickBtn.disabled = true;

      var fd = new FormData();
      fd.append('file', file);
      // نفس مسار المصادقة المركزي (ALW.api.post) — FormData يمر بلا Content-Type يدوي
      var api = (global.ALW && global.ALW.api) || null;
      if (!api || !api.post) {
        status.textContent = 'واجهة الرفع غير جاهزة';
        status.style.color = 'var(--color-danger,#dc2626)';
        pickBtn.disabled = false;
        return;
      }
      api
        .post('/uploads/image', fd)
        .then(function (data) {
          pickBtn.disabled = false;
          var payload = data && data.url ? data : (data && data.data ? data.data : null);
          if (!payload || !payload.url) {
            status.textContent = 'فشل الرفع';
            status.style.color = 'var(--color-danger,#dc2626)';
            return;
          }
          state.url = payload.url;
          input.value = payload.url;
          renderPreview(payload.url);
          status.textContent = '✓ ' + payload.width + '×' + payload.height + ' · ' + Math.round(payload.bytes / 1024) + 'KB (WebP)';
          status.style.color = 'var(--color-success,#16a34a)';
        })
        .catch(function (error) {
          pickBtn.disabled = false;
          var msg = (error && error.message) || 'فشل الرفع';
          status.textContent = msg;
          status.style.color = 'var(--color-danger,#dc2626)';
        });
    });

    col.appendChild(pickBtn);
    col.appendChild(input);
    col.appendChild(status);
    col.appendChild(fileInput);
    row.appendChild(col);
    wrap.appendChild(row);
    if (opts.hint) wrap.appendChild(hintNode(opts.hint));

    return { wrap: wrap, input: input, name: opts.name, getValue: function () { return input.value; }, setValue: function (v) { input.value = v || ''; state.url = v || ''; renderPreview(state.url); }, focus: function () { input.focus(); } };
  }

  function select(config) {
    var opts = withId(config);
    var wrap = fieldWrapper(opts);
    var input = document.createElement('select');
    input.className = 'select';
    input.id = opts.id || 'f-' + opts.name;
    input.name = opts.name || '';
    if (opts.required) input.required = true;
    (opts.options || []).forEach(function (option) {
      var node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      if (opts.value !== undefined && String(opts.value) === String(option.value)) node.selected = true;
      input.appendChild(node);
    });
    if (opts.disabled) input.disabled = true;
    wrap.appendChild(input);
    if (opts.hint) wrap.appendChild(hintNode(opts.hint));
    return { wrap: wrap, input: input, name: opts.name, getValue: function () { return input.value; }, setValue: function (v) { input.value = v === null || v === undefined ? '' : v; }, focus: function () { input.focus(); } };
  }

  function checkbox(config) {
    var opts = config || {};
    var label = document.createElement('label');
    label.className = 'checkbox';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = opts.value === true;
    if (opts.name) input.name = opts.name;
    if (opts.disabled) input.disabled = true;
    label.appendChild(input);
    var textWrap = document.createElement('span');
    textWrap.textContent = opts.label || '';
    label.appendChild(textWrap);
    var wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.appendChild(label);
    if (opts.hint) wrap.appendChild(hintNode(opts.hint));
    return { wrap: wrap, input: input, name: opts.name, getValue: function () { return input.checked; }, setValue: function (v) { input.checked = v === true; }, focus: function () { input.focus(); } };
  }

  function switchField(config) {
    var opts = config || {};
    var label = document.createElement('label');
    label.className = 'switch';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = opts.value === true;
    if (opts.name) input.name = opts.name;
    if (opts.disabled) input.disabled = true;
    label.appendChild(input);
    var textWrap = document.createElement('span');
    textWrap.textContent = opts.label || '';
    label.appendChild(textWrap);
    var wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.appendChild(label);
    return { wrap: wrap, input: input, name: opts.name, getValue: function () { return input.checked; }, setValue: function (v) { input.checked = v === true; }, focus: function () { input.focus(); } };
  }

  function hintNode(text) {
    var hint = document.createElement('div');
    hint.className = 'field__hint';
    hint.textContent = text;
    return hint;
  }

  function form(config) {
    var opts = config || {};
    var node = document.createElement('form');
    node.className = opts.className || 'w-full';
    node.noValidate = true;
    var controls = [];

    function add(control) {
      controls.push(control);
      var target = opts.container || node;
      if (opts.grid) {
        var grid = target.querySelector('.form-grid');
        if (!grid) {
          grid = document.createElement('div');
          grid.className = 'form-grid';
          target.appendChild(grid);
        }
        grid.appendChild(control.wrap);
      } else {
        target.appendChild(control.wrap);
      }
      return control;
    }

    (opts.fields || []).forEach(function (definition) {
      var type = definition.type || 'text';
      var control;
      if (type === 'password') control = password(definition);
      else if (type === 'number') control = number(definition);
      else if (type === 'textarea') control = textarea(definition);
      else if (type === 'select') control = select(definition);
      else if (type === 'checkbox') control = checkbox(definition);
      else if (type === 'switch') control = switchField(definition);
      else if (type === 'image') control = imageField(definition);
      else control = text(definition);
      add(control);
    });

    function values() {
      var out = {};
      controls.forEach(function (control) {
        if (!control.name) return;
        var value = control.getValue();
        if (typeof value === 'string') value = value.trim();
        if (value === '' || value === null || value === undefined) return;
        out[control.name] = value;
      });
      return out;
    }

    function clearErrors() {
      node.querySelectorAll('.field__error').forEach(function (item) {
        item.remove();
      });
      controls.forEach(function (control) {
        var input = control.input;
        if (!input) return;
        input.classList.remove('input--invalid', 'select--invalid', 'textarea--invalid');
        input.removeAttribute('aria-invalid');
      });
    }

    /** Attaches server-side validation errors (400/422) to the matching fields. */
    function showErrors(error) {
      clearErrors();
      var fields = (error && error.fields) || [];
      var attached = 0;
      fields.forEach(function (item) {
        var name = item.field;
        var control = controls.filter(function (candidate) {
          return candidate.name === name;
        })[0];
        if (control) {
          control.wrap.classList && control.wrap.classList.add('field--invalid');
          attachError(control.wrap, name, item.message);
          if (control.input) {
            control.input.classList.add('input--invalid');
            control.input.setAttribute('aria-invalid', 'true');
          }
          attached += 1;
          if (attached === 1) control.focus();
        }
      });
      return attached;
    }

    function setBusy(busy) {
      controls.forEach(function (control) {
        if (control.input) control.input.disabled = busy;
      });
    }

    function reset() {
      clearErrors();
      controls.forEach(function (control) {
        if (!control.setValue) return;
        if (control.input && control.input.type === 'checkbox') control.setValue(false);
        else control.setValue('');
      });
    }

    return {
      node: node,
      controls: controls,
      add: add,
      values: values,
      showErrors: showErrors,
      clearErrors: clearErrors,
      setBusy: setBusy,
      reset: reset,
      control: function (name) {
        return controls.filter(function (item) {
          return item.name === name;
        })[0];
      },
    };
  }

  /** Client-side required check (fast feedback); the server remains the authority. */
  function validateRequired(pairs) {
    var missing = [];
    (pairs || []).forEach(function (pair) {
      var value = pair[1];
      if (value === null || value === undefined || String(value).trim() === '') {
        missing.push(pair[0]);
      }
    });
    return missing;
  }

  var api = { text: text, password: password, number: number, textarea: textarea, select: select, checkbox: checkbox, switch: switchField, form: form, attachError: attachError, validateRequired: validateRequired };

  global.ALW = global.ALW || {};
  global.ALW.forms = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
