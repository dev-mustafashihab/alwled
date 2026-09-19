/**
 * alwled shop — إشعاراتي `#/notifications` (Stage 14.3): list · detail · read · read-all · preferences.
 * لا يُبنى أي HTML من محتوى الإشعار (textContent فقط)، والتوجيه من أنواع معروفة فقط.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var flow = ALW.shopOrderFlow;
  var el = helpers.el;

  var PAGE_SIZE = 10;

  function notificationsPage(view, ctx) {
    shop.clear(view);
    var crumbList = [{ label: 'الرئيسية', href: '#/' }, { label: 'إشعاراتي' }];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, {
        title: 'تسجيل الدخول مطلوب',
        text: 'سجّل دخولك لعرض إشعاراتك.',
        next: '/notifications',
      });
      return Promise.resolve(false);
    }

    var page = parseInt((ctx && ctx.query && ctx.query.page) || '1', 10) || 1;
    var onlyUnread = !!(ctx && ctx.query && ctx.query.unread === '1');

    view.appendChild(shop.loadingBlock('جارٍ تحميل إشعاراتك…'));

    var query = { page: page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' };
    if (onlyUnread) query.read = false;

    return Promise.all([
      shop.api.notifications(query),
      shop.api.notificationPreferences().catch(function () { return { items: [] }; }),
    ]).then(function (results) {
      var payload = results[0] || {};
      var items = payload.items || [];
      var meta = payload.meta || {};
      var preferences = (results[1] && results[1].items) || [];

      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      view.appendChild(el('div', { class: 'shop-section__head' }, [
        el('div', {}, [
          el('h1', { class: 'shop-section__title', text: 'إشعاراتي' }),
          el('p', { class: 'shop-section__sub', text: meta.total ? meta.total + ' إشعار' : 'لا توجد إشعارات' }),
        ]),
        el('div', { class: 'shop-order-row__head' }, [
          el('a', {
            class: 'btn btn--ghost btn--sm', attrs: { id: 'shop-notif-filter' },
            href: onlyUnread ? '#/notifications' : '#/notifications?unread=1',
            text: onlyUnread ? 'عرض الكل' : 'غير المقروء فقط',
          }),
          el('button', {
            class: 'btn btn--secondary btn--sm', type: 'button', text: 'تعليم الكل كمقروء',
            attrs: { id: 'shop-notif-readall' },
            onclick: function (event) { readAll(event.currentTarget, view, ctx); },
          }),
        ]),
      ]));

      if (!items.length) {
        view.appendChild(shop.stateBlock('empty', onlyUnread ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات بعد', 'ستظهر هنا إشعارات طلباتك ودفعاتك وحالة التوثيق.', [
          el('a', { class: 'btn btn--primary', href: '#/orders', text: 'عرض طلباتي' }),
        ]));
      } else {
        view.appendChild(el('div', { class: 'shop-notifs' }, items.map(function (notification) {
          return notificationCard(notification, view, ctx);
        })));
      }

      if (meta.totalPages > 1) {
        view.appendChild(el('div', { class: 'pagination' }, [
          el('button', {
            class: 'pagination__btn', type: 'button', text: 'السابق', disabled: page <= 1 ? 'disabled' : null,
            onclick: function () { goto(page - 1, onlyUnread); },
          }),
          el('span', { class: 'pagination__info', text: 'صفحة ' + page + ' من ' + meta.totalPages }),
          el('button', {
            class: 'pagination__btn', type: 'button', text: 'التالي', disabled: page >= meta.totalPages ? 'disabled' : null,
            onclick: function () { goto(page + 1, onlyUnread); },
          }),
        ]));
      }

      if (preferences.length) {
        view.appendChild(preferencesPanel(preferences, view, ctx));
      }
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/notifications' });
        return false;
      }
      view.appendChild(shop.stateBlock('error', 'تعذّر تحميل الإشعارات', info.message, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'إعادة المحاولة', onclick: function () { notificationsPage(view, ctx); } }),
      ]));
      return false;
    });
  }

  function goto(page, onlyUnread) {
    var query = { page: page };
    if (onlyUnread) query.unread = '1';
    global.location.hash = shop.buildHash({ path: '/notifications', query: query });
  }

  function notificationCard(notification, view, ctx) {
    var target = flow.notificationTarget(notification);
    var card = el('article', {
      class: 'shop-notif' + (notification.read ? '' : ' shop-notif--unread'),
      dataset: { notificationId: String(notification.id), type: String(notification.type || '') },
    }, [
      el('div', { class: 'shop-notif__head' }, [
        el('strong', { class: 'shop-notif__title', text: String(notification.title || '') }),
        notification.read ? shop.badge('مقروء', 'neutral') : shop.badge('جديد', 'brand'),
      ]),
      el('p', { class: 'shop-notif__body', text: String(notification.body || '') }),
      el('div', { class: 'shop-notif__meta' }, [
        el('span', { text: ALW.format.dateTime(notification.createdAt) }),
        el('span', { text: categoryLabel(flow.notificationCategory(notification.type)) }),
      ]),
      el('div', { class: 'shop-notif__actions' }, [
        target ? el('a', { class: 'btn btn--secondary btn--sm', href: target.hash, text: target.label }) : null,
        notification.read
          ? null
          : el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', text: 'تعليم كمقروء',
            attrs: { 'aria-label': 'تعليم الإشعار كمقروء' },
            onclick: function (event) { markRead(event.currentTarget, notification, card, view, ctx); },
          }),
      ].filter(Boolean)),
    ]);
    return card;
  }

  function categoryLabel(category) {
    if (category === 'payment') return 'دفع';
    if (category === 'order') return 'طلب';
    if (category === 'verification') return 'توثيق';
    return 'عام';
  }

  function markRead(button, notification, card, view, ctx) {
    button.disabled = true;
    shop.api.notificationRead(notification.id).then(function () {
      card.classList.remove('shop-notif--unread');
      var badgeNode = card.querySelector('.badge');
      var head = card.querySelector('.shop-notif__head');
      if (head && badgeNode && head.contains(badgeNode)) {
        head.replaceChild(el('span', { class: 'badge badge--neutral badge--sm', text: 'مقروء' }), badgeNode);
      }
      button.remove();
      ALW.app.refreshNotifications();
    }).catch(function (error) {
      button.disabled = false;
      shop.toast(shop.cartErrorInfo(error).message, 'danger');
    });
  }

  function readAll(button, view, ctx) {
    button.disabled = true;
    shop.api.notificationsReadAll().then(function () {
      shop.toast('تم تعليم كل الإشعارات كمقروءة', 'success');
      ALW.app.refreshNotifications();
      notificationsPage(view, ctx);
    }).catch(function (error) {
      button.disabled = false;
      shop.toast(shop.cartErrorInfo(error).message, 'danger');
    });
  }

  function preferencesPanel(preferences, view, ctx) {
    return el('section', { class: 'shop-panel', attrs: { id: 'shop-notif-prefs' } }, [
      el('h2', { class: 'shop-panel__title', text: 'تفضيلات الإشعارات' }),
      el('p', { class: 'shop-note', text: 'الإشعارات الإلزامية لا يمكن تعطيلها؛ وما عداها يمكن ضبطه.' }),
      el('div', { class: 'shop-specs' }, preferences.map(function (item) {
        var type = String(item.type || '');
        var toggle = el('button', {
          class: 'btn btn--sm ' + (item.inAppEnabled ? 'btn--secondary' : 'btn--ghost'),
          type: 'button',
          text: item.mandatory ? 'إلزامي' : (item.inAppEnabled ? 'مُفعّل' : 'معطّل'),
          attrs: {
            'aria-pressed': item.inAppEnabled ? 'true' : 'false',
            disabled: item.mandatory ? 'disabled' : null,
            'data-pref-type': type,
          },
          onclick: function (event) { togglePreference(event.currentTarget, item, view, ctx); },
        });
        return el('div', { class: 'shop-fact' }, [
          el('span', { class: 'shop-fact__label', text: typeLabel(type) }),
          toggle,
        ]);
      })),
    ]);
  }

  function typeLabel(type) {
    var labels = {
      ORDER_CREATED: 'إنشاء طلب', ORDER_CONFIRMED: 'تأكيد طلب', ORDER_CANCELLED: 'إلغاء طلب',
      PAYMENT_CREATED: 'إنشاء دفعة', PAYMENT_SUBMITTED_FOR_REVIEW: 'إرسال إثبات دفع',
      PAYMENT_CONFIRMED: 'تأكيد دفعة', PAYMENT_REJECTED: 'رفض دفعة',
      VERIFICATION_STARTED: 'بدء توثيق', VERIFICATION_REVIEWED: 'مراجعة توثيق',
      VERIFICATION_VERIFIED: 'توثيق مقبول', VERIFICATION_REJECTED: 'رفض توثيق',
      LOW_STOCK: 'مخزون منخفض', OUT_OF_STOCK: 'نفاد مخزون', PAYMENT_REVIEW_REQUIRED: 'مراجعة دفعة مطلوبة',
    };
    return labels[type] || type;
  }

  function togglePreference(button, item, view, ctx) {
    var next = item.inAppEnabled !== true;
    button.disabled = true;
    shop.api.notificationPreferenceUpdate(String(item.type), next).then(function () {
      shop.toast(next ? 'تم تفعيل الإشعار' : 'تم تعطيل الإشعار', 'success');
      notificationsPage(view, ctx);
    }).catch(function (error) {
      button.disabled = false;
      var info = shop.cartErrorInfo(error);
      shop.toast(info.kind === 'invalid' ? 'هذا النوع من الإشعارات إلزامي ولا يمكن تعديله.' : info.message, 'warning');
    });
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.notifications = notificationsPage;
  ALW.shopNotificationsPage = notificationsPage;
})(typeof window !== 'undefined' ? window : globalThis);
