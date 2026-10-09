/*
 * App shelf: a tiny app-store page that reads everything from GitHub.
 * To add an app, add its repository name to apps.json. Nothing else to edit.
 */
(() => {
  'use strict';

  const API = 'https://api.github.com';
  const RAW = 'https://raw.githubusercontent.com';
  const CACHE_KEY = 'app-shelf:v1';
  const CACHE_TTL = 15 * 60 * 1000;

  const main = document.getElementById('main');
  const lightbox = document.getElementById('lightbox');
  const collator = new Intl.Collator(undefined, { numeric: true });

  let state = null; // { cfg, data }
  let cfg = null;

  /* ---------- tiny DOM helper (never uses innerHTML, so remote text stays text) ---------- */

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs || {})) {
      if (val == null || val === false) continue;
      if (key === 'class') el.className = val;
      else el.setAttribute(key, val === true ? '' : val);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid);
    }
    return el;
  }

  /* ---------- GitHub access ---------- */

  class GitHubError extends Error {
    constructor(message, status, rateLimited) {
      super(message);
      this.status = status;
      this.rateLimited = rateLimited;
    }
  }

  async function gh(path) {
    const res = await fetch(API + path, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) {
      const limited = (res.status === 403 || res.status === 429) &&
        res.headers.get('x-ratelimit-remaining') === '0';
      throw new GitHubError(`GitHub returned ${res.status}`, res.status, limited);
    }
    return res.json();
  }

  async function fetchText(url) {
    try {
      const res = await fetch(url);
      return res.ok ? await res.text() : '';
    } catch (err) {
      return '';
    }
  }

  // A missing release list or empty repo is normal, not an error.
  function softFail(err) {
    if (err && (err.status === 404 || err.status === 409)) return null;
    throw err;
  }

  async function loadConfig() {
    const res = await fetch('apps.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not read apps.json');
    const raw = await res.json();
    const owner = String(raw.owner || '').trim();
    if (!owner) throw new Error('apps.json needs an "owner" (your GitHub username).');
    const apps = (raw.apps || [])
      .map((a) => (typeof a === 'string' ? { repo: a } : a))
      .filter((a) => a && a.repo);
    return Object.assign({}, raw, { owner, apps });
  }

  function readCache(key) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY));
      return c && c.key === key ? c : null;
    } catch (err) {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ key, t: Date.now(), data }));
    } catch (err) { /* storage unavailable: fine */ }
  }

  async function loadApps(config) {
    const key = JSON.stringify([config.owner, config.apps]);
    const cached = readCache(key);
    const forceRefresh = /[?&]refresh\b/.test(location.search);
    if (cached && !forceRefresh && Date.now() - cached.t < CACHE_TTL) return cached.data;
    try {
      const data = await fetchApps(config);
      writeCache(key, data);
      return data;
    } catch (err) {
      if (cached) return cached.data; // old info beats an error page
      throw err;
    }
  }

  async function fetchApps(config) {
    const list = await gh(`/users/${encodeURIComponent(config.owner)}/repos?per_page=100&sort=updated`);
    const byName = new Map(list.map((r) => [r.name.toLowerCase(), r]));
    const results = await Promise.allSettled(config.apps.map((entry) => fetchOne(config, entry, byName)));

    const apps = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        if (r.value) apps.push(r.value);
        else console.warn(`[app shelf] Skipped "${config.apps[i].repo}": no public repository with that name.`);
      }
    });
    // Anything other than "repo not found" (rate limit, offline) must not be cached as a partial list.
    const failure = results.find((r) => r.status === 'rejected');
    if (failure) throw failure.reason;
    return { apps };
  }

  async function fetchOne(config, entry, byName) {
    let owner = entry.owner || config.owner;
    let name = String(entry.repo);
    if (name.includes('/')) [owner, name] = name.split('/');

    let repo = owner.toLowerCase() === config.owner.toLowerCase() ? byName.get(name.toLowerCase()) : null;
    if (!repo) {
      try {
        repo = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    }

    const base = `/repos/${repo.full_name}`;
    const [releases, tree, readme] = await Promise.all([
      gh(`${base}/releases?per_page=5`).catch(softFail),
      gh(`${base}/git/trees/${repo.default_branch}?recursive=1`).catch(softFail),
      fetchText(`${RAW}/${repo.full_name}/${repo.default_branch}/README.md`),
    ]);
    return buildApp(entry, repo, releases || [], tree, readme);
  }

  /* ---------- turning repository data into an app ---------- */

  const IMG = /\.(png|jpe?g|webp|gif|svg)$/i;

  function rawUrl(repo, path) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return `${RAW}/${repo.full_name}/${repo.default_branch}/${encoded}`;
  }

  function stripMarkup(s) {
    return s.replace(/<[^>]+>/g, '').replace(/[*_`[\]]/g, '').trim();
  }

  function norm(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function parseReadme(md) {
    const out = { name: '', images: [] };
    const h1 = md.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || md.match(/^#\s+(.+)$/m);
    if (h1) out.name = stripMarkup(h1[1]);

    const found = [];
    for (const m of md.matchAll(/<img\b[^>]*>/gi)) {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[0]);
      const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(m[0]);
      if (src) found.push({ at: m.index, src: src[1], alt: alt ? alt[1] : '' });
    }
    for (const m of md.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)/g)) {
      found.push({ at: m.index, src: m[2], alt: m[1] });
    }
    found.sort((a, b) => a.at - b.at);

    out.images = found
      .filter((f) => !/^(https?:)?\/\//i.test(f.src) && !f.src.startsWith('data:'))
      .map((f) => {
        let path = f.src.split(/[?#]/)[0].replace(/^\.?\//, '');
        try { path = decodeURI(path); } catch (err) { /* keep as written */ }
        return { path, alt: f.alt.trim() };
      });
    return out;
  }

  function pickIcon(files) {
    let best = null;
    let bestScore = 0;
    for (const path of files) {
      if (!IMG.test(path)) continue;
      const stem = path.split('/').pop().toLowerCase().replace(/\.[^.]+$/, '');
      if (/foreground|background|monochrome|round|banner|splash|notification|screenshot|preview|feature|cover/.test(stem)) continue;
      if (/node_modules|\/androidtest\/|\/test\//i.test(path)) continue;

      let score;
      if (/^(app[-_]?icon|icon|logo|ic_logo|ic_launcher|favicon)$/.test(stem)) score = 100;
      else if (/icon|logo/.test(stem)) score = 40;
      else continue;

      if (stem === 'favicon') score -= 20;
      if (stem === 'ic_launcher') score -= 10;
      score -= path.split('/').length * 3;
      if (/xxxhdpi/.test(path)) score += 6;
      else if (/xxhdpi/.test(path)) score += 4;
      else if (/xhdpi/.test(path)) score += 2;
      if (/\.svg$/i.test(path)) score -= 8;

      if (score > bestScore) { best = path; bestScore = score; }
    }
    return best;
  }

  function pickShots(files, readmeImages, iconPath) {
    const fileSet = new Set(files);
    const folder = /^(images|screenshots?|screens|docs\/(images|screenshots?))\/[^/]+\.(png|jpe?g|webp|gif)$/i;
    const fastlane = /^fastlane\/metadata\/android\/[^/]+\/images\/(phone|sevenInch|tenInch)Screenshots\/[^/]+\.(png|jpe?g|webp)$/i;
    const notShot = /icon|logo|banner|badge|favicon|cover|social|header/i;
    const ok = (p) => p !== iconPath && !notShot.test(p.split('/').pop());

    const shots = [];
    const seen = new Set();
    const add = (path, alt) => {
      if (seen.has(path)) return;
      seen.add(path);
      shots.push({ path, alt });
    };

    // Same order as the README, so the first screenshot is the one the author led with.
    for (const img of readmeImages) {
      if (fileSet.has(img.path) && IMG.test(img.path) && !/\.svg$/i.test(img.path) &&
          !/^app\/src\//.test(img.path) && ok(img.path)) add(img.path, img.alt);
    }
    files
      .filter((p) => (folder.test(p) || fastlane.test(p)) && ok(p))
      .sort(collator.compare)
      .forEach((p) => add(p, ''));

    return shots.slice(0, 12);
  }

  const OS_ORDER = ['Android', 'Windows', 'macOS', 'Linux', 'Firefox', 'Chrome', 'Other'];
  const ASSET_TYPES = [
    { re: /\.apk$/i, os: 'Android' },
    { re: /\.(exe|msi)$/i, os: 'Windows' },
    { re: /\.(dmg|pkg)$/i, os: 'macOS' },
    { re: /\.(appimage|deb|rpm|flatpak|snap)$/i, os: 'Linux' },
    { re: /\.xpi$/i, os: 'Firefox' },
    { re: /\.crx$/i, os: 'Chrome' },
    { re: /\.(zip|7z|tar\.gz|tgz)$/i, os: 'Other' },
  ];

  function describeAsset(asset) {
    const type = ASSET_TYPES.find((t) => t.re.test(asset.name));
    if (!type) return null; // checksums, notes and so on
    const n = asset.name.toLowerCase();
    let rank = 5;
    let hint = '';
    if (type.os === 'Android') {
      if (/arm64|v8a/.test(n)) { rank = 1; hint = 'Best for most phones and tablets'; }
      else if (/universal/.test(n)) { rank = 2; hint = 'Works on any device (larger file)'; }
      else if (/armeabi|v7a|arm32/.test(n)) { rank = 3; hint = 'Older 32-bit devices'; }
      else if (/x86/.test(n)) { rank = 4; hint = 'Emulators and Intel devices'; }
      else rank = 2;
    } else if (type.os !== 'Other') {
      rank = 1;
    } else {
      rank = 9;
    }
    return { name: asset.name, url: asset.browser_download_url, size: asset.size, os: type.os, rank, hint };
  }

  function visitorOS() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/windows/i.test(ua)) return 'Windows';
    if (/macintosh|mac os/i.test(ua)) return 'macOS';
    if (/linux|x11/i.test(ua)) return 'Linux';
    return '';
  }

  function pickPrimary(downloads) {
    if (!downloads.length) return null;
    const mine = downloads.filter((d) => d.os === visitorOS());
    return (mine.length ? mine : downloads)[0];
  }

  function firstSentence(text) {
    const t = text.trim().replace(/\s+/g, ' ');
    const m = t.match(/^.*?[.!?](?=\s|$)/);
    let s = m ? m[0] : t;
    if (s.length > 140) s = s.slice(0, 137).replace(/\s+\S*$/, '') + '…';
    return s;
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function buildApp(entry, repo, releases, tree, readmeText) {
    const files = ((tree && tree.tree) || []).filter((n) => n.type === 'blob').map((n) => n.path);
    const readme = parseReadme(readmeText || '');
    const release = releases.find((r) => !r.draft) || null;

    const downloads = ((release && release.assets) || [])
      .map(describeAsset)
      .filter(Boolean)
      .sort((a, b) => OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os) || a.rank - b.rank || collator.compare(a.name, b.name));
    const best = pickPrimary(downloads);

    const homepage = /^https?:\/\//i.test(entry.homepage || repo.homepage || '') ? (entry.homepage || repo.homepage) : '';

    let primary;
    if (entry.download) {
      primary = { href: entry.download, label: 'Get', long: 'Download', external: false };
    } else if (best) {
      primary = { href: best.url, label: 'Get', long: best.os === 'Other' ? 'Download' : `Download for ${best.os}`, external: false };
    } else if (homepage) {
      primary = { href: homepage, label: 'Open', long: 'Open app', external: true };
    } else {
      primary = { href: repo.html_url, label: 'View', long: 'View on GitHub', external: true };
    }

    const readmeName = readme.name && readme.name.length <= 32 &&
      (norm(readme.name).includes(norm(repo.name)) || norm(repo.name).includes(norm(readme.name)))
      ? readme.name : '';
    const name = entry.name || readmeName || capitalize(repo.name.replace(/[-_]+/g, ' '));

    const description = (repo.description || '').trim();
    const tagline = entry.tagline || (description ? firstSentence(description) : '');
    const about = entry.about || (description && description !== tagline ? description : '');

    const oses = [...new Set(downloads.map((d) => d.os).filter((o) => o !== 'Other'))];
    let platform = entry.platform || '';
    if (!platform) {
      if (/android tv|fire tv/i.test(description)) platform = 'Android TV';
      else if (oses.length) platform = oses.join(', ');
      else if (homepage) platform = 'Web';
    }

    const iconPath = entry.icon ? null : pickIcon(files);
    const iconUrl = entry.icon
      ? (/^https?:\/\//i.test(entry.icon) ? entry.icon : rawUrl(repo, entry.icon.replace(/^\.?\//, '')))
      : (iconPath ? rawUrl(repo, iconPath) : '');

    const shots = entry.screenshots
      ? entry.screenshots.map((s) => ({ url: /^https?:\/\//i.test(s) ? s : rawUrl(repo, s.replace(/^\.?\//, '')), alt: '' }))
      : pickShots(files, readme.images, iconPath).map((s) => ({ url: rawUrl(repo, s.path), alt: s.alt }));

    const label = release ? (release.name || release.tag_name || '') : '';
    const version = label && label.length <= 20 ? label : (release ? release.tag_name : '');
    const beta = !!release && (release.prerelease || /alpha|beta|rc\b/i.test(`${release.tag_name} ${release.name || ''}`));
    const spdx = repo.license && repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : '';

    return {
      slug: repo.name.toLowerCase(),
      name,
      tagline,
      about,
      platform,
      beta,
      iconUrl,
      shots,
      downloads,
      primary,
      web: homepage && best ? homepage : '',
      version,
      updated: (release && release.published_at) || repo.pushed_at || '',
      size: best ? best.size : 0,
      license: spdx,
      repoUrl: repo.html_url,
      releasesUrl: `${repo.html_url}/releases`,
      issuesUrl: repo.has_issues ? `${repo.html_url}/issues` : '',
      androidApk: downloads.some((d) => d.os === 'Android'),
    };
  }

  /* ---------- small formatters ---------- */

  function formatSize(bytes) {
    if (!bytes) return '';
    return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (!then) return '';
    const days = Math.round((then - Date.now()) / 86400000);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    let text;
    if (Math.abs(days) < 30) text = rtf.format(days, 'day');
    else if (Math.abs(days) < 365) text = rtf.format(Math.round(days / 30), 'month');
    else text = rtf.format(Math.round(days / 365), 'year');
    return capitalize(text);
  }

  function hue(text) {
    let n = 0;
    for (const ch of text) n = (n * 31 + ch.charCodeAt(0)) % 360;
    return n;
  }

  /* ---------- rendering ---------- */

  function icon(app, large) {
    const cls = 'icon' + (large ? ' lg' : '');
    const tile = () => h('span', { class: `${cls} tile`, style: `--h:${hue(app.name)}`, 'aria-hidden': 'true' },
      app.name.trim().charAt(0).toUpperCase());
    if (!app.iconUrl) return tile();
    const img = h('img', { class: cls, src: app.iconUrl, alt: '', width: large ? 112 : 72, height: large ? 112 : 72, decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(tile()));
    return img;
  }

  function actionLink(app, { large = false, long = false } = {}) {
    const p = app.primary;
    const text = long ? p.long : p.label;
    return h('a', {
      class: 'btn' + (large ? ' lg' : ''),
      href: p.href,
      target: p.external ? '_blank' : null,
      rel: p.external ? 'noopener' : null,
      'aria-label': long ? null : `${p.label} ${app.name}`,
    }, text);
  }

  function chips(app) {
    return h('div', { class: 'chips' },
      app.platform && h('span', { class: 'chip' }, app.platform),
      app.beta && h('span', { class: 'chip warn' }, 'Beta'));
  }

  function appRow(app) {
    return h('li', { class: 'row' },
      icon(app),
      h('div', { class: 'info' },
        h('h2', { class: 'name' }, h('a', { href: `#/app/${encodeURIComponent(app.slug)}` }, app.name)),
        app.tagline && h('p', { class: 'tag' }, app.tagline),
        chips(app)),
      actionLink(app));
  }

  function skeleton() {
    const row = () => h('li', { class: 'row skeleton', 'aria-hidden': 'true' },
      h('span', { class: 'icon' }),
      h('div', { class: 'info' }, h('div', { class: 'bar' }), h('div', { class: 'bar short' })),
      h('span'));
    return h('div', { role: 'status', 'aria-label': 'Loading apps' },
      h('section', { class: 'hero' }, h('h1', {}, 'Loading apps')),
      h('ul', { class: 'list' }, row(), row(), row(), row()));
  }

  function renderHome() {
    const heading = cfg.heading || `Apps by ${cfg.title || cfg.owner}`;
    document.title = heading;
    main.replaceChildren(
      h('section', { class: 'hero' },
        h('h1', {}, heading),
        h('p', {}, cfg.intro || 'Pick an app and tap Get. Downloads come straight from GitHub, and you don\'t need an account.')),
      state.data.apps.length
        ? h('ul', { class: 'list' }, state.data.apps.map(appRow))
        : h('p', { class: 'empty' }, 'No apps to show yet. Add repository names to apps.json to list them here.'));
  }

  function openShot(url, alt) {
    if (!lightbox.showModal) { window.open(url, '_blank', 'noopener'); return; }
    const img = lightbox.querySelector('img');
    img.src = url;
    img.alt = alt;
    lightbox.showModal();
  }

  function renderDetail(app) {
    document.title = `${app.name} - ${cfg.title || cfg.owner}`;

    const facts = [
      ['Version', app.version],
      ['Updated', app.updated ? timeAgo(app.updated) : ''],
      ['Size', formatSize(app.size)],
      ['License', app.license],
      ['Platform', app.platform],
    ].filter(([, v]) => v);

    const shots = app.shots.length
      ? h('section', { class: 'block', 'aria-label': 'Screenshots' },
          h('ul', { class: 'shots' }, app.shots.map((s, i) => {
            const alt = s.alt || `${app.name} screenshot ${i + 1}`;
            const img = h('img', { src: s.url, alt, loading: 'lazy', decoding: 'async' });
            const btn = h('button', { type: 'button', 'aria-label': `Enlarge: ${alt}` }, img);
            btn.addEventListener('click', () => openShot(s.url, alt));
            return h('li', {}, btn);
          })))
      : null;

    const help = app.androidApk && !/tv/i.test(app.platform)
      ? h('details', { class: 'help' },
          h('summary', {}, 'How to install on Android'),
          h('ol', {},
            h('li', {}, 'Tap Download and wait for the file to finish.'),
            h('li', {}, 'Open the file from your notifications or your Downloads folder.'),
            h('li', {}, 'If Android asks, allow installs from your browser. You only do this once.'),
            h('li', {}, 'Tap Install.')),
          h('p', {}, 'Android may warn that the app isn\'t from Google Play. That is normal for apps shared outside the store.'))
      : null;

    const downloads = app.downloads.length > 1
      ? h('section', { class: 'block' },
          h('h2', {}, 'All downloads'),
          h('ul', { class: 'dl' }, app.downloads.map((d) => h('li', {},
            h('div', {},
              h('strong', {}, d.hint || d.os),
              h('span', { class: 'file' }, `${d.name}${d.size ? ` (${formatSize(d.size)})` : ''}`)),
            h('a', { class: 'btn soft sm', href: d.url, 'aria-label': `Download ${d.name}` }, 'Download')))))
      : null;

    main.replaceChildren(
      h('a', { class: 'back', href: '#/' }, '‹ All apps'),
      h('header', { class: 'detail-head' },
        icon(app, true),
        h('div', {},
          h('h1', { class: 'app-name' }, app.name),
          app.tagline && h('p', { class: 'app-tag' }, app.tagline),
          chips(app),
          h('div', { class: 'actions' },
            actionLink(app, { large: true, long: true }),
            app.web && h('a', { class: 'btn soft lg', href: app.web, target: '_blank', rel: 'noopener' }, 'Open in browser')))),
      facts.length
        ? h('dl', { class: 'facts' }, facts.map(([k, v]) => h('div', { class: 'fact' }, h('dt', {}, k), h('dd', {}, v))))
        : null,
      shots,
      app.about && h('section', { class: 'block' }, h('h2', {}, 'About'), h('p', {}, app.about)),
      help,
      downloads,
      h('ul', { class: 'links' },
        h('li', {}, h('a', { href: app.repoUrl, target: '_blank', rel: 'noopener' }, 'View on GitHub')),
        app.releasesUrl && h('li', {}, h('a', { href: app.releasesUrl, target: '_blank', rel: 'noopener' }, 'Release notes')),
        app.issuesUrl && h('li', {}, h('a', { href: app.issuesUrl, target: '_blank', rel: 'noopener' }, 'Report a problem'))));
  }

  function renderError(err) {
    const limited = !!(err && err.rateLimited);
    const links = cfg
      ? cfg.apps.map((a) => {
          const repo = String(a.repo);
          const path = repo.includes('/') ? repo : `${a.owner || cfg.owner}/${repo}`;
          return h('li', {}, h('a', { href: `https://github.com/${path}/releases/latest` }, repo));
        })
      : [];
    main.replaceChildren(h('section', { class: 'notice' },
      h('h1', {}, limited ? 'GitHub is busy right now' : 'The app list didn\'t load'),
      h('p', {}, limited
        ? 'GitHub limits how often a page can ask it for info. Wait a few minutes and reload, or go straight to the downloads:'
        : (cfg ? 'Check your connection and reload the page. You can also go straight to the downloads:'
               : `${err && err.message ? err.message : 'Something went wrong.'}`)),
      links.length ? h('ul', {}, links) : null));
  }

  /* ---------- routing and start-up ---------- */

  function render(moveFocus) {
    if (!state) return;
    const m = location.hash.match(/^#\/app\/([^/?#]+)/);
    let slug = '';
    try { slug = m ? decodeURIComponent(m[1]).toLowerCase() : ''; } catch (err) { /* bad link */ }
    const app = slug && state.data.apps.find((a) => a.slug === slug);
    if (app) renderDetail(app); else renderHome();
    window.scrollTo(0, 0);
    if (moveFocus) main.focus({ preventScroll: true });
  }

  function applySiteInfo() {
    const name = cfg.title || cfg.owner;
    document.getElementById('brand-name').textContent = name;
    const img = document.getElementById('brand-img');
    img.addEventListener('error', () => { img.hidden = true; });
    img.src = `https://github.com/${encodeURIComponent(cfg.owner)}.png?size=64`;
    img.hidden = false;
    document.getElementById('footer-text').replaceChildren(
      'Made by ',
      h('a', { href: `https://github.com/${encodeURIComponent(cfg.owner)}`, target: '_blank', rel: 'noopener' }, name),
      '. Everything here is read live from GitHub.');
  }

  lightbox.addEventListener('click', () => lightbox.close());
  window.addEventListener('hashchange', () => render(true));

  (async function boot() {
    main.replaceChildren(skeleton());
    try {
      cfg = await loadConfig();
      applySiteInfo();
      state = { data: await loadApps(cfg) };
      render(false);
    } catch (err) {
      console.error('[app shelf]', err);
      renderError(err);
    }
  })();
})();
