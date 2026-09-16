/**
 * alwled — الأدوار والصلاحيات: قائمة الأدوار + مصفوفة صلاحيات مجمّعة حسب الوحدة.
 * الصلاحيات تُقرأ من /permissions (مجموعات) وتُحفظ عبر PUT /roles/:id/permissions.
 */
(function (global) {
  'use strict';

  var F = global.ALW.format;
  var ui = global.ALW.ui;
  var dom = global.ALW.dom;

  function render(container) {
    dom.mount(container, []);
    container.appendChild(
      ui.pageHeader({
        title: 'الأدوار والصلاحيات',
        icon: 'key',
        description: 'الأدوار تُجمّع الصلاحيات. الأدوار النظامية محمية من الحذف أو التقليص.',
        actions: [
          global.ALW.can.can('roles.create')
            ? ui.button({
              label: 'إضافة دور',
              icon: 'plus',
              variant: 'btn--primary',
              onClick: function () { openRoleForm(null); },
            })
            : null,
        ].filter(Boolean),
      }),
    );

    var grid = document.createElement('div');
    grid.className = 'grid-3';
    grid.appendChild(global.ALW.feedback.skeletonCards(3));
    container.appendChild(grid);

    function load() {
      dom.mount(grid, [global.ALW.feedback.skeletonCards(3)]);
      return global.ALW.api
        .get('/roles', { query: { limit: 100 } })
        .then(function (data) {
          var roles = (data && data.items) || [];
          if (!roles.length) {
            dom.mount(grid, [global.ALW.feedback.empty('لا توجد أدوار.')]);
            return;
          }
          dom.mount(grid, roles.map(function (role) { return roleCard(role); }));
          global.ALW.can.applyGates(grid);
        })
        .catch(function (error) {
          dom.mount(grid, [global.ALW.feedback.errorState(error, load)]);
        });
    }

    function roleCard(role) {
      var permissions = role.permissions || [];
      var chipList = document.createElement('div');
      chipList.className = 'tag-list';
      var shown = permissions.slice(0, 8);
      shown.forEach(function (permission) {
        var key = typeof permission === 'string' ? permission : permission.key;
        chipList.appendChild(ui.badge(key, key === '*' ? 'brand' : 'neutral', { small: true }));
      });
      if (permissions.length > shown.length) {
        chipList.appendChild(ui.badge('+' + (permissions.length - shown.length), 'info', { small: true }));
      }
      if (!permissions.length) {
        chipList.appendChild(dom.el('span', { class: 'muted text-xs', text: 'لا صلاحيات' }));
      }

      var body = document.createElement('div');
      body.appendChild(ui.detailGrid([
        ['النوع', role.isSystemRole ? ui.badge('نظامي', 'info') : ui.badge('مخصص', 'neutral')],
        ['الصلاحيات', F.number(role.permissionsCount)],
        ['المستخدمون', F.number(role.assignedUsersCount)],
      ]));
      if (role.isWildcard) {
        body.appendChild(ui.alertBox('هذا الدور يملك كل الصلاحيات (*) — حساس: يُمنح للمالك فقط عادةً.', 'warning'));
      }
      body.appendChild(chipList);

      return ui.card({
        title: role.name,
        icon: 'shield',
        subtitle: role.description || '',
        body: body,
        actions: [
          global.ALW.can.can('roles.update') && !role.isOwnerRole
            ? ui.button({ label: 'تعديل', icon: 'edit', size: 'sm', onClick: function () { openPermissions(role); } })
            : null,
          global.ALW.can.can('roles.delete') && !role.isSystemRole
            ? ui.button({
              label: 'حذف',
              icon: 'trash',
              size: 'sm',
              variant: 'btn--ghost',
              onClick: function () {
                global.ALW.modal
                  .confirm({
                    title: 'حذف الدور',
                    message: 'سيُحذف الدور "' + role.name + '". لا يمكن حذف دور مستخدَم أو نظامي (سيمنعه الخادم).',
                    tone: 'danger',
                    confirmLabel: 'حذف',
                    onConfirm: function () { return global.ALW.api.del('/roles/' + role.id); },
                  })
                  .then(function (confirmed) {
                    if (confirmed) {
                      global.ALW.toast.success('تم حذف الدور');
                      load();
                    }
                  });
              },
            })
            : null,
        ].filter(Boolean),
      });
    }

    function openRoleForm(role) {
      var formApi = global.ALW.forms.form({
        fields: [
          { name: 'name', label: 'اسم الدور', required: true, maxLength: 60, hint: 'بالأحرف الكبيرة عادةً (مثال: WAREHOUSE)' },
          { name: 'description', label: 'الوصف', type: 'textarea', full: true, maxLength: 300 },
        ],
        grid: true,
      });
      if (role) {
        formApi.control('name').setValue(role.name);
        formApi.control('description').setValue(role.description);
      }
      var modal = global.ALW.modal.create({ title: role ? 'تعديل الدور' : 'دور جديد', icon: 'key', size: 'sm', content: formApi.node });
      modal.addFooterButton({ label: 'إلغاء', className: 'btn--secondary', onClick: function () { modal.close(); } });
      modal.addFooterButton({
        label: role ? 'حفظ' : 'إضافة',
        className: 'btn--primary',
        loading: true,
        onClick: function () {
          var values = formApi.values();
          if (!values.name) {
            global.ALW.toast.warning('اسم الدور مطلوب');
            return;
          }
          modal.setBusy(true);
          var action = role
            ? global.ALW.api.patch('/roles/' + role.id, values)
            : global.ALW.api.post('/roles', values);
          action
            .then(function () {
              modal.close();
              global.ALW.toast.success(role ? 'تم تحديث الدور' : 'تمت إضافة الدور');
              load();
            })
            .catch(function (error) {
              modal.setBusy(false);
              if (!formApi.showErrors(error)) global.ALW.toast.fromError(error);
            });
        },
      });
      modal.open();
    }

    /* --------------------------- permissions matrix -------------------------- */
    function openPermissions(role) {
      var body = document.createElement('div');
      body.className = 'stack';
      body.appendChild(global.ALW.feedback.skeletonRows(8, '30px'));
      var modal = global.ALW.modal.create({
        title: 'صلاحيات الدور — ' + role.name,
        icon: 'sliders',
        size: 'xl',
        content: body,
      });
      modal.addFooterButton({ label: 'إغلاق', className: 'btn--secondary', onClick: function () { modal.close(); } });
      modal.open();

      Promise.all([
        global.ALW.api.get('/permissions'),
        global.ALW.api.get('/roles/' + role.id),
      ])
        .then(function (results) {
          var permissionData = results[0] || {};
          var roleDetail = results[1] || role;
          // the API works with permission IDs (PUT /roles/:id/permissions { permissionIds })
          var current = {};
          (roleDetail.permissions || []).forEach(function (permission) {
            if (permission && permission.id) current[permission.id] = true;
            else if (permission && permission.key) {
              var match = (permissionData.flat || []).filter(function (item) { return item.key === permission.key; })[0];
              if (match) current[match.id] = true;
            }
          });
          var groups = permissionData.groups || [];
          var flat = permissionData.flat || [];
          var selected = Object.assign({}, current);
          var wrap = document.createElement('div');
          wrap.className = 'stack';

          if (role.isWildcard) {
            wrap.appendChild(ui.alertBox('هذا الدور يملك النجمة (*) — كل الصلاحيات. لا يمكن تقليصه من الواجهة.', 'warning'));
          }

          var search = global.ALW.forms.text({ name: 'permSearch', placeholder: 'بحث في الصلاحيات…' });
          wrap.appendChild(search.wrap);

          var groupsWrap = document.createElement('div');
          groupsWrap.className = 'stack';
          wrap.appendChild(groupsWrap);

          function groupNode(group) {
            var cardBody = document.createElement('div');
            cardBody.className = 'grid-3';
            (group.permissions || []).forEach(function (permission) {
              var row = document.createElement('label');
              row.className = 'checkbox';
              var input = document.createElement('input');
              input.type = 'checkbox';
              input.checked = selected[permission.id] === true;
              input.disabled = role.isWildcard;
              input.dataset.id = permission.id;
              input.dataset.key = permission.key;
              input.dataset.search = (permission.key + ' ' + (permission.name || '') + ' ' + group.module).toLowerCase();
              input.addEventListener('change', function () {
                if (input.checked) selected[permission.id] = true;
                else delete selected[permission.id];
              });
              row.appendChild(input);
              var textWrap = document.createElement('span');
              var key = document.createElement('div');
              key.className = 'mono';
              key.textContent = permission.key;
              textWrap.appendChild(key);
              var label = document.createElement('div');
              label.className = 'text-xs muted';
              label.textContent = permission.name || '';
              textWrap.appendChild(label);
              row.appendChild(textWrap);
              cardBody.appendChild(row);
            });
            return ui.card({ title: group.module, icon: 'folder', subtitle: F.number(group.count) + ' صلاحية', body: cardBody });
          }

          function paint(filter) {
            var term = (filter || '').toLowerCase();
            dom.mount(groupsWrap, groups
              .filter(function (group) {
                if (!term) return true;
                return (group.permissions || []).some(function (permission) {
                  return (permission.key + ' ' + (permission.name || '') + ' ' + group.module).toLowerCase().indexOf(term) !== -1;
                });
              })
              .map(groupNode));
          }
          paint('');
          search.input.addEventListener('input', function () {
            paint(search.input.value.trim());
          });

          var summary = document.createElement('div');
          summary.className = 'row row--between';
          var countLabel = document.createElement('span');
          countLabel.className = 'text-sm muted';
          function updateCount() {
            countLabel.textContent = 'المحدَّد: ' + Object.keys(selected).length + ' صلاحية';
          }
          updateCount();
          groupsWrap.addEventListener('change', updateCount);
          summary.appendChild(countLabel);

          var saveBtn = ui.button({
            label: 'حفظ الصلاحيات',
            icon: 'check',
            variant: 'btn--primary',
            permission: 'roles.update',
            onClick: function () {
              global.ALW.modal
                .confirm({
                  title: 'تعديل صلاحيات الدور',
                  message: 'سيُستبدل كامل مجموعة صلاحيات الدور. تأكد من مراجعة الأثر على الموظفين الحاملين لهذا الدور.',
                  tone: 'warning',
                  confirmLabel: 'حفظ',
                  onConfirm: function () {
                    return global.ALW.api.put('/roles/' + role.id + '/permissions', {
                      permissionIds: Object.keys(selected).map(Number),
                      confirmSystemRoleChange: role.isSystemRole === true,
                    });
                  },
                })
                .then(function (confirmed) {
                  if (confirmed) {
                    global.ALW.toast.success('تم تحديث صلاحيات الدور');
                    modal.close();
                    load();
                  }
                });
            },
          });
          if (saveBtn) summary.appendChild(saveBtn);
          wrap.appendChild(summary);

          dom.mount(body, [wrap]);
        })
        .catch(function (error) {
          dom.mount(body, [global.ALW.feedback.errorState(error, function () { modal.close(); openPermissions(role); })]);
        });
    }

    load();
    return container;
  }

  global.ALW = global.ALW || {};
  global.ALW.pages = global.ALW.pages || {};
  global.ALW.pages.roles = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
