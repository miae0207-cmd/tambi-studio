/* 탐비 블로그 스튜디오 — 이미지 편집기
   콜라주(1~4장) · 칸 자르기 · 모자이크 · 워터마크 · PNG/JPG 저장
   사진은 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('ieCanvas');
  if (!canvas) return;

  /* ---------------- 상수 ---------------- */
  var BASE = 1440;                        // 긴 변 기준 해상도(px)
  var STORE = 'tambi.imageEditor.v1';

  var RATIOS = [
    { id: '1:1',  label: '1:1 대표',   v: 1 },
    { id: '4:3',  label: '4:3 본문',   v: 4 / 3 },
    { id: '16:9', label: '16:9 와이드', v: 16 / 9 },
    { id: '9:16', label: '9:16 클립',  v: 9 / 16 }
  ];
  var LAYOUTS = [
    { id: 'single', label: '1컷',           need: 1 },
    { id: 'h2',     label: '가로 2컷',       need: 2 },
    { id: 'v2',     label: '세로 2컷',       need: 2 },
    { id: 't3',     label: '3컷 위1·아래2',  need: 3 },
    { id: 'v3',     label: '3컷 세로',       need: 3 },
    { id: 'g4',     label: '4컷 2×2',       need: 4 }
  ];
  var BGS = ['#ffffff', '#F0E9FF', '#FBF3E4', '#F1F1F5', '#14111F'];
  var BLOCKS = [
    { id: 'low',  label: '약', px: 12 },
    { id: 'mid',  label: '중', px: 26 },
    { id: 'high', label: '강', px: 46 }
  ];
  var WMPOS = [
    { id: 'br',   label: '우하단' },
    { id: 'bl',   label: '좌하단' },
    { id: 'tr',   label: '우상단' },
    { id: 'tl',   label: '좌상단' },
    { id: 'diag', label: '대각선 반복' }
  ];
  var WMCOLORS = [
    { id: '#ffffff', label: '흰색' },
    { id: '#14111F', label: '검정' },
    { id: '#7C3AED', label: '보라' }
  ];
  var WMPRESETS = ['달래쨘', '달래의 행복나라 여행기♡', '공식 유튜브 캡처 · 달래쨘'];

  /* ---------------- 상태 ---------------- */
  var S = {
    photos: [],          // {img, url, name}
    layout: 'single',
    ratio: '1:1',
    gap: 12,
    radius: 26,
    bg: '#ffffff',
    cells: [],           // {zoom, px, py, fit}
    strokes: [],         // 모자이크 획 {t:'brush'|'rect', r, pts:[{x,y}]}
    sel: 0,
    mode: 'pos',         // pos | mosaic
    shape: 'brush',      // brush | rect
    block: 'mid',
    brush: 140,
    wm: { text: '달래쨘', pos: 'br', size: 34, opacity: 85, color: '#ffffff', badge: true, shadow: true }
  };

  var ctx = canvas.getContext('2d');
  var base = document.createElement('canvas'), baseCtx = base.getContext('2d');
  var mask = document.createElement('canvas'), maskCtx = mask.getContext('2d');
  var layer = document.createElement('canvas'), layerCtx = layer.getContext('2d');
  var small = document.createElement('canvas'), smallCtx = small.getContext('2d');
  var baseDirty = true, rafId = 0, lastBlob = null, lastBlobName = '';

  function clamp(a, b, v) { return v < a ? a : (v > b ? b : v); }
  function kk() { return Math.max(canvas.width, canvas.height) / BASE; }

  /* ---------------- 토스트 ---------------- */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ---------------- 저장된 설정 ---------------- */
  function savePrefs() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        layout: S.layout, ratio: S.ratio, gap: S.gap, radius: S.radius,
        bg: S.bg, block: S.block, wm: S.wm
      }));
    } catch (e) { /* 사생활 보호 모드 등 */ }
  }
  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return;
      var p = JSON.parse(raw) || {};
      if (p.layout) S.layout = p.layout;
      if (p.ratio) S.ratio = p.ratio;
      if (typeof p.gap === 'number') S.gap = clamp(0, 40, p.gap);
      if (typeof p.radius === 'number') S.radius = clamp(0, 80, p.radius);
      if (p.bg) S.bg = p.bg;
      if (p.block) S.block = p.block;
      if (p.wm) { for (var k in p.wm) { if (Object.prototype.hasOwnProperty.call(p.wm, k)) S.wm[k] = p.wm[k]; } }
    } catch (e) { /* 무시 */ }
  }

  /* ---------------- 캔버스 크기·레이아웃 ---------------- */
  function ratioV() {
    for (var i = 0; i < RATIOS.length; i++) { if (RATIOS[i].id === S.ratio) return RATIOS[i].v; }
    return 1;
  }

  function resizeCanvas() {
    var r = ratioV(), w, h;
    if (r >= 1) { w = BASE; h = Math.round(BASE / r); } else { h = BASE; w = Math.round(BASE * r); }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      base.width = w; base.height = h;
      baseDirty = true;
      rebuildMask();
    }
  }

  function needOf(id) {
    for (var i = 0; i < LAYOUTS.length; i++) { if (LAYOUTS[i].id === id) return LAYOUTS[i].need; }
    return 1;
  }
  function defaultLayout(n) {
    return n <= 1 ? 'single' : (n === 2 ? 'h2' : (n === 3 ? 't3' : 'g4'));
  }

  function rects() {
    var W = canvas.width, H = canvas.height;
    var g = Math.round(S.gap * kk()), m = g;
    var iw = Math.max(1, W - 2 * m), ih = Math.max(1, H - 2 * m);
    var hw = Math.max(1, (iw - g) / 2), hh = Math.max(1, (ih - g) / 2);
    switch (S.layout) {
      case 'h2':
        return [{ x: m, y: m, w: hw, h: ih },
                { x: m + hw + g, y: m, w: hw, h: ih }];
      case 'v2':
        return [{ x: m, y: m, w: iw, h: hh },
                { x: m, y: m + hh + g, w: iw, h: hh }];
      case 't3':
        return [{ x: m, y: m, w: iw, h: hh },
                { x: m, y: m + hh + g, w: hw, h: hh },
                { x: m + hw + g, y: m + hh + g, w: hw, h: hh }];
      case 'v3': {
        var th = Math.max(1, (ih - 2 * g) / 3);
        return [{ x: m, y: m, w: iw, h: th },
                { x: m, y: m + th + g, w: iw, h: th },
                { x: m, y: m + 2 * (th + g), w: iw, h: th }];
      }
      case 'g4':
        return [{ x: m, y: m, w: hw, h: hh },
                { x: m + hw + g, y: m, w: hw, h: hh },
                { x: m, y: m + hh + g, w: hw, h: hh },
                { x: m + hw + g, y: m + hh + g, w: hw, h: hh }];
      default:
        return [{ x: m, y: m, w: iw, h: ih }];
    }
  }

  function radiusPx() { return S.radius * kk(); }

  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function cell(i) {
    while (S.cells.length <= i) S.cells.push({ zoom: 1, px: 0, py: 0, fit: false });
    return S.cells[i];
  }

  function geom(i, r) {
    var im = S.photos[i];
    if (!im || !r) return null;
    var c = cell(i);
    var iw = im.img.naturalWidth || im.img.width;
    var ih = im.img.naturalHeight || im.img.height;
    if (!iw || !ih) return null;
    var cover = Math.max(r.w / iw, r.h / ih);
    var fit = Math.min(r.w / iw, r.h / ih);
    var sc = (c.fit ? fit : cover) * (c.zoom || 1);
    var dw = iw * sc, dh = ih * sc;
    var sx = c.fit ? 0 : Math.max(0, (dw - r.w) / 2);
    var sy = c.fit ? 0 : Math.max(0, (dh - r.h) / 2);
    return {
      x: r.x + r.w / 2 - dw / 2 + clamp(-1, 1, c.px || 0) * sx,
      y: r.y + r.h / 2 - dh / 2 + clamp(-1, 1, c.py || 0) * sy,
      dw: dw, dh: dh, sx: sx, sy: sy
    };
  }

  /* ---------------- 그리기 ---------------- */
  function buildBase() {
    var W = canvas.width, H = canvas.height;
    if (base.width !== W || base.height !== H) { base.width = W; base.height = H; }
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.clearRect(0, 0, W, H);
    baseCtx.fillStyle = S.bg;
    baseCtx.fillRect(0, 0, W, H);

    var rs = rects(), rp = radiusPx();
    baseCtx.imageSmoothingEnabled = true;
    baseCtx.imageSmoothingQuality = 'high';

    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (!S.photos[i]) {
        baseCtx.save();
        rr(baseCtx, r.x, r.y, r.w, r.h, rp);
        baseCtx.fillStyle = '#F4EFFE';
        baseCtx.fill();
        baseCtx.restore();
        continue;
      }
      var g = geom(i, r);
      if (!g) continue;
      baseCtx.save();
      rr(baseCtx, r.x, r.y, r.w, r.h, rp);
      baseCtx.clip();
      try { baseCtx.drawImage(S.photos[i].img, g.x, g.y, g.dw, g.dh); } catch (e) { /* 무시 */ }
      baseCtx.restore();
    }
    baseDirty = false;
  }

  function strokeBounds() {
    if (!S.strokes.length) return null;
    var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    S.strokes.forEach(function (st) {
      st.pts.forEach(function (p) {
        var rr2 = st.r || 0;
        if (p.x - rr2 < x1) x1 = p.x - rr2;
        if (p.y - rr2 < y1) y1 = p.y - rr2;
        if (p.x + rr2 > x2) x2 = p.x + rr2;
        if (p.y + rr2 > y2) y2 = p.y + rr2;
      });
    });
    return { x1: x1, y1: y1, x2: x2, y2: y2 };
  }

  function applyMosaic() {
    if (!S.strokes.length) return;
    var bb = strokeBounds();
    if (!bb) return;
    var W = canvas.width, H = canvas.height;
    var x = Math.max(0, Math.floor(bb.x1));
    var y = Math.max(0, Math.floor(bb.y1));
    var x2 = Math.min(W, Math.ceil(bb.x2));
    var y2 = Math.min(H, Math.ceil(bb.y2));
    var w = x2 - x, h = y2 - y;
    if (w < 1 || h < 1) return;

    var block = 20;
    for (var i = 0; i < BLOCKS.length; i++) { if (BLOCKS[i].id === S.block) block = BLOCKS[i].px; }
    block = Math.max(2, Math.round(block * kk()));

    var bw = Math.max(1, Math.round(w / block));
    var bh = Math.max(1, Math.round(h / block));
    if (small.width !== bw || small.height !== bh) { small.width = bw; small.height = bh; }
    smallCtx.setTransform(1, 0, 0, 1, 0, 0);
    smallCtx.clearRect(0, 0, bw, bh);
    smallCtx.imageSmoothingEnabled = true;
    try { smallCtx.drawImage(canvas, x, y, w, h, 0, 0, bw, bh); } catch (e) { return; }

    if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; }
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(x, y, w, h);
    layerCtx.imageSmoothingEnabled = false;
    layerCtx.drawImage(small, 0, 0, bw, bh, x, y, w, h);
    layerCtx.globalCompositeOperation = 'destination-in';
    layerCtx.drawImage(mask, 0, 0);
    layerCtx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    layerCtx.clearRect(x, y, w, h);
  }

  function wmFont(size) {
    return '800 ' + size + 'px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", ' +
      '"Noto Sans KR", "Segoe UI", Roboto, sans-serif';
  }

  function drawWmDiag(t, size, alpha) {
    var W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.font = wmFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = S.wm.color;
    if (S.wm.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,.38)';
      ctx.shadowBlur = size * 0.35;
    }
    var tw = ctx.measureText(t).width;
    var stepX = tw + size * 2.4, stepY = size * 2.9;
    var D = Math.sqrt(W * W + H * H);
    var cols = Math.ceil(D / stepX) + 1, rows = Math.ceil(D / stepY) + 1;
    var ox = -D / 2, oy = -D / 2;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        ctx.fillText(t, ox + c * stepX + (r % 2 ? stepX / 2 : 0), oy + r * stepY);
      }
    }
    ctx.restore();
  }

  function drawWatermark() {
    var t = (S.wm.text || '').trim();
    if (!t) return;
    var W = canvas.width, H = canvas.height;
    var k = kk();
    var size = Math.max(10, S.wm.size * k);
    var alpha = clamp(20, 100, S.wm.opacity) / 100;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (S.wm.pos === 'diag') {
      drawWmDiag(t, size, alpha);
      ctx.restore();
      return;
    }

    ctx.font = wmFont(size);
    var tw = ctx.measureText(t).width;
    var pad = size * 0.55;
    var bh = size * 1.95;
    var bw = tw + pad * 2;
    var m = Math.round(26 * k);
    var cx, cy;
    switch (S.wm.pos) {
      case 'tl': cx = m + bw / 2; cy = m + bh / 2; break;
      case 'tr': cx = W - m - bw / 2; cy = m + bh / 2; break;
      case 'bl': cx = m + bw / 2; cy = H - m - bh / 2; break;
      default:   cx = W - m - bw / 2; cy = H - m - bh / 2;
    }

    if (S.wm.badge) {
      ctx.globalAlpha = alpha;
      if (S.wm.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = size * 0.5;
        ctx.shadowOffsetY = size * 0.08;
      }
      rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = (S.wm.color === '#ffffff') ? 'rgba(20,17,31,.42)' : 'rgba(255,255,255,.82)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.globalAlpha = alpha;
    if (S.wm.shadow && !S.wm.badge) {
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = size * 0.45;
      ctx.shadowOffsetY = size * 0.06;
    }
    ctx.fillStyle = S.wm.color;
    ctx.fillText(t, cx, cy + size * 0.05);
    ctx.restore();
  }

  function render() {
    if (!canvas.width) return;
    if (baseDirty) buildBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    applyMosaic();
    drawWatermark();
    updateSelBox();
    updateEmpty();
  }

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; render(); });
  }

  /* ---------------- 모자이크 마스크 ---------------- */
  function paintStroke(c, st, tailOnly) {
    var n = st.pts.length;
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (st.t === 'rect') {
      if (n < 2) return;
      var a = st.pts[0], b = st.pts[n - 1];
      var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      c.fillRect(x, y, w, h);
      return;
    }
    if (n === 1) {
      c.beginPath();
      c.arc(st.pts[0].x, st.pts[0].y, st.r, 0, Math.PI * 2);
      c.fill();
      return;
    }
    var from = tailOnly ? Math.max(0, n - 2) : 0;
    c.lineWidth = st.r * 2;
    c.beginPath();
    c.moveTo(st.pts[from].x, st.pts[from].y);
    for (var i = from + 1; i < n; i++) c.lineTo(st.pts[i].x, st.pts[i].y);
    c.stroke();
  }

  function rebuildMask() {
    var W = canvas.width, H = canvas.height;
    if (mask.width !== W || mask.height !== H) { mask.width = W; mask.height = H; }
    maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    maskCtx.clearRect(0, 0, W, H);
    for (var i = 0; i < S.strokes.length; i++) paintStroke(maskCtx, S.strokes[i], false);
  }

  /* ---------------- 칩 그리기 도우미 ---------------- */
  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function chip(box, label, on, disabled, handler) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ie-chip' + (on ? ' on' : '');
    b.textContent = label;
    b.disabled = !!disabled;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.addEventListener('click', handler);
    box.appendChild(b);
    return b;
  }

  function renderLayoutChips() {
    var box = $('ieLayout');
    clearNode(box);
    LAYOUTS.forEach(function (L) {
      chip(box, L.label, S.layout === L.id, S.photos.length < L.need, function () {
        if (S.photos.length < L.need) { toast('사진 ' + L.need + '장이 필요해요'); return; }
        S.layout = L.id;
        if (S.sel >= L.need) S.sel = 0;
        baseDirty = true;
        renderLayoutChips();
        syncCells();
        savePrefs();
        schedule();
      });
    });
  }

  function renderRatioChips() {
    var box = $('ieRatio');
    clearNode(box);
    RATIOS.forEach(function (R) {
      chip(box, R.label, S.ratio === R.id, false, function () {
        S.ratio = R.id;
        resizeCanvas();
        baseDirty = true;
        renderRatioChips();
        savePrefs();
        schedule();
      });
    });
  }

  function renderBgSwatches() {
    var box = $('ieBgs');
    clearNode(box);
    BGS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ie-swatch' + (S.bg === c ? ' on' : '');
      b.style.background = c;
      b.setAttribute('aria-label', '배경 ' + c);
      b.addEventListener('click', function () {
        S.bg = c;
        baseDirty = true;
        renderBgSwatches();
        savePrefs();
        schedule();
      });
      box.appendChild(b);
    });
  }

  function renderBlockChips() {
    var box = $('ieBlock');
    clearNode(box);
    BLOCKS.forEach(function (B) {
      chip(box, B.label, S.block === B.id, false, function () {
        S.block = B.id;
        renderBlockChips();
        savePrefs();
        schedule();
      });
    });
  }

  function renderCellChips() {
    var box = $('ieCells');
    clearNode(box);
    var rs = rects();
    for (var i = 0; i < rs.length; i++) {
      if (!S.photos[i]) break;
      (function (idx) {
        chip(box, (idx + 1) + '번째 칸', S.sel === idx, false, function () {
          S.sel = idx;
          renderCellChips();
          syncSliders();
          updateSelBox();
          renderThumbs();
        });
      })(i);
    }
  }

  function renderShape() {
    var box = $('ieShape');
    clearNode(box);
    [{ id: 'brush', label: '붓으로 문지르기' }, { id: 'rect', label: '사각형으로 칠하기' }].forEach(function (pair) {
      chip(box, pair.label, S.shape === pair.id, false, function () {
        S.shape = pair.id;
        renderShape();
      });
    });
  }

  function renderWmPresets() {
    var box = $('ieWmPresets');
    clearNode(box);
    WMPRESETS.forEach(function (t) {
      chip(box, t, S.wm.text === t, false, function () {
        S.wm.text = t;
        $('ieWmText').value = t;
        renderWmPresets();
        savePrefs();
        schedule();
      });
    });
  }

  function renderWmPos() {
    var box = $('ieWmPos');
    clearNode(box);
    WMPOS.forEach(function (p) {
      chip(box, p.label, S.wm.pos === p.id, false, function () {
        S.wm.pos = p.id;
        renderWmPos();
        savePrefs();
        schedule();
      });
    });
  }

  function renderWmColors() {
    var box = $('ieWmColors');
    clearNode(box);
    WMCOLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ie-color' + (S.wm.color === c.id ? ' on' : '');
      b.setAttribute('aria-pressed', S.wm.color === c.id ? 'true' : 'false');
      var dot = document.createElement('i');
      dot.style.background = c.id;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(c.label));
      b.addEventListener('click', function () {
        S.wm.color = c.id;
        renderWmColors();
        savePrefs();
        schedule();
      });
      box.appendChild(b);
    });
  }

  function renderFormat() {
    var box = $('ieFormat');
    clearNode(box);
    var fmts = [{ id: 'image/png', label: 'PNG 고화질' }, { id: 'image/jpeg', label: 'JPG 가벼움' }];
    fmts.forEach(function (f) {
      chip(box, f.label, S.fmt === f.id, false, function () {
        S.fmt = f.id;
        renderFormat();
      });
    });
    $('ieSave').textContent = (S.fmt === 'image/jpeg') ? '💾 사진첩에 저장 (JPG)' : '💾 사진첩에 저장 (PNG)';
  }

  function renderThumbs() {
    var box = $('ieThumbs');
    clearNode(box);
    S.photos.forEach(function (p, i) {
      var d = document.createElement('div');
      d.className = 'ie-thumb' + (S.sel === i ? ' sel' : '');
      var im = document.createElement('img');
      im.src = p.url;
      im.alt = '사진 ' + (i + 1);
      var b = document.createElement('b');
      b.textContent = String(i + 1);
      var x = document.createElement('i');
      x.textContent = '✕';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', (i + 1) + '번 사진 빼기');
      x.addEventListener('click', function (ev) {
        ev.stopPropagation();
        removePhoto(i);
      });
      d.addEventListener('click', function () {
        S.sel = Math.min(i, Math.max(0, S.photos.length - 1));
        renderThumbs();
        syncCells();
        updateSelBox();
      });
      d.appendChild(im);
      d.appendChild(b);
      d.appendChild(x);
      box.appendChild(d);
    });
    box.hidden = !S.photos.length;
  }

  function syncFileUI() {
    var has = S.photos.length > 0;
    $('ieDrop').hidden = has;
    $('ieFileBtns').hidden = !has;
    $('ieStageEmpty').hidden = has;
    $('ieAdd').hidden = S.photos.length >= 4;
    renderThumbs();
  }

  function updateEmpty() {
    $('ieStageEmpty').hidden = S.photos.length > 0;
  }

  function updateSelBox() {
    var box = $('ieSelBox');
    if (!box) return;
    var rs = rects();
    var r = rs[S.sel];
    if (!r || !S.photos.length || S.mode !== 'pos' || !canvas.clientWidth) { box.hidden = true; return; }
    var sc = canvas.clientWidth / canvas.width;
    box.hidden = false;
    box.style.left = (canvas.offsetLeft + r.x * sc) + 'px';
    box.style.top = (canvas.offsetTop + r.y * sc) + 'px';
    box.style.width = (r.w * sc) + 'px';
    box.style.height = (r.h * sc) + 'px';
  }

  /* ---------------- 슬라이더 동기화 ---------------- */
  function syncSliders() {
    var c = cell(S.sel);
    var zv = Math.round((c.zoom || 1) * 100);
    $('ieZoom').value = zv;
    $('ieZoomOut').textContent = ((c.zoom || 1)).toFixed(1) + '×';
    $('iePanX').value = Math.round((c.px || 0) * 100);
    $('iePanXOut').textContent = Math.round((c.px || 0) * 100);
    $('iePanY').value = Math.round((c.py || 0) * 100);
    $('iePanYOut').textContent = Math.round((c.py || 0) * 100);
    var fit = $('ieFit');
    fit.classList.toggle('on', !!c.fit);
    fit.setAttribute('aria-pressed', c.fit ? 'true' : 'false');
    fit.textContent = c.fit ? '전체 보이기 ✓ (여백 생김)' : '전체 보이기 (여백 생김)';
  }

  function syncCells() {
    renderCellChips();
    syncSliders();
  }

  function syncAll() {
    $('ieGap').value = S.gap;
    $('ieGapOut').textContent = S.gap;
    $('ieRadius').value = S.radius;
    $('ieRadiusOut').textContent = S.radius;
    $('ieBrush').value = S.brush;
    $('ieBrushOut').textContent = S.brush;
    $('ieWmText').value = S.wm.text;
    $('ieWmSize').value = S.wm.size;
    $('ieWmSizeOut').textContent = S.wm.size;
    $('ieWmOpacity').value = S.wm.opacity;
    $('ieWmOpacityOut').textContent = S.wm.opacity + '%';
    $('ieWmBadge').classList.toggle('on', !!S.wm.badge);
    $('ieWmBadge').setAttribute('aria-pressed', S.wm.badge ? 'true' : 'false');
    $('ieWmShadow').classList.toggle('on', !!S.wm.shadow);
    $('ieWmShadow').setAttribute('aria-pressed', S.wm.shadow ? 'true' : 'false');
    renderLayoutChips();
    renderRatioChips();
    renderBgSwatches();
    renderBlockChips();
    renderWmPresets();
    renderWmPos();
    renderWmColors();
    renderShape();
    renderFormat();
    syncCells();
    syncFileUI();
    setMode(S.mode);
    $('ieShare').hidden = true;   // 저장을 한 번 하기 전에는 공유 버튼을 숨긴다
  }

  /* ---------------- 사진 넣기 ---------------- */
  function fixLayout() {
    if (!S.photos.length) { S.layout = 'single'; S.sel = 0; return; }
    if (needOf(S.layout) > S.photos.length) S.layout = defaultLayout(S.photos.length);
    if (S.sel >= S.photos.length) S.sel = 0;
  }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []).filter(function (f) {
      return !f.type || /^image\//.test(f.type);
    });
    if (!files.length) { toast('사진 파일이 아니에요'); return; }
    var room = 4 - S.photos.length;
    if (room <= 0) { toast('사진은 최대 4장까지예요'); return; }
    files = files.slice(0, room);

    var pending = files.length, slots = new Array(files.length);

    function done() {
      var ok = slots.filter(Boolean);
      if (!ok.length) { toast('사진을 못 불러왔어요. JPG로 다시 골라주세요'); return; }
      S.photos = S.photos.concat(ok).slice(0, 4);
      if (S.layout === 'single' && S.photos.length > 1) S.layout = defaultLayout(S.photos.length);
      fixLayout();
      resizeCanvas();
      baseDirty = true;
      renderLayoutChips();
      syncCells();
      syncFileUI();
      schedule();
      toast('사진 ' + ok.length + '장을 불러왔어요');
    }

    files.forEach(function (f, i) {
      var url = URL.createObjectURL(f);
      var img = new Image();
      img.onload = function () {
        slots[i] = { img: img, url: url, name: f.name || 'photo' };
        if (--pending === 0) done();
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) { /* 무시 */ }
        slots[i] = null;
        if (--pending === 0) done();
      };
      img.src = url;
    });
  }

  function removePhoto(i) {
    var p = S.photos[i];
    if (p && p.url) { try { URL.revokeObjectURL(p.url); } catch (e) { /* 무시 */ } }
    S.photos.splice(i, 1);
    S.cells.splice(i, 1);
    if (S.sel >= S.photos.length) S.sel = Math.max(0, S.photos.length - 1);
    fixLayout();
    resizeCanvas();
    baseDirty = true;
    renderLayoutChips();
    syncCells();
    syncFileUI();
    schedule();
  }

  function clearAll() {
    S.photos.forEach(function (p) { try { URL.revokeObjectURL(p.url); } catch (e) { /* 무시 */ } });
    S.photos = [];
    S.cells = [];
    S.strokes = [];
    S.sel = 0;
    S.layout = 'single';
    rebuildMask();
    resizeCanvas();
    baseDirty = true;
    $('ieOut').hidden = true;
    lastBlob = null;
    renderLayoutChips();
    syncCells();
    syncFileUI();
    renderCellChips();
    schedule();
  }

  /* ---------------- 도구 모드 ---------------- */
  function setMode(m) {
    S.mode = (m === 'mosaic') ? 'mosaic' : 'pos';
    Array.prototype.forEach.call($('ieMode').children, function (b) {
      var on = b.getAttribute('data-mode') === S.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('ieTip').innerHTML = S.mode === 'mosaic'
      ? '미리보기를 <b>손가락으로 문지르면</b> 그 자리가 모자이크됩니다. 잘못 칠했으면 <b>되돌리기</b>.'
      : '칸을 눌러 고른 뒤 <b>끌어서 위치</b>, 두 손가락으로 <b>확대</b>. 아래 슬라이더로도 맞출 수 있어요.';
    updateSelBox();
  }

  /* ---------------- 손가락 조작 ---------------- */
  var ptrs = new Map();
  var drag = null, pinch = null, painting = null;

  function toCanvas(e) {
    var rc = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rc.left) * canvas.width / rc.width,
      y: (e.clientY - rc.top) * canvas.height / rc.height
    };
  }

  function dist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }

  function hitCell(p) {
    var rs = rects();
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (S.photos[i] && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
    }
    return S.photos.length === 1 ? 0 : -1;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!S.photos.length) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    var p = toCanvas(e);
    ptrs.set(e.pointerId, p);

    if (S.mode === 'mosaic') {
      if (ptrs.size > 1) return;
      var r = Math.max(2, S.brush * kk() / 2);
      var st = S.shape === 'rect'
        ? { t: 'rect', r: 0, pts: [{ x: p.x, y: p.y }, { x: p.x, y: p.y }] }
        : { t: 'brush', r: r, pts: [{ x: p.x, y: p.y }] };
      S.strokes.push(st);
      painting = st;
      paintStroke(maskCtx, st, false);
      schedule();
      return;
    }

    if (ptrs.size === 1) {
      var idx = hitCell(p);
      if (idx >= 0) {
        S.sel = idx;
        renderCellChips();
        syncSliders();
        renderThumbs();
      }
      var c = cell(S.sel);
      var rs = rects();
      var g = geom(S.sel, rs[S.sel]);
      drag = { i: S.sel, x: p.x, y: p.y, px: c.px || 0, py: c.py || 0, sx: g ? g.sx : 0, sy: g ? g.sy : 0 };
      updateSelBox();
    } else if (ptrs.size === 2) {
      drag = null;
      var arr = Array.from(ptrs.values());
      pinch = { d: dist(arr[0], arr[1]), z: cell(S.sel).zoom || 1 };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!S.photos.length || !ptrs.has(e.pointerId)) return;
    e.preventDefault();
    var p = toCanvas(e);
    ptrs.set(e.pointerId, p);

    if (painting && S.mode === 'mosaic') {
      if (painting.t === 'rect') {
        painting.pts[1] = { x: p.x, y: p.y };
        rebuildMask();
        schedule();
        return;
      }
      var last = painting.pts[painting.pts.length - 1];
      if (Math.sqrt((p.x - last.x) * (p.x - last.x) + (p.y - last.y) * (p.y - last.y)) < Math.max(3, painting.r * 0.3)) return;
      painting.pts.push({ x: p.x, y: p.y });
      paintStroke(maskCtx, painting, true);
      schedule();
      return;
    }

    if (pinch && ptrs.size >= 2) {
      var arr = Array.from(ptrs.values());
      var d = dist(arr[0], arr[1]);
      var c = cell(S.sel);
      c.zoom = clamp(1, 5, pinch.z * (d / Math.max(1, pinch.d)));
      baseDirty = true;
      syncSliders();
      schedule();
      return;
    }

    if (drag) {
      var cc = cell(drag.i);
      if (drag.sx > 0) cc.px = clamp(-1, 1, drag.px + (p.x - drag.x) / drag.sx);
      if (drag.sy > 0) cc.py = clamp(-1, 1, drag.py + (p.y - drag.y) / drag.sy);
      baseDirty = true;
      syncSliders();
      schedule();
    }
  });

  function endPointer(e) {
    ptrs.delete(e.pointerId);
    if (painting) {
      var st = painting;
      painting = null;
      if (st.t === 'rect') {
        var a = st.pts[0], b = st.pts[1];
        if (Math.abs(b.x - a.x) < 6 && Math.abs(b.y - a.y) < 6) {
          S.strokes.pop();
          rebuildMask();
        }
      }
      schedule();
    }
    if (ptrs.size === 0) { drag = null; pinch = null; }
    else if (ptrs.size === 1 && S.mode === 'pos') {
      pinch = null;
      var arr = Array.from(ptrs.values())[0];
      var c = cell(S.sel);
      var rs = rects();
      var g = geom(S.sel, rs[S.sel]);
      drag = { i: S.sel, x: arr.x, y: arr.y, px: c.px || 0, py: c.py || 0, sx: g ? g.sx : 0, sy: g ? g.sy : 0 };
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------------- 저장 ---------------- */
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function doSave() {
    if (!S.photos.length) { toast('사진을 먼저 골라주세요'); return; }
    render();
    var type = S.fmt || 'image/png';
    var name = '달래쨘_' + stamp() + (type === 'image/jpeg' ? '.jpg' : '.png');

    function handle(blob) {
      if (!blob) { toast('저장에 실패했어요. 미리보기를 길게 눌러 저장해 주세요'); return; }
      lastBlob = blob;
      lastBlobName = name;
      var url = URL.createObjectURL(blob);
      var link = $('ieOutLink');
      link.href = url;
      link.download = name;
      $('ieOutImg').src = url;
      $('ieOut').hidden = false;
      $('ieShare').hidden = !(navigator.canShare && lastBlob);

      var tmp = document.createElement('a');
      tmp.href = url;
      tmp.download = name;
      document.body.appendChild(tmp);
      tmp.click();
      setTimeout(function () { if (tmp.parentNode) tmp.parentNode.removeChild(tmp); }, 400);
      toast('저장했어요 · 사진첩/다운로드에서 확인해 주세요');
    }

    if (canvas.toBlob) {
      canvas.toBlob(handle, type, 0.92);
    } else {
      try { handle(dataURLtoBlob(canvas.toDataURL(type, 0.92))); } catch (e) { handle(null); }
    }
  }

  function dataURLtoBlob(u) {
    var parts = u.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function doShare() {
    if (!lastBlob) { toast('먼저 저장을 한 번 눌러주세요'); return; }
    try {
      var file = new File([lastBlob], lastBlobName, { type: lastBlob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch(function () { /* 취소 */ });
      } else {
        toast('이 브라우저에서는 공유가 안 돼요. 저장 버튼을 눌러주세요');
      }
    } catch (e) { toast('공유가 안 돼요. 저장 버튼을 눌러주세요'); }
  }

  /* ---------------- 이벤트 연결 ---------------- */
  function wire() {
    $('iePick').addEventListener('click', function () { $('ieFile').click(); });
    $('ieAdd').addEventListener('click', function () { $('ieFile').click(); });
    $('ieFile').addEventListener('change', function () {
      addFiles(this.files);
      this.value = '';
    });
    $('ieClear').addEventListener('click', function () { clearAll(); });

    Array.prototype.forEach.call($('ieMode').children, function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });

    // 접이식 패널
    $('ieGap').addEventListener('input', function () {
      S.gap = parseInt(this.value, 10) || 0;
      $('ieGapOut').textContent = S.gap;
      baseDirty = true; schedule(); savePrefs();
    });
    $('ieRadius').addEventListener('input', function () {
      S.radius = parseInt(this.value, 10) || 0;
      $('ieRadiusOut').textContent = S.radius;
      baseDirty = true; schedule(); savePrefs();
    });

    // 칸 자르기
    $('ieZoom').addEventListener('input', function () {
      cell(S.sel).zoom = (parseInt(this.value, 10) || 100) / 100;
      $('ieZoomOut').textContent = cell(S.sel).zoom.toFixed(1) + '×';
      baseDirty = true; schedule();
    });
    $('iePanX').addEventListener('input', function () {
      cell(S.sel).px = (parseInt(this.value, 10) || 0) / 100;
      $('iePanXOut').textContent = this.value;
      baseDirty = true; schedule();
    });
    $('iePanY').addEventListener('input', function () {
      cell(S.sel).py = (parseInt(this.value, 10) || 0) / 100;
      $('iePanYOut').textContent = this.value;
      baseDirty = true; schedule();
    });
    $('ieFit').addEventListener('click', function () {
      var c = cell(S.sel);
      c.fit = !c.fit;
      c.zoom = 1;
      c.px = 0; c.py = 0;
      baseDirty = true; syncSliders(); schedule();
    });
    $('ieCellReset').addEventListener('click', function () {
      S.cells[S.sel] = { zoom: 1, px: 0, py: 0, fit: false };
      baseDirty = true; syncSliders(); schedule();
      toast('이 칸을 처음 상태로 돌렸어요');
    });

    // 모자이크
    $('ieBrush').addEventListener('input', function () {
      S.brush = parseInt(this.value, 10) || 34;
      $('ieBrushOut').textContent = S.brush;
    });
    $('ieUndo').addEventListener('click', function () {
      if (!S.strokes.length) { toast('되돌릴 모자이크가 없어요'); return; }
      S.strokes.pop();
      rebuildMask();
      schedule();
      toast('한 번 되돌렸어요');
    });
    $('ieMaskClear').addEventListener('click', function () {
      if (!S.strokes.length) { toast('지울 모자이크가 없어요'); return; }
      S.strokes = [];
      rebuildMask();
      schedule();
      toast('모자이크를 모두 지웠어요');
    });

    // 워터마크
    $('ieWmText').addEventListener('input', function () {
      S.wm.text = this.value;
      renderWmPresets();
      savePrefs();
      schedule();
    });
    $('ieWmSize').addEventListener('input', function () {
      S.wm.size = parseInt(this.value, 10) || 34;
      $('ieWmSizeOut').textContent = S.wm.size;
      savePrefs(); schedule();
    });
    $('ieWmOpacity').addEventListener('input', function () {
      S.wm.opacity = parseInt(this.value, 10) || 85;
      $('ieWmOpacityOut').textContent = S.wm.opacity + '%';
      savePrefs(); schedule();
    });
    $('ieWmBadge').addEventListener('click', function () {
      S.wm.badge = !S.wm.badge;
      this.classList.toggle('on', S.wm.badge);
      this.setAttribute('aria-pressed', S.wm.badge ? 'true' : 'false');
      savePrefs(); schedule();
    });
    $('ieWmShadow').addEventListener('click', function () {
      S.wm.shadow = !S.wm.shadow;
      this.classList.toggle('on', S.wm.shadow);
      this.setAttribute('aria-pressed', S.wm.shadow ? 'true' : 'false');
      savePrefs(); schedule();
    });

    // 저장
    $('ieSave').addEventListener('click', doSave);
    $('ieShare').addEventListener('click', doShare);
    // 이미지 탭 안 세그먼트(편집기 / 수급 가이드)
    Array.prototype.forEach.call($('imgSeg').children, function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-pane');
        Array.prototype.forEach.call($('imgSeg').children, function (x) {
          var on = x === b;
          x.classList.toggle('on', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $('imgPane-edit').classList.toggle('active', name === 'edit');
        $('imgPane-guide').classList.toggle('active', name === 'guide');
        if (name === 'edit') { updateSelBox(); }
      });
    });

    window.addEventListener('resize', function () { updateSelBox(); });
    window.addEventListener('orientationchange', function () { setTimeout(updateSelBox, 220); });
  }

  /* ---------------- 시작 ---------------- */
  function init() {
    S.fmt = 'image/png';
    loadPrefs();
    wire();
    resizeCanvas();
    rebuildMask();
    syncAll();
    updateSelBox();
    render();

    // 이미지 탭을 열 때 캔버스 폭이 정해지므로 다시 그린다
    var tabBtn = document.querySelector('.tab[data-tab="images"]');
    if (tabBtn) {
      tabBtn.addEventListener('click', function () {
        setTimeout(function () { updateSelBox(); }, 60);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
