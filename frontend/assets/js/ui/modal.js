/**
 * alwled — Modal/Dialog موحّد + تأكيد + حالات (busy/success/error) مع منع الإغلاق أثناء التنفيذ.
 * يدعم: ESC للإغلاق، حصر التركيز داخل النافذة، إعادة التركيز للعنصر السابق.
 */
(function (global) {
  'use strict';

  var FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var openCount = 0;

  function createModal(options) {
    var opts = options || {};
    var dom = global.ALW.dom;
    var previousFocus = document.activeElement;
    var busy = false;
    var closed = false;
    var onClose = opts.onClose;

    var root = document.createElement('div');
    root.className = 'modal' + (opts.size ? ' modal--' + opts.size : '');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', opts.title || 'نافذة');

    var backdrop = document.createElement('div');
    backdrop.className = 'modal__backdrop';
    root.appendChild(backdrop);

    var panel = document.createElement('div');
    panel.className = 'modal__panel';
    root.appendChild(panel);

    var head = document.createElement('div');
    head.className = 'modal__head';
    var titleWrap = document.createElement('div');
    titleWrap.className = 'modal__title';
    if (opts.icon) titleWrap.appendChild(dom.icon(opts.icon, 'icon'));
    var titleText = document.createElement('span');
    titleText.textContent = opts.title || '';
    titleWrap.appendChild(titleText);
    head.appendChild(titleWrap);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal__close';
    closeBtn.setAttribute('aria-label', 'إغلاق');
    closeBtn.appendChild(dom.icon('x', 'icon'));
    closeBtn.addEventListener('click', function () {
      close();
    });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var body = document.createElement('div');
    body.className = 'modal__body';
    if (opts.content) body.appendChild(opts.content);
    panel.appendChild(body);

    var foot = document.createElement('div');
    foot.className = 'modal__foot';
    panel.appendChild(foot);

    function setBusy(isBusy) {
      busy = !!isBusy;
      root.classList.toggle('modal--busy', busy);
      closeBtn.disabled = busy;
      var buttons = panel.querySelectorAll('[data-modal-action]');
      Array.prototype.forEach.call(buttons, function (button) {
        button.disabled = busy || button.dataset.wasDisabled === 'true';
        var spinner = button.querySelector('.btn__spinner');
        if (spinner) spinner.hidden = !busy;
      });
    }

    function close() {
      if (closed || busy) return;
      closed = true;
      openCount -= 1;
      if (openCount <= 0) document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKeydown, true);
      if (root.parentNode) root.parentNode.removeChild(root);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      if (typeof onClose === 'function') onClose();
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab') {
        var nodes = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (node) {
          return node.offsetParent !== null;
        });
        if (!nodes.length) return;
        var first = nodes[0];
        var last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    function open() {
      document.body.appendChild(root);
      document.body.classList.add('no-scroll');
      openCount += 1;
      document.addEventListener('keydown', onKeydown, true);
      backdrop.addEventListener('click', function () {
        if (opts.closeOnBackdrop === false) return;
        close();
      });
      setTimeout(function () {
        var target = panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE);
        if (target) target.focus();
      }, 30);
      return api;
    }

    var api = {
      root: root,
      body: body,
      foot: foot,
      open: open,
      close: close,
      setBusy: setBusy,
      isBusy: function () {
        return busy;
      },
      setBody: function (node) {
        dom.mount(body, node);
        return api;
      },
      addFooterButton: function (config) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn ' + (config.className || 'btn--secondary');
        button.dataset.modalAction = config.action || 'action';
        if (config.disabled) {
          button.disabled = true;
          button.dataset.wasDisabled = 'true';
        }
        if (config.icon) button.appendChild(dom.icon(config.icon, 'icon'));
        var label = document.createElement('span');
        label.textContent = config.label || '';
        button.appendChild(label);
        if (config.loading) {
          var spinner = document.createElement('span');
          spinner.className = 'btn__spinner';
          spinner.hidden = true;
          button.appendChild(spinner);
        }
        button.addEventListener('click', function (event) {
          if (busy) return;
          if (typeof config.onClick === 'function') config.onClick(event, api);
        });
        foot.appendChild(button);
        return button;
      },
      setFooter: function (nodes) {
        dom.mount(foot, nodes);
        return api;
      },
    };

    return api;
  }

  /** تأكيد حساس: يعيد Promise<boolean>؛ لا يُغلق أثناء التنفيذ. */
  function confirm(options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      var dom = global.ALW.dom;
      var content = document.createElement('div');
      content.className = 'stack';
      if (opts.message) {
        var alertNode = document.createElement('div');
        alertNode.className = 'alert alert--' + (opts.tone || 'warning');
        var iconSpan = document.createElement('span');
        iconSpan.className = 'alert__icon';
        iconSpan.appendChild(dom.icon(opts.tone === 'danger' ? 'alert-triangle' : 'info', 'icon'));
        alertNode.appendChild(iconSpan);
        var messageWrap = document.createElement('div');
        var messageText = document.createElement('div');
        messageText.textContent = opts.message;
        messageWrap.appendChild(messageText);
        if (opts.details) {
          var details = document.createElement('div');
          details.className = 'text-xs muted mt-3';
          details.textContent = opts.details;
          messageWrap.appendChild(details);
        }
        alertNode.appendChild(messageWrap);
        content.appendChild(alertNode);
      }
      if (opts.body) content.appendChild(opts.body);

      var modal = createModal({
        title: opts.title || 'تأكيد العملية',
        icon: opts.icon || (opts.tone === 'danger' ? 'alert-triangle' : 'info'),
        size: 'sm',
        content: content,
        onClose: function () {
          resolve(false);
        },
      });

      modal.addFooterButton({
        label: opts.cancelLabel || 'إلغاء',
        className: 'btn--secondary',
        action: 'cancel',
        onClick: function () {
          resolve(false);
          modal.close();
        },
      });

      modal.addFooterButton({
        label: opts.confirmLabel || 'تأكيد',
        className: opts.tone === 'danger' ? 'btn--danger' : 'btn--primary',
        action: 'confirm',
        loading: true,
        onClick: function () {
          if (typeof opts.onConfirm === 'function') {
            var result = opts.onConfirm(modal);
            if (result && typeof result.then === 'function') {
              modal.setBusy(true);
              result.then(function () {
                modal.setBusy(false);
                resolve(true);
                modal.close();
              }).catch(function (error) {
                modal.setBusy(false);
                if (global.ALW.toast) global.ALW.toast.fromError(error);
              });
              return;
            }
          }
          resolve(true);
          modal.close();
        },
      });

      modal.open();
    });
  }

  var api = { create: createModal, confirm: confirm };

  global.ALW = global.ALW || {};
  global.ALW.modal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
