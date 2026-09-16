/**
 * alwled — عناصر واجهة مشتركة (badges، خلايا جداول، رؤوس صفحات، بطاقات تفاصيل، شريط جانبي).
 * تُستخدم من كل الصفحات لضمان تجانس الشكل.
 */
(function (global) {
  'use strict';

  function dom() {
    return global.ALW.dom;
  }
  function fmt() {
    return global.ALW.format;
  }

  function badge(label, tone, options) {
    var opts = options || {};
    var node = document.createElement('span');
    node.className = 'badge badge--' + (tone || 'neutral') + (opts.small ? ' badge--sm' : '');
    if (opts.dot !== false) {
      var dot = document.createElement('span');
      dot.className = 'badge__dot';
      node.appendChild(dot);
    }
    var text = document.createElement('span');
    text.textContent = label;
    node.appendChild(text);
    return node;
  }

  function enumBadge(map, key) {
    return badge(fmt().enumLabel(map, key), fmt().enumTone(map, key));
  }

  function userCell(user, options) {
    var opts = options || {};
    var wrap = document.createElement('div');
    wrap.className = 'user-cell';
    var avatar = document.createElement('span');
    avatar.className = 'avatar' + (opts.small ? ' avatar--sm' : '');
    avatar.textContent = fmt().initials(user && user.firstName, user && user.lastName);
    wrap.appendChild(avatar);
    var textWrap = document.createElement('div');
    var name = document.createElement('div');
    name.className = 'user-cell__name';
    name.textContent = fmt().fullName(user);
    textWrap.appendChild(name);
    var meta = document.createElement('div');
    meta.className = 'user-cell__meta';
    meta.textContent = (user && (user.phone || user.email)) || (user && user.id ? fmt().shortId(user.id, 14) : '—');
    textWrap.appendChild(meta);
    wrap.appendChild(textWrap);
    return wrap;
  }

  function moneyCell(value, currency) {
    var node = document.createElement('span');
    node.className = 'money tnum';
    node.textContent = fmt().money(value, currency);
    return node;
  }

  function pageHeader(config) {
    var opts = config || {};
    var head = document.createElement('div');
    head.className = 'page-head';
    var titles = document.createElement('div');
    var title = document.createElement('h1');
    title.className = 'page-head__title';
    if (opts.icon) title.appendChild(dom().icon(opts.icon, 'icon icon--lg'));
    var titleText = document.createElement('span');
    titleText.textContent = opts.title || '';
    title.appendChild(titleText);
    titles.appendChild(title);
    if (opts.description) {
      var desc = document.createElement('p');
      desc.className = 'page-head__desc';
      desc.textContent = opts.description;
      titles.appendChild(desc);
    }
    head.appendChild(titles);
    if (opts.actions && opts.actions.length) {
      var actions = document.createElement('div');
      actions.className = 'page-head__actions';
      opts.actions.forEach(function (action) {
        if (action) actions.appendChild(action);
      });
      head.appendChild(actions);
    }
    return head;
  }

  function button(config) {
    var opts = config || {};
    var node = document.createElement('button');
    node.type = opts.type || 'button';
    node.className = 'btn ' + (opts.variant || 'btn--secondary') + (opts.size ? ' btn--' + opts.size : '');
    if (opts.icon) node.appendChild(dom().icon(opts.icon, 'icon'));
    if (opts.label) {
      var label = document.createElement('span');
      label.textContent = opts.label;
      node.appendChild(label);
    }
    if (opts.title) node.title = opts.title;
    if (opts.ariaLabel) node.setAttribute('aria-label', opts.ariaLabel);
    if (opts.permission && !global.ALW.can.can(opts.permission)) {
      if (opts.lockedMode === 'hide') return null;
      node.disabled = true;
      node.title = 'لا تملك صلاحية تنفيذ هذه العملية';
    }
    if (typeof opts.onClick === 'function') node.addEventListener('click', opts.onClick);
    return node;
  }

  function iconButton(name, options) {
    var opts = options || {};
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'btn btn--ghost btn--sm btn--icon';
    node.title = opts.title || '';
    node.setAttribute('aria-label', opts.title || name);
    node.appendChild(dom().icon(name, 'icon icon--sm'));
    if (opts.permission && !global.ALW.can.can(opts.permission)) return null;
    if (typeof opts.onClick === 'function') node.addEventListener('click', opts.onClick);
    return node;
  }

  function card(config) {
    var opts = config || {};
    var node = document.createElement('section');
    node.className = 'card' + (opts.className ? ' ' + opts.className : '');
    if (opts.title || opts.actions) {
      var head = document.createElement('div');
      head.className = 'card__head';
      var titleWrap = document.createElement('div');
      var title = document.createElement('h2');
      title.className = 'card__title';
      if (opts.icon) title.appendChild(dom().icon(opts.icon, 'icon'));
      var text = document.createElement('span');
      text.textContent = opts.title || '';
      title.appendChild(text);
      titleWrap.appendChild(title);
      if (opts.subtitle) {
        var subtitle = document.createElement('span');
        subtitle.className = 'card__subtitle';
        subtitle.textContent = opts.subtitle;
        titleWrap.appendChild(subtitle);
      }
      head.appendChild(titleWrap);
      if (opts.actions && opts.actions.length) {
        var actions = document.createElement('div');
        actions.className = 'btn-group';
        opts.actions.forEach(function (action) {
          if (action) actions.appendChild(action);
        });
        head.appendChild(actions);
      }
      node.appendChild(head);
    }
    if (opts.body) {
      var body = document.createElement('div');
      body.className = 'card__body';
      if (opts.body instanceof Node) body.appendChild(opts.body);
      else body.textContent = String(opts.body);
      node.appendChild(body);
    }
    if (opts.foot) {
      var foot = document.createElement('div');
      foot.className = 'card__foot';
      foot.appendChild(opts.foot);
      node.appendChild(foot);
    }
    return node;
  }

  function kpi(config) {
    var opts = config || {};
    var node = document.createElement('div');
    node.className = 'kpi' + (opts.tone ? ' kpi--' + opts.tone : '');
    var top = document.createElement('div');
    top.className = 'kpi__top';
    var labels = document.createElement('div');
    var label = document.createElement('div');
    label.className = 'kpi__label';
    label.textContent = opts.label || '';
    labels.appendChild(label);
    var value = document.createElement('div');
    value.className = 'kpi__value tnum';
    value.textContent = opts.value === null || opts.value === undefined ? '—' : String(opts.value);
    if (opts.unit) {
      var unit = document.createElement('span');
      unit.className = 'kpi__unit';
      unit.textContent = opts.unit;
      value.appendChild(unit);
    }
    labels.appendChild(value);
    top.appendChild(labels);
    if (opts.icon) {
      var iconBox = document.createElement('span');
      iconBox.className = 'kpi__icon';
      iconBox.appendChild(dom().icon(opts.icon, 'icon'));
      top.appendChild(iconBox);
    }
    node.appendChild(top);
    if (opts.hint) {
      var hint = document.createElement('div');
      hint.className = 'kpi__hint';
      if (opts.hint instanceof Node) hint.appendChild(opts.hint);
      else hint.textContent = opts.hint;
      node.appendChild(hint);
    }
    if (typeof opts.onClick === 'function') {
      node.style.cursor = 'pointer';
      node.addEventListener('click', opts.onClick);
    }
    return node;
  }

  function statRow(label, value, options) {
    var opts = options || {};
    var row = document.createElement('div');
    row.className = 'stat-row';
    var labelWrap = document.createElement('span');
    labelWrap.className = 'stat-row__label';
    if (opts.icon) labelWrap.appendChild(dom().icon(opts.icon, 'icon icon--sm'));
    var labelText = document.createElement('span');
    labelText.textContent = label;
    labelWrap.appendChild(labelText);
    row.appendChild(labelWrap);
    var valueWrap = document.createElement('span');
    valueWrap.className = 'stat-row__value' + (opts.mono ? ' mono' : '');
    if (value instanceof Node) valueWrap.appendChild(value);
    else valueWrap.textContent = value === null || value === undefined ? '—' : String(value);
    row.appendChild(valueWrap);
    return row;
  }

  function detailItem(label, value) {
    var item = document.createElement('div');
    item.className = 'detail-item';
    var labelNode = document.createElement('div');
    labelNode.className = 'detail-item__label';
    labelNode.textContent = label;
    item.appendChild(labelNode);
    var valueNode = document.createElement('div');
    valueNode.className = 'detail-item__value';
    if (value instanceof Node) valueNode.appendChild(value);
    else valueNode.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    item.appendChild(valueNode);
    return item;
  }

  function detailGrid(items) {
    var grid = document.createElement('div');
    grid.className = 'detail-grid';
    items.forEach(function (entry) {
      if (!entry) return;
      grid.appendChild(detailItem(entry[0], entry[1]));
    });
    return grid;
  }

  function copyable(text, options) {
    var opts = options || {};
    var wrap = document.createElement('span');
    wrap.className = 'copyable';
    var value = document.createElement('span');
    value.className = opts.mono === false ? '' : 'mono';
    value.textContent = text || '—';
    wrap.appendChild(value);
    if (text) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'copyable__btn';
      button.title = 'نسخ';
      button.setAttribute('aria-label', 'نسخ القيمة');
      button.appendChild(dom().icon('copy', 'icon icon--sm'));
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        dom()
          .copyText(text)
          .then(function () {
            global.ALW.toast.success('تم نسخ القيمة');
          })
          .catch(function () {
            global.ALW.toast.warning('تعذّر النسخ من المتصفح');
          });
      });
      wrap.appendChild(button);
    }
    return wrap;
  }

  function barList(rows, options) {
    var opts = options || {};
    var wrap = document.createElement('div');
    wrap.className = 'bar-list';
    var max = rows.reduce(function (acc, row) {
      return Math.max(acc, Number(rows.length ? row.value || 0 : 0));
    }, 0);
    rows.forEach(function (row) {
      var item = document.createElement('div');
      item.className = 'bar-item';
      var top = document.createElement('div');
      top.className = 'bar-item__top';
      var label = document.createElement('span');
      label.className = 'bar-item__label';
      label.textContent = row.label;
      top.appendChild(label);
      var value = document.createElement('span');
      value.className = 'bar-item__value';
      value.textContent = row.display !== undefined ? row.display : fmt().number(row.value);
      top.appendChild(value);
      item.appendChild(top);
      var progress = document.createElement('div');
      progress.className = 'progress';
      var bar = document.createElement('div');
      bar.className = 'progress__bar' + (row.tone ? ' progress__bar--' + row.tone : '');
      bar.style.width = (max > 0 ? Math.max(2, Math.round((Number(row.value || 0) / max) * 100)) : 0) + '%';
      progress.appendChild(bar);
      item.appendChild(progress);
      wrap.appendChild(item);
    });
    if (opts.emptyText && !rows.length) {
      var empty = document.createElement('div');
      empty.className = 'muted text-sm';
      empty.textContent = opts.emptyText;
      wrap.appendChild(empty);
    }
    return wrap;
  }

  function timeline(events) {
    var wrap = document.createElement('div');
    wrap.className = 'timeline';
    events.forEach(function (event) {
      var item = document.createElement('div');
      item.className = 'timeline__item';
      var title = document.createElement('div');
      title.className = 'timeline__title';
      title.textContent = event.title;
      item.appendChild(title);
      var meta = document.createElement('div');
      meta.className = 'timeline__meta';
      meta.textContent = event.meta || '';
      item.appendChild(meta);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function thumb(url, alt) {
    if (url && dom().safeUrl(url)) {
      var img = document.createElement('img');
      img.className = 'thumb';
      img.src = dom().safeUrl(url);
      img.alt = alt || '';
      img.loading = 'lazy';
      return img;
    }
    var placeholder = document.createElement('span');
    placeholder.className = 'thumb-placeholder';
    placeholder.title = 'لا صورة';
    placeholder.appendChild(dom().icon('image', 'icon icon--sm'));
    return placeholder;
  }

  function alertBox(message, tone, options) {
    var opts = options || {};
    var node = document.createElement('div');
    node.className = 'alert alert--' + (tone || 'info');
    var icon = document.createElement('span');
    icon.className = 'alert__icon';
    var icons = { info: 'info', success: 'check-circle', warning: 'alert-triangle', danger: 'alert-circle' };
    icon.appendChild(dom().icon(opts.icon || icons[tone] || 'info', 'icon'));
    node.appendChild(icon);
    var content = document.createElement('div');
    var text = document.createElement('div');
    text.textContent = message || '';
    content.appendChild(text);
    if (opts.hint) {
      var hint = document.createElement('div');
      hint.className = 'text-xs mt-3';
      hint.style.opacity = '0.85';
      hint.textContent = opts.hint;
      content.appendChild(hint);
    }
    node.appendChild(content);
    return node;
  }

  var api = {
    badge: badge,
    enumBadge: enumBadge,
    userCell: userCell,
    moneyCell: moneyCell,
    pageHeader: pageHeader,
    button: button,
    iconButton: iconButton,
    card: card,
    kpi: kpi,
    statRow: statRow,
    detailItem: detailItem,
    detailGrid: detailGrid,
    copyable: copyable,
    barList: barList,
    timeline: timeline,
    thumb: thumb,
    alertBox: alertBox,
  };

  global.ALW = global.ALW || {};
  global.ALW.ui = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
