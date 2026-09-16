/**
 * alwled — مركز الإشعارات: جرس في الهيدر + لوحة منسدلة + عدد غير المقروء.
 * فتح الإشعار لا يُنفّذ أي mutation تلقائيًا (التعليم كمقروء يحتاج ضغطة صريحة).
 */
(function (global) {
  'use strict';

  function dom() {
    return global.ALW.dom;
  }
  function fmt() {
    return global.ALW.format;
  }

  function createBell(options) {
    var opts = options || {};
    var root = document.createElement('div');
    root.className = 'dropdown bell';
    root.style.position = 'relative';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn';
    button.setAttribute('aria-label', 'الإشعارات');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.appendChild(dom().icon('bell', 'icon'));
    var count = document.createElement('span');
    count.className = 'bell__count';
    count.hidden = true;
    button.appendChild(count);
    root.appendChild(button);

    var panel = null;
    var items = [];
    var unread = 0;
    var loading = false;
    var error = null;

    function updateBadge() {
      count.hidden = !unread;
      count.textContent = unread > 99 ? '99+' : String(unread);
      button.setAttribute('aria-label', unread ? 'الإشعارات، ' + unread + ' غير مقروء' : 'الإشعارات');
    }

    function renderPanel() {
      var box = document.createElement('div');
      box.className = 'notif-panel';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'قائمة الإشعارات');

      var head = document.createElement('div');
      head.className = 'notif-panel__head';
      var title = document.createElement('strong');
      title.textContent = 'الإشعارات' + (unread ? ' (' + unread + ')' : '');
      head.appendChild(title);
      var actions = document.createElement('div');
      actions.className = 'btn-group';
      var markAll = document.createElement('button');
      markAll.type = 'button';
      markAll.className = 'btn btn--ghost btn--sm';
      markAll.textContent = 'تعليم الكل كمقروء';
      markAll.addEventListener('click', function () {
        if (!unread) return;
        markAll.disabled = true;
        global.ALW.api
          .post('/notifications/read-all')
          .then(function () {
            items = items.map(function (item) {
              return Object.assign({}, item, { read: true, readAt: new Date().toISOString() });
            });
            unread = 0;
            updateBadge();
            renderPanelInto();
            global.ALW.toast.success('تم تعليم كل الإشعارات كمقروءة');
            if (opts.onChanged) opts.onChanged();
          })
          .catch(function (err) {
            markAll.disabled = false;
            global.ALW.toast.fromError(err);
          });
      });
      actions.appendChild(markAll);
      var viewAll = document.createElement('a');
      viewAll.className = 'btn btn--ghost btn--sm';
      viewAll.href = '#/notifications';
      viewAll.textContent = 'عرض الكل';
      viewAll.addEventListener('click', function () {
        close();
      });
      actions.appendChild(viewAll);
      head.appendChild(actions);
      box.appendChild(head);

      var list = document.createElement('div');
      list.className = 'notif-panel__list';

      if (loading) {
        list.appendChild(global.ALW.feedback.skeletonRows(5, '46px'));
      } else if (error) {
        list.appendChild(
          global.ALW.feedback.state({
            compact: true,
            tone: 'error',
            icon: 'alert-triangle',
            title: 'تعذّر تحميل الإشعارات',
            text: error.message || '',
            action: global.ALW.ui.button({
              label: 'إعادة المحاولة',
              icon: 'refresh',
              onClick: function () {
                load(true);
              },
            }),
          }),
        );
      } else if (!items.length) {
        list.appendChild(global.ALW.feedback.state({ compact: true, icon: 'inbox', title: 'لا إشعارات', text: 'ستظهر إشعاراتك هنا.' }));
      } else {
        items.forEach(function (item) {
          list.appendChild(notificationRow(item, function () {
            close();
            if (!item.read) {
              global.ALW.api
                .post('/notifications/' + item.id + '/read')
                .then(function () {
                  item.read = true;
                  unread = Math.max(0, unread - 1);
                  updateBadge();
                  if (opts.onChanged) opts.onChanged();
                })
                .catch(function () {
                  /* القراءة غير حرجة */
                });
            }
          }));
        });
      }
      box.appendChild(list);
      return box;
    }

    function notificationRow(item, onClick) {
      var meta = fmt().NOTIFICATION_TYPE[item.type] || { icon: 'bell', tone: 'neutral' };
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'notif-item' + (item.read ? '' : ' notif-item--unread');
      var iconBox = document.createElement('span');
      iconBox.className = 'notif-item__icon';
      iconBox.appendChild(dom().icon(meta.icon || 'bell', 'icon icon--sm'));
      row.appendChild(iconBox);
      var content = document.createElement('span');
      content.style.flex = '1 1 auto';
      var title = document.createElement('span');
      title.className = 'notif-item__title';
      title.textContent = item.title || fmt().enumLabel(fmt().NOTIFICATION_TYPE, item.type);
      content.appendChild(title);
      var body = document.createElement('span');
      body.className = 'notif-item__body';
      body.textContent = item.body || '';
      content.appendChild(body);
      var time = document.createElement('span');
      time.className = 'notif-item__time';
      time.textContent = fmt().relative(item.createdAt);
      content.appendChild(time);
      row.appendChild(content);
      row.addEventListener('click', function () {
        onClick(item);
      });
      return row;
    }

    function renderPanelInto() {
      if (!panel) return;
      var next = renderPanel();
      panel.parentNode.replaceChild(next, panel);
      panel = next;
    }

    function load(silent) {
      loading = !silent;
      error = null;
      if (!silent) renderPanelInto();
      return global.ALW.api
        .get('/notifications', { query: { limit: 8, page: 1 } })
        .then(function (data) {
          items = (data && data.items) || [];
          unread = (data && data.meta && data.meta.unread) || 0;
          loading = false;
          updateBadge();
          renderPanelInto();
        })
        .catch(function (err) {
          loading = false;
          error = err;
          renderPanelInto();
        });
    }

    function open() {
      if (panel) return;
      panel = renderPanel();
      root.appendChild(panel);
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onDocumentClick, true);
      document.addEventListener('keydown', onKeydown, true);
      load(false);
    }

    function close() {
      if (!panel) return;
      panel.parentNode.removeChild(panel);
      panel = null;
      button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onDocumentClick, true);
      document.removeEventListener('keydown', onKeydown, true);
    }

    function onDocumentClick(event) {
      if (!root.contains(event.target)) close();
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        close();
        button.focus();
      }
    }

    button.addEventListener('click', function () {
      if (panel) close();
      else open();
    });

    return {
      node: root,
      refresh: function () {
        return load(true);
      },
      open: open,
      close: close,
      setUnread: function (value) {
        unread = value;
        updateBadge();
      },
    };
  }

  var api = { createBell: createBell };

  global.ALW = global.ALW || {};
  global.ALW.notificationsUi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
