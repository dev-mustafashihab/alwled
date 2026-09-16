/**
 * alwled — صفحة مورد (Resource Page) موحّدة.
 * كل صفحات الـCRUD (تصنيفات/علامات/منتجات/مواصفات/مخزون/طلبات/دفعات/عملاء/موظفين/تحقق/تدقيق/إشعارات)
 * تُبنى من هذه المصنع، فيبقى الشكل والسلوك موحّدين بلا تكرار.
 */
(function (global) {
  'use strict';

  function dom() {
    return global.ALW.dom;
  }
  function ui() {
    return global.ALW.ui;
  }

  function createPage(config) {
    var cfg = config || {};
    var container = document.createElement('div');
    var dt = null;
    var currentTable = null;

    function refresh() {
      if (dt) return dt.refresh();
      return null;
    }

    function build() {
      dom().mount(container, []);

      var headerActions = (cfg.headerActions || []).map(function (factory) {
        return factory({ refresh: refresh, page: api });
      }).filter(Boolean);

      container.appendChild(
        ui().pageHeader({
          title: cfg.title,
          icon: cfg.icon,
          description: cfg.description,
          actions: headerActions,
        }),
      );

      if (cfg.notice) {
        container.appendChild(ui().alertBox(cfg.notice, cfg.noticeTone || 'info'));
        container.appendChild(document.createElement('div')).className = 'mb-4';
      }

      var createButton = null;
      if (cfg.form) {
        createButton = ui().button({
          label: cfg.form.createLabel || 'إضافة',
          icon: 'plus',
          variant: 'btn--primary',
          onClick: function () {
            openForm(null);
          },
        });
        if (createButton) createButton.dataset.can = cfg.form.permission || '';
      }

      var columns = (cfg.columns || []).slice();
      var hasActions = (cfg.rowActions && cfg.rowActions.length) || cfg.detail || (cfg.form && cfg.form.editable);
      if (hasActions) columns.push(actionsColumnDef());

      dt = global.ALW.datatable.create({
        columns: columns,
        filters: cfg.filters,
        search: cfg.search,
        searchPlaceholder: cfg.searchPlaceholder,
        defaultSort: cfg.defaultSort,
        pageSize: cfg.pageSize,
        initialFilters: cfg.initialFilters,
        emptyText: cfg.emptyText,
        emptyTitle: cfg.emptyTitle,
        onRowClick: cfg.onRowClick || (cfg.detail ? function (row) { openDetail(row); } : undefined),
        actions: createButton ? [createButton] : [],
        load: function (params) {
          var query = cfg.query ? cfg.query(params) : params;
          return global.ALW.api.get(cfg.endpoint, { query: query }).then(function (data) {
            return { items: (data && data.items) || [], meta: (data && data.meta) || null };
          });
        },
      });
      container.appendChild(dt.node);
      dt.load();
      return container;
    }

    /* ------------------------------ create/edit ----------------------------- */
    function openForm(row, options) {
      var opts = options || {};
      var isEdit = !!row;
      var formDef = cfg.form;
      var fields = typeof formDef.fields === 'function' ? formDef.fields(row) : formDef.fields;
      var formApi = global.ALW.forms.form({ fields: fields, grid: true });
      if (row && formDef.fromRow) {
        var values = formDef.fromRow(row) || {};
        Object.keys(values).forEach(function (key) {
          var control = formApi.control(key);
          if (control) control.setValue(values[key]);
        });
      }

      var body = document.createElement('div');
      if (formDef.intro) body.appendChild(ui().alertBox(formDef.intro, 'info'));
      body.appendChild(formApi.node);

      var modal = global.ALW.modal.create({
        title: opts.title || (isEdit ? formDef.editTitle || 'تعديل' : formDef.createTitle || 'إضافة'),
        icon: formDef.icon || (isEdit ? 'edit' : 'plus'),
        size: formDef.size || 'lg',
        content: body,
      });

      modal.addFooterButton({
        label: 'إلغاء',
        className: 'btn--secondary',
        onClick: function () {
          modal.close();
        },
      });

      modal.addFooterButton({
        label: formDef.submitLabel || (isEdit ? 'حفظ التعديلات' : 'إضافة'),
        className: 'btn--primary',
        loading: true,
        onClick: function () {
          var values = formApi.values();
          var missing = global.ALW.forms.validateRequired(
            (fields || [])
              .filter(function (field) {
                return field.required;
              })
              .map(function (field) {
                return [field.name, values[field.name]];
              }),
          );
          formApi.clearErrors();
          if (missing.length) {
            missing.forEach(function (name) {
              var control = formApi.control(name);
              if (control) {
                control.input.classList.add('input--invalid');
                global.ALW.forms.attachError(control.wrap, name, 'هذا الحقل مطلوب');
              }
            });
            global.ALW.toast.warning('يرجى تعبئة الحقول المطلوبة.');
            return;
          }

          var body_ = formDef.toBody ? formDef.toBody(values, row) : values;
          modal.setBusy(true);
          var action = isEdit ? global.ALW.api.patch(formDef.endpoint(row), body_) : global.ALW.api.post(formDef.endpoint(null), body_);
          action
            .then(function () {
              modal.setBusy(false);
              modal.close();
              global.ALW.toast.success(isEdit ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح');
              refresh();
            })
            .catch(function (error) {
              modal.setBusy(false);
              var attached = formApi.showErrors(error);
              if (attached) global.ALW.toast.warning('تحقق من الحقول المُعلَّمة.');
              else global.ALW.toast.fromError(error);
            });
        },
      });

      modal.open();
      return modal;
    }

    /* -------------------------------- details ------------------------------- */
    function openDetail(row) {
      var detail = cfg.detail;
      if (!detail) return null;
      var body = document.createElement('div');
      body.className = 'stack';
      body.appendChild(global.ALW.feedback.inlineLoader('جارٍ تحميل التفاصيل…'));

      var modal = global.ALW.modal.create({
        title: detail.title ? detail.title(row) : 'التفاصيل',
        icon: detail.icon || 'file-text',
        size: detail.size || 'lg',
        content: body,
      });

      var loader = detail.load
        ? Promise.resolve(detail.load(row))
        : global.ALW.api.get(detail.endpoint ? detail.endpoint(row) : cfg.endpoint + '/' + row.id);

      loader
        .then(function (data) {
          var content = detail.render(data || row, { modal: modal, refresh: refresh, row: row });
          dom().mount(body, content || []);
          global.ALW.can.applyGates(body);
        })
        .catch(function (error) {
          dom().mount(body, global.ALW.feedback.errorState(error, function () {
            openDetail(row);
          }));
        });

      if (detail.footer) {
        detail.footer(modal, row).forEach(function (button) {
          if (!button) return;
          modal.foot.appendChild(button);
        });
      }

      modal.open();
      return modal;
    }

    /* ------------------------------- actions -------------------------------- */
    function runAction(action, row) {
      // An action may collect explicit input first (e.g. inventory adjustment, rejection reason).
      if (action.form) {
        openActionForm(action, row);
        return;
      }
      if (action.confirm) {
        global.ALW.modal
          .confirm({
            title: action.confirm.title || 'تأكيد العملية',
            message: action.confirm.message,
            details: action.confirm.details,
            tone: action.confirm.tone || 'warning',
            confirmLabel: action.confirm.confirmLabel || 'تأكيد',
            body: action.confirm.body,
            onConfirm: function () {
              return Promise.resolve(action.run(row)).then(function () {
                onActionSuccess(action);
              });
            },
          })
          .then(function (confirmed) {
            if (confirmed) onActionSuccess(action, true);
          });
      } else {
        Promise.resolve(action.run(row))
          .then(function () {
            onActionSuccess(action);
          })
          .catch(function (error) {
            global.ALW.toast.fromError(error);
          });
      }
    }

    function openActionForm(action, row) {
      var definition = typeof action.form === 'function' ? action.form(row) : action.form;
      var fields = typeof definition.fields === 'function' ? definition.fields(row) : definition.fields;
      var formApi = global.ALW.forms.form({ fields: fields, grid: true });
      if (definition.fromRow) {
        var initial = definition.fromRow(row) || {};
        Object.keys(initial).forEach(function (key) {
          var control = formApi.control(key);
          if (control) control.setValue(initial[key]);
        });
      }
      var body = document.createElement('div');
      if (definition.message) body.appendChild(ui().alertBox(definition.message, definition.tone || 'warning'));
      body.appendChild(formApi.node);

      var modal = global.ALW.modal.create({
        title: typeof definition.title === 'function' ? definition.title(row) : definition.title || action.label,
        icon: definition.icon || action.icon || 'edit',
        size: definition.size || 'sm',
        content: body,
      });

      modal.addFooterButton({ label: 'إلغاء', className: 'btn--secondary', onClick: function () { modal.close(); } });
      modal.addFooterButton({
        label: definition.submitLabel || 'تنفيذ',
        className: definition.submitClass || 'btn--primary',
        loading: true,
        onClick: function () {
          var values = formApi.values();
          var missing = global.ALW.forms.validateRequired(
            (fields || [])
              .filter(function (field) { return field.required; })
              .map(function (field) { return [field.name, values[field.name]]; }),
          );
          formApi.clearErrors();
          if (missing.length) {
            missing.forEach(function (name) {
              var control = formApi.control(name);
              if (control) {
                control.input.classList.add('input--invalid');
                global.ALW.forms.attachError(control.wrap, name, 'هذا الحقل مطلوب');
              }
            });
            global.ALW.toast.warning('يرجى تعبئة الحقول المطلوبة.');
            return;
          }
          modal.setBusy(true);
          var payload = definition.toBody ? definition.toBody(values, row) : values;
          var action_ = definition.submit
            ? Promise.resolve(definition.submit(row, values, payload))
            : (definition.method === 'patch'
              ? global.ALW.api.patch(definition.endpoint(row), payload)
              : global.ALW.api.post(definition.endpoint(row), payload));
          action_
            .then(function (result) {
              modal.setBusy(false);
              modal.close();
              global.ALW.toast.success(definition.successMessage || action.successMessage || 'تم تنفيذ العملية');
              if (typeof definition.onSuccess === 'function') definition.onSuccess(result, row);
              refresh();
            })
            .catch(function (error) {
              modal.setBusy(false);
              var attached = formApi.showErrors(error);
              if (!attached) global.ALW.toast.fromError(error);
            });
        },
      });
      modal.open();
      return modal;
    }


    function onActionSuccess(action, alreadyToasted) {
      if (!alreadyToasted) global.ALW.toast.success(action.successMessage || 'تم تنفيذ العملية');
      refresh();
      if (typeof action.afterRun === 'function') action.afterRun();
    }

    /* ---------------------------- row action bar ---------------------------- */
    /** editing needs <domain>.update — derived from the create permission unless declared */
    function editPermissionOf(formDef) {
      if (!formDef) return null;
      if (formDef.editPermission) return formDef.editPermission;
      var base = formDef.permission || '';
      return base.replace(/\.create$/, '.update') || null;
    }

    function actionsColumnDef() {
      return {
        key: '__actions',
        label: 'إجراءات',
        sortable: false,
        width: '150px',
        render: function (row) {
          return actionButtons(row);
        },
      };
    }

    function actionButtons(row) {
      var wrap = document.createElement('div');
      wrap.className = 'table__cell-actions';
      (cfg.rowActions || []).forEach(function (action) {
        if (action.visible && !action.visible(row)) return;
        if (action.permission && !global.ALW.can.can(action.permission)) return;
        var button = ui().iconButton(action.icon || 'edit', {
          title: action.label,
          onClick: function (event) {
            event.stopPropagation();
            runAction(action, row);
          },
        });
        if (button) wrap.appendChild(button);
      });
      if (cfg.detail) {
        var detailBtn = ui().iconButton('eye', {
          title: 'التفاصيل',
          onClick: function (event) {
            event.stopPropagation();
            openDetail(row);
          },
        });
        if (detailBtn) wrap.appendChild(detailBtn);
      }
      var canEditRow = cfg.form && (!cfg.form.editable || cfg.form.editable(row) !== false) &&
        global.ALW.can.can(editPermissionOf(cfg.form));
      if (canEditRow) {
        var edit = ui().iconButton('edit', {
          title: cfg.form.editLabel || 'تعديل',
          onClick: function (event) {
            event.stopPropagation();
            openForm(row);
          },
        });
        if (edit) wrap.appendChild(edit);
      }
      return wrap;
    }

    var api = {
      container: container,
      render: build,
      refresh: refresh,
      openForm: openForm,
      openDetail: openDetail,
      runAction: runAction,
      table: function () {
        return dt;
      },
      actionsColumn: actionsColumnDef,
    };

    return api;
  }

  var api = { create: createPage };

  global.ALW = global.ALW || {};
  global.ALW.resourcePage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
