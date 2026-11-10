/* DONELines mockup feedback layer
 * Pinned, element-anchored comments for static mockup pages.
 *
 * Config comes from window.FEEDBACK_CONFIG (injected by tools/build.mjs):
 *   { page, pageTitle, pages: [{slug, title}], endpoint, token }
 * With no endpoint it runs in "local" mode and keeps comments in this browser only.
 */
(function () {
  'use strict';
  var CFG = window.FEEDBACK_CONFIG || {};
  var PAGE = CFG.page || location.pathname;
  var LOCAL = !CFG.endpoint;
  var NAME_KEY = 'dl-feedback-name';
  var LOCAL_KEY = 'dl-feedback-local:' + PAGE;

  var SENT = {
    like: { label: 'Like', color: '#12B76A', icon: '👍' },
    dislike: { label: 'Don’t like', color: '#F04438', icon: '👎' },
    note: { label: 'Note', color: '#2E90FA', icon: '💬' }
  };

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ---------- storage ----------
  var api = {
    list: function () {
      if (LOCAL) {
        try { return Promise.resolve(JSON.parse(safeGet(LOCAL_KEY) || '[]')); }
        catch (e) { return Promise.resolve([]); }
      }
      var url = CFG.endpoint + (CFG.endpoint.indexOf('?') < 0 ? '?' : '&') +
        'action=list&page=' + encodeURIComponent(PAGE) + '&token=' + encodeURIComponent(CFG.token || '');
      return fetch(url).then(readJson).then(function (r) { return r.comments || []; });
    },
    send: function (payload) {
      if (LOCAL) return api.list().then(function (all) {
        if (payload.action === 'add') all.push(payload.comment);
        if (payload.action === 'resolve') all.forEach(function (c) { if (c.id === payload.id) c.resolved = payload.resolved; });
        safeSet(LOCAL_KEY, JSON.stringify(all));
        return { ok: true };
      });
      payload.token = CFG.token || '';
      // text/plain keeps this a "simple" request, so the browser skips the CORS preflight
      // that Google Apps Script can't answer.
      return fetch(CFG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(readJson);
    }
  };
  function readJson(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().then(function (j) {
      if (j && j.ok === false) throw new Error(j.error || 'Request failed');
      return j;
    });
  }

  // ---------- anchoring ----------
  function selectorFor(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var tag = el.tagName.toLowerCase();
      var i = 1, sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }
  function labelFor(el) {
    var t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t) t = '<' + el.tagName.toLowerCase() + '>';
    return t.length > 70 ? t.slice(0, 67) + '…' : t;
  }
  function pickTarget(el) {
    // Climb out of SVG internals so the whole icon is the target.
    while (el && el.ownerSVGElement) el = el.ownerSVGElement;
    return el;
  }
  function pinPosition(c) {
    var el = null;
    try { el = c.selector ? document.querySelector(c.selector) : null; } catch (e) {}
    var sx = window.scrollX, sy = window.scrollY;
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + sx + r.width * c.rx, y: r.top + sy + r.height * c.ry };
    }
    var w = document.documentElement.scrollWidth;
    return { x: (c.docXf || 0.5) * w, y: c.docY || 0, lost: true };
  }

  // ---------- UI shell (Shadow DOM so page styles can't leak in) ----------
  var host = document.createElement('div');
  host.setAttribute('data-feedback-ui', '');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'button{font:inherit;cursor:pointer}' +
    '.bar{position:fixed;right:16px;bottom:16px;display:flex;gap:6px;align-items:center;padding:6px;border-radius:14px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:14px;max-width:calc(100vw - 32px);flex-wrap:wrap}' +
    '.bar button,.bar a{border:0;border-radius:9px;padding:9px 12px;background:transparent;color:#fff;font-size:14px;font-weight:600;text-decoration:none;line-height:1.2}' +
    '.bar button:hover,.bar a:hover{background:#374151}' +
    '.bar .primary{background:#fff;color:#111827}.bar .primary:hover{background:#E5E7EB}' +
    '.bar .on{background:#FACC15;color:#111827}.bar .on:hover{background:#FDE047}' +
    '.bar .cur{background:#374151}' +
    '.sep{width:1px;align-self:stretch;background:#374151;margin:4px 2px}' +
    '.hint{position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#FACC15;color:#111827;padding:10px 16px;border-radius:999px;font-size:14px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.2);display:none;max-width:calc(100vw - 32px);text-align:center}' +
    '.hl{position:absolute;pointer-events:none;outline:2px dashed #FACC15;outline-offset:2px;background:rgba(250,204,21,.08);border-radius:4px;display:none}' +
    '.pin{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50% 50% 50% 4px;border:2px solid #fff;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.3);padding:0}' +
    '.pin:hover,.pin.active{transform:scale(1.15)}' +
    '.pin.resolved{background:#98A2B3!important;opacity:.75}' +
    '.pop{position:absolute;width:320px;max-width:calc(100vw - 24px);background:#fff;color:#101828;border-radius:14px;box-shadow:0 16px 40px rgba(16,24,40,.25);padding:14px;font-size:14px;line-height:1.5}' +
    '.pop textarea,.pop input{width:100%;border:1px solid #D0D5DD;border-radius:8px;padding:9px 10px;font:inherit;font-size:14px;color:#101828;background:#fff}' +
    '.pop textarea{min-height:90px;resize:vertical}' +
    '.pop textarea:focus,.pop input:focus{outline:2px solid #2E90FA;outline-offset:0;border-color:transparent}' +
    '.seg{display:flex;gap:6px;margin-bottom:10px}' +
    '.seg button{flex:1;border:1px solid #D0D5DD;background:#fff;border-radius:8px;padding:7px 4px;font-size:13px;font-weight:600;color:#344054}' +
    '.seg button[aria-pressed=true]{border-color:currentColor;background:#F9FAFB}' +
    '.row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;align-items:center}' +
    '.btn{border:1px solid #D0D5DD;background:#fff;color:#344054;border-radius:8px;padding:8px 14px;font-size:14px;font-weight:600}' +
    '.btn.go{background:#111827;border-color:#111827;color:#fff}.btn:disabled{opacity:.5;cursor:default}' +
    '.on-what{font-size:12px;color:#667085;margin:0 0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.meta{font-size:12px;color:#667085;margin-top:6px}' +
    '.err{color:#B42318;font-size:13px;margin-right:auto}' +
    '.txt{white-space:pre-wrap;word-wrap:break-word;margin:0}' +
    '.tag{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;color:#fff;margin-bottom:6px}' +
    '.panel{position:fixed;top:0;right:0;bottom:0;width:380px;max-width:100vw;background:#fff;color:#101828;box-shadow:-12px 0 40px rgba(16,24,40,.2);display:none;flex-direction:column;font-size:14px}' +
    '.panel header{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #EAECF0;gap:8px}' +
    '.panel h2{margin:0;font-size:16px}' +
    '.panel .list{overflow:auto;padding:8px 16px 96px;flex:1}' +
    '.item{border-bottom:1px solid #EAECF0;padding:12px 0;display:flex;gap:10px}' +
    '.item .n{flex:none;width:24px;height:24px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}' +
    '.item .body{flex:1;min-width:0}' +
    '.item.resolved .txt{color:#98A2B3;text-decoration:line-through}' +
    '.link{border:0;background:none;color:#175CD3;font-weight:600;font-size:13px;padding:8px 0;margin-right:12px}' +
    '.empty{color:#667085;padding:24px 0}' +
    '.mode{font-size:12px;color:#B54708;background:#FFFAEB;padding:8px 16px;border-bottom:1px solid #FEDF89}' +
    'label.chk{display:flex;gap:6px;align-items:center;font-size:13px;color:#475467}' +
    '</style>' +
    '<div class="hl"></div><div class="pins"></div>' +
    '<div class="hint" role="status">Click anything on the page to comment on it · Esc to cancel</div>' +
    '<div class="bar" role="toolbar" aria-label="Feedback"></div>' +
    '<aside class="panel" aria-label="Comments"><header><h2></h2>' +
    '<label class="chk"><input type="checkbox" class="showres"> Show resolved</label>' +
    '<button class="btn close" aria-label="Close comments">Close</button></header>' +
    (LOCAL ? '<div class="mode">Local preview mode: comments are saved only in this browser.</div>' : '') +
    '<div class="list"></div></aside>';

  var $ = function (s) { return root.querySelector(s); };
  var bar = $('.bar'), hl = $('.hl'), pinsEl = $('.pins'), hint = $('.hint'), panel = $('.panel');

  // Toolbar: direction switcher + comment controls
  var pages = CFG.pages || [];
  var barHtml = '';
  if (pages.length) {
    barHtml += '<a href="index.html" title="All directions">All</a>';
    pages.forEach(function (p) {
      barHtml += '<a href="' + p.slug + '.html" title="' + p.title + '"' +
        (p.slug === PAGE ? ' class="cur" aria-current="page"' : '') + '>' + p.short + '</a>';
    });
    barHtml += '<span class="sep"></span>';
  }
  barHtml += '<button class="primary add">+ Comment</button>' +
    '<button class="toggle-list">Comments <span class="count">0</span></button>' +
    '<button class="toggle-pins" aria-pressed="true" title="Show or hide pins">Hide pins</button>';
  bar.innerHTML = barHtml;

  var comments = [], showPins = true, showResolved = false, commenting = false, openPop = null;

  // ---------- rendering ----------
  function visible() { return comments.filter(function (c) { return showResolved || !c.resolved; }); }
  function numberOf(c) { return comments.indexOf(c) + 1; }

  function renderPins() {
    pinsEl.innerHTML = '';
    if (!showPins) return;
    visible().forEach(function (c) {
      var p = pinPosition(c);
      var b = document.createElement('button');
      b.className = 'pin' + (c.resolved ? ' resolved' : '');
      b.style.background = (SENT[c.sentiment] || SENT.note).color;
      b.style.left = p.x + 'px'; b.style.top = p.y + 'px';
      b.textContent = numberOf(c);
      b.setAttribute('aria-label', 'Comment ' + numberOf(c) + ' by ' + (c.author || 'someone'));
      b.addEventListener('click', function (e) { e.stopPropagation(); showComment(c, b); });
      pinsEl.appendChild(b);
    });
  }

  function renderList() {
    var open = comments.filter(function (c) { return !c.resolved; }).length;
    $('.count').textContent = open;
    $('.panel h2').textContent = (CFG.pageTitle || 'This page') + ' — ' + open + ' open';
    var list = $('.list');
    list.innerHTML = '';
    var v = visible();
    if (!v.length) {
      list.innerHTML = '<p class="empty">No comments yet. Click “+ Comment”, then click any part of the page.</p>';
      return;
    }
    v.forEach(function (c) {
      var s = SENT[c.sentiment] || SENT.note;
      var item = document.createElement('div');
      item.className = 'item' + (c.resolved ? ' resolved' : '');
      item.innerHTML = '<span class="n"></span><div class="body"><p class="txt"></p>' +
        '<div class="meta"></div><div class="row" style="justify-content:flex-start;margin-top:6px">' +
        '<button class="link goto">Show on page</button><button class="link res"></button></div></div>';
      item.querySelector('.n').style.background = s.color;
      item.querySelector('.n').textContent = numberOf(c);
      item.querySelector('.txt').textContent = s.icon + ' ' + c.text;
      item.querySelector('.meta').textContent = (c.author || 'Anonymous') + ' · ' + when(c.created) + ' · on “' + (c.label || '') + '”';
      item.querySelector('.res').textContent = c.resolved ? 'Reopen' : 'Resolve';
      item.querySelector('.goto').addEventListener('click', function () { goTo(c); });
      item.querySelector('.res').addEventListener('click', function () { setResolved(c, !c.resolved); });
      list.appendChild(item);
    });
  }

  function render() { renderPins(); renderList(); }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function placePop(pop, x, y) {
    root.appendChild(pop);
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var minX = window.scrollX + 12, maxX = window.scrollX + document.documentElement.clientWidth - w - 12;
    var left = Math.max(minX, Math.min(x + 18, maxX));
    var top = y + 18;
    if (top + h > window.scrollY + window.innerHeight - 12) top = Math.max(window.scrollY + 12, y - h - 18);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function closePop() {
    if (openPop) { openPop.remove(); openPop = null; }
    root.querySelectorAll('.pin.active').forEach(function (p) { p.classList.remove('active'); });
  }

  function showComment(c, pinBtn) {
    closePop();
    var s = SENT[c.sentiment] || SENT.note;
    var pop = document.createElement('div');
    pop.className = 'pop';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = '<span class="tag"></span><p class="txt"></p><div class="meta"></div>' +
      '<div class="row"><button class="btn res"></button><button class="btn go close">Close</button></div>';
    pop.querySelector('.tag').style.background = s.color;
    pop.querySelector('.tag').textContent = s.icon + ' ' + s.label + (c.resolved ? ' · resolved' : '');
    pop.querySelector('.txt').textContent = c.text;
    pop.querySelector('.meta').textContent = (c.author || 'Anonymous') + ' · ' + when(c.created);
    pop.querySelector('.res').textContent = c.resolved ? 'Reopen' : 'Resolve';
    pop.querySelector('.res').addEventListener('click', function () { setResolved(c, !c.resolved); closePop(); });
    pop.querySelector('.close').addEventListener('click', closePop);
    pinBtn.classList.add('active');
    var p = pinPosition(c);
    openPop = pop;
    placePop(pop, p.x, p.y);
  }

  function goTo(c) {
    if (window.innerWidth < 700) togglePanel(false);
    var p = pinPosition(c);
    window.scrollTo({ top: Math.max(0, p.y - window.innerHeight / 3), behavior: 'smooth' });
    if (!showPins) setPins(true);
    setTimeout(function () {
      renderPins();
      var btns = pinsEl.querySelectorAll('.pin');
      var idx = visible().indexOf(c);
      if (btns[idx]) showComment(c, btns[idx]);
    }, 400);
  }

  // ---------- composing ----------
  function setCommenting(on) {
    commenting = on;
    $('.add').classList.toggle('on', on);
    $('.add').textContent = on ? 'Cancel' : '+ Comment';
    hint.style.display = on ? 'block' : 'none';
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    if (!on) hl.style.display = 'none';
  }

  function isUi(e) { return e.composedPath && e.composedPath().indexOf(host) >= 0; }

  document.addEventListener('mousemove', function (e) {
    if (!commenting || openPop || isUi(e)) { if (!openPop) hl.style.display = 'none'; return; }
    var el = pickTarget(e.target);
    if (!el || el === document.documentElement || el === document.body) { hl.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    hl.style.display = 'block';
    hl.style.left = r.left + window.scrollX + 'px'; hl.style.top = r.top + window.scrollY + 'px';
    hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
  }, true);

  // Capture clicks so links in the mockup don't fire while commenting.
  document.addEventListener('click', function (e) {
    if (isUi(e)) return;
    if (openPop && !commenting) { closePop(); return; }
    if (!commenting) return;
    e.preventDefault(); e.stopPropagation();
    if (openPop) return;
    var el = pickTarget(e.target);
    if (!el || el === document.documentElement) return;
    compose(el, e.pageX, e.pageY);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closePop(); setCommenting(false); }
  });

  function compose(el, px, py) {
    var r = el.getBoundingClientRect();
    var draft = {
      selector: selectorFor(el),
      rx: r.width ? Math.min(1, Math.max(0, (px - (r.left + window.scrollX)) / r.width)) : 0.5,
      ry: r.height ? Math.min(1, Math.max(0, (py - (r.top + window.scrollY)) / r.height)) : 0.5,
      docXf: px / document.documentElement.scrollWidth,
      docY: py,
      label: labelFor(el)
    };
    var name = safeGet(NAME_KEY) || '';
    var pop = document.createElement('div');
    pop.className = 'pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'New comment');
    pop.innerHTML =
      '<p class="on-what"></p>' +
      '<div class="seg" role="group" aria-label="Reaction">' +
      Object.keys(SENT).map(function (k) {
        return '<button type="button" data-s="' + k + '" aria-pressed="' + (k === 'note') + '" style="color:' + SENT[k].color + '">' + SENT[k].icon + ' ' + SENT[k].label + '</button>';
      }).join('') + '</div>' +
      '<textarea aria-label="Comment" placeholder="What do you think about this part?"></textarea>' +
      (name ? '' : '<input class="name" aria-label="Your name" placeholder="Your name" style="margin-top:8px">') +
      '<div class="row"><span class="err" role="alert"></span><button class="btn cancel" type="button">Cancel</button><button class="btn go post" type="button">Post</button></div>';
    pop.querySelector('.on-what').textContent = 'On: “' + draft.label + '”';
    var sentiment = 'note';
    pop.querySelectorAll('.seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        sentiment = b.getAttribute('data-s');
        pop.querySelectorAll('.seg button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      });
    });
    pop.querySelector('.cancel').addEventListener('click', function () { closePop(); });
    var post = pop.querySelector('.post');
    post.addEventListener('click', function () {
      var text = pop.querySelector('textarea').value.trim();
      var nameIn = pop.querySelector('.name');
      var author = nameIn ? nameIn.value.trim() : name;
      var err = pop.querySelector('.err');
      if (!text) { err.textContent = 'Write a comment first.'; return; }
      if (!author) { err.textContent = 'Add your name.'; return; }
      safeSet(NAME_KEY, author);
      post.disabled = true; post.textContent = 'Posting…'; err.textContent = '';
      var c = {
        id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        page: PAGE, created: new Date().toISOString(), author: author, sentiment: sentiment, text: text,
        selector: draft.selector, rx: draft.rx, ry: draft.ry, docXf: draft.docXf, docY: draft.docY,
        label: draft.label, viewportW: window.innerWidth, resolved: false
      };
      api.send({ action: 'add', comment: c }).then(function () {
        comments.push(c);
        closePop(); render();
      }).catch(function (e2) {
        post.disabled = false; post.textContent = 'Post';
        err.textContent = 'Couldn’t save (' + e2.message + '). Try again.';
      });
    });
    setCommenting(false);
    hl.style.display = 'none';
    openPop = pop;
    placePop(pop, px, py);
    pop.querySelector('textarea').focus();
  }

  function setResolved(c, val) {
    var prev = c.resolved;
    c.resolved = val; render();
    api.send({ action: 'resolve', id: c.id, resolved: val }).catch(function () {
      c.resolved = prev; render();
      alert('Couldn’t update that comment. Please try again.');
    });
  }

  // ---------- toolbar ----------
  function togglePanel(force) {
    var open = typeof force === 'boolean' ? force : panel.style.display !== 'flex';
    panel.style.display = open ? 'flex' : 'none';
    if (open) { closePop(); refresh(); }
  }
  function setPins(on) {
    showPins = on;
    var b = $('.toggle-pins');
    b.textContent = on ? 'Hide pins' : 'Show pins';
    b.setAttribute('aria-pressed', String(on));
    if (!on) closePop();
    renderPins();
  }
  $('.add').addEventListener('click', function () { closePop(); setCommenting(!commenting); });
  $('.toggle-list').addEventListener('click', function () { togglePanel(); });
  $('.toggle-pins').addEventListener('click', function () { setPins(!showPins); });
  $('.close').addEventListener('click', function () { togglePanel(false); });
  $('.showres').addEventListener('change', function (e) { showResolved = e.target.checked; render(); });

  // ---------- data ----------
  var loading = false;
  function refresh() {
    if (loading) return;
    loading = true;
    api.list().then(function (list) {
      list.sort(function (a, b) { return String(a.created).localeCompare(String(b.created)); });
      comments = list;
      if (!openPop) render(); else renderList();
    }).catch(function (e) {
      $('.list').innerHTML = '';
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Couldn’t load comments (' + e.message + ').';
      $('.list').appendChild(p);
    }).then(function () { loading = false; });
  }

  // Keep pins attached as layout settles or the window changes size.
  var raf = 0;
  function reflow() { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderPins); }
  window.addEventListener('resize', reflow);
  if (window.ResizeObserver) new ResizeObserver(reflow).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reflow);
  window.addEventListener('load', reflow);
  // Pick up the other side's comments without a reload.
  setInterval(function () { if (!document.hidden && !openPop) refresh(); }, 60000);

  function start() { document.body.appendChild(host); refresh(); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
