/**
 * alwled — صفحات الأخطاء: 401 (انتهت الجلسة) · 403 · 404 · 500 · خطأ شبكة.
 */
(function (global) {
  'use strict';

  var ui = global.ALW.ui;

  function page(config) {
    var shell = document.createElement('div');
    shell.className = 'app-content';
    shell.style.maxWidth = '620px';
    shell.style.margin = '0 auto';
    var card = document.createElement('div');
    card.className = 'card';
    var body = document.createElement('div');
    body.className = 'card__body';
    body.appendChild(
      global.ALW.feedback.state({
        tone: config.tone || 'info',
        icon: config.icon,
        title: config.title,
        text: config.text,
        action: config.action,
      }),
    );
    card.appendChild(body);
    shell.appendChild(card);
    return shell;
  }

  function notFound() {
    return page({
      icon: 'search',
      title: 'الصفحة غير موجودة',
      text: 'الرابط الذي طلبته غير متاح في اللوحة.',
      action: ui.button({
        label: 'العودة إلى لوحة التحكم',
        icon: 'dashboard',
        variant: 'btn--primary',
        onClick: function () {
          global.ALW.nav.go('/dashboard');
        },
      }),
    });
  }

  function forbidden(route) {
    return page({
      tone: 'error',
      icon: 'lock',
      title: 'لا تملك صلاحية الوصول',
      text: 'هذه الصفحة تتطلب صلاحية لا يملكها حسابك. إن كنت تعتقد أن ذلك خطأ، راجع المالك لتعديل دورك.' +
        (route && route.permission ? '\nالصلاحية المطلوبة: ' + route.permission : ''),
      action: ui.button({
        label: 'العودة إلى لوحة التحكم',
        icon: 'dashboard',
        onClick: function () {
          global.ALW.nav.go('/dashboard');
        },
      }),
    });
  }

  function sessionExpired() {
    return page({
      tone: 'error',
      icon: 'clock',
      title: 'انتهت الجلسة',
      text: 'انتهت صلاحية جلستك أو تم إبطالها. سجّل الدخول من جديد للمتابعة.',
      action: ui.button({
        label: 'تسجيل الدخول',
        icon: 'log-in',
        variant: 'btn--primary',
        onClick: function () {
          global.ALW.session.clear();
          global.ALW.auth.clear();
          global.ALW.nav.go('/login');
        },
      }),
    });
  }

  function serverError() {
    return page({
      tone: 'error',
      icon: 'alert-triangle',
      title: 'خطأ في الخادم',
      text: 'حدث خطأ غير متوقع أثناء معالجة الطلب. أعد المحاولة، وإن تكرر الخطأ أبلغ التقنية.',
      action: ui.button({
        label: 'إعادة المحاولة',
        icon: 'refresh',
        onClick: function () {
          global.ALW.router && global.ALW.router.dispatch();
        },
      }),
    });
  }

  function networkError() {
    return page({
      tone: 'error',
      icon: 'alert-circle',
      title: 'تعذّر الاتصال بالخادم',
      text: 'تحقّق من تشغيل الواجهة الخلفية ومن إعداد عنوان الـAPI (' + global.ALW.config.apiBaseUrl + ').',
      action: ui.button({
        label: 'إعدادات الاتصال',
        icon: 'settings',
        onClick: function () {
          global.ALW.openApiSettings();
        },
      }),
    });
  }

  global.ALW = global.ALW || {};
  global.ALW.pages = global.ALW.pages || {};
  global.ALW.pages.errors = {
    notFound: notFound,
    forbidden: forbidden,
    sessionExpired: sessionExpired,
    serverError: serverError,
    networkError: networkError,
  };
})(typeof window !== 'undefined' ? window : globalThis);
