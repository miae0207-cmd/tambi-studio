/* 탐비 블로그 스튜디오 — 🎬 움짤 만들기 (짧은 영상 → GIF)
   · 영상을 골라 구간만 잘라 GIF89a로 굽습니다.
   · 외부 라이브러리/CDN 없이 팔레트 양자화(중앙값 분할) + LZW 인코더를 이 파일 안에 직접 넣었습니다.
   · 영상은 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다. */
(function (root) {
  'use strict';

  /* =====================================================================
    1. GIF89a 인코더 (순수 JS)
    ===================================================================== */
  var GifEnc = (function () {

    function nextPow2(n) { var p = 2; while (p < n) p <<= 1; return p; }

    /* ---- 중앙값 분할(median cut) 팔레트 만들기 ----
       r,g,b : 같은 길이의 채널 배열, count : 픽셀 수, maxColors : 팔레트 색 수 */
    function quantize(r, g, b, count, maxColors) {
      maxColors = Math.max(2, Math.min(256, maxColors || 256));
      if (!count) return [[0, 0, 0]];

      var order = new Array(count);
      for (var i = 0; i < count; i++) order[i] = i;

      function stats(box) {
        var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
        for (var i = box.lo; i < box.hi; i++) {
          var k = order[i];
          var R = r[k], G = g[k], B = b[k];
          if (R < rmin) rmin = R; if (R > rmax) rmax = R;
          if (G < gmin) gmin = G; if (G > gmax) gmax = G;
          if (B < bmin) bmin = B; if (B > bmax) bmax = B;
        }
        box.rmin = rmin; box.rmax = rmax;
        box.gmin = gmin; box.gmax = gmax;
        box.bmin = bmin; box.bmax = bmax;
        var dr = rmax - rmin, dg = gmax - gmin, db = bmax - bmin;
        box.axis = (dr >= dg && dr >= db) ? 0 : (dg >= db ? 1 : 2);
        box.range = Math.max(dr, dg, db);
      }

      var boxes = [{ lo: 0, hi: count }];
      stats(boxes[0]);

      while (boxes.length < maxColors) {
        var best = -1, bestScore = 0;
        for (var i = 0; i < boxes.length; i++) {
          var bx = boxes[i];
          var n = bx.hi - bx.lo;
          if (n < 2) continue;
          var sc = (bx.range + 1) * Math.sqrt(n);
          if (sc > bestScore) { bestScore = sc; best = i; }
        }
        if (best < 0) break;

        var box = boxes[best];
        var src = box.axis === 0 ? r : (box.axis === 1 ? g : b);
        var sub = order.slice(box.lo, box.hi);
        sub.sort(function (p, q) { return src[p] - src[q]; });
        for (var j = 0; j < sub.length; j++) order[box.lo + j] = sub[j];

        var mid = box.lo + (sub.length >> 1);
        var b1 = { lo: box.lo, hi: mid };
        var b2 = { lo: mid, hi: box.hi };
        stats(b1); stats(b2);
        boxes[best] = b1;
        boxes.push(b2);
      }

      var pal = [];
      for (var bi = 0; bi < boxes.length; bi++) {
        var e = boxes[bi], sr = 0, sg = 0, sb = 0, c = 0;
        for (var p = e.lo; p < e.hi; p++) {
          var kk = order[p];
          sr += r[kk]; sg += g[kk]; sb += b[kk]; c++;
        }
        if (!c) continue;
        pal.push([Math.round(sr / c), Math.round(sg / c), Math.round(sb / c)]);
      }
      return pal;
    }

    /* ---- 색 → 팔레트 인덱스 (5·5·5 캐시로 빠르게) ---- */
    function mapper(palette) {
      var n = palette.length;
      var pr = new Uint8Array(n), pg = new Uint8Array(n), pb = new Uint8Array(n);
      for (var i = 0; i < n; i++) {
        pr[i] = palette[i][0]; pg[i] = palette[i][1]; pb[i] = palette[i][2];
      }
      var cache = new Int16Array(32768);
      cache.fill(-1);
      return function (r, g, b) {
        var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        var hit = cache[key];
        if (hit >= 0) return hit;
        var best = 0, bd = 1 << 30;
        for (var i2 = 0; i2 < n; i2++) {
          var dr = r - pr[i2], dg = g - pg[i2], db = b - pb[i2];
          var d = dr * dr * 2 + dg * dg * 3 + db * db;
          if (d < bd) { bd = d; best = i2; if (!d) break; }
        }
        cache[key] = best;
        return best;
      };
    }

    /* ---- 바이트 쓰기 도구 ---- */
    function Writer(cap) {
      this.b = new Uint8Array(cap || 65536);
      this.n = 0;
    }
    Writer.prototype.grow = function (need) {
      if (this.n + need <= this.b.length) return;
      var cap = this.b.length;
      while (cap < this.n + need) cap *= 2;
      var nb = new Uint8Array(cap);
      nb.set(this.b.subarray(0, this.n));
      this.b = nb;
    };
    Writer.prototype.byte = function (v) {
      this.grow(1);
      this.b[this.n++] = v & 255;
    };
    Writer.prototype.u16 = function (v) {
      this.grow(2);
      this.b[this.n++] = v & 255;
      this.b[this.n++] = (v >> 8) & 255;
    };
    Writer.prototype.str = function (s) {
      this.grow(s.length);
      for (var i = 0; i < s.length; i++) this.b[this.n++] = s.charCodeAt(i) & 255;
    };
    Writer.prototype.bytes = function (arr, off, len) {
      this.grow(len);
      this.b.set(arr.subarray(off, off + len), this.n);
      this.n += len;
    };
    Writer.prototype.result = function () { return this.b.slice(0, this.n); };

    /* ---- LZW 압축 (GIF 변형) ---- */
    function writeLZW(w, indices, minCodeSize) {
      var len = indices.length;
      var clearCode = 1 << minCodeSize;
      var eoiCode = clearCode + 1;
      var codeSize = minCodeSize + 1;
      var maxCode = (1 << codeSize) - 1;
      var nextCode = eoiCode + 1;

      var dict = new Int32Array(4096 * 256);
      dict.fill(-1);

      var block = new Uint8Array(255), bn = 0;
      var cur = 0, curBits = 0;

      w.byte(minCodeSize);

      function flushBlock() {
        if (!bn) return;
        w.byte(bn);
        w.bytes(block, 0, bn);
        bn = 0;
      }
      function out(code) {
        cur |= (code << curBits);
        curBits += codeSize;
        while (curBits >= 8) {
          block[bn++] = cur & 255;
          if (bn === 255) flushBlock();
          cur >>>= 8;
          curBits -= 8;
        }
      }

      out(clearCode);
      if (len) {
        var prefix = indices[0];
        for (var i = 1; i < len; i++) {
          var c = indices[i];
          var key = (prefix << 8) | c;
          var code = dict[key];
          if (code >= 0) { prefix = code; continue; }
          out(prefix);
          if (nextCode < 4096) {
            dict[key] = nextCode++;
            /* GIF 디코더는 한 칸 늦게 코드 길이를 늘리므로, 인코더도 그에 맞춰
               (1<<codeSize) 를 넘어설 때 늘린다. */
            if (nextCode > (1 << codeSize) && codeSize < 12) {
              codeSize++;
              maxCode = (1 << codeSize) - 1;
            }
          } else {
            out(clearCode);
            dict.fill(-1);
            nextCode = eoiCode + 1;
            codeSize = minCodeSize + 1;
            maxCode = (1 << codeSize) - 1;
          }
          prefix = c;
        }
        out(prefix);
      }
      out(eoiCode);
      if (curBits > 0) {
        block[bn++] = cur & 255;
        if (bn === 255) flushBlock();
      }
      flushBlock();
      w.byte(0);
    }

    /* ---- GIF 한 장 굽기 ----
       o = { width, height, palette:[[r,g,b],...], frames:[{indices, delayCs, transparentIndex}], loop } */
    function encode(o) {
      var W = o.width | 0, H = o.height | 0;
      var frames = o.frames || [];
      var pal = o.palette || [[0, 0, 0]];
      var need = pal.length;
      for (var f0 = 0; f0 < frames.length; f0++) {
        var ti = frames[f0].transparentIndex;
        if (typeof ti === 'number' && ti >= need) need = ti + 1;
      }
      var gctSize = nextPow2(Math.max(need, 2));
      if (gctSize > 256) gctSize = 256;
      var gctLog = 1; while ((1 << gctLog) < gctSize) gctLog++;
      var minCodeSize = Math.max(2, gctLog);

      var w = new Writer(1 << 16);
      w.str('GIF89a');
      w.u16(W); w.u16(H);
      w.byte(0x80 | 0x70 | (gctLog - 1));   /* 전역 팔레트 · 8bit 색 · 크기 */
      w.byte(0);                             /* 배경색 */
      w.byte(0);                             /* 픽셀 비율 */
      for (var i = 0; i < gctSize; i++) {
        var c = pal[i] || [0, 0, 0];
        w.byte(c[0]); w.byte(c[1]); w.byte(c[2]);
      }
      /* 무한 반복 */
      w.byte(0x21); w.byte(0xFF); w.byte(11);
      w.str('NETSCAPE2.0');
      w.byte(3); w.byte(1); w.u16(o.loop == null ? 0 : o.loop); w.byte(0);

      for (var f = 0; f < frames.length; f++) {
        var fr = frames[f];
        var tIdx = (typeof fr.transparentIndex === 'number') ? fr.transparentIndex : -1;
        /* 그래픽 제어: 처분방식 1(그대로 두기) + 투명색 */
        w.byte(0x21); w.byte(0xF9); w.byte(4);
        w.byte(0x04 | (tIdx >= 0 ? 1 : 0));
        w.u16(fr.delayCs || 10);
        w.byte(tIdx >= 0 ? tIdx : 0);
        w.byte(0);
        /* 이미지 */
        w.byte(0x2C);
        w.u16(0); w.u16(0); w.u16(W); w.u16(H);
        w.byte(0);
        writeLZW(w, fr.indices, minCodeSize);
      }

      w.byte(0x3B);
      return w.result();
    }

    return { quantize: quantize, mapper: mapper, encode: encode, nextPow2: nextPow2 };
  })();

  root.TambiGif = GifEnc;

  if (typeof document === 'undefined') return;   /* 헤드리스 검증용 */

  /* =====================================================================
    2. 화면 (🎬 움짤 만들기)
    ===================================================================== */
  var $ = function (id) { return document.getElementById(id); };
  if (!$('gmFile')) return;

  var STORE = 'tambi.gifMaker.v1';
  var MAX_LEN = 6;          /* 최대 6초 */
  var DEF_LEN = 4;          /* 기본 4초 */
  var WIDTHS = [
    { v: 640, label: '640px', sub: '블로그 추천' },
    { v: 480, label: '480px', sub: '가벼움' },
    { v: 800, label: '800px', sub: '선명함' }
  ];
  var FPSS = [
    { v: 8, label: '8 fps', sub: '가벼움' },
    { v: 10, label: '10 fps', sub: '기본' },
    { v: 12, label: '12 fps', sub: '부드러움' }
  ];
  var WM_PRESETS = ['달래쨘', '달래의 행복나라 여행기♡'];
  var WM_POS = [
    { id: 'none', label: '없음' },
    { id: 'br', label: '우하단' },
    { id: 'bl', label: '좌하단' },
    { id: 'tr', label: '우상단' }
  ];

  var S = {
    url: null, name: '', video: null,
    duration: 0, vw: 0, vh: 0,
    start: 0, end: DEF_LEN,
    width: 640, fps: 10,
    wmText: '달래쨘', wmPos: 'br',
    busy: false, outUrl: null, outName: '', outBytes: 0, outBlob: null,
    playing: false
  };

  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function fmtSec(v) { return (Math.round(v * 10) / 10).toFixed(1) + '초'; }
  function fmtSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp(d) {
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes());
  }
  function raf() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

  /* ---------------- 설정 기억 ---------------- */
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (p.width === 480 || p.width === 640 || p.width === 800) S.width = p.width;
      if (p.fps === 8 || p.fps === 10 || p.fps === 12) S.fps = p.fps;
      if (typeof p.wmText === 'string' && p.wmText.length <= 40) S.wmText = p.wmText;
      if (p.wmPos === 'none' || p.wmPos === 'br' || p.wmPos === 'bl' || p.wmPos === 'tr') S.wmPos = p.wmPos;
    } catch (e) { /* 무시 */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        width: S.width, fps: S.fps, wmText: S.wmText, wmPos: S.wmPos
      }));
    } catch (e) { /* 무시 */ }
  }

  /* ---------------- 칩 그리기 ---------------- */
  function renderWidths() {
    var box = $('gmWidths');
    box.innerHTML = '';
    WIDTHS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ie-chip' + (S.width === o.v ? ' on' : '');
      b.setAttribute('aria-pressed', S.width === o.v ? 'true' : 'false');
      b.innerHTML = o.label + ' <small>' + o.sub + '</small>';
      b.addEventListener('click', function () {
        S.width = o.v; savePrefs(); renderWidths(); syncInfo();
      });
      box.appendChild(b);
    });
  }
  function renderFps() {
    var box = $('gmFps');
    box.innerHTML = '';
    FPSS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ie-chip' + (S.fps === o.v ? ' on' : '');
      b.setAttribute('aria-pressed', S.fps === o.v ? 'true' : 'false');
      b.innerHTML = o.label + ' <small>' + o.sub + '</small>';
      b.addEventListener('click', function () {
        S.fps = o.v; savePrefs(); renderFps(); syncInfo();
      });
      box.appendChild(b);
    });
  }
  function renderWm() {
    var box = $('gmWmPresets');
    box.innerHTML = '';
    WM_PRESETS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ie-chip' + (S.wmText === t ? ' on' : '');
      b.textContent = t;
      b.addEventListener('click', function () {
        S.wmText = t;
        $('gmWmText').value = t;
        savePrefs(); renderWm();
      });
      box.appendChild(b);
    });
    var custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'ie-chip' + (WM_PRESETS.indexOf(S.wmText) < 0 ? ' on' : '');
    custom.textContent = '✏️ 직접 입력';
    custom.addEventListener('click', function () {
      var inp = $('gmWmText');
      if (WM_PRESETS.indexOf(S.wmText) >= 0) { inp.value = ''; S.wmText = ''; }
      inp.focus();
      savePrefs(); renderWm();
    });
    box.appendChild(custom);
  }
  function renderWmPos() {
    var box = $('gmWmPos');
    box.innerHTML = '';
    WM_POS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ie-chip' + (S.wmPos === o.id ? ' on' : '');
      b.setAttribute('aria-pressed', S.wmPos === o.id ? 'true' : 'false');
      b.textContent = o.label;
      b.addEventListener('click', function () {
        S.wmPos = o.id; savePrefs(); renderWmPos();
      });
      box.appendChild(b);
    });
  }

  /* ---------------- 구간 슬라이더 ---------------- */
  function syncRangeUI() {
    var st = $('gmStart'), en = $('gmEnd');
    st.value = String(Math.round(S.start * 10) / 10);
    en.value = String(Math.round(S.end * 10) / 10);
    $('gmStartOut').textContent = fmtSec(S.start);
    $('gmEndOut').textContent = fmtSec(S.end);
    var len = Math.max(0, S.end - S.start);
    $('gmLenOut').textContent = fmtSec(len);
    var n = Math.max(1, Math.round(len * S.fps));
    var anyLong = len >= MAX_LEN - 0.05;
    $('gmLimit').textContent = anyLong
      ? '⏱ ' + MAX_LEN + '초 상한에 걸렸어요. 더 길면 앞부분을 뒤로 밀어주세요.'
      : '⏱ 최대 ' + MAX_LEN + '초까지. 지금 ' + n + '프레임(' + fmtSec(len) + ')이에요.';
    syncInfo();
  }

  function syncInfo() {
    var len = Math.max(0, S.end - S.start);
    var n = Math.max(1, Math.round(len * S.fps));
    var H = S.vw ? Math.max(2, Math.round(S.width * S.vh / S.vw)) : 0;
    var txt = '결과 ' + S.width + ' × ' + H + 'px · ' + n + '프레임 · ' + S.fps + 'fps';
    if (H > S.width) txt += ' · 세로 영상이라 용량이 커질 수 있어요';
    $('gmInfo').textContent = txt;
  }

  function clampRange(from) {
    var d = S.duration || 0;
    if (S.start < 0) S.start = 0;
    if (S.start > Math.max(0, d - 0.4)) S.start = Math.max(0, d - 0.4);
    if (S.end > d) S.end = d;
    var minLen = Math.min(0.4, d);
    if (S.end < S.start + minLen) S.end = Math.min(d, S.start + minLen);
    if (S.end - S.start > MAX_LEN) {
      if (from === 'start') S.end = S.start + MAX_LEN;
      else S.start = Math.max(0, S.end - MAX_LEN);
    }
    S.start = Math.round(S.start * 10) / 10;
    S.end = Math.round(S.end * 10) / 10;
  }

  /* ---------------- 영상 불러오기 ---------------- */
  function loadFile(file) {
    if (!file) return;
    var isVideo = /^video\//.test(file.type || '') || /\.(mp4|mov|m4v|webm|ogv|avi|mkv)$/i.test(file.name || '');
    if (!isVideo) { toast('영상 파일만 됩니다 (MP4·MOV·WebM)'); return; }

    if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) { } }
    if (S.outUrl) { try { URL.revokeObjectURL(S.outUrl); } catch (e) { } }

    S.url = URL.createObjectURL(file);
    S.name = file.name || 'video';
    S.duration = 0; S.vw = 0; S.vh = 0;
    S.outUrl = null; S.outBlob = null;

    $('gmFileInfo').hidden = false;
    $('gmFileInfo').textContent = '🎬 ' + S.name + ' · ' + fmtSize(file.size || 0);
    $('gmOut').hidden = true;
    $('gmProgWrap').hidden = true;

    var v = $('gmVideo');
    v.src = S.url;
    v.load();
    $('gmEditorCard').hidden = false;
    $('gmRun').disabled = true;
    $('gmRun').textContent = '⏳ 영상 읽는 중…';

    function onMeta() {
      v.removeEventListener('loadedmetadata', onMeta);
      S.duration = isFinite(v.duration) ? v.duration : 0;
      S.vw = v.videoWidth || 0;
      S.vh = v.videoHeight || 0;
      if (!S.duration || !S.vw) {
        $('gmRun').textContent = '🎬 GIF 만들기';
        $('gmRun').disabled = true;
        $('gmLimit').textContent = '⚠️ 이 영상을 브라우저가 못 읽어요. MP4로 바꿔서 다시 해보세요.';
        return;
      }
      var st = $('gmStart'), en = $('gmEnd');
      st.max = String(Math.round(S.duration * 10) / 10);
      en.max = String(Math.round(S.duration * 10) / 10);
      st.step = '0.1'; en.step = '0.1';
      S.start = 0;
      S.end = Math.min(DEF_LEN, S.duration);
      clampRange('start');
      syncRangeUI();
      $('gmMeta').textContent = '길이 ' + fmtSec(S.duration) + ' · 원본 ' + S.vw + ' × ' + S.vh + 'px';
      $('gmRun').disabled = false;
      $('gmRun').textContent = '🎬 GIF 만들기';
      try { v.currentTime = Math.min(0.05, S.duration / 2); } catch (e) { }
    }
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('error', function () {
      $('gmRun').textContent = '🎬 GIF 만들기';
      $('gmRun').disabled = true;
      $('gmLimit').textContent = '⚠️ 이 영상은 브라우저가 못 읽어요. MP4(H.264)로 바꿔보세요.';
    });
  }

  /* ---------------- 프레임 따기 ---------------- */
  function seekTo(v, t) {
    return new Promise(function (res) {
      var done = false;
      var timer = null;
      function fin() {
        if (done) return;
        done = true;
        v.removeEventListener('seeked', fin);
        if (timer) clearTimeout(timer);
        res();
      }
      v.addEventListener('seeked', fin);
      timer = setTimeout(fin, 3000);
      try {
        if (Math.abs(v.currentTime - t) < 0.004 && v.readyState >= 2) { fin(); return; }
        v.currentTime = t;
      } catch (e) { fin(); }
    });
  }

  function drawWm(ctx, w, h, text, pos) {
    if (!text || pos === 'none') return;
    var fs = Math.max(11, Math.round(w * 0.043));
    ctx.save();
    ctx.font = '800 ' + fs + 'px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    var tw = ctx.measureText(text).width;
    var padX = Math.round(fs * 0.62), padY = Math.round(fs * 0.42);
    var bw = Math.min(w - 2, Math.round(tw + padX * 2));
    var bh = Math.round(fs + padY * 2);
    var m = Math.max(6, Math.round(w * 0.022));
    var x, y;
    if (pos === 'bl') { x = m; y = h - bh - m; }
    else if (pos === 'tr') { x = w - bw - m; y = m; }
    else { x = w - bw - m; y = h - bh - m; }   /* br */
    var r = bh / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + bw, y, x + bw, y + bh, r);
    ctx.arcTo(x + bw, y + bh, x, y + bh, r);
    ctx.arcTo(x, y + bh, x, y, r);
    ctx.arcTo(x, y, x + bw, y, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(24,18,38,.52)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = Math.max(1, Math.round(fs * 0.12));
    ctx.fillText(text, x + padX, y + bh / 2 + 1, bw - padX * 2);
    ctx.restore();
  }

  function setProg(pct, text) {
    $('gmProgWrap').hidden = false;
    $('gmBar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    $('gmPct').textContent = Math.round(pct) + '%';
    $('gmStage').textContent = text || '';
  }

  var BUSY = false;

  function makeGif() {
    if (BUSY) return;
    var v = $('gmVideo');
    if (!S.duration) { toast('먼저 영상을 골라주세요'); return; }

    BUSY = true;
    $('gmRun').disabled = true;
    $('gmRun').textContent = '⏳ 만드는 중…';
    $('gmOut').hidden = true;

    var W = S.width;
    var H = Math.max(2, Math.round(W * S.vh / S.vw));
    var len = Math.max(0.2, S.end - S.start);
    var n = Math.max(1, Math.min(96, Math.round(len * S.fps)));
    var delayCs = Math.max(2, Math.round(100 / S.fps));
    var wmText = S.wmPos === 'none' ? '' : ($('gmWmText').value || '').trim();

    var crop = { start: S.start, end: S.end };

    /* --- 1단계: 색 뽑기 (작은 화면으로 몇 장만) --- */
    var pw = 160, ph = Math.max(2, Math.round(pw * S.vh / S.vw));
    var pc = document.createElement('canvas');
    pc.width = pw; pc.height = ph;
    var pctx = pc.getContext('2d', { willReadFrequently: true });

    var samples = 8;
    var sr = [], sg = [], sb = [];

    function palettePass(i) {
      if (i >= samples) return Promise.resolve();
      var t = crop.start + (len * (i + 0.5) / samples);
      t = Math.min(Math.max(0, S.duration - 0.02), t);
      return seekTo(v, t).then(raf).then(raf).then(function () {
        pctx.drawImage(v, 0, 0, pw, ph);
        var d;
        try { d = pctx.getImageData(0, 0, pw, ph).data; } catch (e) { return palettePass(i + 1); }
        var step = 4 * 3;
        for (var p = 0; p < d.length; p += step) {
          sr.push(d[p]); sg.push(d[p + 1]); sb.push(d[p + 2]);
        }
        setProg(2 + (i + 1) / samples * 8, '색 뽑는 중');
        return palettePass(i + 1);
      });
    }

    palettePass(0).then(function () {
      var palette = GifEnc.quantize(
        new Uint8Array(sr), new Uint8Array(sg), new Uint8Array(sb), sr.length, 200);
      /* 투명 슬롯 하나를 팔레트 끝에 붙인다 */
      var transIdx = palette.length;
      palette.push([0, 0, 0]);

      var cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      var ctx = cvs.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      var map = GifEnc.mapper(palette);
      var frames = [];
      var prevIdx = null;
      /* 화면에 실제로 남아 있는 색(ref)을 기억해 두고, 그 색과 거의 같으면 투명 처리.
         앞 프레임과만 비교하면 느린 페이드가 통째로 사라지므로 ref를 씁니다. */
      var refR = new Uint8Array(W * H), refG = new Uint8Array(W * H), refB = new Uint8Array(W * H);
      var palR = new Uint8Array(palette.length), palG = new Uint8Array(palette.length), palB = new Uint8Array(palette.length);
      for (var pi = 0; pi < palette.length; pi++) {
        palR[pi] = palette[pi][0]; palG[pi] = palette[pi][1]; palB[pi] = palette[pi][2];
      }

      function framePass(i) {
        if (i >= n) return Promise.resolve();
        var t = crop.start + (len * i / n);
        t = Math.min(Math.max(0, S.duration - 0.02), t);
        return seekTo(v, t).then(raf).then(raf).then(function () {
          ctx.drawImage(v, 0, 0, W, H);
          if (wmText) drawWm(ctx, W, H, wmText, S.wmPos);
          var img;
          try { img = ctx.getImageData(0, 0, W, H); } catch (e) {
            throw new Error('이 브라우저에서는 영상 프레임을 읽을 수 없어요');
          }
          var d = img.data;
          var idx = new Uint8Array(W * H);
          var k = 0;
          for (var p = 0; p < d.length; p += 4) {
            var r = d[p], g = d[p + 1], b = d[p + 2];
            if (i > 0) {
              var dr = r - refR[k], dg = g - refG[k], db = b - refB[k];
              if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 12) { idx[k] = transIdx; k++; continue; }
            }
            var q = map(r, g, b);
            if (i > 0 && prevIdx && q === prevIdx[k]) { idx[k] = transIdx; k++; continue; }
            idx[k] = q;
            refR[k] = palR[q]; refG[k] = palG[q]; refB[k] = palB[q];
            k++;
          }
          frames.push({
            indices: idx,
            delayCs: delayCs,
            transparentIndex: i === 0 ? -1 : transIdx
          });
          prevIdx = idx;
          setProg(10 + (i + 1) / n * 70, '프레임 따는 중 ' + (i + 1) + '/' + n);
          return framePass(i + 1);
        });
      }

      return framePass(0).then(function () {
        setProg(84, 'GIF로 굽는 중');
        return raf();
      }).then(function () {
        var bytes = GifEnc.encode({
          width: W, height: H,
          palette: palette,
          frames: frames,
          loop: 0
        });
        setProg(100, '다 되었어요');

        if (S.outUrl) { try { URL.revokeObjectURL(S.outUrl); } catch (e) { } }
        var blob = new Blob([bytes], { type: 'image/gif' });
        S.outBlob = blob;
        S.outBytes = blob.size;
        S.outUrl = URL.createObjectURL(blob);
        S.outName = '달래쨘_' + stamp(new Date()) + '.gif';

        var img = $('gmOutImg');
        img.src = S.outUrl;
        $('gmOutName').textContent = S.outName;
        $('gmOutSize').textContent = fmtSize(blob.size) + ' · ' + W + '×' + H + ' · ' + frames.length + '프레임';
        $('gmOutWarn').hidden = !(blob.size > 5 * 1024 * 1024);
        $('gmOut').hidden = false;

        var link = $('gmOutLink');
        link.href = S.outUrl;
        link.download = S.outName;

        $('gmShare').hidden = true;
        try {
          var f = new File([blob], S.outName, { type: 'image/gif' });
          if (navigator.canShare && navigator.canShare({ files: [f] })) $('gmShare').hidden = false;
        } catch (e) { }
      });
    }).catch(function (err) {
      setProg(0, '');
      $('gmProgWrap').hidden = true;
      toast((err && err.message) || '만들지 못했어요. 다른 영상으로 해보세요.');
    }).then(function () {
      BUSY = false;
      $('gmRun').disabled = false;
      $('gmRun').textContent = '🎬 GIF 만들기';
    });
  }

  /* ---------------- 저장 · 공유 ---------------- */
  function saveOut() {
    if (!S.outUrl) return;
    var a = document.createElement('a');
    a.href = S.outUrl;
    a.download = S.outName || 'tambi.gif';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('GIF를 저장했어요 · ' + (S.outName || ''));
  }
  function shareOut() {
    if (!S.outBlob) return;
    try {
      var f = new File([S.outBlob], S.outName, { type: 'image/gif' });
      navigator.share({ files: [f], title: '움짤' }).catch(function () { });
    } catch (e) { toast('공유를 열 수 없어요'); }
  }

  /* ---------------- 연결 ---------------- */
  function wire() {
    /* 영상 탭 안 세그먼트(편집기 / 움짤 만들기 / 수급 가이드) */
    var seg = $('imgSeg');
    if (seg) {
      Array.prototype.forEach.call(seg.children, function (b) {
        b.addEventListener('click', function () {
          var name = b.getAttribute('data-pane');
          var pane = $('imgPane-gif');
          if (pane) pane.classList.toggle('active', name === 'gif');
        });
      });
    }

    $('gmPick').addEventListener('click', function () { $('gmFile').click(); });
    $('gmFile').addEventListener('change', function () {
      loadFile(this.files && this.files[0]);
      this.value = '';
    });

    /* 드래그 앤 드롭 (PC) */
    var drop = $('gmDrop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.add('over');
      });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      drop.addEventListener(ev, function () { drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadFile(f);
    });

    /* 구간 */
    $('gmStart').addEventListener('input', function () {
      S.start = parseFloat(this.value) || 0;
      clampRange('start');
      v_playStop();
      syncRangeUI();
      try { $('gmVideo').currentTime = S.start; } catch (e) { }
    });
    $('gmEnd').addEventListener('input', function () {
      S.end = parseFloat(this.value) || 0;
      clampRange('end');
      v_playStop();
      syncRangeUI();
      try { $('gmVideo').currentTime = Math.max(0, S.end - 0.05); } catch (e) { }
    });

    $('gmPlay').addEventListener('click', function () { v_playRange(); });
    $('gmVideo').addEventListener('click', function () { v_playRange(); });

    /* 워터마크 */
    $('gmWmText').addEventListener('input', function () {
      S.wmText = this.value.slice(0, 40);
      savePrefs();
      renderWm();
    });

    /* 실행 */
    $('gmRun').addEventListener('click', makeGif);
    $('gmSave').addEventListener('click', saveOut);
    $('gmShare').addEventListener('click', shareOut);

    $('gmClear').addEventListener('click', function () {
      v_playStop();
      $('gmEditorCard').hidden = true;
      $('gmFileInfo').hidden = true;
      $('gmOut').hidden = true;
      var v = $('gmVideo');
      v.removeAttribute('src');
      try { v.load(); } catch (e) { }
      S.duration = 0; S.vw = 0; S.vh = 0;
      if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) { } S.url = null; }
    });
  }

  function v_playStop() {
    var v = $('gmVideo');
    S.playing = false;
    try { v.pause(); } catch (e) { }
    $('gmPlay').classList.remove('playing');
  }

  function v_playRange() {
    var v = $('gmVideo');
    if (S.playing) { v_playStop(); return; }
    if (!S.duration) return;
    S.playing = true;
    $('gmPlay').classList.add('playing');
    try { v.currentTime = S.start; } catch (e) { }
    var p = v.play();
    if (p && p.catch) p.catch(function () { v_playStop(); });
  }

  function init() {
    loadPrefs();
    renderWidths();
    renderFps();
    renderWm();
    renderWmPos();
    $('gmWmText').value = S.wmText;
    wire();

    var v = $('gmVideo');
    v.addEventListener('timeupdate', function () {
      if (!S.playing) return;
      if (v.currentTime >= S.end - 0.02) {
        try { v.currentTime = S.start; } catch (e) { v_playStop(); }
      }
    });
    v.addEventListener('pause', function () {
      if (S.playing) { S.playing = false; $('gmPlay').classList.remove('playing'); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
