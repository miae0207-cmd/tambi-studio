/* 탐비 블로그 스튜디오 — app logic (드라마 · 자동차 · 지원금경제) */
(function () {
  'use strict';

  var HF = window.HF;
  var LS_KEY = 'tambi_studio_v2';
  var OLD_KEY = 'tambi_studio_v1';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- state ---------------- */
  function todayKey(d) {
    var t = d || new Date();
    var m = t.getMonth() + 1, day = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  var state = {
    goal: 3,
    log: {},
    saved: [],
    checks: {},
    mode: 'show',
    work: '',
    keyword: '',
    hook: '',
    outcome: '',
    channel: '',
    actor: '',
    tone: 'all',
    imgQuery: '',
    blog: 'drama',
    topicFilter: { drama: 'all', car: 'all', money: 'all' },
    topicQuery: { drama: '', car: '', money: '' },
    savedFilter: 'all'
  };

  function loadState() {
    var raw = null;
    try { raw = window.localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
    if (!raw) {
      try { raw = window.localStorage.getItem(OLD_KEY); } catch (e2) { raw = null; }
    }
    if (!raw) return;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      if (typeof o.goal === 'number' && o.goal > 0 && o.goal <= 20) state.goal = Math.round(o.goal);
      if (o.log && typeof o.log === 'object') state.log = o.log;
      if (Array.isArray(o.saved)) {
        state.saved = o.saved.filter(function (x) { return x && x.text; }).map(function (x) {
          return {
            text: x.text,
            blog: x.blog || 'drama',
            name: x.name || x.work || '',
            mode: x.mode === 'hide' ? 'hide' : 'show',
            at: x.at || ''
          };
        });
      }
      if (o.checks && typeof o.checks === 'object') state.checks = o.checks;
      if (o.mode === 'show' || o.mode === 'hide') state.mode = o.mode;
      ['work', 'keyword', 'hook', 'outcome', 'channel', 'actor', 'tone', 'imgQuery'].forEach(function (k) {
        if (typeof o[k] === 'string') state[k] = o[k];
      });
      if (o.blog === 'drama' || o.blog === 'car' || o.blog === 'money') state.blog = o.blog;
      if (o.topicFilter && typeof o.topicFilter === 'object') {
        ['drama', 'car', 'money'].forEach(function (b) {
          if (typeof o.topicFilter[b] === 'string') state.topicFilter[b] = o.topicFilter[b];
        });
      }
      if (o.topicQuery && typeof o.topicQuery === 'object') {
        ['drama', 'car', 'money'].forEach(function (b) {
          if (typeof o.topicQuery[b] === 'string') state.topicQuery[b] = o.topicQuery[b];
        });
      }
    } catch (e) { /* private mode: run without storage */ }
  }

  var saveTimer = null;
  function saveState() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { window.localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    }, 120);
  }

  /* ---------------- utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  function copyText(text, btn) {
    var done = function (ok) {
      toast(ok ? '복사했어요 · 붙여넣기 하세요' : '복사가 안 됐어요. 길게 눌러 복사해 주세요');
      if (ok && btn) {
        var old = btn.textContent;
        btn.textContent = '복사됨 ✓';
        setTimeout(function () { btn.textContent = old; }, 1400);
      }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  }
  function legacyCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      done(ok);
    } catch (e) { done(false); }
  }
  function copyLine(text) {
    var row = el('div', 'mini-title');
    row.appendChild(el('span', 'mt-text', text));
    var b = el('button', 'copy-btn', '복사');
    b.addEventListener('click', function () { copyText(text, b); });
    row.appendChild(b);
    return row;
  }
  function copyLineSaved(text, blog, name, kind) {
    var row = el('div', 'mini-title' + (kind === 'homefeed' ? ' hf' : ''));
    var wrap = el('span', 'mt-wrap');
    wrap.appendChild(el('span', 'mt-text', text));
    row.appendChild(wrap);
    var acts = el('span', 'mt-acts');
    var b = el('button', 'copy-btn', '복사');
    b.addEventListener('click', function () { copyText(text, b); });
    var sv = el('button', 'copy-btn save', '저장');
    sv.addEventListener('click', function () {
      var added = addSaved(text, blog, name, kind);
      sv.textContent = added ? '저장됨 ✓' : '이미 저장됨';
    });
    acts.appendChild(b);
    acts.appendChild(sv);
    row.appendChild(acts);
    return row;
  }

  /* ---------------- goal tracker ---------------- */
  var DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

  function renderGoal() {
    var key = todayKey();
    var done = Math.max(0, Number(state.log[key]) || 0);
    var goal = state.goal || 3;
    var pct = Math.min(100, Math.round((done / goal) * 100));

    $('goalCount').innerHTML = done + ' <em>/ ' + goal + '편</em>';
    var bar = $('goalBar');
    bar.style.width = pct + '%';
    $('goalBarWrap').classList.toggle('full', done >= goal);

    var badge = $('statusBadge');
    badge.classList.toggle('done', done >= goal);
    var label = done >= goal ? '☕ 목표 달성! 휴식 중' : (done > 0 ? '✍️ 열일 중' : '🌱 첫 글 기다리는 중');
    badge.innerHTML = '<span class="pulse"></span>' + esc(label);

    var hint = $('goalHint');
    if (done >= goal) hint.textContent = '오늘 몫 끝! 🎉';
    else hint.textContent = (goal - done) + '편 남았어요';

    var week = $('weekDots');
    week.innerHTML = '';
    var now = new Date();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var k = todayKey(d);
      var n = Math.max(0, Number(state.log[k]) || 0);
      var cell = el('div', 'day' + (n > 0 ? ' on' : '') + (i === 0 ? ' today' : ''));
      cell.appendChild(el('b', null, n > 0 ? String(n) : '·'));
      cell.appendChild(el('span', null, DAY_NAMES[d.getDay()]));
      cell.title = k + ' · ' + n + '편';
      week.appendChild(cell);
    }
  }

  function bumpGoal(delta) {
    var key = todayKey();
    var cur = Math.max(0, Number(state.log[key]) || 0);
    var next = cur + delta;
    if (next < 0) next = 0;
    if (next > 30) next = 30;
    var wasBelow = cur < state.goal;
    state.log[key] = next;
    saveState();
    renderGoal();
    if (delta > 0 && wasBelow && next >= state.goal) {
      toast('오늘 목표 달성! 🎉 여기까지가 제일 잘한 일이에요');
    } else if (delta > 0) {
      toast(next + '편째 발행 기록! ✍️');
    }
  }

  /* ---------------- data ---------------- */
  var DATA = { drama: [], car: [], money: [] };
  var META = { updated: '', label: '' };

  var DEFAULT_BLOGS = [
    { id: 'drama', icon: '📺', label: '드라마', key: 'topics',
      filters: [{ k: 'all', t: '전체' }, { k: 'airing', t: '방영중' }, { k: 'past', t: '과거작' }] },
    { id: 'car', icon: '🚗', label: '자동차', key: 'car',
      filters: [{ k: 'all', t: '전체' }, { k: '신차', t: '신차' }, { k: '리콜', t: '리콜' },
        { k: '세금', t: '세금' }, { k: '정비', t: '정비' }, { k: '보조금', t: '보조금' }, { k: '초보운전', t: '초보운전' }] },
    { id: 'money', icon: '💰', label: '지원금·경제', key: 'money',
      filters: [{ k: 'all', t: '전체' }, { k: '지원금', t: '지원금' }, { k: '세금', t: '세금' },
        { k: '소상공인', t: '소상공인' }, { k: '생활경제', t: '생활경제' }] }
  ];
  var BLOGS = DEFAULT_BLOGS.slice(0);
  var BLOG_BY_ID = {};
  function indexBlogs() {
    BLOG_BY_ID = {};
    BLOGS.forEach(function (b) { BLOG_BY_ID[b.id] = b; });
  }
  indexBlogs();

  function blogOf(id) { return BLOG_BY_ID[id] || DEFAULT_BLOGS[0]; }
  function blogLabel(id) {
    var b = blogOf(id);
    return (b.icon ? b.icon + ' ' : '') + b.label;
  }
  function listOf(blog) {
    if (blog === 'car') return DATA.car;
    if (blog === 'money') return DATA.money;
    return DATA.drama;
  }

  function applyTopics(data) {
    if (!data || typeof data !== 'object') return false;
    var drama = Array.isArray(data.topics) ? data.topics : [];
    var car = Array.isArray(data.car) ? data.car : [];
    var money = Array.isArray(data.money) ? data.money : [];
    if (!drama.length && !car.length && !money.length) return false;
    DATA.drama = drama;
    DATA.car = car;
    DATA.money = money;
    if (Array.isArray(data.blogs) && data.blogs.length === 3) {
      BLOGS = data.blogs;
      indexBlogs();
    }
    META.updated = data.updated || '';
    META.label = data.label || '';
    renderBlogSwitch();
    renderTopicsMeta();
    renderTopicFilter();
    renderTopics();
    renderImageChips();
    return true;
  }

  function updatedLabel() {
    if (!META.updated) return '';
    var d = new Date(META.updated);
    if (isNaN(d.getTime())) return '';
    var hh = d.getHours(), mm = d.getMinutes();
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
  }

  function renderTopicsMeta() {
    var meta = $('topicsMeta');
    var items = listOf(state.blog);
    var parts = [];
    if (state.blog === 'drama') {
      var airing = items.filter(function (t) { return t.status === 'airing'; }).length;
      parts.push('방영중 <b>' + airing + '</b> · 과거작 <b>' + (items.length - airing) + '</b>');
    } else {
      var counts = {};
      items.forEach(function (t) { counts[t.badge] = (counts[t.badge] || 0) + 1; });
      parts.push('<b>' + items.length + '</b>개 소재');
      var top = Object.keys(counts).slice(0, 3).map(function (k) { return k + ' ' + counts[k]; });
      if (top.length) parts.push(top.join(' · '));
    }
    var when = updatedLabel();
    if (when) parts.push(when + ' 업데이트');
    if (META.label && state.blog === 'drama') parts.push(esc(META.label));
    meta.innerHTML = parts.join(' · ');
  }

  function loadTopics(manual) {
    var meta = $('topicsMeta');
    if (manual) meta.textContent = '소재 새로 불러오는 중…';
    var url = 'topics.json?v=' + Date.now();
    var req;
    try {
      req = fetch(url, { cache: 'no-store' });
    } catch (e) {
      req = null;
    }
    if (!req) {
      applyTopics(window.TOPICS_FALLBACK);
      if (manual) toast('오프라인 소재로 보여드릴게요');
      return;
    }
    req.then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!applyTopics(d)) throw new Error('empty');
      if (manual) toast('최신 소재로 새로고침했어요');
    }).catch(function () {
      var ok = applyTopics(window.TOPICS_FALLBACK);
      if (!ok) meta.textContent = '소재를 불러오지 못했어요. 새로고침을 눌러주세요.';
      else if (manual) toast('지금은 저장된 소재로 보여드려요');
      if (!listOf(state.blog).length) renderTopics();
    });
  }

  /* ---------------- blog switcher ---------------- */
  function renderBlogSwitch() {
    var box = $('blogSwitch');
    if (!box) return;
    box.innerHTML = '';
    BLOGS.forEach(function (b) {
      var n = listOf(b.id).length;
      var btn = el('button', 'blog-btn' + (state.blog === b.id ? ' on' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', state.blog === b.id ? 'true' : 'false');
      btn.appendChild(el('span', 'bi', b.icon || '•'));
      btn.appendChild(el('span', 'bl', b.label));
      btn.appendChild(el('span', 'bn', String(n)));
      btn.addEventListener('click', function () { setBlog(b.id); });
      box.appendChild(btn);
    });
  }

  function setBlog(id) {
    if (!BLOG_BY_ID[id] || state.blog === id) return;
    state.blog = id;
    saveState();
    renderBlogSwitch();
    renderTopicsMeta();
    renderTopicFilter();
    renderTopics();
    var sIn = $('topicSearch');
    if (sIn) {
      sIn.value = state.topicQuery[id] || '';
      sIn.placeholder = id === 'drama' ? '작품명 · 배우 · 채널로 찾기'
        : (id === 'car' ? '차종 · 리콜 · 보조금으로 찾기' : '지원금 · 대상 · 기간으로 찾기');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- filters ---------------- */
  function countFor(blog, k) {
    var items = listOf(blog);
    if (k === 'all') return items.length;
    if (blog === 'drama') return items.filter(function (t) { return t.status === k; }).length;
    return items.filter(function (t) { return t.badge === k; }).length;
  }

  function renderTopicFilter() {
    var box = $('topicFilter');
    if (!box) return;
    box.innerHTML = '';
    var defs = blogOf(state.blog).filters || [];
    defs.forEach(function (d) {
      var n = countFor(state.blog, d.k);
      var on = state.topicFilter[state.blog] === d.k;
      var b = el('button', 'chip' + (on ? ' on' : ''), d.t + ' ' + n);
      b.type = 'button';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.topicFilter[state.blog] = d.k;
        saveState();
        renderTopicFilter();
        renderTopics();
      });
      box.appendChild(b);
    });
  }

  /* ---------------- topics list ---------------- */
  function officialSearchUrl(q) {
    return 'https://search.naver.com/search.naver?query=' + encodeURIComponent(q + ' 공식 홈페이지');
  }
  function youtubeUrl(q) {
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  }
  function outLink(href, label, title, cls) {
    var a = el('a', cls || null, label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (title) a.title = title;
    return a;
  }
  function hayOf(obj) {
    var out = [];
    (function walk(v) {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number') { out.push(String(v)); return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (typeof v === 'object') {
        Object.keys(v).forEach(function (k) { walk(v[k]); });
      }
    })(obj);
    return out.join(' ').toLowerCase();
  }

  function renderTopics() {
    var list = $('topicList');
    if (!list) return;
    list.innerHTML = '';
    var blog = state.blog;
    var q = (state.topicQuery[blog] || '').trim().toLowerCase();
    var f = state.topicFilter[blog] || 'all';
    var items = listOf(blog).filter(function (t) {
      if (f !== 'all') {
        if (blog === 'drama' ? t.status !== f : t.badge !== f) return false;
      }
      if (!q) return true;
      return hayOf(t).indexOf(q) >= 0;
    });
    if (!items.length) {
      list.appendChild(el('div', 'empty', '조건에 맞는 소재가 없어요. 검색어를 지우거나 새로고침을 눌러보세요.'));
      return;
    }
    items.forEach(function (t, i) {
      list.appendChild(blog === 'drama' ? dramaCard(t, i) : genericCard(t, blog, i));
    });
  }

  /* ---- 드라마 카드 ---- */
  function dramaCard(t, idx) {
    var card = el('article', 'topic-card' + (t.heat === 'hot' ? ' hot' : ''));
    var top = el('div', 'topic-top');
    top.appendChild(el('span', 'badge ' + (t.status === 'airing' ? 'airing' : 'past'),
      t.status === 'airing' ? '방영중' : '과거작'));
    if (t.status === 'past') top.appendChild(el('span', 'badge hide', '제목엔 작품명 숨김'));
    if (t.heat === 'hot') top.appendChild(el('span', 'badge flame', '🔥 화제'));
    if (t.genre) top.appendChild(el('span', 'badge genre', t.genre));
    top.appendChild(el('span', 'topic-meta', [t.channel, t.year || t.slot].filter(Boolean).join(' · ')));
    card.appendChild(top);

    if (idx === 0 && state.topicFilter.drama === 'all') {
      var pick = el('p', 'sec-label', '오늘의 추천');
      pick.style.margin = '10px 0 0';
      card.appendChild(pick);
    }

    card.appendChild(el('h3', 'topic-work', t.work));
    if (t.cast) card.appendChild(el('p', 'topic-cast', t.cast));
    if (t.metric) card.appendChild(el('p', 'topic-metric', '📊 ' + t.metric));
    card.appendChild(el('p', 'topic-why', t.why));

    if (Array.isArray(t.angles) && t.angles.length) {
      card.appendChild(el('p', 'sec-label', '이 각도로 쓰면'));
      var ul = el('ul', 'angle-list');
      t.angles.forEach(function (a) {
        var li = el('li');
        li.appendChild(el('span', 'ang-i', a.icon || '·'));
        li.appendChild(el('span', null, a.text || ''));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    if (Array.isArray(t.titles) && t.titles.length) {
      card.appendChild(el('p', 'sec-label', t.status === 'airing' ? '바로 쓸 제목 · [작품명] [회차], [훅]' : '검색용 제목 · 작품명 포함'));
      var tl = el('div', 'mini-titles');
      t.titles.forEach(function (txt) {
        tl.appendChild(copyLineSaved(txt, 'drama', t.work, 'search'));
      });
      card.appendChild(tl);
    }

    if (Array.isArray(t.homefeed) && t.homefeed.length) {
      var hlabel = el('p', 'sec-label', '홈판 제목 · 작품명 없이');
      card.appendChild(hlabel);
      var hl = el('div', 'mini-titles');
      t.homefeed.forEach(function (txt) {
        hl.appendChild(copyLineSaved(txt, 'drama', t.work, 'homefeed'));
      });
      card.appendChild(hl);
    }

    var ib = el('div', 'img-row');
    if (t.officialPhotoUrl) {
      ib.appendChild(outLink(t.officialPhotoUrl, '🖼 공홈 스틸컷',
        (t.officialPhotoLabel || '공식 홈페이지') + ' — ' + (t.officialPhotoNote || '방송사 공식 포토 페이지')));
    } else {
      var note = el('span', 'img-note', '공홈 포토 없음 → 유튜브 캡처 추천');
      if (t.officialPhotoNote) note.title = t.officialPhotoNote;
      ib.appendChild(note);
    }
    if (t.officialYoutubeUrl) {
      ib.appendChild(outLink(t.officialYoutubeUrl, '▶ 공식 유튜브',
        (t.officialYoutubeName || '공식 채널') + '에서 이 작품 클립만 모아 보기'));
    }
    card.appendChild(ib);

    if (Array.isArray(t.timeline) && t.timeline.length) {
      var story = document.createElement('details');
      story.className = 'fold';
      story.appendChild(el('summary', null, '📖 줄거리 순서 · 하이라이트 보기'));
      var sb = el('div', 'fold-body');
      var tlList = el('ol', 'tl-list');
      t.timeline.forEach(function (r) {
        var li = el('li');
        li.appendChild(el('span', 'tl-range', r.range));
        li.appendChild(el('span', 'fold-text', r.text));
        tlList.appendChild(li);
      });
      sb.appendChild(tlList);
      if (Array.isArray(t.highlights) && t.highlights.length) {
        sb.appendChild(el('p', 'sec-label', '주요 하이라이트'));
        var hls = el('ul', 'hl-list');
        t.highlights.forEach(function (h) {
          var li = el('li');
          li.appendChild(el('span', 'hl-ep', h.ep));
          li.appendChild(el('span', 'fold-text', h.text));
          hls.appendChild(li);
        });
        sb.appendChild(hls);
      }
      story.appendChild(sb);
      card.appendChild(story);
    }

    if (Array.isArray(t.behind) && t.behind.length) {
      var bd = document.createElement('details');
      bd.className = 'fold behind';
      bd.appendChild(el('summary', null, '🎬 비하인드 · 특이점 ' + t.behind.length + '개'));
      var bbody = el('div', 'fold-body');
      var bl = el('ul', 'bh-list');
      t.behind.forEach(function (b) {
        var li = el('li');
        li.appendChild(el('span', 'bh-label', b.label));
        li.appendChild(el('span', 'fold-text', b.text));
        bl.appendChild(li);
      });
      bbody.appendChild(bl);
      bd.appendChild(bbody);
      card.appendChild(bd);
    }

    var acts = el('div', 'topic-acts');
    var go = el('button', 'btn soft sm', '이 작품으로 제목 뽑기 →');
    go.type = 'button';
    go.addEventListener('click', function () { useTopic(t); });
    var all = el('button', 'btn ghost sm', '제목 ' + ((t.titles || []).length + (t.homefeed || []).length) + '개 복사');
    all.type = 'button';
    all.addEventListener('click', function () {
      var text = (t.homefeed || []).concat(t.titles || []).join('\n');
      if (!text) return;
      copyText(text, all);
    });
    acts.appendChild(go);
    acts.appendChild(all);
    card.appendChild(acts);

    return card;
  }

  function useTopic(t) {
    var f = t.formula || {};
    state.work = t.work;
    state.keyword = (t.keywords && t.keywords[0]) || '';
    state.mode = t.status === 'airing' ? 'show' : 'hide';
    state.hook = f.hook || '';
    state.outcome = f.outcome || '';
    state.channel = f.channel || '';
    state.actor = f.actor || '';
    saveState();
    syncGenInputs();
    setTab('titles');
    runTitles(true);
    toast(t.status === 'airing'
      ? '방영중 공식으로 채웠어요 · [작품명] [회차], [훅]'
      : '과거작 공식으로 채웠어요 · 작품명 숨김');
  }

  /* ---- 자동차 · 지원금경제 카드 ---- */
  function genericCard(t, blog, idx) {
    var card = el('article', 'topic-card' + (t.heat === 'hot' ? ' hot' : ''));
    var top = el('div', 'topic-top');
    if (t.badge) top.appendChild(el('span', 'badge cat', t.badge));
    if (t.heat === 'hot') top.appendChild(el('span', 'badge flame', '🔥 화제'));
    var metaTxt = t.when || '';
    if (metaTxt) top.appendChild(el('span', 'topic-meta', metaTxt));
    card.appendChild(top);

    if (idx === 0 && state.topicFilter[blog] === 'all') {
      var pick = el('p', 'sec-label', '오늘의 추천');
      pick.style.margin = '10px 0 0';
      card.appendChild(pick);
    }

    card.appendChild(el('h3', 'topic-work', t.name || ''));
    if (t.what) card.appendChild(el('p', 'topic-lede', t.what));
    if (t.why) card.appendChild(el('p', 'topic-why', t.why));

    if (Array.isArray(t.facts) && t.facts.length) {
      card.appendChild(el('p', 'sec-label', blog === 'money' ? '대상 · 기간 · 혜택' : '핵심 숫자'));
      var dl = el('dl', 'fact-grid');
      t.facts.forEach(function (f) {
        if (!f || !f.k) return;
        var row = el('div', 'fact-row');
        row.appendChild(el('dt', null, f.k));
        row.appendChild(el('dd', null, f.v));
        dl.appendChild(row);
      });
      card.appendChild(dl);
    }

    if (Array.isArray(t.points) && t.points.length) {
      card.appendChild(el('p', 'sec-label', '어려운 용어 없이 핵심만'));
      var ul = el('ul', 'angle-list point-list');
      t.points.forEach(function (p) {
        var li = el('li');
        li.appendChild(el('span', 'ang-i', '✔'));
        li.appendChild(el('span', null, p));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    if (Array.isArray(t.jargon) && t.jargon.length) {
      var jd = document.createElement('details');
      jd.className = 'fold';
      jd.appendChild(el('summary', null, '📖 쉬운 말로: ' + t.jargon.map(function (j) { return j.t; }).join(' · ')));
      var jb = el('div', 'fold-body');
      var jl = el('dl', 'jargon-list');
      t.jargon.forEach(function (j) {
        var row = el('div', 'fact-row');
        row.appendChild(el('dt', null, j.t));
        row.appendChild(el('dd', null, j.e));
        jl.appendChild(row);
      });
      jb.appendChild(jl);
      jd.appendChild(jb);
      card.appendChild(jd);
    }

    if (Array.isArray(t.titles) && t.titles.length) {
      card.appendChild(el('p', 'sec-label', '바로 쓸 제목 ' + t.titles.length + '개'));
      var tl = el('div', 'mini-titles');
      t.titles.forEach(function (x) {
        var txt = typeof x === 'string' ? x : x.text;
        var kind = typeof x === 'string' ? 'search' : (x.kind || 'search');
        var row = copyLineSaved(txt, blog, t.name || '', kind);
        if (kind === 'homefeed') {
          (row.querySelector('.mt-wrap') || row).appendChild(el('span', 'kind-tag', '홈판형'));
        } else {
          (row.querySelector('.mt-wrap') || row).appendChild(el('span', 'kind-tag search', '검색형'));
        }
        tl.appendChild(row);
      });
      card.appendChild(tl);
    }

    if (Array.isArray(t.links) && t.links.length) {
      card.appendChild(el('p', 'sec-label', '공식 출처만'));
      var lrow = el('div', 'link-row');
      t.links.forEach(function (l) {
        var a = el('a', 'link-pill');
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.appendChild(el('span', 'lp-label', l.label));
        if (l.note) a.appendChild(el('small', null, l.note));
        lrow.appendChild(a);
      });
      card.appendChild(lrow);
    }

    if (t.note) card.appendChild(el('p', 'note-line', '⚠️ ' + t.note));

    var acts = el('div', 'topic-acts');
    var all = el('button', 'btn ghost sm', '제목 ' + (t.titles || []).length + '개 복사');
    all.type = 'button';
    all.addEventListener('click', function () {
      var text = (t.titles || []).map(function (x) { return typeof x === 'string' ? x : x.text; }).join('\n');
      if (!text) return;
      copyText(text, all);
    });
    var kw = el('button', 'btn soft sm', '키워드만 보기');
    kw.type = 'button';
    kw.addEventListener('click', function () {
      var q = $('topicSearch');
      q.value = (t.keywords && t.keywords[0]) || (t.name || '');
      state.topicQuery[blog] = q.value;
      saveState();
      renderTopics();
      q.focus();
      toast('이 소재 키워드로 걸렀어요');
    });
    acts.appendChild(all);
    acts.appendChild(kw);
    card.appendChild(acts);

    return card;
  }

  /* ---------------- generator ---------------- */
  function syncGenInputs() {
    $('genWork').value = state.work || '';
    $('genKeyword').value = state.keyword || '';
    $('genHook').value = state.hook || '';
    $('genOutcome').value = state.outcome || '';
    $('genChannel').value = state.channel || '';
    $('genActor').value = state.actor || '';
    document.querySelectorAll('#modeSwitch button').forEach(function (b) {
      var on = b.getAttribute('data-mode') === state.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var note = $('modeNote');
    if (state.mode === 'hide') {
      note.textContent = "과거작 공식: '인용 훅' + 성과·방송사·배우 + 드라마. 제목에서 작품명은 빠지고, 저장할 때 작품명이 메모로 남아요.";
    } else {
      note.textContent = '방영중 공식: [작품명] [회차], [한 줄 훅]. 회차를 넣어야 검색과 홈판을 같이 잡습니다.';
    }
    renderToneChips();
  }

  function primaryKeyword(raw) {
    var parts = String(raw || '').split(/[,、·\/|]+/);
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (t) return t;
    }
    return '';
  }

  var TONES = [
    { k: 'all', t: '전체' },
    { k: 'curious', t: '궁금증' },
    { k: 'twist', t: '반전·해석' },
    { k: 'empathy', t: '공감·반응' },
    { k: 'clean', t: '정리' }
  ];

  function renderToneChips() {
    var box = $('toneChips');
    if (!box) return;
    box.innerHTML = '';
    TONES.forEach(function (t) {
      var b = el('button', 'chip' + (state.tone === t.k ? ' on' : ''), t.t);
      b.type = 'button';
      b.setAttribute('aria-pressed', state.tone === t.k ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.tone = t.k;
        saveState();
        renderToneChips();
      });
      box.appendChild(b);
    });
  }

  var FORMULA = {
    past: {
      rule: "'인용 훅' + 성과 · 방송사 · 배우 + 드라마",
      note: '작품명은 제목에서 뺍니다. 훅 안에 숫자가 있으면 클릭이 붙어요(확인한 숫자만).',
      samples: [
        "'시청률 0.2% 였는데..' 종영 3개월만에 넷플릭스 3위 한 드라마",
        '"첫방 4%대 드라마라고?" 3주 만에 넷플릭스 세계 1위 찍은 SBS 드라마',
        "'7주 동안 무슨 일이..' 11.3%로 시작해서 18.2%로 끝난 드라마",
        "'2회 만에 넷플릭스 1위..' 2.9%로 시작해 류승룡이 백상 대상까지 받은 드라마"
      ]
    },
    show: {
      rule: '[작품명] [회차·포인트], [상징적인 한 줄 훅]',
      note: '작품명을 앞에 두고, 쉼표 뒤에 그 회차만의 장면을 한 줄로 박습니다.',
      samples: [
        '100일의 거짓말 10회, 터진 건 폭탄만이 아니었다'
      ]
    }
  };

  function renderFormulaCard() {
    var box = $('formulaCard');
    if (!box) return;
    box.innerHTML = '';
    var card = el('div', 'card formula-card');
    card.appendChild(el('h3', null, '🏆 달래쨘 홈판 제목 공식'));

    [['past', '과거·종영작', '작품명 숨김'], ['show', '방영중', '작품명 포함']].forEach(function (def) {
      var f = FORMULA[def[0]];
      var wrap = el('div', 'fml');
      var head = el('div', 'fml-head');
      head.appendChild(el('b', null, def[1]));
      head.appendChild(el('span', 'fml-tag', def[2]));
      wrap.appendChild(head);
      wrap.appendChild(el('p', 'fml-rule', f.rule));
      wrap.appendChild(el('p', 'fml-note', f.note));
      f.samples.forEach(function (s) { wrap.appendChild(copyLine(s)); });
      card.appendChild(wrap);
    });
    box.appendChild(card);
  }

  function runTitles(skipToast) {
    var work = $('genWork').value.trim();
    if (!work) {
      toast('작품명을 먼저 적어주세요');
      $('genWork').focus();
      return;
    }
    state.work = work;
    state.keyword = $('genKeyword').value.trim();
    state.hook = $('genHook').value.trim();
    state.outcome = $('genOutcome').value.trim();
    state.channel = $('genChannel').value.trim();
    state.actor = $('genActor').value.trim();
    saveState();

    var kw = primaryKeyword(state.keyword);
    if (HF && HF.buildTitles) {
      var list = HF.buildTitles({
        mode: state.mode,
        work: work,
        keyword: kw,
        hook: state.hook,
        outcome: state.outcome,
        channel: state.channel,
        actor: state.actor,
        tone: state.tone,
        limit: 9,
        rand: Math.random
      });
      renderTitles(list);
      if (!skipToast) toast(list.length ? '제목 ' + list.length + '개를 뽑았어요' : '키워드를 조금 바꿔 다시 시도해 주세요');
    }
  }

  function renderTitles(list) {
    var out = $('titleOut');
    out.innerHTML = '';
    var head = el('div', 'block-title');
    head.appendChild(el('h3', null, '추천 제목'));
    head.appendChild(el('span', null, state.mode === 'hide' ? '작품명 숨김 · 24~45자 우선' : '작품명 포함 · 24~45자 우선'));
    out.appendChild(head);

    if (!list || !list.length) {
      out.appendChild(el('div', 'empty', '조건에 맞는 제목이 없어요. 회차를 넣거나 다른 톤으로 바꿔보세요.'));
      return;
    }

    var basket = el('div', null);
    list.forEach(function (t) {
      var row = el('div', 't-row');
      row.appendChild(el('p', 't-text', t.text));
      var meta = el('div', 't-meta');
      meta.appendChild(el('span', 'fit ' + t.fit.cls, t.fit.label + ' · ' + t.len + '자'));
      if (t.toneLabel) meta.appendChild(el('span', 'tone-tag', t.toneLabel));

      var acts = el('div', 't-acts');
      var cp = el('button', null, '복사');
      cp.addEventListener('click', function () { copyText(t.text, cp); });
      var sv = el('button', 'save', '저장');
      sv.addEventListener('click', function () {
        var added = addSaved(t.text, 'drama', state.work, state.mode === 'hide' ? 'homefeed' : 'search');
        sv.textContent = added ? '저장됨 ✓' : '이미 저장됨';
        sv.classList.add('saved');
      });
      acts.appendChild(cp);
      acts.appendChild(sv);
      meta.appendChild(acts);
      row.appendChild(meta);
      basket.appendChild(row);
    });
    out.appendChild(basket);

    if (!HF.findAggro || HF.findAggro(list.map(function (t) { return t.text; }).join(' ')).length === 0) {
      var ok = el('p', 'view-sub', '자극어(충격·경악 등) 없이 뽑았어요. 길이가 ‘적정’인 제목부터 쓰면 좋아요.');
      ok.style.margin = '2px 2px 0';
      out.appendChild(ok);
    }
  }

  function runAngles() {
    var work = $('genWork').value.trim();
    if (!work) {
      toast('작품명을 먼저 적어주세요');
      $('genWork').focus();
      return;
    }
    state.work = work;
    state.keyword = $('genKeyword').value.trim();
    saveState();

    var catId = state.mode === 'hide' ? 'ended' : 'airing';
    var rot = Math.floor(Math.random() * 3);
    var angles = HF.buildAngles(catId, work, primaryKeyword(state.keyword), rot, state.mode);
    renderAngles(angles);
    toast('각도 ' + angles.length + '개를 준비했어요');
  }

  function renderAngles(angles) {
    var out = $('angleOut');
    out.innerHTML = '';
    var head = el('div', 'block-title');
    head.appendChild(el('h3', null, '글 각도 · 구성 가이드'));
    head.appendChild(el('span', null, state.mode === 'hide' ? '과거작용' : '방영중용'));
    out.appendChild(head);

    angles.forEach(function (a, i) {
      var d = el('details', 'angle-card');
      if (i === 0) d.open = true;

      var s = el('summary');
      s.appendChild(el('span', 'a-icon', a.icon || '·'));
      s.appendChild(el('span', 'a-name', a.name));
      s.appendChild(el('span', 'a-tag', a.tagline));
      d.appendChild(s);

      var body = el('div', 'a-body');
      body.appendChild(el('p', 'a-why', a.why));

      if (a.guide && a.guide.length) {
        var ol = el('ol', 'a-guide');
        a.guide.forEach(function (g) { ol.appendChild(el('li', null, g)); });
        body.appendChild(ol);
      }

      if (a.samples && a.samples.length) {
        var sb = el('div', 'a-samples');
        a.samples.forEach(function (txt) {
          var row = el('div', 'a-sample');
          row.appendChild(el('span', null, txt));
          var b = el('button', 'copy-btn', '복사');
          b.addEventListener('click', function () { copyText(txt, b); });
          row.appendChild(b);
          sb.appendChild(row);
        });
        body.appendChild(sb);
      }

      if (a.keywords && a.keywords.length) {
        var kw = el('div', 'a-kw');
        a.keywords.forEach(function (k) { kw.appendChild(el('i', null, '#' + k)); });
        body.appendChild(kw);
      }

      d.appendChild(body);
      out.appendChild(d);
    });
  }

  /* ---------------- saved ---------------- */
  function addSaved(text, blog, name, kind) {
    var exists = state.saved.some(function (x) { return x.text === text; });
    if (exists) return false;
    state.saved.unshift({
      text: text,
      blog: blog || 'drama',
      name: name || '',
      kind: kind || ''
    });
    state.saved = state.saved.slice(0, 300);
    saveState();
    renderSaved();
    renderSavedFilter();
    updateSavedBadge();
    return true;
  }

  function updateSavedBadge() {
    var n = state.saved.length;
    var b = $('savedBadge');
    if (b) b.textContent = n ? String(n) : '';
  }

  function renderSaved() {
    var box = $('savedList');
    if (!box) return;
    box.innerHTML = '';
    var items = state.saved.filter(function (x) {
      return state.savedFilter === 'all' || x.blog === state.savedFilter;
    });
    if (!items.length) {
      box.appendChild(el('div', 'empty', '아직 저장한 제목이 없어요.\n카드나 제목 뽑기에서 ‘저장’을 누르면 여기에 모입니다.'));
      return;
    }
    items.forEach(function (x) {
      var row = el('div', 'saved-row');
      var mid = el('div');
      mid.style.flex = '1 1 auto';
      mid.appendChild(el('span', 's-text', x.text));
      var memo = [blogLabel(x.blog)];
      if (x.name) memo.push(x.name);
      if (x.blog === 'drama') memo.push(x.mode === 'hide' ? '과거작 · 숨김' : '방영중');
      if (x.kind === 'homefeed') memo.push('홈판형');
      mid.appendChild(el('span', 's-meta', memo.join(' · ')));
      row.appendChild(mid);

      var act = el('div', 's-act');
      var cp = el('button', null, '복사');
      cp.addEventListener('click', function () { copyText(x.text, cp); });
      var del = el('button', 'del', '삭제');
      del.addEventListener('click', function () {
        state.saved = state.saved.filter(function (y) { return y !== x; });
        saveState();
        renderSaved();
        renderSavedFilter();
        updateSavedBadge();
        toast('삭제했어요');
      });
      act.appendChild(cp);
      act.appendChild(del);
      row.appendChild(act);
      box.appendChild(row);
    });
  }

  function renderSavedFilter() {
    var box = $('savedFilter');
    if (!box) return;
    box.innerHTML = '';
    var defs = [{ k: 'all', t: '전체' }].concat(BLOGS.map(function (b) {
      return { k: b.id, t: b.label };
    }));
    defs.forEach(function (d) {
      var n = d.k === 'all' ? state.saved.length : state.saved.filter(function (x) { return x.blog === d.k; }).length;
      var b = el('button', 'chip' + (state.savedFilter === d.k ? ' on' : ''), d.t + ' ' + n);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.savedFilter = d.k;
        renderSavedFilter();
        renderSaved();
      });
      box.appendChild(b);
    });
  }

  /* ---------------- images ---------------- */
  function currentImgQuery() {
    var typed = $('imgQuery').value.trim();
    return typed || state.imgQuery || '';
  }

  function updateImgLinks() {
    var q = currentImgQuery();
    state.imgQuery = $('imgQuery').value.trim();
    var defs = {
      home: q ? officialSearchUrl(q) : 'https://search.naver.com/search.naver?query=' + encodeURIComponent('드라마 공식 홈페이지'),
      yt: q ? youtubeUrl(q + ' 공식 클립') : 'https://www.youtube.com/results?search_query=' + encodeURIComponent('드라마 공식 클립')
    };
    Object.keys(defs).forEach(function (k) {
      var a = document.querySelector('[data-imglink="' + k + '"]');
      if (a) a.href = defs[k];
    });
    $('qPreview').textContent = q
      ? '“' + q + '” 공식 홈페이지와 공식 클립만 찾습니다 · 기사 사진은 쓰지 않아요'
      : '작품명을 적으면 아래 버튼이 그 작품의 공식 페이지만 찾아갑니다';
  }

  function renderImageChips() {
    var box = $('imgChips');
    if (!box) return;
    box.innerHTML = '';
    DATA.drama.slice(0, 8).forEach(function (t) {
      var b = el('button', 'chip', t.work);
      b.type = 'button';
      b.addEventListener('click', function () {
        $('imgQuery').value = t.work;
        updateImgLinks();
        toast(t.work + ' 검색으로 바꿨어요');
      });
      box.appendChild(b);
    });
  }

  /* ---------------- checklist ---------------- */
  function renderChecklist() {
    var box = $('checkList');
    if (!box || !HF || !HF.CHECKLIST) return;
    box.innerHTML = '';
    var total = 0, done = 0;

    HF.CHECKLIST.forEach(function (g) {
      var wrap = el('div', 'check-group');
      wrap.appendChild(el('h4', null, g.group));
      g.items.forEach(function (it) {
        total++;
        var on = !!state.checks[it.id];
        if (on) done++;
        var label = el('label', 'check-item');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = on;
        input.addEventListener('change', function () {
          state.checks[it.id] = input.checked;
          saveState();
          renderChecklist();
        });
        var boxEl = el('span', 'box', '✓');
        var cw = el('span', 'ci-wrap');
        cw.appendChild(el('span', 'ci-text', it.label));
        if (it.hint) cw.appendChild(el('span', 'ci-hint', it.hint));
        label.appendChild(input);
        label.appendChild(boxEl);
        label.appendChild(cw);
        wrap.appendChild(label);
      });
      box.appendChild(wrap);
    });

    var pct = total ? Math.round((done / total) * 100) : 0;
    $('checkCount').textContent = done + ' / ' + total + ' 완료';
    $('checkBar').style.width = pct + '%';
  }

  /* ---------------- tabs ---------------- */
  var TABS = ['topics', 'titles', 'images', 'saved'];

  function setTab(name) {
    if (TABS.indexOf(name) < 0) name = 'topics';
    TABS.forEach(function (k) {
      var v = $('view-' + k);
      if (v) v.classList.toggle('active', k === name);
    });
    document.querySelectorAll('.tab').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + name);
    }
  }

  /* ---------------- init ---------------- */
  function init() {
    loadState();

    var now = new Date();
    $('todayLabel').textContent = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' +
      now.getDate() + '일 ' + DAY_NAMES[now.getDay()] + '요일 · 3블로그 스튜디오';

    renderGoal();
    $('plusBtn').addEventListener('click', function () { bumpGoal(1); });
    $('minusBtn').addEventListener('click', function () { bumpGoal(-1); });

    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });
    $('savedBadge').addEventListener('click', function () { setTab('saved'); });

    renderBlogSwitch();
    renderTopicsMeta();
    renderTopicFilter();
    var sIn = $('topicSearch');
    if (sIn) {
      sIn.value = state.topicQuery[state.blog] || '';
      sIn.addEventListener('input', function () {
        state.topicQuery[state.blog] = this.value;
        saveState();
        renderTopics();
      });
    }
    $('refreshTopics').addEventListener('click', function () { loadTopics(true); });
    loadTopics(false);

    renderFormulaCard();
    syncGenInputs();
    $('genWork').addEventListener('input', function () { state.work = this.value; saveState(); });
    $('genKeyword').addEventListener('input', function () { state.keyword = this.value; saveState(); });
    ['genHook', 'genOutcome', 'genChannel', 'genActor'].forEach(function (id) {
      var n = $(id);
      if (!n) return;
      n.addEventListener('input', function () {
        state[id.replace('gen', '').toLowerCase()] = this.value;
        saveState();
      });
      n.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); runTitles(); }
      });
    });
    $('genKeyword').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runTitles(); }
    });
    document.querySelectorAll('#modeSwitch button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mode = b.getAttribute('data-mode');
        saveState();
        syncGenInputs();
        if ($('genWork').value.trim()) { runTitles(true); runAnglesSilent(); }
      });
    });
    $('runTitles').addEventListener('click', function () { runTitles(); });
    $('runAngles').addEventListener('click', function () { runAngles(); });

    if (state.imgQuery) $('imgQuery').value = state.imgQuery;
    $('imgQuery').addEventListener('input', updateImgLinks);
    $('imgQuery').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = currentImgQuery();
        if (q) window.open(officialSearchUrl(q), '_blank', 'noopener');
      }
    });
    updateImgLinks();

    renderChecklist();
    var resetBtn = $('checkReset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.checks = {};
      saveState();
      renderChecklist();
      toast('체크리스트를 비웠어요');
    });

    renderSavedFilter();
    renderSaved();
    updateSavedBadge();
    $('clearSaved').addEventListener('click', function () {
      if (!state.saved.length) { toast('저장함이 비어 있어요'); return; }
      state.saved = [];
      saveState();
      renderSaved();
      renderSavedFilter();
      updateSavedBadge();
      toast('저장함을 비웠어요');
    });

    var h = (window.location.hash || '').replace('#', '');
    setTab(TABS.indexOf(h) >= 0 ? h : 'topics');
  }

  function runAnglesSilent() {
    var work = $('genWork').value.trim();
    if (!work) return;
    var catId = state.mode === 'hide' ? 'ended' : 'airing';
    renderAngles(HF.buildAngles(catId, work, primaryKeyword(state.keyword), Math.floor(Math.random() * 3), state.mode));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
