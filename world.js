// Pixel tower engine (original Tiny-Tower-style cross-section). Pure drawing: no network, no actions.
'use strict';
const PX = (() => {
  const FH = 18, TW = 140, SHAFT = 12, GROUND = 18;
  const BOT_ORDER = ['Scout', 'News', 'Sentiment', 'Charts', 'Skeptic', 'Chief']; // bottom -> top
  const COL = {Chief: '#ffd23f', Scout: '#5ab0ff', News: '#b77dff', Sentiment: '#ff7ac0', Charts: '#4cd98a', Skeptic: '#ff8a3d'};
  const ROOM = {
    Scout: {name: 'LOOKOUT ROOM', wall: '#7cc8f2', wall2: '#6bb8e4'},
    News: {name: 'NEWSROOM', wall: '#b9a2ea', wall2: '#a891dc'},
    Sentiment: {name: 'CHAT LOUNGE', wall: '#f7a6cf', wall2: '#ee93c1'},
    Charts: {name: 'CHART ROOM', wall: '#2f6b4a', wall2: '#285e41'},
    Skeptic: {name: 'RISK VAULT', wall: '#8b93a6', wall2: '#7c8497'},
    Chief: {name: 'PENTHOUSE OFFICE', wall: '#f3d58a', wall2: '#e8c46c'},
    lobby: {name: 'LOBBY', wall: '#e9dcc4', wall2: '#ddcfb4'},
    cafe: {name: 'CAFE', wall: '#c98b5a', wall2: '#bb7d4d', unlock: 2},
    gym: {name: 'GYM', wall: '#5fc7b8', wall2: '#50b8a9', unlock: 3},
    arcade: {name: 'ARCADE', wall: '#3b2a63', wall2: '#33245a', unlock: 4},
    trophy: {name: 'TROPHY HALL', wall: '#8c2c3c', wall2: '#7d2535', unlock: 5},
  };
  // 7x10 chibi bitizen. k outline, s skin, h hair, c shirt, d dark shirt, p pants, w white
  const BODY = ['.hhhhh.', 'hhhhhhh', 'hsssssh', 'sksssks', 'sssssss', '.sssss.', 'ccccccc', 'scccccs', '.ppppp.', '.p...p.'];
  const HAT = { // rows drawn from y-2, overrides
    Chief: {rows: ['.y.y.y.', '.yyyyy.'], at: -2, extra: [[3, 6, '#d62839'], [3, 7, '#d62839']], hair: '#5a3a1a', skin: '#f2c28b'},
    Scout: {rows: ['.bbbbb.', 'bbbbbbbb'], at: 0, hair: '#2a4d8f', skin: '#e8b07a', brim: true},
    News: {rows: ['..ddd..', 'ddddddd'], at: -1, extra: [[5, -1, '#ffffff']], hair: '#3a2a1a', skin: '#c98e5a'},
    Sentiment: {rows: ['...r...', '..rrr..'], at: -2, extra: [[0, 3, '#222'], [6, 3, '#222'], [0, 2, '#222'], [6, 2, '#222']], hair: '#ff4fa3', skin: '#f5cfa0'},
    Charts: {rows: [], at: 0, extra: [[0, 2, '#2ecc71'], [1, 2, '#2ecc71'], [2, 2, '#2ecc71'], [3, 2, '#2ecc71'], [4, 2, '#2ecc71'], [5, 2, '#2ecc71'], [6, 2, '#2ecc71']], hair: '#1d1d1d', skin: '#e0a370'},
    Skeptic: {rows: ['.mmmmm.', 'mmmrmmm'], at: 0, hair: '#555', skin: '#d79b67'},
  };
  const HATCOL = {y: '#ffd23f', b: '#2b6fd6', d: '#5b3fa0', r: '#ff3b6b', m: '#9aa3b5'};
  const WALK = ['.hhh.', 'hsssh', 'sksks', '.sss.', 'ccccc', 'scccs'];
  const LEGS = [['.p.p.', '.k.k.'], ['p...p', 'k...k']];
  const PALS = [['#3a2a1a', '#e74c3c'], ['#f1c40f', '#3498db'], ['#1d1d1d', '#9b59b6'], ['#a0522d', '#1abc9c'], ['#ecf0f1', '#e67e22'], ['#6b3e26', '#2ecc71'], ['#222', '#f78fb3']];
  const SKINS = ['#f2c28b', '#e0a370', '#c98e5a', '#8d5a3a', '#f5cfa0'];

  let ctx, W, H, lay, f = 0, elev = null, walkers = [], car = 0, cer = null, coins = [], slumpUntil = {}, phase = 'day';
  const rng = s => () => (s = (s * 1664525 + 0x3C6EF35F) >>> 0) / 2 ** 32;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

  function layout(level, W_, H_) {
    const floors = [{type: 'lobby', key: 'lobby'}];
    ['cafe', 'gym', 'arcade', 'trophy'].forEach(k => { if (level >= ROOM[k].unlock) floors.push({type: 'amenity', key: k}); });
    BOT_ORDER.forEach(b => floors.push({type: 'bot', key: b, bot: b}));
    const groundY = H_ - GROUND;
    const compact = W_ < TW + 7 + 60 + 6;
    const LW = compact ? 0 : Math.max(60, Math.min(124, W_ - TW - 16));
    const x0 = compact ? Math.max(1, Math.floor((W_ - TW) / 2)) : Math.max(3, Math.floor((W_ - (TW + 7 + LW)) / 2));
    floors.forEach((fl, i) => { fl.i = i; fl.y = groundY - (i + 1) * FH; fl.room = ROOM[fl.key]; });
    const rx = x0 + 3 + SHAFT + 1, rw = TW - 3 - SHAFT - 1 - 3;
    return {level, compact, floors, groundY, x0, LW, rx, rw, roofY: groundY - floors.length * FH, labelX: x0 + TW + 7};
  }

  function init(canvas, level, scale, opts) {
    W = Math.floor(canvas.parentElement.clientWidth / scale); H = opts.H;
    canvas.width = W; canvas.height = H; canvas.style.width = W * scale + 'px'; canvas.style.height = H * scale + 'px';
    ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    lay = layout(level, W, H);
    const r = rng(7 + level);
    walkers = [];
    lay.floors.forEach(fl => {
      const n = fl.type === 'lobby' ? 3 : fl.type === 'amenity' ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const pal = PALS[Math.floor(r() * PALS.length)];
        walkers.push({fl: fl.i, x: lay.rx + 6 + Math.floor(r() * (lay.rw - 16)), dir: r() < .5 ? -1 : 1,
          hair: pal[0], shirt: pal[1], skin: SKINS[Math.floor(r() * SKINS.length)], pause: 0, seed: r()});
      }
    });
    elev = {y: lay.floors[0].y + 1, target: lay.floors[0].y + 1, wait: 6, r: rng(99)};
    return lay;
  }

  // ---------------- sprites
  function sprite(rows, x, y, map) { rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = map[row[i]]; if (c) R(x + i, y + j, 1, 1, c); } }); }
  function drawBot(name, x, y, mood, fr) {
    const h = HAT[name], c = COL[name];
    const map = {k: '#1a1020', s: h.skin, h: h.hair, c, p: '#2d2f4a', w: '#fff'};
    let rows = BODY.slice();
    if (mood === 'idle' && fr % 8 < 4) rows[3] = 'sssssss';
    if (mood === 'busy') rows[7] = fr % 2 ? 'scccccs' : 'cscccsc';
    if (mood === 'walk') rows[9] = fr % 2 ? '.p...p.' : '..p.p..';
    if (mood === 'slump') { rows[3] = 'sssssss'; y += 2; }
    if (mood === 'ghost') { map.c = '#777'; map.h = '#555'; map.s = '#aaa'; }
    const by = y + (mood === 'busy' && fr % 4 === 0 ? -1 : 0);
    sprite(rows, x, by, map);
    if ((mood === 'idle' && fr % 8 < 4) || mood === 'slump') R(x + 1, by + 3, 2, 1, '#1a1020'), R(x + 4, by + 3, 2, 1, '#1a1020');
    if (mood === 'slump') { R(x - 1, by - 7, 9, 3, '#555c70'); R(x, by - 8, 6, 1, '#555c70'); if (fr % 2) R(x + 2, by - 4, 1, 2, '#7fd3ff'); else R(x + 5, by - 3, 1, 2, '#7fd3ff'); }
    if (mood === 'ghost') { R(x + 7, by + 6, 5, 4, '#a0673d'); R(x + 7, by + 6, 5, 1, '#c98b5a'); }
    if (h.rows.length) sprite(h.rows, x, by + h.at, Object.assign({}, HATCOL));
    if (h.brim) R(x + 5, by + 1, 3, 1, '#1f4fa0');
    (h.extra || []).forEach(([ex, ey, col]) => R(x + ex, by + ey, 1, 1, col));
    if (mood === 'idle') { const zy = by - 3 - (fr % 6 > 2 ? 2 : 0); R(x + 8, zy, 3, 1, '#fff'); R(x + 9, zy + 1, 1, 1, '#fff'); R(x + 8, zy + 2, 3, 1, '#fff'); }
    if (mood === 'warning') { R(x + 7, by + 1, 1, 2, '#7fd3ff'); if (fr % 2) { R(x + 3, by - 6, 1, 3, '#ff3b3b'); R(x + 3, by - 2, 1, 1, '#ff3b3b'); } }
  }
  function drawWalker(w, x, y, fr) {
    const map = {h: w.hair, s: w.skin, k: '#1a1020', c: w.shirt, p: '#2d2f4a'};
    sprite(WALK, x, y, map); sprite(LEGS[w.pause ? 0 : fr % 2], x, y + 6, map);
  }
  function desk(x, y, wood = '#8b5a2b', screen) {
    R(x, y, 15, 2, wood); R(x, y + 2, 15, 1, '#5b3a1a'); R(x + 1, y + 3, 1, 2, '#5b3a1a'); R(x + 13, y + 3, 1, 2, '#5b3a1a');
    if (screen) { R(x + 9, y - 5, 6, 5, '#1a1020'); R(x + 10, y - 4, 4, 3, screen); R(x + 11, y - 1, 2, 1, '#444'); }
  }

  // ---------------- scenery
  const SKY = {
    day: ['#3d8fe0', '#4e9fea', '#62aff2', '#7bc0f7', '#97d0fb', '#b6e0ff'],
    dawn: ['#2b2d6e', '#53407f', '#8a4f86', '#c8648a', '#f08a6e', '#ffc07a'],
    dusk: ['#1d2257', '#3b2d6e', '#6e3a7a', '#b24d6e', '#e8755a', '#ffa95a'],
    night: ['#070a1f', '#0b1030', '#0f1640', '#141c4d', '#19235a', '#1f2b66'],
    gloom: ['#5c6474', '#666e7e', '#717989', '#7c8494', '#878f9f', '#959dab'],
    gloomNight: ['#1a1d26', '#20232e', '#262a36', '#2c303d', '#333745', '#3a3f4e'],
  };
  function sky(gloom) {
    const night = phase === 'night', bands = gloom ? (night ? SKY.gloomNight : SKY.gloom) : SKY[phase];
    const bh = Math.ceil(lay.groundY / bands.length);
    bands.forEach((c, i) => { R(0, i * bh, W, bh, c); if (i) for (let x = (i % 2); x < W; x += 2) R(x, i * bh, 1, 1, bands[i - 1]); });
    if (!gloom) {
      if (night || phase === 'dusk') { const st = rng(21); for (let i = 0; i < (night ? 60 : 20); i++) { const x = Math.floor(st() * W), y = Math.floor(st() * lay.groundY * .6); if ((i + (f >> 2)) % 7) R(x, y, 1, 1, i % 5 ? '#cfd8ff' : '#fff6a0'); } }
      if (night) { const mx = W - 30, my = 14; R(mx + 2, my, 8, 12, '#f4f1d0'); R(mx, my + 2, 12, 8, '#f4f1d0'); R(mx + 6, my + 1, 6, 8, SKY.night[0]); R(mx + 3, my + 5, 2, 2, '#d9d4a8'); }
      else if (phase === 'day') { const sx = W - 30, sy = 14; R(sx + 3, sy, 8, 14, '#ffe066'); R(sx, sy + 3, 14, 8, '#ffe066'); R(sx + 1, sy + 1, 12, 12, '#ffe066'); R(sx + 4, sy + 3, 3, 2, '#fff6bf'); }
      else { const sx = phase === 'dawn' ? 20 : W - 40, sy = lay.groundY - 34; R(sx + 3, sy, 8, 14, '#ff9a3d'); R(sx, sy + 3, 14, 8, '#ff9a3d'); R(sx + 1, sy + 1, 12, 12, '#ffb86b'); }
    }
    const r = rng(3), dark = night || phase === 'dusk';
    const bc = gloom ? (night ? '#2a2e3a' : '#7a8292') : {day: '#a8d4f5', dawn: '#6e5a8a', dusk: '#4a3462', night: '#151b44'}[phase];
    for (let x = 0; x < W;) { const bw = 10 + Math.floor(r() * 14), bh2 = 20 + Math.floor(r() * 50);
      R(x, lay.groundY - bh2, bw, bh2, bc); for (let wy = lay.groundY - bh2 + 3; wy < lay.groundY - 3; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) { const lit = r();
        if (dark ? lit < .35 : lit < .5) R(wx, wy, 1, 2, dark ? (lit < .1 ? '#fff6a0' : '#ffd23f') : (gloom ? '#8a92a2' : '#c4e4fb')); }
      x += bw + 1; }
    [[10, 22, 0], [120, 40, 37], [220, 16, 71]].forEach(([cx, cy, off]) => { const x = ((cx + Math.floor((f + off) / 3)) % (W + 40)) - 30; cloud(x, cy, gloom || dark); });
  }
  function cloud(x, y, g) { const n = phase === 'night'; const c = n ? '#2a3266' : g ? '#9aa1ad' : '#fff', s = n ? '#1f2752' : g ? '#80878f' : '#d8ecfb'; R(x + 4, y, 7, 2, c); R(x + 2, y + 2, 14, 2, c); R(x, y + 4, 20, 3, c); R(x, y + 7, 20, 1, s); }
  function rain() { const r = rng(11); for (let i = 0; i < 90; i++) { const x = Math.floor(r() * W), y = (Math.floor(r() * H) + f * 5) % lay.groundY; R(x, y, 1, 3, '#cfe3ff'); } }
  function ground() {
    const g = lay.groundY;
    R(0, g, W, 2, '#3fae4a'); for (let x = 0; x < W; x += 5) R(x + (x % 3), g - 1, 1, 1, '#3fae4a');
    R(0, g + 2, W, 4, '#c9c4b8'); for (let x = 0; x < W; x += 8) R(x, g + 2, 1, 4, '#a9a498');
    R(0, g + 6, W, 1, '#7d786d'); R(0, g + 7, W, H - g - 7, '#3a3d4a');
    for (let x = -(f % 12); x < W; x += 12) R(x, g + 11, 6, 1, '#ffd23f');
    car = (car + 2) % (W + 40); const cx = car - 20, cy = g + 8; // little car
    R(cx, cy + 2, 16, 4, '#e74c3c'); R(cx + 3, cy, 9, 2, '#e74c3c'); R(cx + 4, cy, 3, 2, '#bfe8ff'); R(cx + 8, cy, 3, 2, '#bfe8ff');
    R(cx + 2, cy + 6, 3, 2, '#111'); R(cx + 11, cy + 6, 3, 2, '#111'); R(cx + 15, cy + 3, 1, 1, '#fff6a0');
  }

  // ---------------- rooms
  function wallpaper(fl, x, y, w, h) {
    R(x, y, w, h, fl.room.wall);
    const k = fl.key, c2 = fl.room.wall2;
    if (k === 'Chief' || k === 'cafe') for (let i = 0; i < w; i += 6) R(x + i, y, 2, h, c2);
    else if (k === 'Skeptic') { for (let i = 3; i < w; i += 10) { R(x + i, y + 2, 1, 1, '#5d6476'); R(x + i, y + h - 3, 1, 1, '#5d6476'); } }
    else if (k === 'arcade') { for (let i = 0; i < w; i += 7) R(x + i + ((i * 3) % 5), y + 2 + (i % 4), 1, 1, (f + i) % 4 ? '#8a7bd1' : '#fff'); }
    else if (k === 'lobby') { for (let i = 0; i < w; i += 4) R(x + i, y + h - 3, 2, 3, ((i / 4) % 2) ? '#cfc2a8' : '#f4ead6'); }
    else for (let j = 2; j < h; j += 4) for (let i = (j % 8 ? 0 : 2); i < w; i += 4) R(x + i, y + j, 1, 1, c2);
  }
  const ROOMDRAW = {
    lobby(x, y, w, s) {
      R(x + 6, s - 7, 22, 7, '#a0522d'); R(x + 6, s - 8, 22, 1, '#d2915a'); R(x + 16, s - 10, 2, 2, '#ffd23f');
      plant(x + 34, s); plant(x + w - 32, s);
      const dx = x + w - 20; R(dx, s - 13, 16, 13, '#3a3d4a'); R(dx + 1, s - 12, 6, 12, '#9fd6ff'); R(dx + 8, s - 12, 6, 12, '#9fd6ff'); R(dx + 7, s - 12, 1, 12, '#3a3d4a');
      if (lay.level >= 3) { R(x + 30, s - 1, w - 52, 1, '#c0392b'); plant(x + 4, s); }
      if (lay.level >= 5) { const cx = x + Math.floor(w / 2); R(cx - 1, y + 1, 2, 2, '#ffd23f'); R(cx - 4, y + 3, 8, 1, '#ffd23f'); R(cx - 4, y + 4, 1, 1, '#fff6a0'); R(cx + 3, y + 4, 1, 1, '#fff6a0'); }
    },
    cafe(x, y, w, s) {
      R(x + 4, s - 7, 26, 7, '#6b3e26'); R(x + 4, s - 8, 26, 1, '#a0673d'); R(x + 8, s - 13, 6, 5, '#555'); R(x + 9, s - 12, 4, 2, '#e74c3c');
      if (f % 4 < 2) R(x + 10, s - 15, 1, 2, '#eee'); else R(x + 11, s - 16, 1, 2, '#eee');
      R(x + 36, y + 2, 16, 7, '#2b2b2b'); R(x + 38, y + 4, 10, 1, '#fff'); R(x + 38, y + 6, 7, 1, '#fff');
      [60, 84].forEach(t => { R(x + t, s - 5, 10, 1, '#6b3e26'); R(x + t + 4, s - 4, 2, 4, '#6b3e26'); R(x + t + 3, s - 7, 3, 2, '#fff'); });
    },
    gym(x, y, w, s) {
      R(x + 4, s - 3, 22, 3, '#333'); for (let i = 0; i < 22; i += 3) R(x + 4 + ((i + f) % 22), s - 3, 1, 1, '#777'); R(x + 22, s - 11, 2, 8, '#555'); R(x + 18, s - 11, 6, 2, '#555');
      R(x + 40, y + 2, 20, 11, '#d7f3ff'); R(x + 41, y + 3, 4, 9, '#f5fdff');
      R(x + 74, s - 9, 18, 1, '#555'); R(x + 74, s - 5, 18, 1, '#555'); [76, 81, 86].forEach(d => { R(x + d, s - 11, 3, 2, '#222'); R(x + d, s - 7, 3, 2, '#222'); });
    },
    arcade(x, y, w, s) {
      R(x, y + 1, w, 1, (f % 2) ? '#ff4fd8' : '#4fd8ff');
      [6, 22, 90].forEach((a, i) => { R(x + a, s - 13, 10, 13, ['#e74c3c', '#2980b9', '#f1c40f'][i]); R(x + a + 2, s - 11, 6, 5, (f + i) % 3 ? '#1a1020' : '#4cff8f');
        R(x + a + 3, s - 10 + (f % 3), 2, 2, '#ff4fd8'); R(x + a + 2, s - 5, 6, 1, '#222'); });
    },
    trophy(x, y, w, s) {
      [8, 28, 48].forEach((t, i) => { R(x + t, s - 5, 8, 5, '#d8d0c0'); R(x + t + 2, s - 10, 4, 4, '#ffd23f'); R(x + t + 1, s - 10, 6, 1, '#ffd23f'); R(x + t + 3, s - 6, 2, 1, '#c99a00'); });
      R(x + 74, y + 2, 26, 11, '#5b3a1a'); R(x + 75, y + 3, 24, 9, '#0a0d1e');
      const pts = [8, 7, 7, 5, 6, 4, 3, 2]; pts.forEach((p, i) => R(x + 76 + i * 3, y + 3 + p, 3, 1, '#4cff8f'));
    },
    Scout(x, y, w, s) {
      R(x + 4, y + 2, 26, 11, '#3a3d4a'); R(x + 5, y + 3, 24, 9, '#bfe8ff'); R(x + 8 + (f >> 2) % 14, y + 5, 6, 2, '#fff');
      R(x + 30, s - 10, 2, 10, '#555'); R(x + 27, s - 1, 8, 1, '#555'); R(x + 22, s - 13, 10, 3, '#2b2b2b'); R(x + 21, s - 13, 2, 3, '#7fd3ff');
      R(x + 84, y + 2, 18, 11, '#e9d9a6'); [[88, 5], [95, 8], [99, 4]].forEach(([a, b]) => R(x + a, y + b, 1, 1, '#d62839')); R(x + 86, y + 9, 10, 1, '#7aa36b');
      R(x + 106, s - 9, 9, 9, '#123'); R(x + 107, s - 8, 7, 7, '#0b3d1f'); if (f % 4 < 2) R(x + 110, s - 5, 1, 1, '#4cff8f'); R(x + 110 + (f % 4 === 1 ? 2 : f % 4 === 3 ? -2 : 0), s - 7, 1, 1, '#4cff8f');
    },
    News(x, y, w, s) {
      R(x + 4, y + 2, 24, 12, '#1a1020'); R(x + 5, y + 3, 22, 10, '#c0392b'); R(x + 7, y + 5, 10, 2, '#fff'); R(x + 5, y + 10, 22, 2, '#fff');
      R(x + 5 + ((f * 2) % 18), y + 10, 4, 2, '#1a1020');
      R(x + 86, s - 6, 14, 6, '#8b5a2b'); for (let i = 0; i < 4; i++) R(x + 88, s - 8 - i, 6, 1, i % 2 ? '#fff' : '#ddd');
      R(x + 104, s - 8, 12, 8, '#ccc'); R(x + 106, s - 10, 8, 2, '#fff'); if (f % 6 < 3) R(x + 106, s - 3, 8, 1, '#fff');
    },
    Sentiment(x, y, w, s) {
      R(x + 4, s - 7, 26, 5, '#7b2cbf'); R(x + 4, s - 9, 4, 9, '#7b2cbf'); R(x + 26, s - 9, 4, 9, '#7b2cbf'); R(x + 8, s - 6, 18, 2, '#9d4edd');
      const b = (bx, by, col) => { R(bx, by, 8, 5, '#fff'); R(bx + 1, by + 5, 2, 1, '#fff'); R(bx + 2, by + 2, 4, 1, col); };
      b(x + 8, y + 2 + (f % 8 < 4 ? 0 : 1), '#ff3b6b'); b(x + 88, y + 3 + (f % 8 < 4 ? 1 : 0), '#2ecc71'); b(x + 100, y + 1, '#5ab0ff');
      plant(x + 112, s); R(x + 80, s - 9, 3, 9, '#333'); R(x + 79, s - 12, 5, 4, f % 4 < 2 ? '#ff7ac0' : '#ffd23f');
    },
    Charts(x, y, w, s) {
      const scr = (sx, col, ph) => { R(sx, y + 2, 26, 12, '#111'); R(sx + 1, y + 3, 24, 10, '#06140c');
        let v = 5; for (let i = 0; i < 24; i += 2) { const nv = 2 + ((i * 5 + ph * 3 + (f >> 1)) % 7); R(sx + 1 + i, y + 3 + Math.min(v, nv), 1, Math.abs(nv - v) + 1, col); R(sx + 1 + i, y + 3 + nv, 2, 1, col); v = nv; } };
      scr(x + 4, '#4cff8f', 0); scr(x + 84, '#ff4d5e', 3);
      R(x, s - 1, w, 1, '#1a1020'); R(x + 112, s - 10, 6, 10, '#3a3d4a'); if (f % 2) R(x + 113, s - 9, 4, 1, '#4cff8f');
    },
    Skeptic(x, y, w, s) {
      const cx = x + 16, cy = y + 8; R(cx - 7, cy - 6, 14, 13, '#5d6476'); R(cx - 5, cy - 7, 10, 15, '#5d6476'); R(cx - 4, cy - 4, 8, 8, '#aab2c4'); R(cx - 1, cy - 1, 2, 2, '#333');
      const sp = [[0, -3], [3, 0], [0, 3], [-3, 0]][(f >> 1) % 4]; R(cx + sp[0] - 1, cy + sp[1] - 1, 2, 2, '#333');
      R(x + 88, y + 3, 10, 10, '#ff8a3d'); R(x + 89, y + 12, 8, 1, '#ff8a3d'); R(x + 91, y + 13, 4, 1, '#ff8a3d'); R(x + 92, y + 5, 2, 6, '#fff'); R(x + 90, y + 7, 6, 2, '#fff');
      R(x + 108, y + 2, 4, 3, f % 2 ? '#ff3b3b' : '#7a1010');
      R(x + 104, s - 6, 12, 6, '#444'); R(x + 105, s - 5, 10, 1, '#ffd23f');
    },
    Chief(x, y, w, s) {
      R(x + 4, y + 2, 30, 12, '#5b3a1a'); R(x + 5, y + 3, 28, 10, '#ffb36b'); R(x + 5, y + 9, 28, 4, '#ff8c5a');
      for (let i = 0; i < 28; i += 5) R(x + 5 + i, y + 13 - (3 + (i % 3) * 2), 4, 3 + (i % 3) * 2, '#3d2a5a');
      R(x + 86, y + 3, 14, 9, '#ffd23f'); R(x + 87, y + 4, 12, 7, '#2a6f97'); R(x + 89, y + 8, 4, 3, '#4cd98a');
      plant(x + 108, s); R(x + 40, s - 9, 3, 2, '#ffd23f'); R(x + 41, s - 7, 1, 2, '#c99a00');
    },
  };
  function plant(x, s) { R(x, s - 4, 5, 4, '#a0522d'); R(x + 1, s - 8, 3, 4, '#2e8b57'); R(x, s - 10, 2, 3, '#3fae4a'); R(x + 3, s - 10, 2, 3, '#3fae4a'); }

  function drawFloor(fl, d) {
    const x = lay.rx, y = fl.y + 1, w = lay.rw, h = FH - 3, s = fl.y + FH - 2;
    wallpaper(fl, x, y, w, h);
    R(x, fl.y, w, 1, '#fff8e0'); for (let i = 10; i < w; i += 30) R(x + i, fl.y + 1, 4, 1, '#fff6a0');
    const fn = ROOMDRAW[fl.key]; if (fn) fn(x, y, w, s);
    if (fl.bot) {
      const b = d.bots[fl.bot] || {mood: 'idle'};
      const mood = (slumpUntil[fl.bot] || 0) > f ? 'slump' : b.mood;
      if (cer && cer.bot === fl.bot) {
        desk(x + 48, s - 5, '#8b5a2b', '#24304a');
        const t = cer.t;
        if (t < 26) drawBot(fl.bot, Math.max(x + 1, x + 52 - t * 2), s - 10, 'ghost', f);
        else if (t >= 32) { const nx = Math.min(x + 52, x + 1 + (t - 32) * 2); drawBot(fl.bot, nx, s - 10, nx >= x + 52 ? 'busy' : 'walk', f);
          if (f % 2) { R(nx - 2, s - 13, 1, 1, '#fff6a0'); R(nx + 8, s - 6, 1, 1, '#fff6a0'); } else { R(nx + 9, s - 12, 1, 1, '#ffd23f'); R(nx - 2, s - 5, 1, 1, '#ffd23f'); } }
      } else {
        drawBot(fl.bot, x + 52, s - 12, mood, f + fl.i);
        desk(x + 48, s - 5, fl.bot === 'Chief' ? '#6b2f1a' : '#8b5a2b', mood === 'busy' ? (f % 2 ? '#4cff8f' : '#2bbf6a') : '#24304a');
      }
    }
    R(x, s, w, 2, '#4a3b2f'); R(x, s, w, 1, '#6b5a4a');
  }

  function drawShaft() {
    const sx = lay.x0 + 3, top = lay.roofY, bot = lay.groundY;
    R(sx, top, SHAFT, bot - top, '#2a2d3a'); R(sx + 3, top, 1, bot - top, '#555a6e'); R(sx + 8, top, 1, bot - top, '#555a6e');
    lay.floors.forEach(fl => { R(sx, fl.y + FH - 2, SHAFT, 2, '#4a3b2f'); R(sx + 1, fl.y + 3, SHAFT - 2, 1, '#ffd23f'); });
    // elevator: move 2px per tick between floors, pause at stops
    if (elev.wait > 0) elev.wait--; else if (elev.y !== elev.target) elev.y += Math.sign(elev.target - elev.y) * Math.min(2, Math.abs(elev.target - elev.y));
    else { elev.wait = 8; const fl = lay.floors[Math.floor(elev.r() * lay.floors.length)]; elev.target = fl.y + 1; }
    const ey = elev.y; R(sx + 4, top, 1, ey - top, '#999'); R(sx, ey, SHAFT, FH - 3, '#c0392b'); R(sx + 1, ey + 1, SHAFT - 2, FH - 5, '#f5e6c8');
    sprite(WALK, sx + 3, ey + 4, {h: '#222', s: '#f2c28b', k: '#1a1020', c: '#5ab0ff'}); sprite(LEGS[0], sx + 3, ey + 10, {p: '#2d2f4a', k: '#1a1020'});
    if (elev.wait > 0) { R(sx + 1, ey + 1, 2, FH - 5, '#d9c9a8'); R(sx + SHAFT - 3, ey + 1, 2, FH - 5, '#d9c9a8'); }
    else { R(sx + 1, ey + 1, 5, FH - 5, '#d9c9a8'); R(sx + 6, ey + 1, 5, FH - 5, '#cdbd9c'); }
  }

  function drawRoof(level, ghostNext) {
    const x = lay.x0, y = lay.roofY, w = TW;
    R(x - 1, y - 3, w + 2, 3, '#6b6f80'); R(x - 1, y - 3, w + 2, 1, '#9aa0b4');
    R(x + 8, y - 7, 10, 4, '#b0b5c4'); R(x + 9, y - 6, 8, 1, '#888'); // AC unit
    if (level >= 2) { R(x + 40, y - 18, 2, 15, '#444'); R(x + 92, y - 18, 2, 15, '#444'); R(x + 34, y - 30, 66, 13, '#1a1020'); R(x + 35, y - 29, 64, 11, '#ffd23f'); }
    if (level >= 3) { const tx = x + 112; R(tx, y - 18, 14, 10, '#8b5a2b'); R(tx, y - 19, 14, 1, '#5b3a1a'); for (let i = 0; i < 14; i += 3) R(tx + i, y - 18, 1, 10, '#6b4423');
      R(tx + 1, y - 8, 1, 5, '#555'); R(tx + 12, y - 8, 1, 5, '#555'); R(x + 24, y - 24, 1, 21, '#888'); R(x + 22, y - 20, 5, 1, '#888'); R(x + 23, y - 26, 3, 2, f % 4 < 2 ? '#ff3b3b' : '#7a1010'); }
    if (level >= 4) { for (let i = 0; i < 6; i++) R(x + 4 + i * 5, y - 5, 4, 2, i % 2 ? '#3fae4a' : '#2e8b57'); [x + 30, x + 104].forEach((px, i) => { R(px, y - 14, 1, 11, '#ddd'); R(px + 1, y - 14 + ((f + i) % 2), 5, 3, i ? '#5ab0ff' : '#ff4d5e'); }); }
    if (level >= 5) { const hx = x + 52, hy = y - 4; R(hx, y - 34, 30, 3, '#555'); R(hx + 13, y - 33, 2, 1, '#ffd23f');
      R(hx + 14, y - 42, 2, 8, '#ccc'); if (f % 4 < 2) { R(hx + 13, y - 45, 4, 3, '#ff3b3b'); R(hx + 12, y - 44, 6, 1, '#ff9b9b'); } else R(hx + 14, y - 44, 2, 2, '#7a1010'); }
    if (ghostNext) { const gy = y - 3 - FH - (level >= 2 ? 30 : 6); for (let i = 0; i < w; i += 4) { R(x + i, gy, 2, 1, '#ffffff'); R(x + i, gy + FH, 2, 1, '#ffffff'); }
      for (let j = 0; j < FH; j += 4) { R(x, gy + j, 1, 2, '#fff'); R(x + w - 1, gy + j, 1, 2, '#fff'); } return gy; }
    return null;
  }

  function fireworks() {
    if (lay.level < 5) return; const r = rng(Math.floor(f / 10) + 5), t = f % 10; if (t > 6) return;
    for (let k = 0; k < 2; k++) { const cx = 20 + Math.floor(r() * (W - 40)), cy = 14 + Math.floor(r() * 40), col = ['#ff4fd8', '#ffd23f', '#4cff8f', '#5ab0ff'][Math.floor(r() * 4)];
      for (let a = 0; a < 8; a++) { const dx = Math.round(Math.cos(a * Math.PI / 4) * t * 2), dy = Math.round(Math.sin(a * Math.PI / 4) * t * 2); R(cx + dx, cy + dy, 1, 1, col); } }
  }

  // d = {bots:{name:{mood}}, gloom, rain, hire:Set, ghost}
  function frame(d) {
    f++; ctx.clearRect(0, 0, W, H); phase = d.phase || 'day';
    if (cer && ++cer.t > 70) cer = null;
    sky(d.gloom); if (!d.gloom) fireworks();
    const x = lay.x0;
    R(x, lay.roofY, TW, lay.groundY - lay.roofY, '#d9cdb5'); R(x, lay.roofY, 3, lay.groundY - lay.roofY, '#b8a98d'); R(x + TW - 3, lay.roofY, 3, lay.groundY - lay.roofY, '#b8a98d');
    lay.floors.forEach(fl => drawFloor(fl, d));
    walkers.forEach(w => {
      const fl = lay.floors[w.fl], s = fl.y + FH - 2;
      if (w.pause > 0) w.pause--; else { w.x += w.dir; if (w.x < lay.rx + 3 || w.x > lay.rx + lay.rw - 8) { w.dir *= -1; w.x += 2 * w.dir; } if (((f * 13 + w.seed * 97) | 0) % 40 === 0) w.pause = 6; }
      drawWalker(w, w.x, s - 8, f + w.fl);
    });
    // FOR HIRE floors flash dark/red
    lay.floors.forEach(fl => { if (fl.bot && d.hire.has(fl.bot) && f % 2) { ctx.globalAlpha = .35; R(lay.rx, fl.y + 1, lay.rw, FH - 3, '#ff1f3d'); ctx.globalAlpha = 1; } });
    drawShaft();
    const gy = drawRoof(lay.level, d.ghost);
    // connectors to the floor plates
    if (!lay.compact) lay.floors.forEach(fl => { R(x + TW, fl.y + 8, 7, 1, '#1a1020'); R(x + TW + 6, fl.y + 7, 1, 3, '#1a1020'); });
    ground();
    if (d.rain) rain();
    coins = coins.filter(c => c.life > 0);
    coins.forEach(c => { c.life--; if (c.y < c.floor) { c.y = Math.min(c.floor, c.y + c.vy); } else if (!c.b) { c.b = 1; c.y -= 6; } c.x += c.dx;
      const w2 = (f + c.ph) % 4 === 0 ? 1 : 3; R(c.x + (3 - w2) / 2, c.y, w2, 3, '#ffd23f'); if (w2 === 3) R(c.x + 1, c.y, 1, 1, '#fff6bf'); R(c.x + (3 - w2) / 2, c.y + 3, w2, 1, '#c99a00'); });
    return gy;
  }

  // tiny 16x24 icon for each level
  function icon(canvas, level) {
    canvas.width = 16; canvas.height = 24; const c = canvas.getContext('2d'); const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    r(0, 0, 16, 24, '#7bc0f7'); r(0, 22, 16, 2, '#3fae4a');
    const n = 2 + level, cols = ['#e9dcc4', '#c98b5a', '#5fc7b8', '#3b2a63', '#8c2c3c', '#7cc8f2', '#f3d58a'];
    for (let i = 0; i < n; i++) { const y = 20 - i * 2; r(4, y, 9, 2, i === 0 ? cols[0] : cols[(i % 6) + 1]); r(4, y + 1, 9, 1, 'rgba(0,0,0,.25)'); r(4, y, 1, 2, '#2a2d3a'); }
    const top = 22 - n * 2; r(3, top - 1, 11, 1, '#6b6f80');
    if (level >= 2) r(6, top - 3, 5, 2, '#ffd23f');
    if (level >= 3) r(12, top - 4, 1, 3, '#888');
    if (level >= 4) r(4, top - 2, 2, 1, '#2e8b57');
    if (level >= 5) { r(8, top - 7, 1, 4, '#ccc'); r(7, top - 8, 3, 1, '#ff3b3b'); }
  }
  function avatar(canvas, name) {
    canvas.width = 11; canvas.height = 11; const save = [ctx, W, H]; ctx = canvas.getContext('2d');
    R(0, 0, 11, 11, ROOM[name] ? ROOM[name].wall : '#333'); drawBot(name, 2, 2, 'none', 1); [ctx] = save; W = save[1]; H = save[2];
  }
  function ceremony(bot) { cer = {bot, t: 0}; }
  function coinShower(n) { const r = rng(f + 1); for (let i = 0; i < n; i++) coins.push({x: lay.x0 + Math.floor(r() * TW), y: -Math.floor(r() * 60), vy: 2 + Math.floor(r() * 2), dx: 0,
    floor: lay.groundY - 3, life: 60 + Math.floor(r() * 20), ph: i, b: 0}); }
  function slump(bots, ticks) { bots.forEach(b => { slumpUntil[b] = f + ticks; }); }
  return {init, frame, icon, avatar, ceremony, coinShower, slump, layout: () => lay, FH, TW, COL, ROOM, BOT_ORDER};
})();
