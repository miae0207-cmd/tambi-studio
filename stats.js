/* 탐비 블로그 스튜디오 — 📊 통계 리포트 탭
   데이터는 stats.json 에서 읽고, 실패하면 stats-data.js 스냅샷으로 그립니다.
   캡처가 오면 stats.json 의 daily / sources / posts 숫자만 바꾸면 KPI·차트가 함께 갱신됩니다. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var TYPE_COLOR = {
    home: '#7C3AED',
    air: '#2FA98F',
    issue: '#E9A23B',
    review: '#5B8DEF'
  };
  var TYPE_CLASS = {
    home: 't-home',
    air: 't-air',
    issue: 't-issue',
    review: 't-review'
  };
  var SRC_COLOR = ['#7C3AED', '#2FA98F', '#E9A23B', '#B9B2C9'];

  var DATA = null;

  function fmt(n) {
    var v = Math.round(Number(n) || 0);
    return v.toLocaleString('ko-KR');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function typeLabel(k) {
    var list = (DATA && DATA.types) || [];
    for (var i = 0; i < list.length; i++) if (list[i].k === k) return list[i].label;
    return '기타';
  }
  function typeColor(k) { return TYPE_COLOR[k] || '#B9B2C9'; }
  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  /* ---------------- header ---------------- */
  function renderHead() {
    var p = DATA.period || {};
    var t = $('statTitle');
    if (t) t.textContent = p.label || '주간 리포트';

    var parts = [];
    if (DATA.blogName) parts.push(DATA.blogName);
    parts.push(DATA.source || ((DATA.blogLabel || '드라마') + ' · 네이버 블로그 통계 캡처 기준'));
    if (p.note) parts.push(p.note);
    parts.push('업데이트 ' + shortWhen(DATA.updated));

    var m = $('statMeta');
    if (m) {
      m.innerHTML = parts.map(function (x) { return esc(x); }).join('<span class="rh-dot">·</span>') +
        (DATA.sample ? '<span class="sample-chip">샘플</span>' : '');
    }

    var b = $('statBanner');
    if (b) {
      if (DATA.sample && DATA.banner) {
        b.hidden = false;
        b.innerHTML = '<b>샘플 리포트 화면</b><span>' +
          esc(String(DATA.banner).replace(/^샘플 리포트 화면\s*·\s*/, '')) + '</span>';
      } else {
        b.hidden = true;
        b.innerHTML = '';
      }
    }
  }

  function shortWhen(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var mm = d.getMonth() + 1, dd = d.getDate();
    var hh = d.getHours(), mi = d.getMinutes();
    return (mm < 10 ? '0' + mm : mm) + '/' + (dd < 10 ? '0' + dd : dd) + ' ' +
      (hh < 10 ? '0' + hh : hh) + ':' + (mi < 10 ? '0' + mi : mi);
  }

  /* ---------------- kpi ---------------- */
  function totals() {
    var daily = DATA.daily || [];
    var total = 0, best = null;
    daily.forEach(function (d) {
      var v = num(d.views, 0);
      total += v;
      if (!best || v > num(best.views, 0)) best = d;
    });
    var posts = (DATA.posts || []).slice().sort(function (a, b) {
      return num(b.views, 0) - num(a.views, 0);
    });
    return {
      daily: daily,
      total: total,
      avg: daily.length ? Math.round(total / daily.length) : 0,
      best: best,
      posts: posts,
      top: posts[0] || null,
      topPct: total && posts[0] ? (num(posts[0].views, 0) / total) * 100 : 0
    };
  }

  function renderKpi(t) {
    var box = $('statKpi');
    if (!box) return;
    var cards = [
      { label: '한 주 조회수', value: fmt(t.total), note: t.daily.length + '일 합계', hi: true },
      { label: '하루 평균', value: fmt(t.avg), note: t.daily.length + '일 평균' },
      {
        label: '가장 많이 본 날',
        value: t.best ? fmt(t.best.views) : '-',
        note: t.best ? (t.best.date || '') + ' ' + (t.best.day || '') + '요일' : ''
      },
      {
        label: '1위 글 조회수',
        value: t.top ? fmt(t.top.views) : '-',
        note: t.top ? '주 조회수 중 ' + t.topPct.toFixed(1) + '%' : ''
      }
    ];
    box.innerHTML = cards.map(function (c) {
      return '<div class="kpi' + (c.hi ? ' hi' : '') + '">' +
        '<span class="kpi-label">' + esc(c.label) + '</span>' +
        '<strong class="kpi-value">' + esc(c.value) + '</strong>' +
        '<span class="kpi-note">' + esc(c.note) + '</span>' +
        '</div>';
    }).join('');
  }

  /* ---------------- week bar chart ---------------- */
  function barPath(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return 'M' + x + ',' + (y + h) +
      'V' + (y + r) +
      'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) +
      'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'V' + (y + h) + 'Z';
  }

  function renderWeek(t) {
    var host = $('weekChart');
    var legend = $('weekLegend');
    if (!host) return;
    var daily = t.daily;
    if (!daily.length) {
      host.innerHTML = '<p class="chart-empty">요일별 숫자가 아직 없어요.</p>';
      return;
    }

    var W = 300, H = 170, padT = 22, baseY = 128, left = 2, right = 2;
    var slot = (W - left - right) / daily.length;
    var maxV = 0;
    daily.forEach(function (d) { maxV = Math.max(maxV, num(d.views, 0)); });
    var scaleMax = maxV * 1.1 || 1;
    var maxH = baseY - padT;
    var barW = Math.min(26, slot * 0.58);
    var peakIdx = -1;
    daily.forEach(function (d, i) { if (num(d.views, 0) === maxV) peakIdx = i; });

    var s = '<svg class="week-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="요일별 조회수 막대 차트">';
    s += '<defs>' +
      '<linearGradient id="barSoft" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#B79CF9"/><stop offset="100%" stop-color="#8B5CF6"/>' +
      '</linearGradient>' +
      '<linearGradient id="barPeak" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#5B21B6"/>' +
      '</linearGradient>' +
      '</defs>';

    /* baseline */
    s += '<line x1="' + left + '" y1="' + baseY + '" x2="' + (W - right) + '" y2="' + baseY +
      '" stroke="#EDE7F8" stroke-width="1.2"/>';

    /* average line */
    var avgY = baseY - (t.avg / scaleMax) * maxH;
    s += '<line x1="' + left + '" y1="' + avgY.toFixed(1) + '" x2="' + (W - right) + '" y2="' +
      avgY.toFixed(1) + '" stroke="#A99CD0" stroke-width="1.2" stroke-dasharray="4 4"/>';

    daily.forEach(function (d, i) {
      var v = num(d.views, 0);
      var h = Math.max(3, (v / scaleMax) * maxH);
      var x = left + slot * i + (slot - barW) / 2;
      var y = baseY - h;
      var peak = i === peakIdx;
      s += '<path d="' + barPath(+x.toFixed(1), +y.toFixed(1), +barW.toFixed(1), +h.toFixed(1), 6) +
        '" fill="url(#' + (peak ? 'barPeak' : 'barSoft') + ')"/>';
      s += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) +
        '" text-anchor="middle" font-size="10.5" font-weight="800" fill="' +
        (peak ? '#5B21B6' : '#5B5370') + '" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">' +
        esc(fmt(v)) + '</text>';
      s += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (baseY + 17) +
        '" text-anchor="middle" font-size="11" font-weight="800" fill="' +
        (peak ? '#6D28D9' : '#5B5370') + '">' + esc(d.day || '') + '</text>';
      s += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (baseY + 30) +
        '" text-anchor="middle" font-size="9.5" fill="#8E86A3">' + esc(d.date || '') + '</text>';
    });
    s += '</svg>';
    host.innerHTML = s;

    if (legend) {
      legend.innerHTML =
        '<span class="lg"><i class="lg-dot"></i>이번 주</span>' +
        '<span class="lg"><i class="lg-dash"></i>평균 ' + esc(fmt(t.avg)) + '</span>';
    }
  }

  /* ---------------- donut ---------------- */
  function donutSvg(segs, centerMain, centerSub) {
    var R = 47, SW = 18, C = 2 * Math.PI * R;
    var gap = 2.2;
    var out = '<svg class="donut-svg" viewBox="0 0 120 120" role="img" ' +
      'aria-label="' + esc(centerMain + ' ' + centerSub) + '">';
    out += '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="#F3EEFD" stroke-width="' + SW + '"/>';
    var off = 0;
    segs.forEach(function (g) {
      var len = (g.pct / 100) * C;
      if (len <= 0.4) { off += len; return; }
      var dash = Math.max(len - gap, 0.4);
      out += '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + g.color +
        '" stroke-width="' + SW + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + (C - dash).toFixed(2) +
        '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 60 60)"/>';
      off += len;
    });
    out += '<text x="60" y="58" text-anchor="middle" font-size="21" font-weight="800" fill="#2E2540">' +
      esc(centerMain) + '</text>';
    out += '<text x="60" y="74" text-anchor="middle" font-size="9.5" font-weight="700" fill="#8E86A3">' +
      esc(centerSub) + '</text>';
    out += '</svg>';
    return out;
  }

  function renderSources() {
    var host = $('sourceChart');
    if (!host) return;
    var src = DATA.sources || [];
    if (!src.length) { host.innerHTML = '<p class="chart-empty">유입 자료가 아직 없어요.</p>'; return; }

    var totalPct = 0;
    src.forEach(function (s) { totalPct += num(s.pct, 0); });
    var scale = totalPct > 0 && Math.abs(totalPct - 100) > 0.5 ? 100 / totalPct : 1;
    var segs = src.map(function (s, i) {
      return { label: s.label, pct: num(s.pct, 0) * scale, raw: num(s.pct, 0), color: SRC_COLOR[i % SRC_COLOR.length] };
    });
    var top = segs.slice().sort(function (a, b) { return b.pct - a.pct; })[0];

    var rows = segs.map(function (s) {
      return '<li><i class="ld" style="background:' + s.color + '"></i>' +
        '<span class="ll">' + esc(s.label) + '</span>' +
        '<b class="lv">' + s.raw.toFixed(1) + '%</b></li>';
    }).join('');

    host.innerHTML = '<div class="donut-wrap">' +
      '<div class="donut-box">' + donutSvg(segs, Math.round(top.pct) + '%', top.label) + '</div>' +
      '<ul class="donut-legend">' + rows + '</ul>' +
      '</div>';
  }

  function renderTypes(t) {
    var host = $('typeChart');
    if (!host) return;
    var order = (DATA.types || []).slice();
    if (!order.length) { host.innerHTML = '<p class="chart-empty">글 유형이 아직 없어요.</p>'; return; }

    var sum = {};
    var total = 0;
    t.posts.forEach(function (p) {
      var k = p.type || 'other';
      sum[k] = (sum[k] || 0) + num(p.views, 0);
      total += num(p.views, 0);
    });
    if (!total) { host.innerHTML = '<p class="chart-empty">글 목록이 아직 없어요.</p>'; return; }

    var segs = order.map(function (o) {
      return {
        key: o.k,
        label: o.label || typeLabel(o.k),
        value: sum[o.k] || 0,
        pct: ((sum[o.k] || 0) / total) * 100,
        color: typeColor(o.k)
      };
    }).filter(function (g) { return g.pct > 0; });

    var top = segs.slice().sort(function (a, b) { return b.value - a.value; })[0];

    var rows = segs.map(function (g) {
      return '<li><i class="ld" style="background:' + g.color + '"></i>' +
        '<span class="ll">' + esc(g.label) + '</span>' +
        '<b class="lv">' + esc(fmt(g.value)) + ' · ' + Math.round(g.pct) + '%</b></li>';
    }).join('');

    host.innerHTML = '<div class="donut-wrap">' +
      '<div class="donut-box">' + donutSvg(segs, Math.round(top.pct) + '%', top.label) + '</div>' +
      '<ul class="donut-legend">' + rows + '</ul>' +
      '</div>';
  }

  /* ---------------- rank list ---------------- */
  function rankRow(p, i, maxV) {
    var v = num(p.views, 0);
    var w = maxV ? Math.max(2, (v / maxV) * 100) : 0;
    var k = p.type || 'other';
    return '<li class="rank-row">' +
      '<span class="rk' + (i === 0 ? ' top' : '') + '">' + (i + 1) + '</span>' +
      '<div class="rb">' +
      '<div class="r-head">' +
      '<span class="tbadge ' + (TYPE_CLASS[k] || 't-etc') + '">' +
      esc((findType(k) || {}).label || '기타') + '</span>' +
      '<b class="r-views">' + esc(fmt(v)) + '</b>' +
      '</div>' +
      '<p class="r-title">' + esc(p.title || '') + '</p>' +
      '<div class="r-track"><i style="width:' + w.toFixed(1) + '%;background:' + typeColor(k) + '"></i></div>' +
      '</div>' +
      '</li>';
  }

  function findType(k) {
    var list = (DATA.types || []);
    for (var i = 0; i < list.length; i++) if (list[i].k === k) return list[i];
    return null;
  }

  function renderRanks(t) {
    var host = $('rankList');
    if (!host) return;
    var posts = t.posts;
    if (!posts.length) { host.innerHTML = '<p class="chart-empty">글 목록이 아직 없어요.</p>'; return; }

    var maxV = num(posts[0].views, 0);
    var head = posts.slice(0, 6);
    var rest = posts.slice(6);

    var html = '<ol class="rank-list">' + head.map(function (p, i) {
      return rankRow(p, i, maxV);
    }).join('') + '</ol>';

    if (rest.length) {
      html += '<details class="more-posts"><summary>나머지 ' + rest.length + '편 더 보기</summary>' +
        '<ol class="rank-list">' + rest.map(function (p, i) {
          return rankRow(p, i + head.length, maxV);
        }).join('') + '</ol></details>';
    }
    host.innerHTML = html;
  }

  /* ---------------- 크리에이터 어드바이저 ---------------- */
  var ADV = null;
  var advGroup = 0;

  var ADV_JUMP = [
    { id: 'advRevenueCard', label: '💰 예상수익' },
    { id: 'advRisingCard', label: '🔥 급상승' },
    { id: 'advAudienceCard', label: '👥 독자' },
    { id: 'advSearchCard', label: '🔎 검색어' },
    { id: 'advLastCard', label: '📌 지난주 인기' },
    { id: 'advMainCard', label: '🏆 메인 TOP20' }
  ];

  function siblingUp(e, attr) {
    attr = attr || 'data-adv';
    var t = e.target;
    while (t && t !== document) {
      if (t.getAttribute && t.getAttribute(attr) != null) return t;
      t = t.parentNode;
    }
    return null;
  }

  /* --- 방문 통계 ↔ 어드바이저 세그먼트 --- */
  function setPane(name) {
    var seg = $('statSeg');
    if (seg) {
      var btns = seg.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-pane') === name;
        if (on) btns[i].classList.add('on'); else btns[i].classList.remove('on');
        btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }
    var b = $('paneBasic'), a = $('paneAdv');
    if (b) b.hidden = name !== 'basic';
    if (a) a.hidden = name !== 'adv';
  }

  function initSeg() {
    var seg = $('statSeg');
    if (!seg) return;
    seg.onclick = function (e) {
      var btn = siblingUp(e, 'data-pane');
      if (!btn) return;
      setPane(btn.getAttribute('data-pane'));
    };
  }

  function renderAdvBand() {
    var sub = $('advBandSub');
    if (sub) {
      if (ADV) {
        var bits = [];
        if (ADV.dayLabel) bits.push(ADV.dayLabel + ' 기준');
        bits.push('네이버가 직접 집계한 값');
        if (ADV.channel) bits.push(ADV.channel);
        sub.textContent = bits.join(' · ');
      } else {
        sub.textContent = '자료를 아직 불러오지 못했어요';
      }
    }

    var jump = $('advJump');
    if (!jump) return;
    jump.innerHTML = ADV_JUMP.map(function (j) {
      return '<button type="button" data-adv="' + j.id + '">' + esc(j.label) + '</button>';
    }).join('');
    jump.onclick = function (e) {
      var btn = siblingUp(e);
      if (!btn) return;
      var el = $(btn.getAttribute('data-adv'));
      if (!el) return;
      if (el.scrollIntoView) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch (err) { el.scrollIntoView(); }
      }
    };
  }

  /* --- 예상수익 미니 막대 --- */
  function moneyChart(daily) {
    var W = 300, H = 128, padT = 19, baseY = 94, left = 2, right = 2;
    var slot = (W - left - right) / daily.length;
    var maxV = 0;
    daily.forEach(function (d) { maxV = Math.max(maxV, num(d.won, 0)); });
    var scaleMax = maxV * 1.06 || 1;
    var maxH = baseY - padT;
    var barW = Math.min(24, slot * 0.58);

    var s = '<svg class="week-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 7일 예상수익 막대 차트">';
    s += '<defs>' +
      '<linearGradient id="moneySoft" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#C4A9FB"/><stop offset="100%" stop-color="#9F7CF4"/>' +
      '</linearGradient>' +
      '<linearGradient id="moneyPeak" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#5B21B6"/>' +
      '</linearGradient>' +
      '</defs>';
    s += '<line x1="' + left + '" y1="' + baseY + '" x2="' + (W - right) + '" y2="' + baseY +
      '" stroke="#EDE7F8" stroke-width="1.2"/>';

    daily.forEach(function (d, i) {
      var pending = d.won === null || d.won === undefined;
      var v = num(d.won, 0);
      var h = pending ? 2 : (v > 0 ? Math.max(3, (v / scaleMax) * maxH) : 2);
      var x = left + slot * i + (slot - barW) / 2;
      var y = baseY - h;
      var last = i === daily.length - 1;
      s += '<path d="' + barPath(+x.toFixed(1), +y.toFixed(1), +barW.toFixed(1), +h.toFixed(1), 6) +
        '" fill="url(#' + (last ? 'moneyPeak' : 'moneySoft') + '" opacity="' + (pending ? '0.35' : '1') + '"/>';
      s += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) +
        '" text-anchor="middle" font-size="9" font-weight="800" fill="' +
        (last ? '#5B21B6' : '#6B6283') + '" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">' +
        esc(pending ? '집계 전' : fmt(v)) + '</text>';
      s += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (baseY + 14) +
        '" text-anchor="middle" font-size="10" font-weight="800" fill="' +
        (last ? '#6D28D9' : '#5B5370') + '">' + esc(d.day || '') + '</text>';
      s += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (baseY + 26) +
        '" text-anchor="middle" font-size="8.5" fill="#8E86A3">' + esc(d.date || '') + '</text>';
    });
    s += '</svg>';
    return s;
  }

  function renderRevenue() {
    var host = $('advRevenue');
    if (!host) return;
    var r = ADV && ADV.revenue;
    if (!r) { host.innerHTML = '<p class="chart-empty">수익 자료를 아직 불러오지 못했어요.</p>'; return; }

    var up = num(r.delta, 0) >= 0;
    var daily = r.daily || [];
    var ad = r.ad || {};
    var revPending = r.yesterday === null || r.yesterday === undefined;
    var pendDays = num(r.pendingDays, 0);

    var html = '<div class="money-hero">' +
      '<div>' +
      '<span class="money-label">어제 ' + esc(ADV.dayLabel || '') + ' 예상수익</span>' +
      (revPending
        ? '<strong class="money-num">집계 전</strong>'
        : '<strong class="money-num">' + esc(fmt(r.yesterday)) + '<em>원</em></strong>') +
      '</div>' +
      (revPending
        ? '<span class="money-delta">네이버 집계 전</span>'
        : '<span class="money-delta">' + (up ? '▲' : '▼') + ' ' +
          (up ? '+' : '−') + esc(fmt(Math.abs(num(r.delta, 0)))) + '원 ' +
          '<small>' + (up ? '+' : '−') + esc(Math.abs(num(r.deltaPct, 0)).toFixed(1)) + '%</small></span>') +
      '</div>';

    html += '<div class="money-grid">' +
      '<div class="money-cell"><span>최근 7일 합계' + (pendDays ? ' (' + (7 - pendDays) + '일)' : '') + '</span><b>' + esc(fmt(r.total7)) + '<i>원</i></b></div>' +
      '<div class="money-cell"><span>하루 평균' + (pendDays ? ' (' + (7 - pendDays) + '일)' : '') + '</span><b>' + esc(fmt(r.avg7)) + '<i>원</i></b></div>' +
      '</div>';

    if (pendDays) {
      html += '<p class="adv-hint" style="margin:7px 0 0">' + esc((ADV.dayLabel || '') + ' 예상수익은 아직 집계 전이라 합계·평균에서 빠져 있어요.') + '</p>';
    }

    if (daily.length) {
      html += '<div class="money-chart">' + moneyChart(daily) + '</div>';
    }

    html += '<div class="money-ads">' +
      '<div class="ad-cell"><span>광고 노출</span><b>' + (ad.impressions === null || ad.impressions === undefined ? '-' : esc(fmt(ad.impressions))) + '</b></div>' +
      '<div class="ad-cell"><span>광고 클릭</span><b>' + (ad.clicks === null || ad.clicks === undefined ? '-' : esc(fmt(ad.clicks))) + '</b></div>' +
      '<div class="ad-cell"><span>클릭률</span><b>' + (ad.ctr === null || ad.ctr === undefined ? '-' : esc(num(ad.ctr, 0).toFixed(2)) + '%') + '</b></div>' +
      '</div>';

    var tr = ADV.traffic;
    if (tr) {
      var tv = [
        '어제 조회수 ' + fmt(tr.views) + ' (' + (num(tr.viewsPct, 0) >= 0 ? '+' : '−') + Math.abs(num(tr.viewsPct, 0)).toFixed(1) + '%)',
        '메인 유입 ' + fmt(tr.mainInflow),
        '검색 유입 ' + fmt(tr.searchInflow)
      ];
      html += '<p class="adv-hint" style="margin:11px 0 0">' + esc(tv.join(' · ')) + '</p>';
    }

    host.innerHTML = html;
  }

  /* --- 어제 급상승 콘텐츠 --- */
  function renderRising() {
    var host = $('advRising');
    var note = $('advRisingNote');
    if (!host) return;
    var list = (ADV && ADV.rising) || [];
    if (note) note.textContent = ADV && ADV.dayLabel ? (ADV.dayLabel + ' · 내 글') : '내 글';
    if (!list.length) { host.innerHTML = '<p class="chart-empty">급상승 자료를 아직 불러오지 못했어요.</p>'; return; }

    host.innerHTML = '<ol class="rise-list">' + list.map(function (p, i) {
      var badge = p.is_new
        ? '<span class="tbadge rise-new">NEW</span>'
        : '<span class="tbadge rise-up">+' + esc(fmt(p.delta)) + '</span>';
      return '<li class="rise-row">' +
        '<span class="rk' + (i === 0 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '<div class="rise-body">' +
        '<div class="rise-top">' +
        '<span class="rise-when">' + esc(p.created || '') + '</span>' +
        badge +
        '<b class="rise-num">' + esc(fmt(p.views)) + '<i>회</i></b>' +
        '</div>' +
        '<p class="rise-title">' + esc(p.title || '') + '</p>' +
        '</div></li>';
    }).join('') + '</ol>';
  }

  /* --- 독자 구성 --- */
  function audBar(items, colors) {
    var total = 0;
    items.forEach(function (x) { total += num(x.pct, 0); });
    var scale = total > 0 ? 100 / total : 1;
    return items.map(function (x, i) {
      return '<i style="width:' + (num(x.pct, 0) * scale).toFixed(2) + '%;background:' +
        colors[i % colors.length] + '"></i>';
    }).join('');
  }
  function audLegend(items, colors) {
    return '<ul class="aud-legend">' + items.map(function (x, i) {
      return '<li><i class="ld" style="background:' + colors[i % colors.length] + '"></i>' +
        esc(x.label) + ' <b>' + num(x.pct, 0).toFixed(1) + '%</b></li>';
    }).join('') + '</ul>';
  }

  function renderAudience() {
    var host = $('advAudience');
    if (!host) return;
    var a = ADV && ADV.audience;
    if (!a) { host.innerHTML = '<p class="chart-empty">독자 자료를 아직 불러오지 못했어요.</p>'; return; }

    var DEV = ['#7C3AED', '#C4B5FD'];
    var GEN = ['#E58AA8', '#7C9CE8'];
    var html = '';

    if ((a.device || []).length) {
      var dTop = a.device.slice().sort(function (x, y) { return num(y.pct, 0) - num(x.pct, 0); })[0];
      html += '<div class="aud-block">' +
        '<div class="aud-head"><span>기기</span><b>' + esc(dTop.label) + ' ' + num(dTop.pct, 0).toFixed(1) + '%</b></div>' +
        '<div class="aud-bar">' + audBar(a.device, DEV) + '</div>' +
        audLegend(a.device, DEV) + '</div>';
    }

    if ((a.gender || []).length) {
      var g = a.gender;
      html += '<div class="aud-block">' +
        '<div class="aud-head"><span>성별</span><b>여 ' + num(g[0].pct, 0).toFixed(1) + '% · 남 ' +
        num(g[1] ? g[1].pct : 0, 0).toFixed(1) + '%</b></div>' +
        '<div class="aud-bar">' + audBar(g, GEN) + '</div>' +
        audLegend(g, GEN) + '</div>';
    }

    var band = a.age_band;
    if (band) {
      var cells = (a.age_top || []).map(function (x) {
        return esc(x.label) + ' ' + num(x.pct, 0).toFixed(1) + '%';
      }).join(' · ');
      html += '<div class="aud-block">' +
        '<div class="aud-head"><span>나이</span><b>' + esc(band.label) + '가 ' +
        num(band.pct, 0).toFixed(1) + '% — 절반 이상</b></div>' +
        '<div class="aud-bar"><i style="width:' + num(band.pct, 0).toFixed(1) +
        '%;background:linear-gradient(90deg,#B79CF9,#7C3AED)"></i></div>' +
        '<p class="aud-note">' + cells + '</p>' +
        '</div>';
    }

    host.innerHTML = html || '<p class="chart-empty">독자 자료를 아직 불러오지 못했어요.</p>';
  }

  /* --- 주제별 인기 유입 검색어 --- */
  function termChip(t) {
    var right = t.new || t.n == null ? '<b>NEW</b>' : '<b>' + esc(fmt(t.n)) + '</b>';
    return '<span class="term-chip' + (t.new ? ' new' : '') + '">' + esc(t.t) + ' ' + right + '</span>';
  }

  function renderSearch() {
    var tabs = $('advSearchTabs');
    var body = $('advSearchBody');
    if (!tabs || !body) return;
    var groups = (ADV && ADV.searchTerms) || [];
    if (!groups.length) {
      tabs.innerHTML = '';
      body.innerHTML = '<p class="chart-empty">검색어 자료를 아직 불러오지 못했어요.</p>';
      return;
    }
    if (advGroup >= groups.length) advGroup = 0;

    tabs.innerHTML = groups.map(function (g, i) {
      return '<button type="button" data-adv="' + i + '"' + (i === advGroup ? ' class="on"' : '') + '>' +
        esc((g.emoji || '') + ' ' + g.label) + '</button>';
    }).join('');
    tabs.onclick = function (e) {
      var btn = siblingUp(e);
      if (!btn) return;
      advGroup = Number(btn.getAttribute('data-adv')) || 0;
      renderSearch();
    };

    var g = groups[advGroup];
    var terms = (g.terms || []).filter(function (t) { return t.n != null || t.new; });
    if (!terms.length) { body.innerHTML = '<p class="adv-empty">이 주제는 아직 값이 없어요.</p>'; return; }

    var head = terms.slice(0, 12);
    var rest = terms.slice(12);
    var html = '<div class="term-chips">' + head.map(termChip).join('') + '</div>';
    if (rest.length) {
      html += '<details class="more-posts"><summary>나머지 ' + rest.length + '개 더 보기</summary>' +
        '<div class="term-chips">' + rest.map(termChip).join('') + '</div></details>';
    }
    body.innerHTML = html;
  }

  /* --- 네이버 블로그 검색 링크 (제목으로 찾기) --- */
  function blogSearchUrl(title) {
    return 'https://m.search.naver.com/search.naver?where=m_blog&query=' +
      encodeURIComponent(String(title || '').trim());
  }

  /* --- 네이버 메인 유입 TOP 20 (제목 누르면 원문 글로 바로) --- */
  function mainRow(p, i) {
    var title = p.title || '';
    var href = p.url || blogSearchUrl(title);
    var go = p.url ? '바로가기 ↗' : '글 찾기 ↗';
    return '<li>' +
      '<a class="main-row" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="rk' + (i === 0 ? ' top' : '') + '">' + (p.rank || i + 1) + '</span>' +
      '<p class="main-title">' + esc(title) + '</p>' +
      '<span class="main-go">' + go + '</span></a></li>';
  }

  function renderMain() {
    var host = $('advMain');
    if (!host) return;
    var list = (ADV && ADV.mainTop) || [];
    if (!list.length) { host.innerHTML = '<p class="chart-empty">메인 유입 자료를 아직 불러오지 못했어요.</p>'; return; }

    var head = list.slice(0, 10);
    var rest = list.slice(10);
    var html = '<ol class="main-list">' + head.map(mainRow).join('') + '</ol>';
    if (rest.length) {
      html += '<details class="more-posts"><summary>' + (head.length + 1) + '~' + list.length + '위 더 보기</summary>' +
        '<ol class="main-list">' + rest.map(mainRow).join('') + '</ol></details>';
    }
    host.innerHTML = html;
  }

  /* --- 지난주 돋보였던 콘텐츠 5건 (블로그 직링크) --- */
  function renderLastWeek() {
    var host = $('advLastWeek');
    if (!host) return;
    var list = (ADV && ADV.lastWeek) || [];
    if (!list.length) { host.innerHTML = '<p class="chart-empty">지난주 인기 글을 아직 불러오지 못했어요.</p>'; return; }

    host.innerHTML = '<ol class="main-list">' + list.map(function (p, i) {
      return '<li>' +
        '<a class="main-row last-row" href="' + esc(p.url || '#') + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="rk' + (i === 0 ? ' top' : '') + '">' + (p.rank || i + 1) + '</span>' +
        '<span class="last-body">' +
        '<span class="main-title">' + esc(p.title || '') + '</span>' +
        '<span class="last-blog">' + esc(p.blog || '') + '</span>' +
        '</span>' +
        '<span class="main-go">바로가기 ↗</span></a></li>';
    }).join('') + '</ol>';
  }

  function renderAdvisor() {
    ADV = (DATA && DATA.advisor) || null;
    renderAdvBand();
    renderRevenue();
    renderRising();
    renderAudience();
    renderSearch();
    renderLastWeek();
    renderMain();
  }

  /* ---------------- boot ---------------- */
  function mmdd(iso) {
    var p = String(iso || '').split('-');
    if (p.length < 3) return '';
    return parseInt(p[1], 10) + '/' + parseInt(p[2], 10);
  }

  /* '이 숫자는 어디서 왔나' — 기간·기준일을 데이터에서 채운다 */
  function renderSourceNotes(d) {
    var per = d.period || {};
    var advDay = d.advisor && d.advisor.day ? mmdd(d.advisor.day) : '';
    var n1 = $('srcNotePeriod');
    if (n1 && per.start && per.end) {
      n1.innerHTML = '네이버 블로그 <b>관리 → 통계</b>에 찍힌 실제 기록입니다(' +
        mmdd(per.start) + ' ~ ' + mmdd(per.end) + ', ' + (per.days || 7) + '일).';
    }
    var n2 = $('srcNoteSource');
    if (n2 && advDay) {
      n2.innerHTML = '요일별 조회수는 <b>조회수 일간</b> 원본, 유입 비율은 ' + advDay + ' <b>유입 분석</b> 값입니다.';
    }
    var n4 = $('srcNoteAdv');
    if (n4 && advDay) {
      n4.innerHTML = '예상수익·광고·급상승·독자 구성은 <b>크리에이터 어드바이저</b>(creator-advisor.naver.com) ' +
        advDay + ' 값입니다.';
    }
  }

  function render(d) {
    if (!d || !d.daily && !d.posts) return false;
    DATA = d;
    var t = totals();
    renderHead();
    renderKpi(t);
    renderWeek(t);
    renderSources();
    renderRanks(t);
    renderTypes(t);
    renderAdvisor();
    renderSourceNotes(d);
    var foot = $('statUpdated');
    if (foot) foot.textContent = '기준 ' + shortWhen(d.updated) + ' · ' + (d.blogLabel || '드라마') + ' 블로그';
    return true;
  }

  function load(manual) {
    if (manual) {
      var btn = $('statRefresh');
      if (btn) { btn.disabled = true; btn.textContent = '↻ 불러오는 중'; }
    }
    var done = function (d, live) {
      if (!render(d) && window.STATS_FALLBACK) render(window.STATS_FALLBACK);
      var btn = $('statRefresh');
      if (btn) { btn.disabled = false; btn.textContent = '↻ 새로고침'; }
      if (manual) toastMsg(live ? '통계를 새로 불러왔어요' : '저장된 통계로 보여드려요');
    };

    var req;
    try {
      req = fetch('stats.json?v=' + Date.now(), { cache: 'no-store' });
    } catch (e) {
      req = null;
    }
    if (!req) { done(window.STATS_FALLBACK, false); return; }

    req.then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!render(d)) throw new Error('empty');
      var btn = $('statRefresh');
      if (btn) { btn.disabled = false; btn.textContent = '↻ 새로고침'; }
      if (manual) toastMsg('통계를 새로 불러왔어요');
    }).catch(function () {
      done(window.STATS_FALLBACK, false);
    });
  }

  function toastMsg(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function init() {
    var btn = $('statRefresh');
    if (btn) btn.addEventListener('click', function () { load(true); });
    if (!$('view-stats')) return;
    initSeg();
    load(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
