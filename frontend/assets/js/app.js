/**
 * alwled — نقطة تشغيل اللوحة: التهيئة، الهيكل (Sidebar/Header)، التوجيه، والحمايات.
 * لا أسرار هنا: العنوان الوحيد القابل للتغيير هو عنوان الـAPI (إعداد محلي في المتصفح).
 */
(function (global) {
  'use strict';

  var ALW = global.ALW || (global.ALW = {});
  var dom = ALW.dom;
  var ui = ALW.ui;

  var THEME_KEY = 'alwled.theme';
  var shell = {};
  var routes = {};

  /* ------------------------------- theme ---------------------------------- */
  function applyTheme(theme) {
    var value = theme || 'light';
    document.documentElement.setAttribute('data-theme', value);
    try {
      global.localStorage.setItem(THEME_KEY, value);
    } catch (error) {
      /* ignore */
    }
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return next;
  }

  function initTheme() {
    var stored = null;
    try {
      stored = global.localStorage.getItem(THEME_KEY);
    } catch (error) {
      stored = null;
    }
    if (!stored && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) stored = 'dark';
    applyTheme(stored || 'light');
  }

  /* ------------------------------- routing -------------------------------- */
  function defineRoutes() {
    routes = {
      '/login': { public: true, title: 'تسجيل الدخول', render: function (container, context) { return ALW.pages.login.render(container, context); } },
      '/dashboard': { title: 'لوحة التحكم', permission: 'dashboard.read', icon: 'dashboard', group: 'الرئيسية', nav: 'لوحة التحكم', render: ALW.pages.dashboard.render },
      '/analytics': { title: 'التحليلات', permission: 'analytics.read', icon: 'chart', group: 'الرئيسية', nav: 'التحليلات', render: ALW.pages.analytics.render },

      '/slider': { title: 'السلايدر', permission: 'slider.read', icon: 'image', group: 'واجهة المتجر', nav: 'السلايدر', render: function (container, context) { return ALW.pages.slider.render(container, context); } },

      '/products': { title: 'المنتجات', permission: 'products.read', icon: 'package', group: 'الكتالوج', nav: 'المنتجات', render: renderPage(ALW.pagesCatalog.products) },
      '/categories': { title: 'التصنيفات', permission: 'categories.read', icon: 'layers', group: 'الكتالوج', nav: 'التصنيفات', render: renderPage(ALW.pagesCatalog.categories) },
      '/brands': { title: 'العلامات التجارية', permission: 'brands.read', icon: 'tag', group: 'الكتالوج', nav: 'العلامات', render: renderPage(ALW.pagesCatalog.brands) },
      '/specifications': { title: 'المواصفات', permission: 'specifications.read', icon: 'sliders', group: 'الكتالوج', nav: 'المواصفات', render: renderPage(ALW.pagesCatalog.specifications) },
      '/inventory': { title: 'المخزون', permission: 'inventory.read', icon: 'boxes', group: 'الكتالوج', nav: 'المخزون', render: renderPage(ALW.pagesCatalog.inventory) },

      '/orders': { title: 'الطلبات', permission: 'orders.read', icon: 'cart', group: 'المبيعات', nav: 'الطلبات', render: renderPage(ALW.pagesOps.orders) },
      '/payments': { title: 'الدفعات', permission: 'payments.read', icon: 'credit-card', group: 'المبيعات', nav: 'الدفعات', render: renderPage(ALW.pagesOps.payments) },
      '/payments/review': { title: 'مراجعة شام كاش', permission: 'payments.read', icon: 'wallet', group: 'المبيعات', nav: 'مراجعة شام كاش', render: renderPage(ALW.pagesOps.shamCashReview) },

      '/customers': { title: 'العملاء', permission: ['users.read', 'employees.read'], icon: 'users', group: 'العملاء', nav: 'العملاء', render: renderPage(ALW.pagesOps.customers) },
      '/verification': { title: 'تحقق العملاء', permission: 'verification.read', icon: 'shield', group: 'العملاء', nav: 'تحقق العملاء', render: renderPage(ALW.pagesOps.verification) },

      '/notifications': { title: 'الإشعارات', icon: 'bell', group: 'التواصل', nav: 'إشعاراتي', render: renderPage(ALW.pagesOps.notifications) },
      '/admin/notifications': { title: 'طابور الإشعارات', permission: 'notifications.admin.read', icon: 'inbox', group: 'التواصل', nav: 'طابور الإشعارات', render: renderPage(ALW.pagesOps.adminNotifications) },

      '/employees': { title: 'الموظفون', permission: 'employees.read', icon: 'briefcase', group: 'الفريق والصلاحيات', nav: 'الموظفون', render: renderPage(ALW.pagesOps.employees) },
      '/roles': { title: 'الأدوار والصلاحيات', permission: 'roles.read', icon: 'key', group: 'الفريق والصلاحيات', nav: 'الأدوار والصلاحيات', render: ALW.pages.roles.render },
      '/audit': { title: 'سجل التدقيق', permission: 'audit.read', icon: 'activity', group: 'الفريق والصلاحيات', nav: 'سجل التدقيق', render: renderPage(ALW.pagesOps.audit) },

      '/account': { title: 'حسابي', icon: 'user', group: 'الحساب', nav: 'حسابي', render: ALW.pages.account.render, hideFromNav: false },
    };
  }

  /** يلفّ مصنع صفحة بحيث يُبنى كائن الصفحة مرة واحدة لكل تنقّل. */
  function renderPage(factory) {
    return function (container) {
      dom.mount(container, []);
      var page = factory();
      if (page && typeof page.render === 'function') {
        // resource pages fill their own container when render() is called
        var out = page.render();
        var node = out && out.nodeType ? out : page.container || page.node;
        if (node) container.appendChild(node);
        return container;
      }
      if (page && page.container) {
        container.appendChild(page.container);
        return container;
      }
      if (page) container.appendChild(page);
      return container;
    };
  }

  /* --------------------------------- shell -------------------------------- */
  function buildSidebar() {
    var aside = document.createElement('aside');
    aside.className = 'app-sidebar';
    aside.setAttribute('aria-label', 'القائمة الرئيسية');

    var brand = document.createElement('div');
    brand.className = 'app-sidebar__brand';
    var logo = document.createElement('span');
    logo.className = 'app-sidebar__logo';
    var logoImage = document.createElement('img');
    logoImage.src = 'assets/icons/logo-alwaleed-mark.png';
    logoImage.alt = '';
    logoImage.width = 30;
    logoImage.height = 30;
    logoImage.setAttribute('aria-hidden', 'true');
    logo.appendChild(logoImage);
    brand.appendChild(logo);
    var brandText = document.createElement('div');
    brandText.className = 'app-sidebar__brand-text';
    var brandName = document.createElement('div');
    brandName.className = 'app-sidebar__brand-name';
    brandName.textContent = ALW.config.appName;
    brandText.appendChild(brandName);
    var brandSub = document.createElement('div');
    brandSub.className = 'app-sidebar__brand-sub';
    brandSub.textContent = ALW.config.appTagline;
    brandText.appendChild(brandSub);
    brand.appendChild(brandText);
    aside.appendChild(brand);

    var nav = document.createElement('nav');
    nav.className = 'app-sidebar__nav';
    nav.id = 'main-nav';
    aside.appendChild(nav);
    shell.nav = nav;

    var foot = document.createElement('div');
    foot.className = 'app-sidebar__foot';
    var userButton = document.createElement('button');
    userButton.type = 'button';
    userButton.className = 'sidebar-user';
    userButton.addEventListener('click', function () {
      ALW.nav.go('/account');
      closeDrawer();
    });
    foot.appendChild(userButton);
    shell.sidebarUser = userButton;
    aside.appendChild(foot);
    return aside;
  }

  function renderNav() {
    var nav = shell.nav;
    if (!nav) return;
    dom.mount(nav, []);
    var groups = [];
    Object.keys(routes).forEach(function (path) {
      var route = routes[path];
      if (!route.nav || route.hideFromNav) return;
      if (route.permission && !ALW.can.can(route.permission)) return;
      var group = groups.filter(function (item) { return item.name === route.group; })[0];
      if (!group) {
        group = { name: route.group || 'عام', items: [] };
        groups.push(group);
      }
      group.items.push({ path: path, route: route });
    });

    groups.forEach(function (group) {
      var groupNode = document.createElement('div');
      groupNode.className = 'nav-group';
      var label = document.createElement('div');
      label.className = 'nav-group__label';
      label.textContent = group.name;
      groupNode.appendChild(label);
      group.items.forEach(function (entry) {
        var item = document.createElement('a');
        item.className = 'nav-item';
        item.href = '#' + entry.path;
        item.dataset.path = entry.path;
        item.appendChild(dom.icon(entry.route.icon || 'circle-slash', 'icon nav-item__icon'));
        var text = document.createElement('span');
        text.className = 'nav-item__text';
        text.textContent = entry.route.nav;
        item.appendChild(text);
        item.addEventListener('click', function () {
          closeDrawer();
        });
        groupNode.appendChild(item);
      });
      nav.appendChild(groupNode);
    });
    markActiveNav(currentPath());
  }

  function markActiveNav(path) {
    if (!shell.nav) return;
    Array.prototype.forEach.call(shell.nav.querySelectorAll('.nav-item'), function (item) {
      var isActive = item.dataset.path === path;
      item.classList.toggle('nav-item--active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function renderSidebarUser() {
    if (!shell.sidebarUser) return;
    var user = ALW.auth.user() || {};
    dom.mount(shell.sidebarUser, []);
    var avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = ALW.format.initials(user.firstName, user.lastName);
    shell.sidebarUser.appendChild(avatar);
    var meta = document.createElement('div');
    meta.className = 'sidebar-user__meta';
    var name = document.createElement('div');
    name.className = 'sidebar-user__name';
    name.textContent = ALW.format.fullName(user);
    meta.appendChild(name);
    var role = document.createElement('div');
    role.className = 'sidebar-user__role';
    role.textContent = (user.roles || []).join('، ') || '—';
    meta.appendChild(role);
    shell.sidebarUser.appendChild(meta);
  }

  function buildHeader() {
    var header = document.createElement('header');
    header.className = 'app-header';

    var menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'icon-btn sidebar-toggle-mobile';
    menuButton.setAttribute('aria-label', 'فتح القائمة');
    menuButton.setAttribute('aria-controls', 'main-nav');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.appendChild(dom.icon('menu', 'icon'));
    menuButton.addEventListener('click', function () {
      toggleDrawer();
    });
    header.appendChild(menuButton);

    var collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'icon-btn sidebar-toggle-desktop';
    collapse.setAttribute('aria-label', 'طي القائمة');
    collapse.appendChild(dom.icon('panel-right', 'icon'));
    collapse.addEventListener('click', function () {
      var collapsed = document.body.classList.toggle('app--sidebar-collapsed');
      try {
        global.localStorage.setItem('alwled.sidebar', collapsed ? 'collapsed' : 'expanded');
      } catch (error) {
        /* ignore */
      }
    });
    header.appendChild(collapse);

    var titles = document.createElement('div');
    titles.className = 'app-header__titles';
    var title = document.createElement('div');
    title.className = 'app-header__title';
    titles.appendChild(title);
    var breadcrumb = document.createElement('nav');
    breadcrumb.className = 'breadcrumb';
    breadcrumb.setAttribute('aria-label', 'مسار التنقل');
    titles.appendChild(breadcrumb);
    header.appendChild(titles);
    shell.headerTitle = title;
    shell.breadcrumb = breadcrumb;

    var actions = document.createElement('div');
    actions.className = 'app-header__actions';

    var bell = ALW.notificationsUi.createBell({});
    bell.node.classList.add('bell');
    header.appendChild(actions);
    actions.appendChild(bell.node);
    shell.bell = bell;

    var themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.className = 'icon-btn';
    themeButton.setAttribute('aria-label', 'تبديل المظهر');
    themeButton.appendChild(dom.icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon', 'icon'));
    themeButton.addEventListener('click', function () {
      var next = toggleTheme();
      dom.mount(themeButton, dom.icon(next === 'dark' ? 'sun' : 'moon', 'icon'));
    });
    actions.appendChild(themeButton);

    var userMenu = document.createElement('div');
    userMenu.className = 'dropdown';
    var userButton = document.createElement('button');
    userButton.type = 'button';
    userButton.className = 'icon-btn';
    userButton.setAttribute('aria-label', 'قائمة المستخدم');
    userButton.setAttribute('aria-haspopup', 'menu');
    userButton.setAttribute('aria-expanded', 'false');
    userButton.appendChild(dom.icon('user', 'icon'));
    userMenu.appendChild(userButton);
    var menu = null;
    function closeMenu() {
      if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
      menu = null;
      userButton.setAttribute('aria-expanded', 'false');
    }
    userButton.addEventListener('click', function () {
      if (menu) {
        closeMenu();
        return;
      }
      menu = document.createElement('div');
      menu.className = 'dropdown__menu dropdown__menu--end';
      menu.setAttribute('role', 'menu');
      var user = ALW.auth.user() || {};
      var headerBlock = document.createElement('div');
      headerBlock.className = 'dropdown__header';
      headerBlock.textContent = ALW.format.fullName(user) + ' — ' + ((user.roles || []).join('، ') || '—');
      menu.appendChild(headerBlock);
      var divider = document.createElement('div');
      divider.className = 'dropdown__divider';
      menu.appendChild(divider);
      [
        { label: 'حسابي', icon: 'user', run: function () { ALW.nav.go('/account'); } },
        { label: 'إعدادات الاتصال', icon: 'settings', run: function () { ALW.openApiSettings(); } },
        { label: 'تسجيل الخروج', icon: 'log-out', danger: true, run: function () { ALW.confirmLogout(); } },
      ].forEach(function (entry) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'dropdown__item' + (entry.danger ? ' dropdown__item--danger' : '');
        item.setAttribute('role', 'menuitem');
        item.appendChild(dom.icon(entry.icon, 'icon icon--sm'));
        var label = document.createElement('span');
        label.textContent = entry.label;
        item.appendChild(label);
        item.addEventListener('click', function () {
          closeMenu();
          entry.run();
        });
        menu.appendChild(item);
      });
      userMenu.appendChild(menu);
      userButton.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onDocumentClick, true);
      document.addEventListener('keydown', onKeydown, true);
    });
    function onDocumentClick(event) {
      if (!userMenu.contains(event.target)) {
        closeMenu();
        document.removeEventListener('click', onDocumentClick, true);
        document.removeEventListener('keydown', onKeydown, true);
      }
    }
    function onKeydown(event) {
      if (event.key === 'Escape') closeMenu();
    }
    actions.appendChild(userMenu);

    header.appendChild(actions);
    return header;
  }

  function drawerIsMobile() {
    return !!(global.matchMedia && global.matchMedia('(max-width: 1024px)').matches);
  }

  function onDrawerKeydown(event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
      event.preventDefault();
      closeDrawer();
    }
  }

  /** قفل تمرير الصفحة خلف الدرج على الجوال (يُرفع عند الإغلاق). */
  function lockDrawerScroll(lock) {
    if (lock) {
      document.addEventListener('keydown', onDrawerKeydown, true);
      document.body.classList.add('drawer-open');
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', onDrawerKeydown, true);
      document.body.classList.remove('drawer-open');
      document.body.style.overflow = '';
    }
  }

  function toggleDrawer() {
    var sidebar = dom.qs('.app-sidebar');
    if (!sidebar) return;
    var willOpen = !sidebar.classList.contains('is-open');
    sidebar.classList.toggle('is-open', willOpen);
    var menuButton = dom.qs('.sidebar-toggle-mobile');
    if (menuButton) menuButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    var scrim = dom.qs('.sidebar-scrim');
    if (willOpen && !scrim) {
      scrim = document.createElement('div');
      scrim.className = 'sidebar-scrim';
      scrim.addEventListener('click', closeDrawer);
      document.body.appendChild(scrim);
    } else if (!willOpen && scrim) {
      scrim.remove();
    }
    lockDrawerScroll(willOpen && drawerIsMobile());
  }

  function closeDrawer() {
    var sidebar = dom.qs('.app-sidebar');
    var wasOpen = !!(sidebar && sidebar.classList.contains('is-open'));
    if (sidebar) sidebar.classList.remove('is-open');
    var scrim = dom.qs('.sidebar-scrim');
    if (scrim) scrim.remove();
    var menuButton = dom.qs('.sidebar-toggle-mobile');
    if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
    lockDrawerScroll(false);
    // إرجاع التركيز إلى زر الفتح (مسار كيبورد كامل)
    if (wasOpen && menuButton && drawerIsMobile()) menuButton.focus({ preventScroll: true });
  }

  function renderBreadcrumb(route) {
    var bc = shell.breadcrumb;
    dom.mount(bc, []);
    if (!route || !route.group) {
      bc.hidden = true;
      return;
    }
    bc.hidden = false;
    var group = document.createElement('span');
    group.textContent = route.group;
    bc.appendChild(group);
    var sep = document.createElement('span');
    sep.className = 'breadcrumb__sep';
    sep.textContent = '›';
    bc.appendChild(sep);
    var current = document.createElement('span');
    current.className = 'breadcrumb__current';
    current.textContent = route.nav || route.title;
    bc.appendChild(current);
  }

  /* -------------------------------- app flow ------------------------------- */
  var router = null;
  var contentNode = null;

  function currentPath() {
    return (router && router.current() && router.current().path) || '/';
  }

  function showOnlyContent(show) {
    if (shell.sidebar) shell.sidebar.hidden = !show;
    if (shell.header) shell.header.hidden = !show;
    if (shell.userMenu) shell.userMenu.hidden = !show;
    document.body.classList.toggle('auth-mode', !show);
  }

  function handleRoute(entry) {
    var path = entry.path;
    var query = entry.query;
    var result = entry.result;
    var route = result.route;

    if (result.kind === 'login' || path === '/login') {
      showOnlyContent(false);
      dom.mount(contentNode, []);
      ALW.pages.login.render(contentNode, {
        onSuccess: function () {
          renderNav();
          renderSidebarUser();
          if (shell.bell) shell.bell.refresh();
          // only honour ?next= when it points at a real route
          var target = query && query.next && routes[query.next] ? query.next : '/dashboard';
          ALW.nav.go(target);
        },
      });
      return;
    }

    showOnlyContent(true);
    renderNav();
    renderSidebarUser();

    if (result.kind === 'forbidden') {
      shell.headerTitle.textContent = route && route.nav ? route.nav : 'صلاحيات';
      renderBreadcrumb(route);
      dom.mount(contentNode, []);
      contentNode.appendChild(ALW.pages.errors.forbidden(route));
      markActiveNav(null);
      return;
    }

    if (result.kind === 'notfound') {
      shell.headerTitle.textContent = 'غير موجود';
      renderBreadcrumb(null);
      dom.mount(contentNode, []);
      contentNode.appendChild(ALW.pages.errors.notFound());
      markActiveNav(null);
      return;
    }

    if (!route) {
      dom.mount(contentNode, [ALW.pages.errors.notFound()]);
      return;
    }

    shell.headerTitle.textContent = route.title || '';
    document.title = (route.title ? route.title + ' — ' : '') + ALW.config.appNameFull;
    renderBreadcrumb(route);
    markActiveNav(path);
    dom.mount(contentNode, []);
    try {
      route.render(contentNode, { query: query });
      ALW.can.applyGates(contentNode);
    } catch (error) {
      if (global.console && console.error) console.error(error);
      dom.mount(contentNode, [ALW.pages.errors.serverError()]);
    }
  }

  function openApiSettings() {
    var formApi = ALW.forms.form({
      fields: [
        {
          name: 'apiBaseUrl',
          label: 'عنوان واجهة الـAPI',
          value: ALW.config.apiBaseUrl,
          required: true,
          hint: 'مثال: /api/v1 عند تقديم الواجهة من نفس الخادم، أو https://api.example.com/api/v1',
          full: true,
        },
      ],
    });
    var body = document.createElement('div');
    body.appendChild(
      ui.alertBox('يُحفظ هذا الإعداد في هذا المتصفح فقط. لا يحتوي أي أسرار.', 'info'),
    );
    body.appendChild(formApi.node);
    var modal = ALW.modal.create({ title: 'إعدادات الاتصال', icon: 'settings', size: 'sm', content: body });
    modal.addFooterButton({ label: 'إلغاء', className: 'btn--secondary', onClick: function () { modal.close(); } });
    modal.addFooterButton({
      label: 'حفظ وإعادة التحميل',
      className: 'btn--primary',
      onClick: function () {
        var values = formApi.values();
        if (!values.apiBaseUrl) {
          ALW.toast.warning('أدخل عنوانًا صالحًا');
          return;
        }
        ALW.config.saveOverrides({ apiBaseUrl: values.apiBaseUrl.trim() });
        ALW.toast.success('تم الحفظ — إعادة تحميل اللوحة…');
        setTimeout(function () {
          global.location.reload();
        }, 600);
      },
    });
    modal.open();
  }

  function confirmLogout() {
    ALW.modal
      .confirm({
        title: 'تسجيل الخروج',
        message: 'سيتم إنهاء هذه الجلسة. يمكنك اختيار إنهاء كل الجلسات من صفحة «حسابي».',
        tone: 'warning',
        confirmLabel: 'تسجيل الخروج',
        onConfirm: function () {
          return ALW.auth.logout(false);
        },
      })
      .then(function (confirmed) {
        if (confirmed) {
          ALW.toast.success('تم تسجيل الخروج');
          ALW.nav.go('/login');
        }
      });
  }

  function boot() {
    initTheme();
    ALW.config.applyDocumentOverrides(document);

    // wire the API client + auth service with real dependencies
    ALW.api.configure({
      config: ALW.config,
      session: ALW.session,
      refresh: function () {
        return ALW.auth.refresh();
      },
      onUnauthorized: function () {
        ALW.auth.clear();
        ALW.nav.go('/login');
      },
    });
    ALW.auth.configure({
      api: ALW.api,
      session: ALW.session,
      permissionsFactory: ALW.permissions,
    });
    ALW.session.on(function (event) {
      if (event === 'expired') ALW.nav.go('/login');
    });

    defineRoutes();

    var app = document.createElement('div');
    app.className = 'app';

    shell.sidebar = buildSidebar();
    app.appendChild(shell.sidebar);

    var main = document.createElement('div');
    main.className = 'app-main';
    shell.header = buildHeader();
    main.appendChild(shell.header);

    contentNode = document.createElement('main');
    contentNode.className = 'app-content';
    contentNode.id = 'content';
    contentNode.setAttribute('tabindex', '-1');
    main.appendChild(contentNode);

    var footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.textContent = ALW.config.appNameFull + ' — لوحة إدارة داخلية · الواجهة تعمل على بيانات الـAPI الفعلية فقط.';
    main.appendChild(footer);
    app.appendChild(main);

    var root = document.getElementById('app') || document.body;
    dom.mount(root, [app]);

    // restore the sidebar preference on desktop
    try {
      if (global.localStorage.getItem('alwled.sidebar') === 'collapsed') {
        document.body.classList.add('app--sidebar-collapsed');
      }
    } catch (error) {
      /* ignore */
    }

    var routerModule = ALW.router; // keep the module (parseHash/buildHash) before exposing the instance
    router = routerModule.createRouter({
      routes: routes,
      context: function () {
        return {
          authenticated: ALW.auth.isAuthenticated(),
          can: function (permission) {
            return ALW.can.can(permission);
          },
        };
      },
    });
    ALW.router = router;
    router.onChange(handleRoute);

    ALW.nav = {
      go: function (path, query) {
        router.navigate(path, query);
      },
    };

    // expose helpers used by pages
    ALW.openApiSettings = openApiSettings;
    ALW.confirmLogout = confirmLogout;
    ALW.toggleTheme = toggleTheme;

    var initial = routerModule.parseHash(global.location.hash);
    ALW.auth
      .restore()
      .then(function (restored) {
        renderNav();
        renderSidebarUser();
        router.start(); // registers hashchange + dispatches the current route
        if (!restored && initial.path !== '/login') {
          if (initial.path && initial.path !== '/') router.navigate('/login', { next: initial.path });
          else router.navigate('/login');
        } else if (restored && (initial.path === '/' || initial.path === '/login')) {
          router.navigate('/dashboard');
        }
        if (restored && shell.bell) shell.bell.refresh();
      })
      .catch(function () {
        renderNav();
        renderSidebarUser();
        router.navigate('/login');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
