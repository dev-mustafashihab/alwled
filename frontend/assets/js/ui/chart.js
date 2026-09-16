/**
 * alwled — رسوم بيانية خفيفة بـSVG (بلا مكتبات خارجية أو CDN).
 * تُستخدم في Dashboard/Analytics لعرض السلاسل الزمنية والقيم.
 */
(function (global) {
  'use strict';

  function dom() {
    return global.ALW.dom;
  }

  var NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  /**
   * area/line chart.
   * points: [{ label, value, secondary? }]
   */
  function line(config) {
    var opts = config || {};
    var points = opts.points || [];
    var width = opts.width || 900;
    var height = opts.height || 260;
    var padding = { top: 16, right: 16, bottom: 34, left: 48 };
    var wrap = document.createElement('div');
    wrap.className = 'chart';
    wrap.style.position = 'relative';

    if (!points.length) {
      wrap.appendChild(global.ALW.feedback.empty(opts.emptyText || 'لا بيانات لعرضها في هذه الفترة.'));
      return wrap;
    }

    var max = points.reduce(function (acc, point) {
      return Math.max(acc, Number(point.value) || 0, Number(point.secondary) || 0);
    }, 0);
    if (max <= 0) max = 1;
    var plotW = width - padding.left - padding.right;
    var plotH = height - padding.top - padding.bottom;
    var stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: '100%',
      height: String(height),
      role: 'img',
      'aria-label': opts.ariaLabel || 'رسم بياني',
      preserveAspectRatio: 'none',
    });

    // grid + y labels
    for (var i = 0; i <= 4; i += 1) {
      var y = padding.top + (plotH / 4) * i;
      svg.appendChild(svgEl('line', {
        x1: padding.left, x2: width - padding.right, y1: y, y2: y,
        stroke: 'var(--border-subtle)', 'stroke-width': '1',
      }));
      var label = svgEl('text', {
        x: width - padding.right + 4, y: y + 4, 'font-size': '10',
        fill: 'var(--text-muted)', 'text-anchor': 'end',
      });
      label.textContent = String(Math.round(max - (max / 4) * i));
      svg.appendChild(label);
    }

    function pathFor(key) {
      var d = '';
      points.forEach(function (point, index) {
        var value = Number(point[key]) || 0;
        var x = padding.left + stepX * index;
        var y = padding.top + plotH - (value / max) * plotH;
        d += (index === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      });
      return d.trim();
    }

    var areaId = 'chart-fill-' + Math.random().toString(36).slice(2, 8);
    var defs = svgEl('defs', {});
    var gradient = svgEl('linearGradient', { id: areaId, x1: '0', y1: '0', x2: '0', y2: '1' });
    gradient.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'var(--brand-500)', 'stop-opacity': '0.35' }));
    gradient.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'var(--brand-500)', 'stop-opacity': '0.02' }));
    defs.appendChild(gradient);
    svg.appendChild(defs);

    var areaPath = pathFor('value');
    if (areaPath) {
      svg.appendChild(svgEl('path', {
        d: areaPath + ' L' + (padding.left + stepX * (points.length - 1)).toFixed(1) + ' ' + (padding.top + plotH) +
          ' L' + padding.left + ' ' + (padding.top + plotH) + ' Z',
        fill: 'url(#' + areaId + ')',
        stroke: 'none',
      }));
      svg.appendChild(svgEl('path', {
        d: areaPath, fill: 'none', stroke: 'var(--brand-500)', 'stroke-width': '2',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
    }
    if (points.some(function (point) { return point.secondary !== undefined; })) {
      svg.appendChild(svgEl('path', {
        d: pathFor('secondary'), fill: 'none', stroke: 'var(--accent-500)',
        'stroke-width': '2', 'stroke-dasharray': '4 4', 'stroke-linejoin': 'round',
      }));
    }

    // x labels (first / middle / last to avoid crowding)
    var labelIndexes = points.length <= 6
      ? points.map(function (_, index) { return index; })
      : [0, Math.floor((points.length - 1) / 2), points.length - 1];
    labelIndexes.forEach(function (index) {
      var point = points[index];
      if (!point) return;
      var text = svgEl('text', {
        x: padding.left + stepX * index,
        y: height - 12,
        'font-size': '10',
        fill: 'var(--text-muted)',
        'text-anchor': index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle',
      });
      text.textContent = point.label;
      svg.appendChild(text);
    });

    // hover targets with native tooltips
    points.forEach(function (point, index) {
      var circle = svgEl('circle', {
        cx: padding.left + stepX * index,
        cy: padding.top + plotH - ((Number(point.value) || 0) / max) * plotH,
        r: '3',
        fill: 'var(--bg-surface)',
        stroke: 'var(--brand-500)',
        'stroke-width': '2',
      });
      var title = svgEl('title', {});
      title.textContent = point.label + ' — ' + (opts.valueLabel || 'القيمة') + ': ' + (point.displayValue || point.value) +
        (point.secondaryDisplay ? ' · ' + (opts.secondaryLabel || 'ثانوي') + ': ' + point.secondaryDisplay : '');
      circle.appendChild(title);
      svg.appendChild(circle);
    });

    wrap.appendChild(svg);

    if (opts.legend) {
      var legend = document.createElement('div');
      legend.className = 'row text-xs muted';
      legend.style.marginTop = 'var(--space-2)';
      opts.legend.forEach(function (entry) {
        var item = document.createElement('span');
        item.className = 'row';
        item.style.gap = 'var(--space-2)';
        var swatch = document.createElement('span');
        swatch.style.width = '14px';
        swatch.style.height = '3px';
        swatch.style.borderRadius = '2px';
        swatch.style.background = entry.color;
        item.appendChild(swatch);
        var text = document.createElement('span');
        text.textContent = entry.label;
        item.appendChild(text);
        legend.appendChild(item);
      });
      wrap.appendChild(legend);
    }
    return wrap;
  }

  var api = { line: line };

  global.ALW = global.ALW || {};
  global.ALW.chart = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
