/**
 * alwled — DataTable قابل لإعادة الاستخدام: بحث + فلاتر + ترتيب + صفحات + حالات
 * (تحميل/فراغ/خطأ) + إجراءات صفوف + وضع بطاقات على الشاشات الصغيرة.
 * كل الجداول في اللوحة تُبنى من هذا المكوّن.
 */
(function (global) {
  'use strict';

  function dom() {
    return global.ALW.dom;
  }

  function create(config) {
    var opts = config || {};
    var columns = opts.columns || [];
    // when the endpoint does not support server-side ordering, never send sortBy/sortOrder
    var serverSort = opts.serverSort !== false;
    var state = {
      page: 1,
      limit: opts.pageSize || (global.ALW.config ? global.ALW.config.defaultPageSize : 20),
      sortBy: opts.defaultSort ? opts.defaultSort.by : null,
      sortOrder: opts.defaultSort ? opts.defaultSort.order : 'desc',
      search: '',
      filters: Object.assign({}, opts.initialFilters || {}),
      status: 'loading',
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      error: null,
    };

    var root = document.createElement('div');
    root.className = 'card';
    var toolbar = document.createElement('div');
    toolbar.className = 'card__body';
    toolbar.style.paddingBottom = '0';
    var body = document.createElement('div');
    body.className = 'card__body';
    body.style.paddingTop = 'var(--space-3)';
    root.appendChild(toolbar);
    root.appendChild(body);

    // ------------------------------- toolbar --------------------------------
    var toolbarRow = document.createElement('div');
    toolbarRow.className = 'toolbar';
    toolbar.appendChild(toolbarRow);

    var searchWrap = null;
    if (opts.search !== false) {
      searchWrap = document.createElement('div');
      searchWrap.className = 'toolbar__search';
      var group = document.createElement('div');
      group.className = 'input-group';
      var icon = document.createElement('span');
      icon.className = 'input-group__icon';
      icon.appendChild(dom().icon('search', 'icon icon--sm'));
      group.appendChild(icon);
      var searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'input';
      searchInput.placeholder = opts.searchPlaceholder || 'بحث…';
      searchInput.setAttribute('aria-label', 'بحث');
      searchInput.addEventListener(
        'input',
        dom().debounce(function () {
          state.search = searchInput.value.trim();
          state.page = 1;
          load();
        }, 350),
      );
      group.appendChild(searchInput);
      searchWrap.appendChild(group);
      toolbarRow.appendChild(searchWrap);
    }

    var filtersWrap = document.createElement('div');
    filtersWrap.className = 'toolbar__filters';
    toolbarRow.appendChild(filtersWrap);

    (opts.filters || []).forEach(function (filter) {
      var field = document.createElement('select');
      field.className = 'select';
      field.style.minWidth = '150px';
      field.style.width = 'auto';
      field.setAttribute('aria-label', filter.label);
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = filter.placeholder || filter.label;
      field.appendChild(placeholder);
      (filter.options || []).forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.value;
        node.textContent = option.label;
        field.appendChild(node);
      });
      if (state.filters[filter.key] !== undefined) field.value = state.filters[filter.key];
      field.addEventListener('change', function () {
        if (field.value) state.filters[filter.key] = field.value;
        else delete state.filters[filter.key];
        state.page = 1;
        load();
      });
      filtersWrap.appendChild(field);
    });

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'filter-reset';
    resetBtn.appendChild(dom().icon('refresh', 'icon icon--sm'));
    var resetLabel = document.createElement('span');
    resetLabel.textContent = 'تفريغ الفلاتر';
    resetBtn.appendChild(resetLabel);
    resetBtn.addEventListener('click', function () {
      state.filters = {};
      state.search = '';
      if (searchWrap) {
        var input = searchWrap.querySelector('input');
        if (input) input.value = '';
      }
      filtersWrap.querySelectorAll('select').forEach(function (select) {
        select.value = '';
      });
      state.page = 1;
      load();
    });
    filtersWrap.appendChild(resetBtn);

    var spacer = document.createElement('div');
    spacer.className = 'toolbar__spacer';
    toolbarRow.appendChild(spacer);

    var actionsWrap = document.createElement('div');
    actionsWrap.className = 'btn-group';
    toolbarRow.appendChild(actionsWrap);
    if (opts.actions) {
      opts.actions.forEach(function (action) {
        actionsWrap.appendChild(action);
      });
    }

    // -------------------------------- render --------------------------------
    function renderLoading() {
      dom().mount(body, global.ALW.feedback.skeletonRows(8));
    }

    function renderError(error) {
      dom().mount(
        body,
        global.ALW.feedback.errorState(error, function () {
          load();
        }),
      );
    }

    function renderEmpty() {
      dom().mount(body, global.ALW.feedback.empty(opts.emptyText || 'لا توجد عناصر لعرضها.', opts.emptyTitle));
    }

    function cellFor(row, column) {
      var td = document.createElement('td');
      if (column.cardLabel !== false) td.setAttribute('data-label', column.label || '');
      if (column.className) td.className = column.className;
      if (typeof column.render === 'function') {
        var out = column.render(row);
        if (out === null || out === undefined || out === false) return td;
        td.appendChild(typeof out === 'string' ? document.createTextNode(out) : out);
        return td;
      }
      var value = column.key ? row[column.key] : '';
      td.textContent = value === null || value === undefined ? '—' : String(value);
      return td;
    }

    function renderRows() {
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap table-wrap--cards';
      var table = document.createElement('table');
      table.className = 'table' + (opts.compact ? ' table--compact' : '');

      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      columns.forEach(function (column) {
        var th = document.createElement('th');
        if (column.width) th.style.width = column.width;
        var sortable = serverSort && column.sortable !== false && !!column.key;
        if (sortable) {
          th.classList.add('is-sortable');
          th.setAttribute('tabindex', '0');
          th.setAttribute('role', 'button');
          var ariaSort = state.sortBy === column.key ? (state.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none';
          th.setAttribute('aria-sort', ariaSort);
          var inner = document.createElement('span');
          inner.className = 'table__sort';
          var label = document.createElement('span');
          label.textContent = column.label || '';
          inner.appendChild(label);
          var sortIcon = dom().icon(state.sortBy === column.key && state.sortOrder === 'asc' ? 'chevron-up' : 'chevron-down', 'icon icon--sm table__sort-icon');
          inner.appendChild(sortIcon);
          th.appendChild(inner);
          function toggleSort() {
            if (state.sortBy === column.key) {
              state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
              state.sortBy = column.key;
              state.sortOrder = column.defaultOrder || 'desc';
            }
            state.page = 1;
            load();
          }
          th.addEventListener('click', toggleSort);
          th.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleSort();
            }
          });
        } else {
          th.textContent = column.label || '';
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      state.items.forEach(function (row) {
        var tr = document.createElement('tr');
        if (opts.onRowClick) {
          tr.classList.add('table__row--clickable');
          tr.addEventListener('click', function (event) {
            if (event.target.closest('button, a, input, select, label')) return;
            opts.onRowClick(row);
          });
        }
        columns.forEach(function (column) {
          tr.appendChild(cellFor(row, column));
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      dom().mount(body, [wrap, renderPagination()]);
    }

    function renderPagination() {
      var meta = state.meta || {};
      var totalPages = Math.max(1, meta.totalPages || 1);
      var bar = document.createElement('div');
      bar.className = 'pagination';

      var info = document.createElement('div');
      info.className = 'pagination__info';
      var from = meta.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
      var to = Math.min(state.page * state.limit, meta.total || 0);
      info.textContent = 'عرض ' + from + '–' + to + ' من ' + (meta.total || 0);
      bar.appendChild(info);

      var pages = document.createElement('div');
      pages.className = 'pagination__pages';

      function pageButton(label, page, options) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'pagination__btn' + (options && options.active ? ' pagination__btn--active' : '');
        button.textContent = label;
        if (options && options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
        if (options && options.disabled) {
          button.disabled = true;
          return button;
        }
        button.addEventListener('click', function () {
          state.page = page;
          load();
        });
        return button;
      }

      var prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'pagination__btn';
      prev.setAttribute('aria-label', 'الصفحة السابقة');
      prev.appendChild(dom().icon('chevron-right', 'icon icon--sm'));
      prev.disabled = state.page <= 1;
      prev.addEventListener('click', function () {
        state.page = Math.max(1, state.page - 1);
        load();
      });
      pages.appendChild(prev);

      var windowStart = Math.max(1, state.page - 2);
      var windowEnd = Math.min(totalPages, windowStart + 4);
      if (windowStart > 1) pages.appendChild(pageButton('1', 1, { active: state.page === 1 }));
      if (windowStart > 2) pages.appendChild(document.createTextNode('…'));
      for (var page = windowStart; page <= windowEnd; page += 1) {
        pages.appendChild(pageButton(String(page), page, { active: page === state.page }));
      }
      if (windowEnd < totalPages - 1) pages.appendChild(document.createTextNode('…'));
      if (windowEnd < totalPages) pages.appendChild(pageButton(String(totalPages), totalPages, { active: state.page === totalPages }));

      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'pagination__btn';
      next.setAttribute('aria-label', 'الصفحة التالية');
      next.appendChild(dom().icon('chevron-left', 'icon icon--sm'));
      next.disabled = state.page >= totalPages;
      next.addEventListener('click', function () {
        state.page = Math.min(totalPages, state.page + 1);
        load();
      });
      pages.appendChild(next);
      bar.appendChild(pages);

      var sizeWrap = document.createElement('div');
      sizeWrap.className = 'pagination__size';
      var sizeLabel = document.createElement('span');
      sizeLabel.textContent = 'لكل صفحة';
      sizeWrap.appendChild(sizeLabel);
      var sizeSelect = document.createElement('select');
      sizeSelect.className = 'select';
      sizeSelect.setAttribute('aria-label', 'عدد العناصر في الصفحة');
      ((global.ALW.config && global.ALW.config.pageSizes) || [10, 20, 50]).forEach(function (size) {
        var option = document.createElement('option');
        option.value = size;
        option.textContent = size;
        if (Number(state.limit) === Number(size)) option.selected = true;
        sizeSelect.appendChild(option);
      });
      sizeSelect.addEventListener('change', function () {
        state.limit = Number(sizeSelect.value);
        state.page = 1;
        load();
      });
      sizeWrap.appendChild(sizeSelect);
      bar.appendChild(sizeWrap);

      return bar;
    }

    // --------------------------------- load ---------------------------------
    var requestToken = 0;

    function load() {
      var token = ++requestToken;
      state.status = 'loading';
      renderLoading();
      var params = Object.assign(
        {
          page: state.page,
          limit: state.limit,
        },
        state.search ? { search: state.search } : {},
        serverSort && state.sortBy ? { sortBy: state.sortBy, sortOrder: state.sortOrder } : {},
        state.filters,
      );
      return Promise.resolve(opts.load(params))
        .then(function (result) {
          if (token !== requestToken) return;
          var items = Array.isArray(result) ? result : (result && result.items) || [];
          var meta = (result && result.meta) || { page: state.page, limit: state.limit, total: items.length, totalPages: 1 };
          state.items = items;
          state.meta = meta;
          state.status = 'ready';
          if (opts.onLoaded) opts.onLoaded(result);
          if (!items.length) renderEmpty();
          else renderRows();
        })
        .catch(function (error) {
          if (token !== requestToken) return;
          state.status = 'error';
          state.error = error;
          renderError(error);
          if (opts.onError) opts.onError(error);
        });
    }

    return {
      node: root,
      load: load,
      refresh: load,
      state: function () {
        return state;
      },
      setFilter: function (key, value) {
        if (value === null || value === undefined || value === '') delete state.filters[key];
        else state.filters[key] = value;
        state.page = 1;
        return load();
      },
      setPage: function (page) {
        state.page = page;
        return load();
      },
      search: function (term) {
        state.search = term || '';
        state.page = 1;
        return load();
      },
      items: function () {
        return state.items;
      },
      toolbar: toolbarRow,
      body: body,
    };
  }

  var api = { create: create };

  global.ALW = global.ALW || {};
  global.ALW.datatable = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
