/**
 * alwled — حسابي: الملف الشخصي · تغيير كلمة المرور · الجلسات · التفضيلات · المظهر وإعدادات الـAPI.
 */
(function (global) {
  'use strict';

  var F = global.ALW.format;
  var ui = global.ALW.ui;
  var dom = global.ALW.dom;

  function render(container) {
    dom.mount(container, []);
    var auth = global.ALW.auth;
    var user = auth.user() || {};

    container.appendChild(
      ui.pageHeader({
        title: 'حسابي',
        icon: 'user',
        description: 'بياناتك، جلساتك، وتفضيلاتك في اللوحة.',
        actions: [
          ui.button({
            label: 'تسجيل الخروج',
            icon: 'log-out',
            onClick: function () {
              global.ALW.confirmLogout();
            },
          }),
        ],
      }),
    );

    var grid = document.createElement('div');
    grid.className = 'grid-2';
    container.appendChild(grid);

    /* -------------------------------- profile ------------------------------- */
    var profileBody = document.createElement('div');
    profileBody.appendChild(ui.detailGrid([
      ['الاسم', F.fullName(user)],
      ['الهاتف', user.phone || '—'],
      ['البريد', user.email || '—'],
      ['الحالة', ui.enumBadge(F.USER_STATUS, user.status)],
      ['التوثيق', user.isVerified ? ui.badge('موثَّق', 'success') : ui.badge('غير موثَّق', 'neutral')],
      ['الأدوار', (user.roles || []).join('، ') || '—'],
      ['آخر دخول', user.lastLoginAt ? F.dateTime(user.lastLoginAt) : '—'],
      ['المُعرِّف', ui.copyable(user.id, { mono: true })],
    ]));
    var permissionsCount = (auth.permissions().keys || []).length;
    profileBody.appendChild(
      ui.alertBox('صلاحياتك الحالية: ' + F.number(permissionsCount) + ' صلاحية.', 'info', {
        hint: auth.permissions().wildcard ? 'تملك النجمة (*) — كل الصلاحيات.' : (auth.permissions().keys || []).slice(0, 8).join(' · '),
      }),
    );
    grid.appendChild(ui.card({ title: 'الملف الشخصي', icon: 'user', body: profileBody }));

    /* ---------------------------- change password --------------------------- */
    var passwordForm = global.ALW.forms.form({
      fields: [
        { name: 'currentPassword', label: 'كلمة المرور الحالية', type: 'password', required: true, autocomplete: 'current-password' },
        { name: 'newPassword', label: 'كلمة المرور الجديدة', type: 'password', required: true, autocomplete: 'new-password', hint: '٨ أحرف على الأقل' },
        { name: 'confirmNewPassword', label: 'تأكيد كلمة المرور الجديدة', type: 'password', required: true, autocomplete: 'new-password' },
      ],
    });
    var passwordSubmit = ui.button({
      label: 'تغيير كلمة المرور',
      icon: 'lock',
      variant: 'btn--primary',
      onClick: function () {
        var values = passwordForm.values();
        var missing = global.ALW.forms.validateRequired([
          ['currentPassword', values.currentPassword],
          ['newPassword', values.newPassword],
          ['confirmNewPassword', values.confirmNewPassword],
        ]);
        passwordForm.clearErrors();
        if (missing.length) {
          global.ALW.toast.warning('يرجى تعبئة كل الحقول');
          return;
        }
        if (values.newPassword !== values.confirmNewPassword) {
          passwordForm.control('confirmNewPassword').input.classList.add('input--invalid');
          global.ALW.forms.attachError(passwordForm.control('confirmNewPassword').wrap, 'confirmNewPassword', 'كلمتا المرور غير متطابقتين');
          return;
        }
        global.ALW.feedback.setButtonBusy(passwordSubmit, true);
        global.ALW.api
          .post('/auth/change-password', values)
          .then(function (result) {
            global.ALW.feedback.setButtonBusy(passwordSubmit, false);
            passwordForm.reset();
            global.ALW.toast.success(
              'تم تغيير كلمة المرور' + (result && result.revokedSessions ? ' وإبطال ' + result.revokedSessions + ' جلسة' : ''),
            );
            loadSessions();
          })
          .catch(function (error) {
            global.ALW.feedback.setButtonBusy(passwordSubmit, false);
            if (!passwordForm.showErrors(error)) global.ALW.toast.fromError(error);
          });
      },
    });
    var passwordBody = document.createElement('div');
    passwordBody.appendChild(passwordForm.node);
    passwordBody.appendChild(passwordSubmit);
    grid.appendChild(ui.card({ title: 'تغيير كلمة المرور', icon: 'lock', body: passwordBody }));

    /* -------------------------------- sessions ------------------------------ */
    var sessionsBody = document.createElement('div');
    sessionsBody.appendChild(global.ALW.feedback.skeletonRows(3, '30px'));
    grid.appendChild(
      ui.card({
        title: 'الجلسات النشطة',
        icon: 'clock',
        body: sessionsBody,
        actions: [
          ui.button({
            label: 'إنهاء كل الجلسات',
            icon: 'log-out',
            size: 'sm',
            onClick: function () {
              global.ALW.modal
                .confirm({
                  title: 'إنهاء كل الجلسات',
                  message: 'سيتم إبطال كل جلساتك على جميع الأجهزة، وستحتاج لتسجيل الدخول من جديد.',
                  tone: 'danger',
                  confirmLabel: 'إنهاء الكل',
                  onConfirm: function () {
                    return global.ALW.api.post('/auth/logout-all', {});
                  },
                })
                .then(function (confirmed) {
                  if (confirmed) {
                    global.ALW.toast.success('تم إنهاء كل الجلسات');
                    global.ALW.auth.logout(true).then(function () {
                      global.ALW.nav.go('/login');
                    });
                  }
                });
            },
          }),
        ],
      }),
    );

    function loadSessions() {
      return global.ALW.api
        .get('/auth/sessions')
        .then(function (data) {
          var sessions = (data && data.sessions) || [];
          var wrap = document.createElement('div');
          wrap.appendChild(ui.statRow('الجلسات النشطة', F.number(data && data.activeSessions), { icon: 'clock' }));
          if (!sessions.length) {
            wrap.appendChild(global.ALW.feedback.empty('لا جلسات نشطة.'));
          } else {
            sessions.slice(0, 8).forEach(function (session) {
              var details = [
                session.ip || 'IP غير معروف',
                session.userAgent ? String(session.userAgent).slice(0, 40) : '',
                session.createdAt ? F.relative(session.createdAt) : '',
              ].filter(Boolean).join(' · ');
              wrap.appendChild(ui.statRow(session.current ? 'الجلسة الحالية' : 'جهاز', details));
            });
          }
          dom.mount(sessionsBody, [wrap]);
        })
        .catch(function (error) {
          dom.mount(sessionsBody, [global.ALW.feedback.errorState(error, loadSessions)]);
        });
    }
    loadSessions();

    /* -------------------------------- settings ------------------------------ */
    var themeRow = document.createElement('div');
    themeRow.className = 'stat-row';
    var themeLabel = document.createElement('span');
    themeLabel.className = 'stat-row__label';
    themeLabel.textContent = 'المظهر';
    themeRow.appendChild(themeLabel);
    var themeToggle = ui.button({
      label: document.documentElement.getAttribute('data-theme') === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن',
      icon: document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon',
      size: 'sm',
      onClick: function () {
        global.ALW.toggleTheme();
        themeToggle.textContent = '';
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        themeToggle.appendChild(dom.icon(isDark ? 'sun' : 'moon', 'icon'));
        var label = document.createElement('span');
        label.textContent = isDark ? 'الوضع الفاتح' : 'الوضع الداكن';
        themeToggle.appendChild(label);
      },
    });
    themeRow.appendChild(themeToggle);

    var apiRow = document.createElement('div');
    apiRow.className = 'stat-row';
    var apiLabel = document.createElement('span');
    apiLabel.className = 'stat-row__label';
    apiLabel.textContent = 'عنوان الـAPI';
    apiRow.appendChild(apiLabel);
    var apiValue = document.createElement('span');
    apiValue.className = 'stat-row__value mono';
    apiValue.textContent = global.ALW.config.apiBaseUrl;
    apiRow.appendChild(apiValue);

    var settingsBody = document.createElement('div');
    settingsBody.appendChild(themeRow);
    settingsBody.appendChild(apiRow);
    settingsBody.appendChild(
      ui.button({
        label: 'تعديل إعدادات الاتصال',
        icon: 'settings',
        size: 'sm',
        onClick: function () {
          global.ALW.openApiSettings();
        },
      }),
    );
    grid.appendChild(ui.card({ title: 'التفضيلات', icon: 'settings', body: settingsBody }));

    /* ------------------------- notification preferences --------------------- */
    var prefsBody = document.createElement('div');
    prefsBody.appendChild(global.ALW.feedback.skeletonRows(4, '30px'));
    grid.appendChild(
      ui.card({
        title: 'تفضيلات الإشعارات',
        icon: 'bell',
        body: prefsBody,
        actions: [
          global.ALW.can.can('notifications.read')
            ? ui.button({ label: 'فتح الإشعارات', icon: 'external-link', size: 'sm', onClick: function () { global.ALW.nav.go('/notifications'); } })
            : null,
        ].filter(Boolean),
      }),
    );

    global.ALW.api
      .get('/notifications/preferences')
      .then(function (data) {
        var items = (data && data.items) || [];
        var wrap = document.createElement('div');
        items.forEach(function (item) {
          wrap.appendChild(
            ui.statRow(F.enumLabel(F.NOTIFICATION_TYPE, item.type), item.mandatory ? ui.badge('إلزامي', 'info') : (item.inAppEnabled ? 'مُفعَّل' : 'معطَّل'), {
              icon: item.mandatory ? 'shield' : 'bell',
            }),
          );
        });
        if (!items.length) wrap.appendChild(global.ALW.feedback.empty('لا تفضيلات.'));
        dom.mount(prefsBody, [wrap]);
      })
      .catch(function (error) {
        dom.mount(prefsBody, [global.ALW.feedback.errorState(error)]);
      });

    return container;
  }

  global.ALW = global.ALW || {};
  global.ALW.pages = global.ALW.pages || {};
  global.ALW.pages.account = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
