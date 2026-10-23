(function () {
  'use strict';

  // Used if donate.json can't be loaded (e.g. opening the file straight from disk).
  var FALLBACK = {
    goal: 100, raised: 0, currency: '$', month: '',
    kofi: 'https://ko-fi.com/wishismachine',
    networks: [
      { id: 'trc20', name: 'Tron', tag: 'TRC20', coin: 'USDT', address: 'TUn7M6syjxrgfcUskaxH7UdjnpUngh3fYp', qr: 'qr/trc20.svg', note: 'Lowest fees. Usually under a dollar.' },
      { id: 'erc20', name: 'Ethereum', tag: 'ERC20', coin: 'USDT', address: '0x7c11cd045bb237e579e8ce58591313aff6f87781', qr: 'qr/erc20.svg', note: 'Higher network fees, best for larger amounts.' }
    ]
  };

  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/></svg>';
  var EASE = 'cubic-bezier(.05, .7, .1, 1)';

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cfg, current = 0, qrCache = {}, copyTimer;

  function money(n) {
    var v = Math.round(n * 100) / 100;
    return cfg.currency + (v % 1 === 0 ? v : v.toFixed(2));
  }

  /* ---------- Monthly goal ---------- */
  function renderGoal() {
    var goal = Math.max(Number(cfg.goal) || 0, 1);
    var raised = Math.max(Number(cfg.raised) || 0, 0);
    var pct = Math.min(raised / goal, 1);
    var left = Math.max(goal - raised, 0);

    $('goal-month').textContent = cfg.month ? '· ' + cfg.month : '';
    $('goal-target').textContent = money(goal);
    $('meter').setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    $('goal-foot').textContent = raised >= goal
      ? 'Goal reached. Thank you, it means a lot.'
      : raised === 0
        ? 'Be the first this month.'
        : money(left) + ' to go. Thank you to everyone who has chipped in.';

    var fill = $('meter-fill');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { fill.style.width = (pct * 100) + '%'; });
    });

    if (reduceMotion) { $('goal-raised').textContent = money(raised); return; }
    var start = null, dur = 1200;
    function tick(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - t, 4);
      $('goal-raised').textContent = money(raised * e);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- Ripple on buttons ---------- */
  document.addEventListener('pointerdown', function (e) {
    if (reduceMotion) return;
    var el = e.target.closest && e.target.closest('.btn, .icon-btn, .seg button');
    if (!el) return;
    var r = el.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2;
    var dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = size + 'px';
    dot.style.left = (e.clientX - r.left - size / 2) + 'px';
    dot.style.top = (e.clientY - r.top - size / 2) + 'px';
    el.appendChild(dot);
    dot.addEventListener('animationend', function () { dot.remove(); });
  });

  /* ---------- Bottom sheet ---------- */
  var sheet = $('sheet'), opener = $('open-crypto');

  function openSheet() {
    sheet.showModal();
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('open'); }); });
  }

  function closeSheet() {
    if (!sheet.open) return;
    sheet.classList.remove('open');
    var finish = function () {
      sheet.close();
      document.documentElement.style.overflow = '';
      opener.focus({ preventScroll: true });
    };
    if (reduceMotion) finish(); else setTimeout(finish, 260);
  }

  /* ---------- Network picker ---------- */
  function buildTabs() {
    var seg = $('seg');
    cfg.networks.forEach(function (n, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.id = 'tab-' + n.id;
      b.setAttribute('aria-controls', 'pay');
      b.innerHTML = '<span class="check">' + CHECK + '</span><span class="lbl"></span>';
      b.querySelector('.lbl').textContent = n.name + ' ';
      var small = document.createElement('small');
      small.textContent = n.tag;
      b.querySelector('.lbl').appendChild(small);
      b.addEventListener('click', function () { select(i, true); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = (current + d + cfg.networks.length) % cfg.networks.length;
        select(next, true);
        seg.querySelectorAll('button')[next].focus();
      });
      seg.appendChild(b);
    });
  }

  function loadQr(n) {
    if (qrCache[n.id]) return Promise.resolve(qrCache[n.id]);
    return fetch(n.qr).then(function (r) { if (!r.ok) throw new Error('qr'); return r.text(); })
      .then(function (svg) { qrCache[n.id] = svg; return svg; });
  }

  function animateIn(el, frames) {
    if (reduceMotion || !el.animate) return;
    el.animate(frames, { duration: 400, easing: EASE });
  }

  function select(i, userAction) {
    current = i;
    var n = cfg.networks[i];

    $('seg').querySelectorAll('button').forEach(function (b, idx) {
      b.setAttribute('aria-selected', idx === i ? 'true' : 'false');
      b.tabIndex = idx === i ? 0 : -1;
    });
    $('pay').setAttribute('aria-labelledby', 'tab-' + n.id);

    $('net-note').textContent = n.note || '';
    $('addr').textContent = n.address;
    $('warn-text').textContent = 'Only send ' + n.coin + ' on the ' + n.name + ' (' + n.tag + ') network. Funds sent on another network can’t be recovered.';
    resetCopy();

    var box = $('qr');
    loadQr(n).then(function (svg) {
      if (cfg.networks[current] !== n) return;
      box.innerHTML = svg + '<div class="coin" aria-hidden="true"><span>₮</span></div>';
      var svgEl = box.querySelector('svg');
      svgEl.classList.add('code');
      svgEl.setAttribute('role', 'img');
      svgEl.setAttribute('aria-label', 'QR code for the ' + n.name + ' ' + n.coin + ' address');
      if (userAction) animateIn(box, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }]);
    }).catch(function () {
      box.innerHTML = '<p class="min">QR code unavailable. Please copy the address instead.</p>';
    });

    if (userAction) {
      animateIn($('addr'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);
      animateIn($('net-note'), [{ opacity: 0 }, { opacity: 1 }]);
    }
  }

  /* ---------- Copy ---------- */
  function resetCopy() {
    clearTimeout(copyTimer);
    $('copy').classList.remove('done');
    $('copy').querySelector('.copy-label').textContent = 'Copy address';
  }

  function selectAddr() {
    var r = document.createRange();
    r.selectNodeContents($('addr'));
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function copyAddress() {
    var n = cfg.networks[current];
    function ok() {
      $('copy').classList.add('done');
      $('copy').querySelector('.copy-label').textContent = 'Copied';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(resetCopy, 2200);
    }
    function legacy() {
      selectAddr();
      try { if (document.execCommand('copy')) ok(); } catch (e) { /* the address is selected, so touch-and-hold still works */ }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(n.address).then(ok, legacy);
    } else { legacy(); }
  }

  /* ---------- Start ---------- */
  function start(data) {
    cfg = data;
    $('kofi-link').href = cfg.kofi || FALLBACK.kofi;
    buildTabs();
    select(0, false);
    renderGoal();

    opener.addEventListener('click', openSheet);
    $('close').addEventListener('click', closeSheet);
    sheet.addEventListener('cancel', function (e) { e.preventDefault(); closeSheet(); });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    $('copy').addEventListener('click', copyAddress);
    $('addr').addEventListener('focus', selectAddr);
  }

  fetch('donate.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('config'); return r.json(); })
    .then(start)
    .catch(function () { start(FALLBACK); });
})();
