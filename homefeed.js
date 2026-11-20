/* 🔥 홈판 수집 — 네이버 모바일 홈(홈판)에 노출된 블로그 글 목록
   데이터: homefeed-data.js (실제 수집 스냅샷) */
(function () {
  'use strict';

  var DATA = window.HOMEFEED_DATA || null;
  var state = { cat: '전체', q: '' };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function num(n) {
    return (n == null || isNaN(n)) ? '-' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function items() {
    if (!DATA || !DATA.items) return [];
    return DATA.items;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return items().filter(function (it) {
      if (state.cat !== '전체' && it.cat !== state.cat) return false;
      if (!q) return true;
      return (it.title + ' ' + it.blogName + ' ' + it.blogId).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderChips() {
    var box = $('hfCats');
    if (!box) return;
    box.innerHTML = '';
    var all = items();
    var cats = (DATA && DATA.cats) ? DATA.cats : [];
    var counts = {};
    all.forEach(function (it) { counts[it.cat] = (counts[it.cat] || 0) + 1; });

    var list = ['전체'].concat(cats);
    list.forEach(function (c) {
      var b = el('button', 'chip' + (state.cat === c ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('role', 'button');
      b.innerHTML = '<span>' + c + '</span> <b style="opacity:.65;font-weight:700">' +
        (c === '전체' ? all.length : (counts[c] || 0)) + '</b>';
      b.addEventListener('click', function () {
        state.cat = c;
        renderChips();
        renderList();
      });
      box.appendChild(b);
    });
  }

  function renderList() {
    var wrap = $('hfList');
    if (!wrap) return;
    wrap.innerHTML = '';
    var rows = filtered();

    if (!rows.length) {
      wrap.appendChild(el('p', 'view-sub', '조건에 맞는 글이 없습니다.'));
      return;
    }

    rows.forEach(function (it, i) {
      var row = el('div', 'hf-row');

      var no = el('div', 'hf-no', String(i + 1));
      row.appendChild(no);

      var mid = el('div', 'hf-mid');
      var top = el('div', 'hf-top');
      top.appendChild(el('span', 'hf-cat', it.cat));
      var name = el('span', 'hf-name', it.blogName || it.blogId);
      name.title = it.blogTitle || it.blogId;
      top.appendChild(name);
      mid.appendChild(top);

      var a = el('a', 'hf-title', it.title);
      a.href = it.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      mid.appendChild(a);

      var sub = el('div', 'hf-sub');
      sub.appendChild(el('span', '', it.blogId));
      mid.appendChild(sub);

      row.appendChild(mid);

      var right = el('div', 'hf-visit');
      right.appendChild(el('b', '', num(it.visitToday)));
      right.appendChild(el('span', '', '오늘'));
      row.appendChild(right);

      wrap.appendChild(row);
    });
  }

  function csvCell(v) {
    var s = (v == null ? '' : String(v));
    s = s.replace(/"/g, '""');
    return '"' + s + '"';
  }

  function downloadCsv() {
    var rows = filtered();
    var head = ['순번', '카테고리', '블로그명', '블로그ID', '글제목', '원문 URL', '오늘 방문자', '누적 방문자', '수집시각'];
    var lines = [head.map(csvCell).join(',')];
    var t = fmtTime(DATA && DATA.collectedAt);
    rows.forEach(function (it, i) {
      lines.push([
        i + 1, it.cat, it.blogName, it.blogId, it.title, it.url,
        it.visitToday == null ? '-' : it.visitToday,
        it.visitTotal == null ? '-' : it.visitTotal,
        t
      ].map(csvCell).join(','));
    });

    var blob = new Blob(['\uFEFF' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8;' });
    var d = new Date();
    function p(x) { return (x < 10 ? '0' : '') + x; }
    var fname = 'naver-homefeed_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.csv';

    if (window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, fname);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function renderMeta() {
    var t = $('hfTime');
    if (t) t.textContent = fmtTime(DATA && DATA.collectedAt) + ' 수집';
    var s = $('hfSummary');
    if (s) {
      var counts = (DATA && DATA.counts) || {};
      var parts = [];
      Object.keys(counts).forEach(function (k) { parts.push(k + ' ' + counts[k]); });
      s.textContent = items().length + '건 · ' + parts.join(' · ');
    }
  }

  function init() {
    if (!$('view-homefeed')) return;
    renderMeta();
    renderChips();
    renderList();

    var q = $('hfSearch');
    if (q) {
      q.addEventListener('input', function () {
        state.q = q.value || '';
        renderList();
      });
    }
    var csv = $('hfCsv');
    if (csv) csv.addEventListener('click', downloadCsv);

    var re = $('hfRefresh');
    if (re) {
      re.addEventListener('click', function () {
        // 홈판은 네이버 개인화 화면이라 브라우저에서 바로 못 긁습니다.
        // 새 수집값은 homefeed-data.js 로 다시 배포됩니다.
        var msg = $('hfNote');
        if (msg) msg.style.display = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
