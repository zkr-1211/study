/* 文档站运行时：树导航 / 路由 / 搜索 / 大纲 / 复制 / 灯箱 */
(function () {
  'use strict';
  var DATA = window.__DOCS_DATA__;
  var docs = DATA.docs;
  var groups = DATA.groups;
  var byKey = {};
  docs.forEach(function (d, i) { byKey[d.f] = i; });
  var gmap = {};
  var groupName = {};
  groups.forEach(function (g) { groupName[g.id] = g.name; });
  docs.forEach(function (d, i) {
    if (!gmap[d.g]) gmap[d.g] = [];
    gmap[d.g].push(i);
  });

  var treeEl = document.getElementById('tree');
  var resEl = document.getElementById('search-results');
  var inputEl = document.getElementById('search-input');
  var docBody = document.getElementById('doc-body');
  var docTitle = document.getElementById('doc-title');
  var docMeta = document.getElementById('doc-meta');
  var crumbEl = document.getElementById('crumb');
  var outlineEl = document.getElementById('outline');
  var pagerEl = document.getElementById('pager');
  var lbEl = document.getElementById('lightbox');
  var current = -1;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }
  function closeDrawer() { document.body.classList.remove('side-open'); }
  function hashFor(d) { return '#/' + encodeURIComponent(d.f); }

  /* ===== 侧边栏树 ===== */
  var COLLAPSE_KEY = 'xz-kb-collapsed-v1';
  var collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; } catch (e) {}
  function saveCollapsed() {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch (e) {}
  }
  function renderTree() {
    var html = '';
    groups.forEach(function (g) {
      var list = gmap[g.id] || [];
      if (!list.length) return;
      html += '<details class="group" data-g="' + esc(g.id) + '"' + (collapsed[g.id] ? '' : ' open') + '>' +
        '<summary><span class="chev"></span><span class="g-name">' + esc(g.name) + '</span>' +
        '<span class="g-count">' + list.length + '</span></summary>';
      list.forEach(function (i) {
        var d = docs[i];
        html += '<a class="doc-link" data-i="' + i + '" href="' + hashFor(d) + '">' + esc(d.t) + '</a>';
      });
      html += '</details>';
    });
    treeEl.innerHTML = html;
    Array.prototype.forEach.call(treeEl.querySelectorAll('details.group'), function (det) {
      det.addEventListener('toggle', function () {
        if (det.open) delete collapsed[det.dataset.g];
        else collapsed[det.dataset.g] = 1;
        saveCollapsed();
      });
    });
  }
  function setActive(i) {
    Array.prototype.forEach.call(treeEl.querySelectorAll('.doc-link.active'), function (a) {
      a.classList.remove('active');
    });
    var el = treeEl.querySelector('.doc-link[data-i="' + i + '"]');
    if (!el) return;
    el.classList.add('active');
    var det = el.parentNode;
    while (det && det.tagName !== 'DETAILS') det = det.parentNode;
    if (det && !det.open) det.open = true;
    if (det && el.getBoundingClientRect) {
      var r = el.getBoundingClientRect();
      var dr = det.getBoundingClientRect();
      if (r.top < dr.top || r.bottom > window.innerHeight) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  /* ===== 打开文档 ===== */
  function postProcess() {
    Array.prototype.forEach.call(docBody.querySelectorAll('table'), function (tb) {
      var w = document.createElement('div');
      w.className = 'table-wrap';
      tb.parentNode.insertBefore(w, tb);
      w.appendChild(tb);
    });
    Array.prototype.forEach.call(docBody.querySelectorAll('pre'), function (pre) {
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = '复制';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code') || pre;
        var text = code.innerText;
        var done = function (ok) {
          btn.textContent = ok ? '已复制' : '复制失败';
          setTimeout(function () { btn.textContent = '复制'; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        } else { done(false); }
      });
      pre.appendChild(btn);
    });
  }

  var spyHandler = null;
  function buildOutline() {
    if (spyHandler) { window.removeEventListener('scroll', spyHandler); spyHandler = null; }
    var heads = docBody.querySelectorAll('h2, h3');
    if (!heads.length) { outlineEl.innerHTML = ''; return; }
    var html = '<div class="outline-title">大纲</div>';
    Array.prototype.forEach.call(heads, function (h) {
      html += '<a class="' + (h.tagName === 'H3' ? 'lv3' : '') + '" data-t="' + h.id + '" href="#' + h.id + '">' + esc(h.textContent) + '</a>';
    });
    outlineEl.innerHTML = '<div class="outline-inner">' + html + '</div>';
    Array.prototype.forEach.call(outlineEl.querySelectorAll('a'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var t = document.getElementById(a.dataset.t);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    var links = outlineEl.querySelectorAll('a');
    var ticking = false;
    spyHandler = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var idx = 0;
        Array.prototype.forEach.call(heads, function (h, k) {
          if (h.getBoundingClientRect().top <= 90) idx = k;
        });
        Array.prototype.forEach.call(links, function (a, k) {
          a.classList.toggle('active', k === idx);
        });
      });
    };
    window.addEventListener('scroll', spyHandler, { passive: true });
    spyHandler();
  }

  function buildPager(i) {
    var prev = i > 0 ? docs[i - 1] : null;
    var next = i < docs.length - 1 ? docs[i + 1] : null;
    var html = '';
    html += prev
      ? '<a class="prev" href="' + hashFor(prev) + '"><span class="dir">上一篇</span><span class="ttl">' + esc(prev.t) + '</span></a>'
      : '<span class="ph"></span>';
    html += next
      ? '<a class="next" href="' + hashFor(next) + '"><span class="dir">下一篇</span><span class="ttl">' + esc(next.t) + '</span></a>'
      : '<span class="ph"></span>';
    pagerEl.innerHTML = html;
  }

  function openDoc(i) {
    if (i < 0 || i >= docs.length) return;
    current = i;
    var d = docs[i];
    document.title = d.t + ' · ' + DATA.title;
    docTitle.textContent = d.t;
    crumbEl.innerHTML = esc(groupName[d.g] || d.g) + ' <span class="sep">/</span> <b>' + esc(d.t) + '</b>';
    var meta = [];
    if (d.u) meta.push('<a href="' + esc(d.u) + '" target="_blank" rel="noopener">语雀原文 ↗</a>');
    if (d.x) meta.push('<span>导出日期 ' + esc(d.x) + '</span>');
    docMeta.innerHTML = meta.join('');
    docBody.innerHTML = d.h;
    postProcess();
    buildOutline();
    buildPager(i);
    setActive(i);
    window.scrollTo(0, 0);
    if (isMobile()) closeDrawer();
  }

  function route() {
    var key = '';
    if (location.hash.indexOf('#/') === 0) {
      try { key = decodeURIComponent(location.hash.slice(2)); } catch (e) {}
    }
    var i = Object.prototype.hasOwnProperty.call(byKey, key) ? byKey[key] : 0;
    openDoc(i);
  }
  window.addEventListener('hashchange', route);

  /* ===== 全文搜索 ===== */
  var searchIdx = null;
  function buildSearchIdx() {
    searchIdx = docs.map(function (d) {
      var div = document.createElement('div');
      div.innerHTML = d.h;
      var txt = (div.textContent || '').replace(/\s+/g, ' ').trim();
      return { t: d.t, lt: d.t.toLowerCase(), txt: txt, ltx: txt.toLowerCase() };
    });
  }
  function hl(s, q) {
    var lo = s.toLowerCase();
    var out = '', pos = 0, k = lo.indexOf(q);
    while (k !== -1) {
      out += esc(s.slice(pos, k)) + '<mark>' + esc(s.slice(k, k + q.length)) + '</mark>';
      pos = k + q.length;
      k = lo.indexOf(q, pos);
    }
    return out + esc(s.slice(pos));
  }
  function clearSearch() {
    inputEl.value = '';
    document.body.classList.remove('searching');
    resEl.innerHTML = '';
  }
  function runSearch() {
    var q = inputEl.value.trim().toLowerCase();
    if (!q) { clearSearch(); return; }
    if (!searchIdx) buildSearchIdx();
    var hits = [];
    for (var i = 0; i < searchIdx.length; i++) {
      var it = searchIdx[i];
      var ti = it.lt.indexOf(q);
      var ci = ti === -1 ? it.ltx.indexOf(q) : -1;
      if (ti !== -1 || ci !== -1) {
        var snip = '';
        if (ci !== -1) {
          var s = Math.max(0, ci - 32);
          snip = (s > 0 ? '…' : '') + it.txt.slice(s, ci + q.length + 60) + '…';
        }
        hits.push({ i: i, t: it.t, snip: snip, titleHit: ti !== -1 });
      }
    }
    hits.sort(function (a, b) { return (b.titleHit ? 1 : 0) - (a.titleHit ? 1 : 0); });
    document.body.classList.add('searching');
    var html = '';
    if (!hits.length) {
      html = '<div class="sr-empty">没有找到与「' + esc(inputEl.value.trim()) + '」相关的文档</div>';
    } else {
      html += '<div class="sr-count">共 ' + hits.length + ' 篇匹配' + (hits.length > 80 ? '（显示前 80）' : '') + '</div>';
      hits.slice(0, 80).forEach(function (h) {
        html += '<div class="sr-item" data-i="' + h.i + '">' +
          '<div class="sr-title">' + hl(h.t, q) + '</div>' +
          (h.snip ? '<div class="sr-snip">' + hl(h.snip, q) + '</div>' : '') +
          '</div>';
      });
    }
    resEl.innerHTML = html;
    Array.prototype.forEach.call(resEl.querySelectorAll('.sr-item'), function (el) {
      el.addEventListener('click', function () {
        var d = docs[+el.dataset.i];
        if (location.hash === hashFor(d)) route();
        else location.hash = hashFor(d);
      });
    });
  }
  var searchTimer = null;
  inputEl.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 130);
  });
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') clearSearch();
  });

  /* ===== 灯箱 ===== */
  docBody.addEventListener('click', function (e) {
    if (e.target && e.target.tagName === 'IMG') {
      lbEl.innerHTML = '';
      var im = document.createElement('img');
      im.src = e.target.src;
      im.alt = e.target.alt || '';
      lbEl.appendChild(im);
      lbEl.classList.add('open');
    }
  });
  lbEl.addEventListener('click', function () {
    lbEl.classList.remove('open');
    lbEl.innerHTML = '';
  });

  /* ===== 移动端抽屉 ===== */
  document.getElementById('menu-btn').addEventListener('click', function () {
    document.body.classList.toggle('side-open');
  });
  document.getElementById('mask').addEventListener('click', closeDrawer);

  /* ===== 键盘快捷键 ===== */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (e.key === 'Escape') {
      if (lbEl.classList.contains('open')) { lbEl.classList.remove('open'); lbEl.innerHTML = ''; return; }
      if (document.body.classList.contains('searching')) clearSearch();
      return;
    }
    if (e.key === '/' && !typing) {
      e.preventDefault();
      if (isMobile()) document.body.classList.add('side-open');
      inputEl.focus();
    }
  });

  /* ===== 初始化 ===== */
  renderTree();
  route();
  if (window.matchMedia('(min-width: 901px)').matches && inputEl.setAttribute) {
    inputEl.setAttribute('autofocus-hint', '');
  }
})();
