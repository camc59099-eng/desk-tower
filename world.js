// Pixel tower engine (original Tiny-Tower-style cross-section). Pure drawing: no network, no actions.
'use strict';
const PX = (() => {
  const FH = 18, TW = 140, SHAFT = 12, GROUND = 18, LED = 8;
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
    mezz: {name: 'LOBBY MEZZANINE', wall: '#d8cbb0', wall2: '#cbbd9f'},
    leader: {name: 'LEADERBOARD', wall: '#232a50', wall2: '#1d2340'},
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

  let ctx, W, H, lay, f = 0, elev = null, walkers = [], cars = [], trafR = null, cash = false, cer = null, coins = [], slumpUntil = {}, phase = 'day', moves = {}, season = null;
  const rng = s => () => (s = (s * 1664525 + 0x3C6EF35F) >>> 0) / 2 ** 32;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

  function layout(level, W_, H_) {
    const floors = [{type: 'lobby', key: 'lobby'}, {type: 'mezz', key: 'mezz'}, {type: 'leader', key: 'leader'}];
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
      const n = fl.type === 'lobby' ? 3 : fl.type === 'amenity' ? 2 : fl.type === 'leader' || fl.type === 'mezz' ? 0 : 1;
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
  function drawBot(name, x, y, mood, fr, face) {
    const h = HAT[name], c = COL[name];
    const map = {k: '#1a1020', s: h.skin, h: h.hair, c, p: '#2d2f4a', w: '#fff', r: '#ff8fa3'};
    let rows = BODY.slice();
    if (face === 'happy') { rows[4] = 'srsssrs'; rows[5] = '.skkks.'; }
    else if (face === 'stressed') { rows[5] = '.ksksk.'; }
    else if (face === 'neutral') { rows[5] = '.sskss.'; }
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
    if (face === 'stressed' && fr % 4 < 2) R(x + 7, by + 2, 1, 2, '#7fd3ff');
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
  function snow() { const r = rng(17); for (let i = 0; i < 70; i++) { const x = (Math.floor(r() * W) + Math.round(Math.sin((f + i * 9) / 8) * 2) + W) % W, y = (Math.floor(r() * H) + f) % lay.groundY; R(x, y, 1, 1, '#fff'); }
    R(0, lay.groundY - 1, W, 1, '#f4f6ff'); }
  function seasonSky() {
    if (season === 'halloween') for (let k = 0; k < 4; k++) { const bx = (f * (2 + k % 2) + k * 70) % (W + 20) - 10, by = 20 + k * 14 + Math.round(Math.sin((f + k * 5) / 3) * 3), up = (f + k) % 4 < 2;
      R(bx + 2, by, 2, 2, '#1a1020'); R(bx, by + (up ? -1 : 1), 2, 1, '#1a1020'); R(bx + 4, by + (up ? -1 : 1), 2, 1, '#1a1020'); }
    if (season === 'valentine') for (let k = 0; k < 6; k++) { const hx = (k * 53 + 20) % W, hy = lay.groundY - 10 - ((f * 1 + k * 31) % (lay.groundY - 20));
      R(hx, hy, 1, 1, '#ff7ac0'); R(hx + 2, hy, 1, 1, '#ff7ac0'); R(hx, hy + 1, 3, 1, '#ff7ac0'); R(hx + 1, hy + 2, 1, 1, '#ff7ac0'); }
  }
  function rain() { const r = rng(11); for (let i = 0; i < 90; i++) { const x = Math.floor(r() * W), y = (Math.floor(r() * H) + f * 5) % lay.groundY; R(x, y, 1, 3, '#cfe3ff'); } }
  // ---------------- street traffic: varied pixel vehicles, two lanes, both directions
  const VEH = { // facing right; b=body s=stripe w=window k=tyre l=headlight t=taillight d=trim y=accent h=helmet r/u=siren
    sedan: ['....bbbbbb......', '...bwwbwwwb.....', '..bbbbbbbbbbbbb.', 'bbbbbbbbbbbbbbbl', 'tbbbbbbbbbbbbbbb', 'dddddddddddddddd', '..kk.......kk...'],
    taxi: ['......yy........', '....bbbbbb......', '...bwwbwwwb.....', '..bbbbbbbbbbbbb.', 'bdbdbdbdbdbdbdbl', 'tbbbbbbbbbbbbbbb', 'dddddddddddddddd', '..kk.......kk...'],
    sports: ['......bbbbb.......', '....bwwwwwbbb.....', '.bbbbbbbbbbbbbbbbl', 'tbbbbbbbbbbbbbbbbb', 'dddddddddddddddddd', '..kk.........kk...'],
    pickup: ['..........bbbb....', '..........bwwwb...', 'bbbbbbbbbbbwwwbbb.', 'bbbbbbbbbbbbbbbbbl', 'tbbbbbbbbbbbbbbbbb', 'dddddddddddddddddd', '..kk..........kk..'],
    van: ['bbbbbbbbbbbbbbbb....', 'bbbbbbbbbbbbbbbbbb..', 'bbbbbbbbbbbbbbbbwwb.', 'ssssssssssssssssbwwb', 'bbbbbbbbbbbbbbbbbbbl', 'tbbbbbbbbbbbbbbbbbbb', 'dddddddddddddddddddd', '..kk............kk..'],
    bus: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbb.', 'bwwbwwbwwbwwbwwbwwbwwbwwbwwwbb', 'bwwbwwbwwbwwbwwbwwbwwbwwbwwwbb', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'ssssssssssssssssssssssssssssss',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbl', 'tbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'dddddddddddddddddddddddddddddd', '...kk..................kk.....'],
    police: ['......ru........', '....bbbbbb......', '...bwwbwwwb.....', '..ddddddddddddd.', 'bbbbbbbbbbbbbbbl', 'tbbbbbbbbbbbbbbb', 'dddddddddddddddd', '..kk.......kk...'],
    moto: ['...hh...', '...bb...', '..bbbbd.', 'tbbbbbbl', '.kk..kk.'],
    ev: ['.....bbbbbb.......', '...bwwwwwwwwb.....', '.bbbbbbbbbbbbbbbb.', 'tbbbbbbbbbbbbbbbbl', 'dddddddddddddddddd', '..kk.........kk...'],
    cash: ['bbbbbbbbbbbbbbb.......', 'bbbbbbbbbbbbbbbbbbb...', 'bbbbbbybbbbbbbbbbwwb..', 'bbbbbyyybbbbbbbbbwwbb.', 'bbbbbbybbbbbbbbbbbbbbl', 'tbbbbbbbbbbbbbbbbbbbbb', 'dddddddddddddddddddddd', '..kk...kk.........kk..'],
  };
  const VCOL = ['#e74c3c', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f1f5f9', '#334155', '#b45309', '#84cc16', '#0ea5e9'];
  const FIXED = {taxi: '#ffd23f', police: '#f1f5f9', bus: '#f59e0b', cash: '#5f6b5a', van: '#f1f5f9'};
  const SPEED = {sedan: [2, 3], taxi: [2, 3], sports: [3, 4], pickup: [2, 2], van: [1, 2], bus: [1, 1], police: [3, 3], moto: [3, 4], ev: [2, 3], cash: [1, 1]};
  function vehDraw(v, x, bottom) {
    const rows = VEH[v.type], hgt = rows.length, top = bottom - hgt + 1, night = phase === 'night' || phase === 'dusk';
    const map = {b: v.col, s: v.stripe, w: night ? '#3a4a6a' : '#bfe8ff', k: '#111', l: night ? '#fff6a0' : '#ffe9a8', t: '#c0392b', d: '#2a2d3a', y: v.type === 'cash' ? '#ffd23f' : '#1a1020', h: v.helmet,
      r: f % 2 ? '#ff3b3b' : '#5a1010', u: f % 2 ? '#1e3a8a' : '#3b82f6'};
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[v.dir > 0 ? i : row.length - 1 - i], c = map[ch]; if (c && ch !== '.') R(x + i, top + j, 1, 1, c); } });
    const wy = bottom; rows[hgt - 1].split('').forEach((ch, i) => { if (ch === 'k' && (i + (f >> 0) + (v.dir > 0 ? 0 : 1)) % 2 === 0) R(x + (v.dir > 0 ? i : rows[0].length - 1 - i), wy, 1, 1, '#555'); }); // stepped wheel spin
    if (night) { const li = rows.findIndex(r => r.includes('l')); if (li >= 0) { ctx.globalAlpha = .35; const lx = v.dir > 0 ? x + rows[0].length : x - 7;
      R(lx, top + li - 1, 7, 3, '#fff6a0'); R(v.dir > 0 ? lx + 7 : lx - 3, top + li - 2, 3, 5, '#fff6a0'); ctx.globalAlpha = 1; } }
  }
  function traffic(g, warm) {
    if (!trafR) { trafR = rng(4242); for (let k = 0; k < 160; k++) traffic(g, true); } // pre-fill the road
    const r = trafR, lanes = [{dir: -1, bottom: g + 10}, {dir: 1, bottom: H - 1}];
    const rate = phase === 'night' ? .025 : phase === 'dusk' || phase === 'dawn' ? .05 : .09;
    lanes.forEach((ln, li) => {
      const mine = cars.filter(c => c.lane === li);
      if (r() < rate) { // spawn at the entry edge if there's room
        const pool = ['sedan', 'sedan', 'taxi', 'sports', 'pickup', 'van', 'bus', 'police', 'moto', 'moto', 'ev', 'ev'].concat(cash && r() < .25 ? ['cash'] : []);
        const type = pool[Math.floor(r() * pool.length)], wv = VEH[type][0].length, sp = SPEED[type];
        const x = ln.dir > 0 ? -wv : W, clear = mine.every(c => ln.dir > 0 ? c.x > wv + 6 : c.x + c.w < W - 6);
        if (clear) cars.push({lane: li, dir: ln.dir, type, w: wv, x, speed: sp[0] + Math.floor(r() * (sp[1] - sp[0] + 1)),
          col: FIXED[type] || VCOL[Math.floor(r() * VCOL.length)], stripe: type === 'police' ? '#1e3a8a' : type === 'bus' ? '#1a1020' : VCOL[Math.floor(r() * VCOL.length)], helmet: VCOL[Math.floor(r() * VCOL.length)]});
      }
      mine.sort((a, b) => ln.dir > 0 ? b.x - a.x : a.x - b.x); // front-most first
      mine.forEach((c, i) => { let nx = c.x + c.dir * c.speed; const ahead = mine[i - 1];
        if (ahead) nx = ln.dir > 0 ? Math.min(nx, ahead.x - c.w - 4) : Math.max(nx, ahead.x + ahead.w + 4); // keep a gap, never overlap
        c.x = nx; });
    });
    cars = cars.filter(c => c.x > -c.w - 2 && c.x < W + 2);
    if (warm) return;
    cars.filter(c => c.lane === 0).forEach(c => vehDraw(c, c.x, lanes[0].bottom));
    cars.filter(c => c.lane === 1).forEach(c => vehDraw(c, c.x, lanes[1].bottom));
  }
  function ground() {
    const g = lay.groundY;
    R(0, g, W, 2, '#3fae4a'); for (let x = 0; x < W; x += 5) R(x + (x % 3), g - 1, 1, 1, '#3fae4a');
    R(0, g + 2, W, 4, '#c9c4b8'); for (let x = 0; x < W; x += 8) R(x, g + 2, 1, 4, '#a9a498');
    R(0, g + 6, W, 1, '#7d786d'); R(0, g + 7, W, H - g - 7, '#3a3d4a');
    for (let x = 0; x < W; x += 12) R(x, g + 11, 6, 1, "#ffd23f"); // static lane dashes
    traffic(g);
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
    mezz(x, y, w, s) { // TV bezel (left) + cork calendar board (right); text is an HTML overlay
      const half = Math.floor(w / 2);
      R(x + 2, y + 1, half - 3, s - y - 2, '#1a1020'); R(x + 3, y + 2, half - 5, s - y - 4, '#0b1426');
      R(x + Math.floor(half / 2) - 3, s - 1, 6, 1, '#444');
      R(x + half + 1, y + 1, w - half - 3, s - y - 2, '#7a4b2a'); R(x + half + 2, y + 2, w - half - 5, s - y - 4, '#c9a26b');
      for (let i = 0; i < 4; i++) R(x + half + 6 + i * 14, y + 2, 2, 1, ['#ff4d5e', '#5ab0ff', '#4cff8f', '#ffd23f'][i]);
    },
    leader(x, y, w, s) {
      R(x + 3, y + 1, w - 6, h0(y, s) - 1, '#0a0d1e'); R(x + 3, y + 1, w - 6, 1, '#ffd23f'); R(x + 3, s - 2, w - 6, 1, '#ffd23f');
      for (let i = 0; i < w - 6; i += 4) if ((i + f) % 8 < 4) R(x + 3 + i, y + 1, 2, 1, '#fff6a0');
      R(x + 1, s - 6, 2, 6, '#555'); R(x + w - 3, s - 6, 2, 6, '#555');
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
    Charts(x, y, w, s) { // two wall screens with REAL MNQ / micro-gold 15-min closes (from data.prices); NO DATA if missing
      chartScreens(x).forEach((sc, i) => {
        R(sc.x, y + 1, sc.w, 13, '#111'); R(sc.x + 1, y + 2, sc.w - 2, 11, '#06140c');
        const it = prices && prices.ok && prices.items && prices.items[i];
        const pts = it && it.points && it.points.length >= 2 ? it.points : null;
        if (!pts) { for (let k = 0; k < sc.w - 2; k += 3) R(sc.x + 1 + k, y + 12, 1, 1, '#1d3a2a'); return; }
        const cw = sc.w - 2, top = y + 6, rows = 7, n = cw, mn = Math.min(...pts), mx = Math.max(...pts), rg = (mx - mn) || 1;
        const col = (it.change_pct || 0) >= 0 ? '#4cff8f' : '#ff4d5e', dim = (it.change_pct || 0) >= 0 ? '#14502c' : '#5a1620';
        let prev = null;
        for (let c = 0; c < n; c++) { const v = pts[Math.min(pts.length - 1, Math.floor(c * pts.length / n))], r = Math.round((mx - v) / rg * (rows - 1));
          for (let q = r + 1; q < rows; q++) if ((c + q) % 2 === 0) R(sc.x + 1 + c, top + q, 1, 1, dim);
          if (prev != null && prev !== r) R(sc.x + 1 + c, top + Math.min(prev, r), 1, Math.abs(prev - r) + 1, col); else R(sc.x + 1 + c, top + r, 1, 1, col);
          prev = r; }
        if (f % 4 < 2) R(sc.x + sc.w - 2, top + prev, 1, 1, '#fff');
      });
      R(x, s - 1, w, 1, '#1a1020'); R(x + 112, s - 10, 6, 10, '#3a3d4a'); if (f % 2) R(x + 113, s - 9, 4, 1, '#4cff8f');    },
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
  // desk cat: wanders on the best bot's floor, then naps on its desk
  function drawCat(bot) {
    const fl = lay.floors.find(q => q.bot === bot); if (!fl) return;
    const x = lay.rx, s = fl.y + FH - 2, t = f % 220, k = '#2a2230', o = '#ff9a3d';
    if (t < 140) { const span = 60, p = t % (2 * span), cx = x + 8 + (p < span ? p : 2 * span - p), dir = p < span ? 1 : -1, leg = (t >> 1) % 2;
      R(cx, s - 4, 6, 3, o); R(dir > 0 ? cx + 5 : cx - 2, s - 6, 3, 3, o); R(dir > 0 ? cx + 5 : cx - 2, s - 7, 1, 1, o); R(dir > 0 ? cx + 7 : cx, s - 7, 1, 1, o);
      R(dir > 0 ? cx + 6 : cx - 1, s - 5, 1, 1, k); R(dir > 0 ? cx - 2 : cx + 6, s - 6 + (t % 6 < 3 ? 0 : 1), 2, 1, o);
      R(cx + leg, s - 1, 1, 1, k); R(cx + 4 - leg, s - 1, 1, 1, k);
    } else { const dx = x + 49, dy = s - 8; // curled up on the desk
      R(dx, dy, 7, 3, o); R(dx + 5, dy - 1, 3, 3, o); R(dx + 6, dy, 1, 1, k); R(dx, dy + 2, 3, 1, '#d9752a');
      const zt = (t - 140) % 24; if (zt < 18) { R(dx + 9 + (zt >> 3), dy - 3 - (zt >> 2), 2, 1, '#fff'); R(dx + 9 + (zt >> 3), dy - 2 - (zt >> 2), 1, 1, '#fff'); } }
  }
  function chartScreens(x) { return lay.compact ? [{x: x + 2, w: 22}, {x: x + 25, w: 22}] : [{x: x + 3, w: 36}, {x: x + 73, w: 36}]; }
  let prices = null;
  function h0(y, s) { return s - y - 1; }
  function plant(x, s) { R(x, s - 4, 5, 4, '#a0522d'); R(x + 1, s - 8, 3, 4, '#2e8b57'); R(x, s - 10, 2, 3, '#3fae4a'); R(x + 3, s - 10, 2, 3, '#3fae4a'); }

  function drawFloor(fl, d) {
    const x = lay.rx, y = fl.y + 1, w = lay.rw, h = FH - 3, s = fl.y + FH - 2;
    wallpaper(fl, x, y, w, h);
    if (season === 'christmas') for (let i = 2; i < w; i += 6) R(x + i, y, 1, 1, ['#ff3b3b', '#4cff8f', '#ffd23f', '#5ab0ff'][(i / 6 + (f >> 1)) % 4 | 0]);
    R(x, fl.y, w, 1, '#fff8e0'); for (let i = 10; i < w; i += 30) R(x + i, fl.y + 1, 4, 1, '#fff6a0');
    const fn = ROOMDRAW[fl.key]; if (fn) fn(x, y, w, s);
    const away = fl.bot && d.away && d.away.has(fl.bot), mv = fl.bot && moves[fl.bot];
    if (fl.bot && (away || mv)) {
      desk(x + 48, s - 5, fl.bot === 'Chief' ? '#6b2f1a' : '#8b5a2b', '#24304a');
      if (mv) { // walk to/from the lift (x of shaft door) over ~40 ticks
        mv.t++; const p = Math.min(1, mv.t / 40), from = mv.out ? x + 52 : x + 1, to = mv.out ? x + 1 : x + 52;
        drawBot(fl.bot, Math.round(from + (to - from) * p), s - 10, p >= 1 && !mv.out ? 'busy' : 'walk', f, (d.bots[fl.bot] || {}).face);
        if (p >= 1) delete moves[fl.bot];
      }
    } else if (fl.bot) {
      const b = d.bots[fl.bot] || {mood: 'idle'};
      const mood = (slumpUntil[fl.bot] || 0) > f ? 'slump' : b.mood;
      if (cer && cer.bot === fl.bot) {
        desk(x + 48, s - 5, '#8b5a2b', '#24304a');
        const t = cer.t;
        if (t < 26) drawBot(fl.bot, Math.max(x + 1, x + 52 - t * 2), s - 10, 'ghost', f);
        else if (t >= 32) { const nx = Math.min(x + 52, x + 1 + (t - 32) * 2); drawBot(fl.bot, nx, s - 10, nx >= x + 52 ? 'busy' : 'walk', f, 'happy');
          if (f % 2) { R(nx - 2, s - 13, 1, 1, '#fff6a0'); R(nx + 8, s - 6, 1, 1, '#fff6a0'); } else { R(nx + 9, s - 12, 1, 1, '#ffd23f'); R(nx - 2, s - 5, 1, 1, '#ffd23f'); } }
      } else {
        drawBot(fl.bot, x + 52, s - 12, mood, f + fl.i, b.face);
        desk(x + 48, s - 5, fl.bot === 'Chief' ? '#6b2f1a' : '#8b5a2b', mood === 'busy' ? (f % 2 ? '#4cff8f' : '#2bbf6a') : '#24304a');
      }
    }
    if (d.spot && fl.bot && d.spot.has(fl.bot) && !away) { // lead-of-the-day spotlight
      ctx.globalAlpha = .28; for (let j = 0; j < h; j++) R(x + 55 - (j >> 1), y + j, 3 + j, 1, '#fff6a0'); ctx.globalAlpha = 1;
      R(x + 55, y, 3, 1, '#ffd23f'); if (f % 4 < 2) { R(x + 66, y + 2, 1, 3, '#ffd23f'); R(x + 65, y + 3, 3, 1, '#ffd23f'); }
    }
    if (d.dim && d.dim.has(fl.key)) { ctx.globalAlpha = .55; R(x, y - 1, w, h + 2, '#060a24'); ctx.globalAlpha = 1;
      if (fl.i % 2) R(x + 20, y + 3, 2, 2, '#fff6a0'); }
    R(x, s, w, 2, '#4a3b2f'); R(x, s, w, 1, '#6b5a4a');
  }

  let risk = 0; const jobs = [];
  function drawShaft() {
    const sx = lay.x0 + 3, top = lay.roofY, bot = lay.groundY;
    R(sx, top, SHAFT, bot - top, '#2a2d3a'); R(sx + 3, top, 1, bot - top, '#555a6e'); R(sx + 8, top, 1, bot - top, '#555a6e');
    lay.floors.forEach(fl => { R(sx, fl.y + FH - 2, SHAFT, 2, '#4a3b2f'); R(sx + 1, fl.y + 3, SHAFT - 2, 1, '#ffd23f'); });
    // elevator: move 2px per tick between floors, pause at stops
    if (elev.wait > 0) elev.wait--; else if (elev.y !== elev.target) elev.y += Math.sign(elev.target - elev.y) * Math.min(2, Math.abs(elev.target - elev.y));
    else if (elev.job) { const j = elev.job; // delivery: go to the reporter's floor, pick up, ride to the next floor, drop off
      if (j.stage === 0) { j.stage = 1; elev.target = j.from; elev.wait = 2; }
      else if (j.stage === 1) { j.stage = 2; elev.carry = true; elev.target = j.to; elev.wait = 8; }
      else { elev.carry = false; elev.job = null; elev.wait = 10; } }
    else if (jobs.length) { elev.job = jobs.shift(); elev.job.stage = 0; }
    else { elev.wait = 8; const fl = lay.floors[Math.floor(elev.r() * lay.floors.length)]; elev.target = fl.y + 1; }
    const ey = elev.y; R(sx + 4, top, 1, ey - top, '#999'); R(sx, ey, SHAFT, FH - 3, '#c0392b'); R(sx + 1, ey + 1, SHAFT - 2, FH - 5, '#f5e6c8');
    sprite(WALK, sx + 3, ey + 4, {h: '#222', s: '#f2c28b', k: '#1a1020', c: '#5ab0ff'}); sprite(LEGS[0], sx + 3, ey + 10, {p: '#2d2f4a', k: '#1a1020'});
    if (elev.carry) { R(sx + 6, ey + 6, 4, 5, '#fff'); R(sx + 7, ey + 7, 2, 1, '#888'); R(sx + 7, ey + 9, 2, 1, '#888'); if (f % 2) R(sx + 9, ey + 5, 1, 1, '#ffd23f'); }
    if (elev.wait > 0) { R(sx + 1, ey + 1, 2, FH - 5, '#d9c9a8'); R(sx + SHAFT - 3, ey + 1, 2, FH - 5, '#d9c9a8'); }
    else { R(sx + 1, ey + 1, 5, FH - 5, '#d9c9a8'); R(sx + 6, ey + 1, 5, FH - 5, '#cdbd9c'); }
    // risk meter: rises with today's loss toward the 2% daily limit (top of the shaft = limit hit)
    const span = bot - top, rp = Math.max(0, Math.min(100, risk)), rh = Math.round(span * rp / 100);
    R(sx, top, 2, span, '#11131c'); for (let q = 1; q < 4; q++) R(sx, bot - Math.round(span * q / 4), 3, 1, '#6b6f80');
    const rc = rp >= 75 ? '#ff4d5e' : rp >= 40 ? '#ffb020' : '#4cff8f';
    if (rh > 0) R(sx, bot - rh, 2, rh, rp >= 100 && f % 2 ? '#fff' : rc);
    R(sx, top, 3, 1, '#ff4d5e');
  }

  function drawRoof(level, ghostNext, d) {
    const x = lay.x0, w = TW, y = lay.roofY - LED;
    R(x - 1, lay.roofY - LED, w + 2, LED, '#0b0b10'); R(x - 1, lay.roofY - LED, w + 2, 1, '#3a3d4a'); // LED ticker housing
    for (let i = 0; i < w; i += 2) R(x + i, lay.roofY - 2, 1, 1, '#2a1a00');
    R(x - 1, y - 3, w + 2, 3, '#6b6f80'); R(x - 1, y - 3, w + 2, 1, '#9aa0b4');
    R(x + 8, y - 7, 10, 4, '#b0b5c4'); R(x + 9, y - 6, 8, 1, '#888'); // AC unit
    if (level >= 2) { R(x + 40, y - 18, 2, 15, '#444'); R(x + 92, y - 18, 2, 15, '#444'); R(x + 34, y - 30, 66, 13, '#1a1020'); R(x + 35, y - 29, 64, 11, '#ffd23f'); }
    if (level >= 3) { const tx = x + 112; R(tx, y - 18, 14, 10, '#8b5a2b'); R(tx, y - 19, 14, 1, '#5b3a1a'); for (let i = 0; i < 14; i += 3) R(tx + i, y - 18, 1, 10, '#6b4423');
      R(tx + 1, y - 8, 1, 5, '#555'); R(tx + 12, y - 8, 1, 5, '#555'); R(x + 24, y - 24, 1, 21, '#888'); R(x + 22, y - 20, 5, 1, '#888'); R(x + 23, y - 26, 3, 2, f % 4 < 2 ? '#ff3b3b' : '#7a1010'); }
    if (level >= 4) { for (let i = 0; i < 6; i++) R(x + 4 + i * 5, y - 5, 4, 2, i % 2 ? '#3fae4a' : '#2e8b57'); [x + 30, x + 104].forEach((px, i) => { R(px, y - 14, 1, 11, '#ddd'); R(px + 1, y - 14 + ((f + i) % 2), 5, 3, i ? '#5ab0ff' : '#ff4d5e'); }); }
    if (level >= 5) { const hx = x + 52, hy = y - 4; R(hx, y - 34, 30, 3, '#555'); R(hx + 13, y - 33, 2, 1, '#ffd23f');
      R(hx + 14, y - 42, 2, 8, '#ccc'); if (f % 4 < 2) { R(hx + 13, y - 45, 4, 3, '#ff3b3b'); R(hx + 12, y - 44, 6, 1, '#ff9b9b'); } else R(hx + 14, y - 44, 2, 2, '#7a1010'); }
    const st = d.streak || {};
    if (st.type === 'win' && st.n >= 3) [x + 2, x + w - 9, x + 60].forEach((fx, k) => { const ph = (f + k * 3) % 6, hgt = 6 + (ph < 3 ? ph : 6 - ph);
      R(fx, y - 3 - hgt, 6, hgt, '#ff5d3d'); R(fx + 1, y - 3 - hgt + 2, 4, hgt - 2, '#ffb020'); R(fx + 2, y - 3 - hgt + 4, 2, hgt - 4, '#fff6a0'); if (ph % 2) R(fx + 2, y - 5 - hgt, 2, 2, '#ff5d3d'); });
    if (st.type === 'loss' && st.n >= 3) for (let k = 0; k < 6; k++) { const t = (f + k * 7) % 42, sx = x + 12 + Math.round(Math.sin((t + k) / 5) * 3) + k % 2 * 4, sy = y - 8 - t;
      ctx.globalAlpha = Math.max(0, .7 - t / 60); R(sx, sy, 4 + (t >> 4), 3 + (t >> 4), k % 2 ? '#6b6f80' : '#9aa0b4'); ctx.globalAlpha = 1; }
    if (season === 'halloween') [x + 22, x + 68, x + 100].forEach(px => { R(px, y - 7, 6, 4, '#ff8a00'); R(px + 2, y - 8, 2, 1, '#2e8b57'); R(px + 1, y - 6, 1, 1, '#1a1020'); R(px + 4, y - 6, 1, 1, '#1a1020'); R(px + 2, y - 5, 2, 1, f % 4 < 2 ? '#ffd23f' : '#1a1020'); });
    if (season === 'christmas') { for (let i = 0; i < w; i += 1) R(x + i, y - 4, 1, 1, '#fff'); R(x + w - 12, y - 14, 1, 11, '#5b3a1a'); for (let j = 0; j < 9; j++) R(x + w - 12 - (j >> 1), y - 13 + j, 1 + j, 1, '#2e8b57'); R(x + w - 12, y - 15, 1, 1, '#ffd23f'); }
    if (season === 'valentine') { const hx = x + 64, hy = y - 12; R(hx, hy, 2, 2, '#ff4fa3'); R(hx + 3, hy, 2, 2, '#ff4fa3'); R(hx - 1, hy + 1, 7, 2, '#ff4fa3'); R(hx, hy + 3, 5, 1, '#ff4fa3'); R(hx + 1, hy + 4, 3, 1, '#ff4fa3'); R(hx + 2, hy + 5, 1, 1, '#ff4fa3'); }
    if (ghostNext && d.construct) { const gy = y - 3 - FH - (level >= 2 ? 30 : 6), sb = y - 3;
      for (let i = 0; i <= w; i += 10) R(x + i, gy, 1, sb - gy, '#c98a2b');
      for (let j = gy; j < sb; j += 6) R(x, j, w, 1, '#c98a2b');
      for (let i = 0; i < w; i += 20) for (let j = 0; j < 6; j++) R(x + i + j, gy + 6 + j, 1, 1, '#8a5a1a');
      const cx = x + w + 6; R(cx, gy - 16, 2, sb - gy + 16, '#ffd23f'); for (let j = gy - 16; j < sb; j += 4) R(cx - 1, j, 4, 1, '#c99a00');
      R(cx - 46, gy - 16, 60, 2, '#ffd23f'); R(cx + 8, gy - 14, 6, 4, '#555');
      const hx = cx - 40 + ((f >> 1) % 30); R(hx, gy - 14, 1, 10 + (f % 4), '#888'); R(hx - 2, gy - 4 + (f % 4), 5, 3, '#c0392b');
      R(cx - 2, gy - 20, 6, 4, '#3a3d4a'); R(cx - 1, gy - 19, 4, 2, '#9fd6ff');
      if (f % 4 < 2) R(cx, gy - 22, 2, 1, '#ff3b3b'); }
    if (ghostNext) { const gy = y - 3 - FH - (level >= 2 ? 30 : 6); for (let i = 0; i < w; i += 4) { R(x + i, gy, 2, 1, '#ffffff'); R(x + i, gy + FH, 2, 1, '#ffffff'); }
      for (let j = 0; j < FH; j += 4) { R(x, gy + j, 1, 2, '#fff'); R(x + w - 1, gy + j, 1, 2, '#fff'); } return gy; }
    return null;
  }

  function fireworks() {
    if (lay.level < 5 && season !== 'newyear') return; const r = rng(Math.floor(f / 10) + 5), t = f % 10; if (t > 6) return;
    for (let k = 0; k < 2; k++) { const cx = 20 + Math.floor(r() * (W - 40)), cy = 14 + Math.floor(r() * 40), col = ['#ff4fd8', '#ffd23f', '#4cff8f', '#5ab0ff'][Math.floor(r() * 4)];
      for (let a = 0; a < 8; a++) { const dx = Math.round(Math.cos(a * Math.PI / 4) * t * 2), dy = Math.round(Math.sin(a * Math.PI / 4) * t * 2); R(cx + dx, cy + dy, 1, 1, col); } }
  }

  // d = {bots:{name:{mood}}, gloom, rain, hire:Set, ghost}
  function frame(d) {
    f++; ctx.clearRect(0, 0, W, H); phase = d.phase || 'day';
    if (cer && ++cer.t > 70) cer = null;
    season = d.season || null; prices = d.prices || null; cash = !!d.cash; sky(d.gloom); if (!d.gloom || season === 'newyear') fireworks(); seasonSky();
    const x = lay.x0;
    R(x, lay.roofY, TW, lay.groundY - lay.roofY, '#d9cdb5'); R(x, lay.roofY, 3, lay.groundY - lay.roofY, '#b8a98d'); R(x + TW - 3, lay.roofY, 3, lay.groundY - lay.roofY, '#b8a98d');
    lay.floors.forEach(fl => drawFloor(fl, d));
    walkers.forEach(w => {
      const fl = lay.floors[w.fl], s = fl.y + FH - 2;
      if (w.pause > 0) w.pause--; else { w.x += w.dir; if (w.x < lay.rx + 3 || w.x > lay.rx + lay.rw - 8) { w.dir *= -1; w.x += 2 * w.dir; } if (((f * 13 + w.seed * 97) | 0) % 40 === 0) w.pause = 6; }
      drawWalker(w, w.x, s - 8, f + w.fl);
    });
    if (d.cat) drawCat(d.cat);
    // FOR HIRE floors flash dark/red
    lay.floors.forEach(fl => { if (fl.bot && d.hire.has(fl.bot) && f % 2) { ctx.globalAlpha = .35; R(lay.rx, fl.y + 1, lay.rw, FH - 3, '#ff1f3d'); ctx.globalAlpha = 1; } });
    drawShaft();
    risk = d.risk || 0;
    const gy = drawRoof(lay.level, d.ghost, d);
    // connectors to the floor plates
    if (!lay.compact) lay.floors.forEach(fl => { R(x + TW, fl.y + 8, 7, 1, '#1a1020'); R(x + TW + 6, fl.y + 7, 1, 3, '#1a1020'); });
    ground();
    if (d.rain && season !== 'christmas') rain();
    if (season === 'christmas') snow();
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
  function deliver(fromBot, toBot) {
    const a = lay.floors.find(fl => fl.bot === fromBot), b = lay.floors.find(fl => fl.bot === toBot);
    if (a && b && jobs.length < 6) jobs.push({from: a.y + 1, to: b.y + 1, fromBot, toBot});
  }
  function walk(bot, out) { moves[bot] = {t: 0, out}; }
  function slump(bots, ticks) { bots.forEach(b => { slumpUntil[b] = f + ticks; }); }
  return {chartScreens, init, frame, icon, avatar, ceremony, coinShower, slump, walk, deliver, LED, layout: () => lay, FH, TW, COL, ROOM, BOT_ORDER};
})();
