(function () {
  'use strict';

  // Used if donate.json can't be loaded (e.g. opening the file straight from disk).
  var FALLBACK = {
    goal: 100, raised: 0, currency: '$', month: '',
    kofi: 'https://ko-fi.com/wishismachine',
    links: { discord: 'https://discord.com/invite/B5scEa987Y', youtube: 'https://www.youtube.com/@wishismachine', github: 'https://github.com/wishissue' },
    supporters: [],
    networks: [
      { id: 'trc20', name: 'Tron', tag: 'TRC20', coin: 'USDT', color: '#eb0029', address: 'TUn7M6syjxrgfcUskaxH7UdjnpUngh3fYp', qr: 'qr/trc20.svg', note: 'The cheapest way to send. Usually under a dollar in fees.', chips: [{ icon: 'bolt', text: 'Low fees' }, { icon: 'clock', text: 'About a minute' }, { icon: 'coin', text: 'Min 1 USDT' }] },
      { id: 'erc20', name: 'Ethereum', tag: 'ERC20', coin: 'USDT', color: '#627eea', address: '0x7c11cd045bb237e579e8ce58591313aff6f87781', qr: 'qr/erc20.svg', note: 'Network fees are higher, so it suits larger amounts.', chips: [{ icon: 'bolt', text: 'Higher fees' }, { icon: 'clock', text: 'A few minutes' }, { icon: 'coin', text: 'Min 1 USDT' }] }
    ]
  };

  // Material icon paths (24px grid).
  var ICON = {
    coffee: 'M18.5 3H6c-1.1 0-2 .9-2 2v5.71c0 3.83 2.95 7.18 6.78 7.29 3.96.12 7.22-3.06 7.22-7v-1h.5c1.93 0 3.5-1.57 3.5-3.5S20.43 3 18.5 3ZM16 5v3H6V5h10Zm2.5 3H18V5h.5c.83 0 1.5.67 1.5 1.5S19.33 8 18.5 8ZM4 19h16v2H4Z',
    bolt: 'M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21Z',
    star: 'm12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27Z',
    trophy: 'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2ZM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8Zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1Z',
    clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2ZM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8Zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7Z',
    coin: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16Z',
    heart: 'm12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z'
  };
  var NS = 'http://www.w3.org/2000/svg';
  function svg(name) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICON[name]);
    s.appendChild(p);
    return s;
  }

  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/></svg>';
  var EASE = 'cubic-bezier(.05, .7, .1, 1)';

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cfg, current = 0, qrCache = {}, copyTimer;

  function money(n) {
    var v = Math.round(n * 100) / 100;
    return cfg.currency + (v % 1 === 0 ? v : v.toFixed(2));
  }

  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }

  /* ---------- Confetti ---------- */
  var COLORS = ['var(--primary)', 'var(--tertiary)', 'var(--good)', '#f9a825', '#ec407a', '#42a5f5'];

  function burst(x, y, count, hearts) {
    if (reduceMotion) return;
    count = count || 24;
    for (var i = 0; i < count; i++) {
      var el = document.createElement('div');
      el.className = 'bit';
      var size = 7 + Math.random() * 7;
      el.style.width = el.style.height = size + 'px';
      el.style.color = COLORS[(Math.random() * COLORS.length) | 0];
      var heart = hearts || Math.random() < 0.25;
      if (heart) { el.style.width = el.style.height = (size + 6) + 'px'; el.appendChild(svg('heart')); el.querySelector('svg').style.fill = 'currentColor'; }
      else { el.style.background = 'currentColor'; el.style.borderRadius = Math.random() < 0.5 ? '50%' : '2px'; }
      (sheet.open ? sheet : document.body).appendChild(el);

      var angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      var speed = 90 + Math.random() * 190;
      var dx = Math.cos(angle) * speed, dy = Math.sin(angle) * speed;
      var rot = (Math.random() - 0.5) * 720;
      var anim = el.animate([
        { transform: 'translate(' + x + 'px,' + y + 'px) scale(.4) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(.1,.8,.3,1)' },
        { transform: 'translate(' + (x + dx) + 'px,' + (y + dy) + 'px) scale(1) rotate(' + (rot / 2) + 'deg)', opacity: 1, offset: 0.45, easing: 'cubic-bezier(.5,0,.9,.6)' },
        { transform: 'translate(' + (x + dx * 1.25) + 'px,' + (y + dy + 260 + Math.random() * 120) + 'px) scale(.7) rotate(' + rot + 'deg)', opacity: 0 }
      ], { duration: 1100 + Math.random() * 700, fill: 'forwards' });
      anim.onfinish = (function (node) { return function () { node.remove(); }; })(el);
    }
  }

  function burstFrom(el, count, hearts) {
    var r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, count, hearts);
  }

  /* ---------- Monthly goal ---------- */
  var MILES = [{ t: 0.25, icon: 'coffee' }, { t: 0.5, icon: 'bolt' }, { t: 0.75, icon: 'star' }, { t: 1, icon: 'trophy' }];

  function renderGoal() {
    var goal = Math.max(Number(cfg.goal) || 0, 1);
    var raised = Math.max(Number(cfg.raised) || 0, 0);
    var pct = Math.min(raised / goal, 1);
    var left = Math.max(goal - raised, 0);

    $('goal-month').textContent = cfg.month ? '· ' + cfg.month : '';
    $('goal-target').textContent = money(goal);
    $('meter').setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    $('meter').classList.toggle('done', raised >= goal);
    $('goal-foot').textContent = raised >= goal
      ? 'Goal reached. Thank you, it means a lot.'
      : raised === 0
        ? 'Be the first this month.'
        : money(left) + ' to go. Thank you to everyone who has chipped in.';

    // Milestone badges
    var ol = $('miles');
    ol.textContent = '';
    MILES.forEach(function (m) {
      var li = document.createElement('li');
      li.className = 'mile';
      li.style.left = (m.t * 100) + '%';
      var dot = document.createElement('span');
      dot.className = 'mile-dot';
      dot.appendChild(svg(m.icon));
      var lab = document.createElement('span');
      lab.className = 'mile-label';
      lab.textContent = money(goal * m.t);
      li.appendChild(dot); li.appendChild(lab);
      ol.appendChild(li);
      var reached = raised >= goal * m.t;
      li.setAttribute('aria-label', money(goal * m.t) + (reached ? ' reached' : ' not reached yet'));
      if (reached) {
        // Pop each badge just as the bar passes it.
        var delay = reduceMotion ? 0 : 300 + 1000 * Math.min(m.t / Math.max(pct, 0.001), 1) * 0.85;
        setTimeout(function () { li.classList.add('reached'); }, delay);
      }
    });

    var fill = $('meter-fill');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { fill.style.width = (pct * 100) + '%'; });
    });
    if (raised >= goal) setTimeout(function () { burstFrom($('meter'), 36); }, reduceMotion ? 0 : 1700);

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

  /* ---------- Supporters ---------- */
  function hue(text) { var n = 0; for (var i = 0; i < text.length; i++) n = (n * 31 + text.charCodeAt(i)) % 360; return n; }

  function renderSupporters() {
    var list = (cfg.supporters || []).filter(Boolean).map(String);
    if (!list.length) return;
    var box = $('avatars');
    list.slice(0, 4).forEach(function (name) {
      var a = document.createElement('span');
      a.className = 'avatar';
      a.style.setProperty('--h', hue(name));
      a.title = name;
      a.textContent = name.trim().charAt(0).toUpperCase();
      box.appendChild(a);
    });
    var shown = list.slice(0, 3), more = list.length - shown.length;
    var names = shown.length > 1 ? shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1] : shown[0];
    $('thanks-text').textContent = 'Thank you ' + names + (more > 0 ? ' and ' + more + ' more' : '') + ' for supporting this month.';
    $('supporters').hidden = false;
  }

  /* ---------- Ripple ---------- */
  document.addEventListener('pointerdown', function (e) {
    if (reduceMotion) return;
    var el = e.target.closest && e.target.closest('.btn, .icon-btn, .seg button, .row-item');
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

  function scanAgain() {
    var w = $('qr-wrap');
    w.classList.remove('scanning');
    void w.offsetWidth;
    w.classList.add('scanning');
  }

  function openSheet() {
    sheet.showModal();
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('open'); scanAgain(); }); });
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
      var dot = document.createElement('span');
      dot.className = 'coin-dot';
      dot.style.setProperty('--c', n.color || 'var(--primary)');
      var lbl = document.createElement('span');
      lbl.appendChild(document.createTextNode(n.name + ' '));
      var small = document.createElement('small');
      small.textContent = n.tag;
      lbl.appendChild(small);
      b.appendChild(dot); b.appendChild(lbl);
      b.addEventListener('click', function () { if (i !== current) select(i, true); });
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
      .then(function (s) { qrCache[n.id] = s; return s; });
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

    var chips = $('info-chips');
    chips.textContent = '';
    (n.chips || []).forEach(function (c) {
      var s = document.createElement('span');
      s.className = 'info-chip';
      if (ICON[c.icon]) s.appendChild(svg(c.icon));
      s.appendChild(document.createTextNode(c.text));
      chips.appendChild(s);
    });
    resetCopy();

    var box = $('qr');
    loadQr(n).then(function (text) {
      if (cfg.networks[current] !== n) return;
      box.innerHTML = text + '<div class="coin" aria-hidden="true"><span>₮</span></div>';
      var el = box.querySelector('svg');
      el.classList.add('code');
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'QR code for the ' + n.name + ' ' + n.coin + ' address');
      if (userAction) animateIn(box, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }]);
    }).catch(function () {
      box.innerHTML = '<p class="net-note">QR code unavailable. Please copy the address instead.</p>';
    });

    if (userAction) {
      scanAgain();
      buzz(8);
      [$('addr'), $('net-note'), $('info-chips')].forEach(function (el, k) {
        animateIn(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);
      });
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
      $('copy').querySelector('.copy-label').textContent = 'Copied. Thank you!';
      $('live').textContent = n.tag + ' address copied';
      burstFrom($('copy'), 26);
      buzz([12, 40, 12]);
      clearTimeout(copyTimer);
      copyTimer = setTimeout(resetCopy, 2600);
    }
    function legacy() {
      selectAddr();
      try { if (document.execCommand('copy')) ok(); } catch (e) { /* the address is selected, so touch-and-hold still works */ }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(n.address).then(ok, legacy);
    } else { legacy(); }
  }

  /* ---------- Share ---------- */
  function sharePage(origin) {
    var data = { title: 'Support Wishissue', text: 'Free, ad-free apps by Wishissue.', url: location.href.split('#')[0] };
    if (navigator.share) { navigator.share(data).catch(function () { /* cancelled */ }); return; }
    function done() {
      $('live').textContent = 'Link copied';
      var small = document.querySelector('#link-share small');
      if (small) { var old = small.textContent; small.textContent = 'Link copied. Thank you!'; setTimeout(function () { small.textContent = old; }, 2200); }
      burstFrom(origin, 20, true);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(data.url).then(done, function () {});
  }

  /* ---------- Start ---------- */
  function setLink(id, href) {
    var a = $(id);
    if (!a) return;
    if (href) a.href = href; else a.closest('li').hidden = true;
  }

  function start(data) {
    cfg = data;
    $('kofi-link').href = cfg.kofi || FALLBACK.kofi;
    var l = cfg.links || {};
    setLink('link-discord', l.discord);
    setLink('link-youtube', l.youtube);
    setLink('link-github', l.github);

    buildTabs();
    select(0, false);
    renderGoal();
    renderSupporters();

    $('kofi-link').addEventListener('click', function (e) { burst(e.clientX, e.clientY, 18, true); buzz(10); });
    $('heart').addEventListener('click', function () { burstFrom($('heart'), 16, true); buzz([10, 30, 10]); });
    $('share').addEventListener('click', function () { sharePage($('share')); });
    $('link-share').addEventListener('click', function () { sharePage($('link-share')); });

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
