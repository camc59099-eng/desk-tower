// Desk HQ UI (pixel Tiny-Tower style). Read-only: polls JSON and draws. No forms, no POSTs, no trading, no sign-ins.
'use strict';
const POLL_MS = 4000, TICK_MS = 160, WORLD_H = 308;
const Q = new URLSearchParams(location.search);
const mode = 'real'; // single real view (demo modes removed)
let data = null, lastTier = null, preview = +Q.get('preview') || null, skyOverride = Q.get('sky');
let chatFilter = 'All', lastChatKey = '', worldKey = '', ghostY = null, worldState = null, scale = 3;
let prevLeads = null, chatQ = [];
let prevAway = null, apPage = 0;
let speechSpots = [], speechI = 0, visitors = null;
let replayAsof = null, liveDays = [], prevSnap = null, lastRoster = null, sound = false, actx = null, openBot = null;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
const money = (v, sign = false) => v == null ? '–' : (sign && v > 0 ? '+' : v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const fmtTime = ts => { if (!ts) return ''; const d = new Date(ts); if (isNaN(d)) return esc(ts);
  return d.toLocaleString('en-AU', {timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit'}) + ' Syd'; };
const fmtDate = ts => { const d = new Date(ts); return isNaN(d) ? String(ts) : d.toLocaleDateString('en-AU', {timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric'}); };
const fmtDay = ds => { const d = new Date(ds + 'T12:00:00'); return isNaN(d) ? ds : d.toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short'}); };
const avatarURL = {}; function avatar(name) { if (!avatarURL[name]) { const c = document.createElement('canvas'); PX.avatar(c, name); avatarURL[name] = c.toDataURL(); } return avatarURL[name]; }

// ---------------- data
const STATIC = !!window.HQ_STATIC; // static export (GitHub Pages): replay days are pre-built files
function src() { const f = 'data.json';
  if (STATIC && replayAsof) return `history/${mode}/${replayAsof}.json?t=${Date.now()}`;
  return f + '?t=' + Date.now() + (replayAsof ? '&asof=' + replayAsof : ''); }
async function poll() {
  const want = mode + '|' + replayAsof;
  try {
    const r = await fetch(src(), {cache: 'no-store'});
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    if (want !== mode + '|' + replayAsof) return; // stale response after a mode/replay switch
    if (d.demo) throw new Error('unexpected demo data');
    if (d.pnl && d.pnl.as_of) { const t = Date.parse(d.pnl.as_of); d.pnl.stale = isNaN(t) || Date.now() - t > 864e5; } // age checked in the browser
    data = d; if (!d.asof) liveDays = d.days || liveDays;
    events(d); render(); $('live').className = 'live'; $('live').textContent = replayAsof ? '● REPLAY' : '● LIVE';
  } catch (e) { $('live').className = 'live stale'; $('live').textContent = '● OFFLINE'; $('live').title = e.message; }
}
function start() { lastTier = null; lastChatKey = ''; worldKey = ''; replayAsof = null; prevSnap = null; lastRoster = null; liveDays = []; data = null; poll(); }

// ---------------- events: trades closing, rehires, new leads/orders, level ups
function events(d) {
  const snap = {closed: new Set(d.closed_trades.map(t => t.lead_id + '|' + t.date + '|' + t.pnl)), rows: d.open_trades.length + d.pnl.closed,
    chat: new Set(d.chat.map(m => m.ts + m.bot + m.text)), tier: d.tier.level};
  if (prevSnap) {
    const fresh = d.closed_trades.filter(t => !prevSnap.closed.has(t.lead_id + '|' + t.date + '|' + t.pnl));
    const wins = fresh.filter(t => t.pnl > 0), losses = fresh.filter(t => t.pnl < 0);
    if (wins.length) { PX.coinShower(Math.min(60, 14 * wins.length)); toast(`+${money(wins.reduce((a, t) => a + t.pnl, 0))} · COIN SHOWER!`); sfx('coin'); }
    if (losses.length) { PX.slump([...new Set(losses.flatMap(t => t.workers || []))], 60); toast(`${money(losses.reduce((a, t) => a + t.pnl, 0))} · the desk slumps`); sfx('sad'); }
    const newMsgs = d.chat.filter(m => !prevSnap.chat.has(m.ts + m.bot + m.text));
    if (newMsgs.some(m => m.kind === 'lead')) sfx('lead');
    if (newMsgs.some(m => m.kind === 'order') || snap.rows > prevSnap.rows) sfx('order');
    if (snap.tier > prevSnap.tier && !preview) sfx('level');
  }
  prevSnap = snap;
  leadAdvance(d);
  // hire ceremony: a roster version went up
  const base = lastRoster || JSON.parse(localStorage.getItem('hq_roster_real') || 'null') || {};
  (d.roster || []).forEach(r => { const was = base[r.name] || 1; if (r.version > was) { PX.ceremony(r.name); toast(`NEW HIRE: ${r.name.toUpperCase()} v${r.version} moves in!`); sfx('level'); } });
  lastRoster = Object.fromEntries((d.roster || []).map(r => [r.name, r.version]));
  if (!d.asof) localStorage.setItem('hq_roster_real', JSON.stringify(lastRoster));
}
// ---------------- lead advances -> elevator carries the report up the pipeline + decorative chatter between neighbours
const PIPE = ['Scout', 'News', 'Sentiment', 'Charts', 'Skeptic', 'Chief'];
function leadSteps(d) { const m = {}; (d.leads || []).forEach(l => { m[l.lead_id] = new Set([...Object.keys(l.reports || {}), ...(l.verdict ? ['Skeptic'] : [])]); }); return m; }
function leadAdvance(d, force) {
  const now = leadSteps(d);
  if (d.asof) { prevLeads = null; return; }
  const adv = [];
  if (prevLeads) Object.entries(now).forEach(([lid, set]) => set.forEach(b => { if (!(prevLeads[lid] && prevLeads[lid].has(b))) adv.push([lid, b]); }));
  if (force) adv.push(force);
  prevLeads = now;
  adv.slice(0, 3).forEach(([lid, b]) => { const nb = PIPE[PIPE.indexOf(b) + 1] || 'Chief'; if (nb !== b) PX.deliver(b, nb); chatter(lid, b, nb); });
}
const CHAT_A = ['#{L} done, sending it up to {N}!', 'Report on #{L} is in the lift.', '{N}, your turn on #{L}.', 'Filed #{L}. Coffee time.'];
const CHAT_B = ['Got it, reading #{L} now.', 'Thanks {A}, on it.', 'Lift is here with #{L}!', 'Checking the numbers on #{L}.'];
function chatter(lid, a, b) {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)].replace(/\{L\}/g, lid).replace(/\{N\}/g, b).replace(/\{A\}/g, a);
  chatQ.push({bot: a, text: pick(CHAT_A)}, {bot: b, text: pick(CHAT_B)});
  if (!chatter.t) chatter.t = setInterval(() => { const c = chatQ.shift(); if (!c) { clearInterval(chatter.t); chatter.t = null; const e = $('chatter'); if (e) e.hidden = true; return; } showChatter(c); }, 2600);
}
function showChatter(c) {
  const el = $('chatter'), lay = PX.layout(); if (!el || !lay) return; const fl = lay.floors.find(q => q.bot === c.bot); if (!fl) return;
  const S = scale; el.style.left = (lay.rx + 4) * S + 'px'; el.style.top = (fl.y + 1) * S + 'px'; el.style.setProperty('--c', PX.COL[c.bot]);
  el.innerHTML = `<b>${esc(c.bot.toUpperCase())}</b> ${esc(c.text)}`; el.hidden = false;
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 4000); }

// ---------------- chiptune (WebAudio, muted by default; starts only after a click)
$('sound').onclick = () => { sound = !sound; $('sound').textContent = sound ? '♪ ON' : '♪ OFF'; $('sound').classList.toggle('on', sound);
  if (sound) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); sfx('lead'); } catch (e) { sound = false; } } };
function sfx(kind) {
  if (!sound || !actx) return;
  const seq = {lead: [[660, .08], [880, .1]], order: [[523, .07], [659, .07], [784, .12]], coin: [[988, .06], [1319, .18]],
    sad: [[392, .15], [330, .15], [262, .3]], level: [[523, .1], [659, .1], [784, .1], [1047, .25]]}[kind] || [];
  let t = actx.currentTime + .02;
  seq.forEach(([fq, dur]) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.value = fq;
    g.gain.setValueAtTime(.06, t); g.gain.setValueAtTime(0, t + dur - .01); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur); t += dur; });
}

// ---------------- day / night from US market hours (America/New_York)
function marketPhase() {
  if (['day', 'dawn', 'dusk', 'night'].includes(skyOverride)) return {phase: skyOverride, label: 'SKY PREVIEW: ' + skyOverride.toUpperCase()};
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false})
    .formatToParts(new Date()).map(p => [p.type, p.value]));
  const h = (+parts.hour % 24) + (+parts.minute) / 60, wd = parts.weekday;
  const nice = new Date().toLocaleTimeString('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'});
  let phase, label;
  if (wd === 'Sat' || wd === 'Sun') { phase = 'night'; label = 'WEEKEND · MARKET CLOSED'; }
  else if (h >= 4 && h < 9.5) { phase = 'dawn'; label = 'PRE-MARKET'; }
  else if (h >= 9.5 && h < 16) { phase = 'day'; label = 'MARKET OPEN'; }
  else if (h >= 16 && h < 20) { phase = 'dusk'; label = 'AFTER HOURS'; }
  else { phase = 'night'; label = 'MARKET CLOSED'; }
  return {phase, label: `NY ${wd.toUpperCase()} ${nice} ET · ${label}`};
}

// ---------------- render
function render() {
  const d = data, p = d.pnl, realTier = d.tier.level, lvl = preview || realTier;
  $('equity').textContent = money(p.equity);
  const pct = d.balance_start ? 100 * p.total / d.balance_start : 0;
  $('totalPct').textContent = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'; $('totalPct').className = 'chip ' + cls(pct);
  $('total').textContent = money(p.total, true); $('total').className = cls(p.total);
  $('today').textContent = money(p.today, true); $('today').className = cls(p.today);
  $('winrate').textContent = p.winrate == null ? '–' : p.winrate + '%';
  $('open').textContent = p.open_count; $('dd').textContent = p.drawdown_pct + '%'; $('dd').className = p.drawdown_pct > 0 ? 'neg' : '';
  $('srcNote').textContent = `Start ${money(d.balance_start)} · ${d.balance_source}`;
  const tv = p.source === 'tradovate';
  $('pnlStamp').hidden = !tv; $('ledgerDiff').hidden = !(tv && p.ledger_diff);
  if (tv) {
    $('pnlStamp').className = 'stamp' + (p.stale ? ' stale' : '');
    $('pnlStamp').textContent = `AS OF ${fmtTime(p.as_of)} · ${p.label.replace(/^from /, 'FROM ').toUpperCase()}${p.stale ? ' · OLDER THAN 1 DAY' : ''}`;
    $('ledgerDiff').textContent = `⚠ Ledger differs by ${money(Math.abs(p.ledger_diff))}: ledger P&L ${money(p.ledger_total, true)} vs Tradovate ${money(p.total, true)}. Showing Tradovate.`
      + (p.starting_balance_mismatch ? ` Start balance in tradovate.json (${money(p.starting_balance_file)}) ≠ my-rules.md.` : '');
  }
  syncBadge(d); marketWidget(d);
  $('updated').textContent = 'Real data updated ' + fmtTime(d.generated_at) + (d.asof ? ` · REPLAY as of ${fmtDay(d.asof)}` : '');
  $('limitBanner').hidden = !p.daily_limit_hit;
  $('limitBanner').textContent = `DAILY LIMIT HIT: today's paper loss reached ${money(p.daily_limit_usd)} (2%). Per my-rules.md no more cards until tomorrow.`;
  replayUI(d);
  spark(d.equity_curve); openTrades(d); positions(d); leads(d); trophies(d);
  const tier = d.tiers.find(t => t.level === lvl);
  $('tierName').textContent = `LV${lvl} ${tier.name.toUpperCase()}`;
  if (d.next_tier) {
    const prev = d.tier.min_pnl || 0, span = d.next_tier.min_pnl - prev, prog = Math.max(0, Math.min(1, (p.total - prev) / span));
    $('nextBar').style.width = (Math.floor(prog * 10) * 10) + '%';
    $('nextText').textContent = `${money(Math.max(0, d.next_tier.min_pnl - p.total))} more paper profit → ${d.next_tier.name} (${d.next_tier.unlocks})`;
  } else { $('nextBar').style.width = '100%'; $('nextText').textContent = 'MAX LEVEL! Sky Tower complete.'; }
  ladder(d, lvl);
  $('previewTag').hidden = !preview;
  if (preview) { $('previewTag').innerHTML = `PREVIEW: ${esc(tier.name)} · not the real level <button id="endPrev">BACK</button>`; $('endPrev').onclick = () => { preview = null; worldKey = ''; render(); }; }
  const hire = new Set(d.proposals.map(x => x.bot)), mp = marketPhase();
  $('hud').textContent = mp.label;
  worldState = {bots: Object.fromEntries(d.bots.map(b => [b.name, b])), gloom: !preview && (p.total < 0 || p.today < 0 || hire.size > 0),
    rain: !preview && p.total < 0, hire, ghost: !!d.tiers.find(t => t.level === lvl + 1), phase: mp.phase,
    streak: preview ? {} : (d.streak || {}), spot: new Set(d.lead_of_day ? d.lead_of_day.floors : []), risk: Math.min(100, (d.autopilot || {}).loss_used_pct || 0),
    season: currentSeason(), ...nightShift(), construct: constructing(d, lvl), cat: catBot(d), prices: d.prices, cash: !preview && p.total > 0};
  shiftMoves(worldState.away);
  world(d, lvl);
  if (lastTier != null && realTier > lastTier && !preview && !d.asof) celebrate(d.tier.name);
  lastTier = realTier; fire(d); chat(d);
  if (openBot) openModal(openBot, true);
}

function constructing(d, lvl) {
  if (Q.get('build') === '1') return true;
  if (preview || !d.next_tier || lvl !== d.tier.level) return false;
  const prev = d.tier.min_pnl || 0, span = d.next_tier.min_pnl - prev;
  return span > 0 && (d.pnl.total - prev) / span >= 0.75; // within 25% of the next floor
}
function catBot(d) { const lb = d.leaderboard || []; const top = lb.find(r => r.trades > 0); return top ? top.name : 'Chief'; }
function world(d, lvl) {
  const sky = $('sky'); scale = sky.clientWidth >= 600 ? 3 : 2;
  const ap = d.autopilot || {};
  const key = [lvl, sky.clientWidth, scale, mode, d.asof, [...worldState.hire].join(), JSON.stringify(ap), d.bots.map(b => b.mood + b.status + b.version + b.face + b.last_text).join(), JSON.stringify(d.ticker), JSON.stringify(d.lead_of_day), [...worldState.away].join(), worldState.season, worldState.construct, worldState.cat, JSON.stringify(d.prices), JSON.stringify(d.calendar && d.calendar.events), JSON.stringify(d.leaderboard), JSON.stringify(d.closed_trades.map(t => t.lead_id + t.pnl)), d.open_trades.length].join('|');
  if (key === worldKey) return; worldKey = key;
  const lay = PX.init($('world'), lvl, scale, {H: WORLD_H});
  ghostY = PX.frame(worldState);
  const S = scale, FH = PX.FH, byName = Object.fromEntries(d.bots.map(b => [b.name, b]));
  let h = ''; speechSpots = [];
  lay.floors.forEach(fl => {
    const top = (fl.y + 1) * S, height = (FH - 2) * S;
    const left = lay.compact ? (lay.rx + lay.rw - 47) * S : lay.labelX * S, width = lay.compact ? 46 * S : lay.LW * S;
    const cmp = lay.compact ? ' compact' : '';
    if (fl.bot) {
      const b = byName[fl.bot], warn = worldState.hire.has(fl.bot), v = b.version > 1 ? ` v${b.version}` : '';
      h += `<div class="tag${cmp} ${warn ? 'warn' : ''}" data-bot="${esc(fl.bot)}" title="Click for ${esc(fl.bot)}'s floor details" style="--c:${PX.COL[fl.bot]};left:${left}px;top:${top}px;width:${width}px;height:${height}px">
        <b>${esc(fl.bot.toUpperCase())}${v}${warn ? ' · FOR HIRE?' : ''}</b><span>${esc(fl.room.name)} · ${esc(b.role)}</span><em>${esc(b.status)}</em></div>`;
      h += `<div class="hot" data-bot="${esc(fl.bot)}" style="left:${lay.rx * S}px;top:${top}px;width:${(lay.compact ? lay.rw - 48 : lay.rw) * S}px;height:${height}px"></div>`;
      if (fl.bot === 'Charts') PX.chartScreens(lay.rx).forEach((sc, i) => {
        const it = d.prices && d.prices.ok && d.prices.items ? d.prices.items[i] : null, nm = i ? 'GOLD' : 'MNQ';
        const pc = it && it.change_pct != null ? (it.change_pct > 0 ? '+' : '') + it.change_pct.toFixed(2) + '%' : '';
        const px = it ? it.last.toLocaleString('en-US', {maximumFractionDigits: it.last >= 1000 ? 0 : 2}) : '';
        h += `<div class="cscr${cmp} ${it ? cls(it.change_pct) : 'nodata'}" data-scr="1" title="${it ? `${esc(it.name)} ${it.last} (${pc}) · 15-min closes · ${esc(d.prices.source)} · tap for details` : 'No price data: ' + esc(d.prices ? d.prices.message || '' : 'replay')}" style="left:${(sc.x + 1) * S}px;top:${(fl.y + 3) * S}px;width:${(sc.w - 2) * S}px;height:${(it ? 4 : 11) * S}px">`
          + (it ? `<b>${nm}</b>${lay.compact ? '' : ` <span>${px}</span>`} <em>${pc}</em>` : `<b>${nm}</b><i>NO DATA</i>`) + `</div>`; });
      if (b.last_text && !worldState.away.has(fl.bot)) speechSpots.push({bot: fl.bot, text: b.last_text, left: (lay.rx + 50) * S, top: (fl.y - 1) * S});
      if (warn) h += `<div class="forhire" style="left:${(lay.rx + 68) * S}px;top:${(fl.y + 3) * S}px">FOR HIRE?</div>`;
    } else if (fl.key === 'lobby') {
      const st = (ap.state || 'NOT SET'), stc = st === 'ON' ? 'on' : st === 'PAUSED' ? 'paused' : 'off';
      const lp = Math.min(100, ap.loss_used_pct || 0);
      h += `<div id="apboard" class="apboard${cmp}" title="Autopilot + rule board (parsed from my-rules.md). Tap for the full rule board." style="left:${(lay.rx + (lay.compact ? 30 : 38)) * S}px;top:${(fl.y + 2) * S}px;width:${(lay.rw - (lay.compact ? 52 : 76)) * S}px;height:${(FH - 5) * S}px">
</div>`;
      h += `<div id="visitors" class="visitors${cmp}" title="${PUBLIC ? 'Page-load count from a no-account, no-cookie public counter (abacus.jasoncameron.dev). No individual tracking.' : 'The visitor counter only runs on the public GitHub Pages copy.'}" style="left:${(lay.rx + 1) * S}px;top:${(fl.y + 1) * S}px;width:${(lay.compact ? 28 : 36) * S}px">${visitorText()}</div>`;
      if (!lay.compact) h += `<div class="tag amen" style="--c:#c8d0f0;left:${left}px;top:${top}px;width:${width}px;height:${height}px"><b>LOBBY</b><span>Ground floor · lift to every floor</span><em>Autopilot board is display-only</em></div>`;
    } else if (fl.key === 'mezz') {
      const half = Math.floor(lay.rw / 2);
      h += `<div class="tv${cmp}" id="tvBox" title="Lobby TV · read-only prices · tap for details" style="left:${(lay.rx + 3) * S}px;top:${(fl.y + 3) * S}px;width:${(half - 5) * S}px;height:${(FH - 6) * S}px">${tvHTML(d)}</div>`;
      h += `<div class="calb${cmp}" id="calBox" title="Economic calendar · tap for details" style="left:${(lay.rx + half + 2) * S}px;top:${(fl.y + 3) * S}px;width:${(lay.rw - half - 5) * S}px;height:${(FH - 6) * S}px">${calHTML(d, lay.compact ? 2 : 3)}</div>`;
      if (!lay.compact) h += `<div class="tag amen" style="--c:#c8d0f0;left:${left}px;top:${top}px;width:${width}px;height:${height}px"><b>LOBBY MEZZANINE</b><span>TV: MNQ + gold micro</span><em>Econ calendar board</em></div>`;
    } else if (fl.key === 'leader') {
      const lb = d.leaderboard || [];
      h += `<div class="lboard${cmp}" title="Ranked by net paper P&L of closed trades on leads each bot worked on" style="left:${(lay.rx + 4) * S}px;top:${(fl.y + 2) * S}px;width:${(lay.rw - 8) * S}px;height:${(FH - 6) * S}px">${lb.map((r, i) =>
        `<span style="--c:${PX.COL[r.name]}"><i>${i + 1}</i><b>${esc(r.name.toUpperCase())}</b><em class="${cls(r.net)}">${r.trades ? money(r.net, true) : '–'}</em></span>`).join('')}</div>`;
      if (!lay.compact) h += `<div class="tag amen" style="--c:#ffd23f;left:${left}px;top:${top}px;width:${width}px;height:${height}px"><b>LEADERBOARD</b><span>Net P&amp;L of leads worked</span><em>${lb.some(r => r.trades) ? 'Closed paper trades only' : 'No closed trades yet'}</em></div>`;
    } else if (!lay.compact) {
      const t = d.tiers.find(t => t.level === fl.room.unlock);
      h += `<div class="tag amen" style="--c:#c8d0f0;left:${left}px;top:${top}px;width:${width}px;height:${height}px"><b>${esc(fl.room.name)}</b><span>Unlocked at ${esc(t ? t.label : '')}</span><em>Bitizens relaxing</em></div>`;
    } else h += `<div class="tag compact amen" style="--c:#c8d0f0;left:${left}px;top:${top}px;width:${width}px;height:${height}px"><b>${esc(fl.room.name)}</b></div>`;
  });
  if (lvl >= 2) h += `<div class="bill ${lvl >= 5 ? 'neon' : ''}" style="left:${(lay.x0 + 35) * S}px;top:${(lay.roofY - PX.LED - 29) * S}px;width:${64 * S}px;height:${11 * S}px">${lvl >= 5 ? 'CHEN TOWER' : "CAM'S DESK"}</div>`;
  if (ghostY != null) { const nt = d.tiers.find(t => t.level === lvl + 1);
    h += `<div class="ghost" style="left:${lay.x0 * S}px;top:${ghostY * S}px;width:${PX.TW * S}px;height:${FH * S}px">NEXT: ${esc(nt.unlocks.split(' + ')[0].toUpperCase())} AT ${esc(nt.label.split(' ')[0])}</div>`; }
  h += timeline(d, lay, S);
  const tk = (d.ticker && d.ticker.length ? d.ticker : ['NO LEADS YET', 'DESK HQ', 'PAPER ONLY']).join('  ◆  ');
  h += `<div class="ledtick${lay.compact ? ' compact' : ''}" title="Latest leads and Skeptic verdicts" style="left:${lay.x0 * S}px;top:${(lay.roofY - PX.LED + 1) * S}px;width:${PX.TW * S}px;height:${(PX.LED - 2) * S}px"><span style="animation-duration:${Math.max(12, Math.round(tk.length * .22))}s;animation-delay:-${Math.max(12, Math.round(tk.length * .22)) * .3}s">${esc(tk)}</span></div>`;
  const rk = worldState.risk;
  h += `<div class="riskhot" title="RISK METER: today's loss is ${rk}% of the 2% daily limit (top of the lift shaft = limit hit)" style="left:${(lay.x0 + 3) * S}px;top:${lay.roofY * S}px;width:${3 * S}px;height:${(lay.groundY - lay.roofY) * S}px"></div>`;
  if (d.lead_of_day) { const L = d.lead_of_day, sp = lay.floors.filter(fl => fl.bot && worldState.spot.has(fl.bot) && !worldState.away.has(fl.bot));
    sp.forEach(fl => { h += `<div class="spotTag${lay.compact ? ' compact' : ''}" title="Lead of the day: #${esc(L.lead_id)} ${esc(L.ticker)} (${L.score}/6 steps)" style="left:${(lay.rx + 62) * S}px;top:${(fl.y + 1) * S}px">★ #${esc(L.lead_id)}</div>`; }); }
  h += `<div class="bubble" id="bubble"></div><div class="speech" id="speech" hidden></div><div class="tltip" id="tltip" hidden></div><div class="chatter" id="chatter" title="Decorative bot chatter (canned, not real messages)" hidden></div>`;
  $('overlay').innerHTML = h;
  $('sky').style.height = WORLD_H * S + 'px';
  $('overlay').querySelectorAll('[data-bot]').forEach(el => {
    el.onclick = () => openModal(el.dataset.bot);
    el.onmouseenter = () => { if (lay.compact) return; const b = byName[el.dataset.bot], bub = $('bubble');
      bub.innerHTML = `<b>${esc(b.name.toUpperCase())}</b> ${esc(b.role)}<br><i>${esc(b.status)}</i>${b.last_text ? `<br>“${esc(b.last_text)}”` : ''}<br><small>Click for details</small>`;
      bub.style.left = Math.max(4, parseInt(el.style.left) - 260) + 'px'; bub.style.top = Math.max(4, parseInt(el.style.top) - 20) + 'px'; bub.classList.add('on'); };
    el.onmouseleave = () => $('bubble').classList.remove('on');
  });
  $('overlay').querySelectorAll('[data-tl]').forEach(el => el.onclick = e => { e.stopPropagation(); const t = tlTrades[+el.dataset.tl], tip = $('tltip');
    if (!tip.hidden && tip.dataset.i === el.dataset.tl) { tip.hidden = true; return; }
    tip.dataset.i = el.dataset.tl;
    tip.innerHTML = `<b>#${esc(t.lead_id)} ${esc(t.ticker)}</b> ${esc(t.side || '')}<br>${esc(t.date)} · ${t.pnl == null ? 'OPEN' : `<span class="${cls(t.pnl)}">${money(t.pnl, true)}</span>`}<br>entry ${t.entry ?? '–'} · stop ${t.stop ?? '–'} · tgt ${t.target ?? '–'}${t.note ? `<br><i>${esc(String(t.note).slice(0, 80))}</i>` : ''}`;
    const x = parseInt(el.style.left); tip.style.left = Math.max(4, Math.min($('sky').clientWidth - 214, x - 100)) + 'px'; tip.style.bottom = (parseInt(el.dataset.b) + 18) + 'px'; tip.hidden = false; });
  speechI = speechI % Math.max(1, speechSpots.length); speak();
  if ($('apboard')) { apRender($('apboard')); $('apboard').onclick = openRules; }
  if ($('tvBox')) { $('tvBox').onclick = openTV; drawTV(d); }
  $('overlay').querySelectorAll('[data-scr]').forEach(el => el.onclick = e => { e.stopPropagation(); openTV(); });
  if ($('calBox')) $('calBox').onclick = openCal;
}

// ---------------- trade timeline along the street
let tlTrades = [];
function timeline(d, lay, S) {
  tlTrades = [...d.closed_trades, ...d.open_trades.map(t => ({...t, pnl: null}))].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-40);
  const top = (lay.groundY + 2) * S, h = 4 * S, b = (WORLD_H - lay.groundY - 2) * S - h, x0 = 64, x1 = Math.max(x0 + 40, $('sky').clientWidth - 14);
  let out = `<div class="tlbar" style="top:${top}px;height:${h}px"><span>TRADES</span>${tlTrades.length ? '' : '<em>NO PAPER TRADES YET</em>'}</div>`;
  tlTrades.forEach((t, i) => { const x = tlTrades.length === 1 ? x0 : Math.round(x0 + i * (x1 - x0) / (tlTrades.length - 1)), k = t.pnl == null ? 'open' : t.pnl > 0 ? 'win' : t.pnl < 0 ? 'loss' : 'flat';
    out += `<button class="tlm ${k}" data-tl="${i}" data-b="${b}" title="#${esc(t.lead_id)} ${esc(t.ticker)} · ${t.pnl == null ? 'open' : money(t.pnl, true)}" style="left:${x - 5}px;top:${top + (h - 10) / 2}px" aria-label="Trade ${esc(t.lead_id)}"></button>`; });
  return out;
}
document.addEventListener('click', () => { const t = $('tltip'); if (t) t.hidden = true; });

// ---------------- rotating speech bubbles (latest message per bot)
function speak() {
  const el = $('speech'); if (!el) return;
  if (!speechSpots.length || $('modal').hidden === false) { el.hidden = true; return; }
  const sp = speechSpots[speechI % speechSpots.length]; speechI++;
  const txt = sp.text.replace(/\s+/g, ' ').trim(), short = txt.length > 54 ? txt.slice(0, 52).trimEnd() + '…' : txt;
  el.style.setProperty('--c', PX.COL[sp.bot]); el.innerHTML = `<b>${esc(sp.bot.toUpperCase())}:</b> ${esc(short)}`;
  el.style.left = sp.left + 'px'; el.style.top = sp.top + 'px'; el.hidden = false;
}
setInterval(speak, 3500);

// ---------------- visitors counter (public GitHub Pages copy only; no cookies, no accounts, no per-person tracking)
const PUBLIC = STATIC && /\.github\.io$/.test(location.hostname);
const COUNTER = 'https://abacus.jasoncameron.dev/%s/camc59099-desk-tower/visits';
function visitorText() { return PUBLIC ? `VISITORS<br><b>${visitors == null ? '…' : Number(visitors).toLocaleString('en-US')}</b>` : 'VISITORS<br><small>PUBLIC PAGE ONLY</small>'; }
async function countVisit() {
  if (!PUBLIC) return;
  let op = 'get'; try { if (!sessionStorage.getItem('hq_counted')) { op = 'hit'; sessionStorage.setItem('hq_counted', '1'); } } catch (e) { op = 'get'; }
  try { const r = await fetch(COUNTER.replace('%s', op), {credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'});
    const j = await r.json(); visitors = typeof j.value === 'number' && j.value >= 0 ? j.value : null; }
  catch (e) { visitors = null; }
  const el = $('visitors'); if (el) el.innerHTML = visitors == null ? 'VISITORS<br><small>COUNTER OFFLINE</small>' : visitorText();
}
countVisit();

// ---------------- live sync badge
function nyOpen() { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false})
  .formatToParts(new Date()).map(x => [x.type, x.value])); const h = (+p.hour % 24) + (+p.minute) / 60; return !['Sat', 'Sun'].includes(p.weekday) && h >= 9.5 && h < 16; }
function ago(ms) { const m = Math.max(0, Math.round(ms / 6e4)); return m < 60 ? m + 'M' : m < 2880 ? Math.round(m / 60) + 'H' : Math.round(m / 1440) + 'D'; }
function syncBadge(d) {
  const el = $('syncBadge'), p = d.pnl, sy = d.sync;
  if (d.asof) { el.hidden = true; return; }
  el.hidden = false; let c = 'off', t, tip;
  if (sy && sy.ok === false) { c = 'bad'; t = 'SYNC FAILED' + (sy.at ? ' · ' + fmtTime(sy.at).toUpperCase() : ''); tip = sy.message || 'data/sync_status.json says the last sync failed'; }
  else if (p.source === 'tradovate') { const age = Date.now() - Date.parse(p.as_of), open = nyOpen();
    c = isNaN(age) ? 'warn' : open && age > 45 * 6e4 ? 'warn' : 'ok';
    t = `SYNC ${isNaN(age) ? '?' : ago(age) + ' AGO'}${c === 'warn' ? ' · STALE' : ''}`;
    tip = `tradovate.json as_of ${p.as_of}. Amber when older than 45 min during US market hours (9:30-16:00 ET weekdays).${sy && sy.ok ? ' Last sync OK ' + fmtTime(sy.at) + '.' : ''}`; }
  else { t = 'NO BROKER SYNC · LEDGER ONLY'; tip = 'No data/tradovate.json, so P&L comes from paper-ledger.csv.'; }
  el.className = 'sync ' + c; el.textContent = t; el.title = tip;
}

// ---------------- market weather (Nasdaq-100 daily move, fetched by build_data.py)
function marketWidget(d) {
  const m = d.market, el = $('weather');
  if (!m || d.asof) { el.hidden = true; return; }
  el.hidden = false;
  if (!m.ok) { el.innerHTML = `<canvas class="px" id="wxIcon"></canvas><div><b>NDX WEATHER</b><span>${esc(m.message || 'Market data unavailable')}</span></div>`; wxIcon('unknown'); el.title = m.source || ''; return; }
  const c = m.change_pct, kind = c >= 0.5 ? 'sun' : c >= 0 ? 'part' : c > -0.5 ? 'cloud' : c > -1.5 ? 'rain' : 'storm';
  const mt = new Date(m.market_time), when = isNaN(mt) ? '' : mt.toLocaleString('en-US', {timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit'}) + ' ET';
  el.innerHTML = `<canvas class="px" id="wxIcon"></canvas><div><b>NDX <span class="${cls(c)}">${c > 0 ? '+' : ''}${c.toFixed(2)}%</span></b><span>as of ${esc(when)}${m.stale_fetch ? ' · refresh failed' : ''}</span><span>Yahoo Finance · fetched ${esc(fmtTime(m.fetched_at))}</span></div>`;
  el.title = `Nasdaq-100 ${m.last} vs prev close ${m.prev_close}. Source: ${m.source}. Fetched by build_data.py, cached 15 min.`;
  wxIcon(kind);
}
function wxIcon(kind) {
  const c = $('wxIcon'); c.width = 16; c.height = 12; const x = c.getContext('2d'), R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  const sun = (ox, oy) => { R(ox + 1, oy, 4, 6, '#ffe066'); R(ox, oy + 1, 6, 4, '#ffe066'); R(ox + 2, oy + 1, 1, 1, '#fff6bf'); };
  const cloud = (ox, oy, col) => { R(ox + 2, oy, 5, 2, col); R(ox, oy + 2, 11, 3, col); R(ox + 7, oy + 1, 3, 1, col); };
  if (kind === 'sun') { sun(5, 3); R(8, 0, 1, 2, '#ffe066'); R(8, 10, 1, 2, '#ffe066'); R(2, 6, 2, 1, '#ffe066'); R(13, 6, 2, 1, '#ffe066'); }
  else if (kind === 'part') { sun(8, 1); cloud(1, 5, '#f4f6ff'); }
  else if (kind === 'cloud') cloud(2, 3, '#c3c9dc');
  else if (kind === 'rain') { cloud(2, 1, '#8a93ad'); [3, 7, 11].forEach(i => R(i, 8, 1, 2, '#5ab0ff')); }
  else if (kind === 'storm') { cloud(2, 1, '#5d6580'); R(7, 6, 2, 2, '#ffd23f'); R(6, 8, 2, 2, '#ffd23f'); R(5, 10, 2, 1, '#ffd23f'); R(3, 7, 1, 2, '#5ab0ff'); R(12, 7, 1, 2, '#5ab0ff'); }
  else { cloud(2, 3, '#555c74'); R(7, 4, 2, 1, '#fff'); }
}
setInterval(() => { if (worldState && worldKey) PX.frame(worldState); }, TICK_MS);
setInterval(() => { if (data) { const mp = marketPhase(); $('hud').textContent = mp.label; if (worldState) { worldState.phase = mp.phase; Object.assign(worldState, nightShift()); shiftMoves(worldState.away); } syncBadge(data); } }, 30000);

// ---------------- night shift: after the US close bots leave one by one and floors dim; back at pre-market
const SHIFT_ORDER = ['Scout', 'News', 'Sentiment', 'Charts', 'Skeptic', 'Chief']; // first out ... last out (Chief locks up)
function nightShift() {
  const away = new Set(), dim = new Set(), amen = ['leader', 'cafe', 'gym', 'arcade', 'trophy'];
  const ov = skyOverride;
  if (ov === 'day' || ov === 'dawn') return {away, dim};
  if (ov === 'dusk' || ov === 'night') { SHIFT_ORDER.forEach(b => { away.add(b); dim.add(b); }); if (ov === 'night') amen.forEach(a => dim.add(a)); return {away, dim}; }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false})
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  const m = (+p.hour % 24) * 60 + (+p.minute), wd = p.weekday;
  const weekend = wd === 'Sat' || wd === 'Sun' || (wd === 'Fri' && m >= 16 * 60) || (wd === 'Mon' && m < 4 * 60);
  SHIFT_ORDER.forEach((b, i) => {
    const out = weekend || m >= 16 * 60 + 8 * i || m < 4 * 60 + 5 * i;
    if (out) away.add(b);
    if (weekend || m >= 16 * 60 + 8 * i + 3 || m < 4 * 60 + 5 * i) dim.add(b);
  });
  if (weekend || m >= 17 * 60 || m < 4 * 60) amen.forEach(a => dim.add(a));
  return {away, dim};
}
function shiftMoves(away) {
  if (prevAway) { away.forEach(b => { if (!prevAway.has(b)) { PX.walk(b, true); } }); prevAway.forEach(b => { if (!away.has(b)) PX.walk(b, false); }); }
  prevAway = new Set(away);
}

// ---------------- seasonal themes (by the viewer's date), toggle remembered
function currentSeason() {
  const q = Q.get('season'); if (q) return q === 'off' ? null : q;
  if (localStorage.getItem('hq_season') === 'off') return null;
  return seasonFor(new Date());
}
function seasonFor(dt) { const mo = dt.getMonth() + 1, da = dt.getDate();
  if (mo === 10 && da >= 17) return 'halloween';
  if (mo === 12 && da <= 26) return 'christmas';
  if ((mo === 12 && da >= 30) || (mo === 1 && da <= 2)) return 'newyear';
  if (mo === 2 && da >= 12 && da <= 14) return 'valentine';
  return null; }
const SEASON_NAME = {halloween: 'HALLOWEEN', christmas: 'CHRISTMAS', newyear: 'NEW YEAR', valentine: 'VALENTINE'};
function themeBtn() { const t = $('theme'), today = Q.get('season') || seasonFor(new Date()), on = !!currentSeason();
  t.hidden = !today || today === 'off'; t.textContent = on ? `★ ${SEASON_NAME[today] || today.toUpperCase()}` : '★ THEME OFF'; t.classList.toggle('on', on); }
$('theme').onclick = () => { localStorage.setItem('hq_season', localStorage.getItem('hq_season') === 'off' ? 'on' : 'off'); themeBtn(); worldKey = ''; data && render(); };
themeBtn();

// ---------------- dark mode (softer palette), remembered
function applyDark(on) { document.body.classList.toggle('dark', on); $('dark').textContent = on ? '☾ DARK' : '☀ LIGHT'; $('dark').classList.toggle('on', on); }
$('dark').onclick = () => { const on = !document.body.classList.contains('dark'); localStorage.setItem('hq_dark', on ? '1' : '0'); applyDark(on); };
applyDark(Q.get('dark') ? Q.get('dark') === '1' : localStorage.getItem('hq_dark') === '1');

// ---------------- share card: PNG rendered in the browser, downloaded locally, never uploaded
async function shareCard() {
  if (!data) return; try { await document.fonts.ready; } catch (e) {}
  const wc = $('world'), k = 2, pad = 16, head = 132, foot = 40, d = data, p = d.pnl;
  const c = document.createElement('canvas'); c.width = wc.width * k + pad * 2; c.height = wc.height * k + head + foot; const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#10132a'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#05060f'; x.fillRect(pad - 4, head - 4, wc.width * k + 8, wc.height * k + 8);
  x.drawImage(wc, pad, head, wc.width * k, wc.height * k);
  const lay = PX.layout(); if (lay && d.tier.level >= 2 && !preview) { const bx = pad + (lay.x0 + 35) * k, by = head + (lay.roofY - PX.LED - 29) * k;
    x.font = '9px "Press Start 2P"'; x.fillStyle = '#1a1020'; x.textAlign = 'center'; x.fillText(d.tier.level >= 5 ? 'CHEN TOWER' : "CAM'S DESK", bx + 64, by + 15); x.textAlign = 'left'; }
  const T = (txt, X, Y, size, col, font = '"Press Start 2P"') => { x.font = `${size}px ${font}`; x.fillStyle = col; x.fillText(txt, X, Y); };
  T("CAM'S DESK HQ", pad, 30, 16, '#ffd23f'); T(`LV${d.tier.level} ${d.tier.name.toUpperCase()}`, pad, 52, 10, '#c8d0f0');
  const col = v => v > 0 ? '#4cff8f' : v < 0 ? '#ff4d5e' : '#f1f3ff';
  T('EQUITY', pad, 78, 8, '#9aa5d6'); T(money(p.equity), pad, 98, 14, '#ffffff');
  const cx = Math.max(pad + 200, c.width / 2);
  T('TODAY', cx, 78, 8, '#9aa5d6'); T(money(p.today, true), cx, 98, 12, col(p.today));
  T('TOTAL', cx + 130 < c.width - 90 ? cx + 130 : cx, cx + 130 < c.width - 90 ? 78 : 118, 8, '#9aa5d6');
  if (cx + 130 < c.width - 90) T(money(p.total, true), cx + 130, 98, 12, col(p.total)); else T(money(p.total, true), cx + 60, 118, 10, col(p.total));
  T('PAPER ONLY · ' + new Date().toLocaleDateString('en-AU', {timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric'}), pad, c.height - 16, 8, '#4cff8f');
  T('read-only desk visualisation · not advice', pad, c.height - 4, 13, '#6b7398', 'VT323');
  return c;
}
$('share').onclick = async () => { const c = await shareCard(); if (!c) return; openBot = null;
  const url = c.toDataURL('image/png'), name = `desk-tower-${new Date().toISOString().slice(0, 10)}.png`;
  $('modalBody').innerHTML = `<div class="eyebrow">SHARE CARD</div><p class="srcNote">Made in your browser. Nothing is uploaded; download it and share it yourself.</p>
    <img class="sharePrev px" src="${url}" alt="Share card preview"><div class="shareBtns"><a class="btnpx" href="${url}" download="${name}">⬇ DOWNLOAD PNG</a></div>`;
  $('modal').hidden = false; };

// ---------------- lobby TV (read-only prices fetched by build_data.py)
function tvHTML(d) {
  const p = d.prices;
  if (!p) return '<div class="tvmsg">NO SIGNAL (replay)</div>';
  if (!p.ok) return `<div class="tvmsg">PRICES UNAVAILABLE</div><small>${esc(p.message || '')}</small>`;
  return p.items.map((it, i) => `<div class="tvrow"><b>${esc(it.symbol)}</b><canvas class="px" data-tv="${i}"></canvas><span>${it.last.toLocaleString('en-US', {maximumFractionDigits: it.last >= 1000 ? 0 : 2})}</span><em class="${cls(it.change_pct)}">${it.change_pct == null ? '' : (it.change_pct > 0 ? '+' : '') + it.change_pct.toFixed(2) + '%'}</em></div>`).join('');
}
function drawTV(d) {
  if (!d.prices || !d.prices.ok) return;
  document.querySelectorAll('canvas[data-tv]').forEach(c => { const it = d.prices.items[+c.dataset.tv], pts = it.points || []; c.width = 40; c.height = 10;
    const x = c.getContext('2d'); if (pts.length < 2) return; const mn = Math.min(...pts), mx = Math.max(...pts), rg = (mx - mn) || 1;
    x.fillStyle = (it.change_pct || 0) >= 0 ? '#4cff8f' : '#ff4d5e';
    pts.forEach((v, i) => { const px = Math.round(i * 39 / (pts.length - 1)), py = Math.round(9 - (v - mn) / rg * 9); x.fillRect(px, py, 1, 1); }); });
}
function calHTML(d, n) {
  const c = d.calendar;
  if (!c) return '<div class="calmsg">CALENDAR: N/A IN REPLAY</div>';
  if (!c.events.length) return '<div class="calmsg">CALENDAR UNAVAILABLE</div>';
  return c.events.slice(0, n).map(e => `<div class="calrow"><b>${esc(fmtShort(e.date))}</b> ${esc(e.name)}</div>`).join('') + (c.sources.some(s => !s.ok) ? '<i title="Some sources unavailable">!</i>' : '');
}
const fmtShort = ds => { const d = new Date(ds + 'T12:00:00Z'); return isNaN(d) ? ds : d.toLocaleDateString('en-US', {timeZone: 'UTC', month: 'short', day: 'numeric'}).toUpperCase(); };
function openTV() { const p = data && data.prices; if (!p) return; openBot = null;
  $('modalBody').innerHTML = `<div class="eyebrow">LOBBY TV · READ-ONLY PRICES</div>${p.ok ? `<table><tr><th>SYMBOL</th><th>LAST</th><th>CHG</th><th>AS OF (ET)</th></tr>${p.items.map(it => `<tr><td><b>${esc(it.symbol)}</b> <small>${esc(it.name)}</small></td><td>${it.last}</td><td class="${cls(it.change_pct)}">${it.change_pct == null ? '–' : it.change_pct.toFixed(2) + '%'}</td><td>${esc(new Date(it.market_time).toLocaleString('en-US', {timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit'}))}</td></tr>`).join('')}</table>
    <p class="srcNote">Source: ${esc(p.source)}. Fetched by build_data.py ${esc(fmtTime(p.fetched_at))}${p.stale_fetch ? ' · latest refresh failed, showing last good fetch' : ''}. Change is vs the previous settlement. Display only, no trading.</p>` : `<div class="empty">${esc(p.message)}</div><p class="srcNote">Source: ${esc(p.source)}</p>`}`;
  $('modal').hidden = false; }
function openCal() { const c = data && data.calendar; if (!c) return; openBot = null;
  $('modalBody').innerHTML = `<div class="eyebrow">ECONOMIC CALENDAR</div>${c.events.length ? `<table><tr><th>DATE (US)</th><th>EVENT</th><th>SOURCE</th></tr>${c.events.map(e => `<tr><td>${esc(fmtShort(e.date))}</td><td>${esc(e.name)} <small>${esc(e.detail || '')}</small></td><td>${esc(e.source)}</td></tr>`).join('')}</table>` : '<div class="empty">No upcoming events available.</div>'}
    ${c.sources.map(s => `<div class="srcNote">${s.ok ? '✓' : '✗'} ${esc(s.name)}: ${esc(s.source)} · ${s.ok ? 'fetched ' + esc(fmtTime(s.fetched_at)) : '<b class="neg">unavailable</b> (' + esc(s.error || 'no data') + ')'}</div>`).join('')}
    <p class="fine">Dates fetched at build time from official sources; nothing is guessed. FOMC date = decision day.</p>`;
  $('modal').hidden = false; }

// ---------------- rule board (parsed limits only)
function openRules() {
  const r = data && data.rules; if (!r) return; openBot = null;
  const v = (x, suf) => x == null ? '<i class="neg">not found</i>' : x + suf;
  $('modalBody').innerHTML = `<div class="eyebrow">RULE BOARD</div>
    <div class="rulegrid"><div><label>MAX LOSS</label><b>${v(r.max_loss_pct, '%')}</b><small>per trade</small></div><div><label>DAILY LIMIT</label><b>${v(r.daily_limit_pct, '%')}</b><small>then no cards</small></div>
    <div><label>CARDS</label><b>${v(r.cards_per_day, '')}</b><small>per day max</small></div><div><label>MAX SIZE</label><b>${v(r.max_size_pct, '%')}</b><small>per trade</small></div></div>
    <div class="eyebrow msec">AUTOPILOT <span class="${r.autopilot === 'ON' ? 'pos' : 'neg'}">${esc(r.autopilot)}</span></div>
    ${r.autopilot_conditions.length ? `<div class="srcNote">Only when all are true:</div><ul class="conds">${r.autopilot_conditions.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<div class="srcNote">No conditions found.</div>'}
    <p class="fine">Summary ${esc(r.source)}. The site shows parsed values only and never edits the rules.</p>`;
  $('modal').hidden = false; $('modalClose').focus();
}
setInterval(() => { const b = $('apboard'); if (!b || !data) return; apPage = (apPage + 1) % 3; apRender(b); }, 5000);
function apRender(b) {
  const ap = data.autopilot || {}, r = data.rules || {}, lp = Math.min(100, ap.loss_used_pct || 0), st = (ap.state || 'NOT SET'), stc = st === 'ON' ? 'on' : st === 'PAUSED' ? 'paused' : 'off';
  const n = (x, s) => x == null ? '?' : x + s;
  b.innerHTML = apPage === 0 ? `<div><b class="${stc}">AUTOPILOT ${esc(st)}</b><span title="autopilot trades today">${ap.used_today ?? 0}/${ap.max_today ?? 5}</span></div>
      <div class="lossbar" title="Today's loss vs the 2% daily limit"><i style="width:${Math.round(lp / 10) * 10}%"></i></div><small>2% LOSS LIMIT: ${lp}% USED</small>`
    : apPage === 1 ? `<div><b>RULES</b><span>tap</span></div><div class="rl">MAX LOSS ${n(r.max_loss_pct, '%')} · DAILY ${n(r.daily_limit_pct, '%')}</div><small>CARDS ${n(r.cards_per_day, '/DAY')} · SIZE ${n(r.max_size_pct, '%')}</small>`
    : `<div><b class="${stc}">AUTO IF</b><span>${(r.autopilot_conditions || []).length} RULES</span></div><div class="rl">${esc((r.autopilot_conditions || [])[0] || 'no conditions parsed')}</div><small>${esc((r.autopilot_conditions || []).slice(1, 3).join(' · '))}</small>`;
}

// ---------------- history replay
function replayUI(d) {
  const days = liveDays.length ? liveDays : (d.days || []), r = $('replay');
  r.max = Math.max(0, days.length - 1);
  if (document.activeElement !== r) r.value = replayAsof ? Math.max(0, days.indexOf(replayAsof)) : r.max;
  r.disabled = days.length < 2;
  $('replayLabel').textContent = replayAsof ? fmtDay(replayAsof).toUpperCase() : (days.length < 2 ? 'LIVE · 1 DAY OF HISTORY' : 'LIVE');
  $('replayBanner').hidden = !replayAsof;
  $('replayBanner').innerHTML = replayAsof ? `⏪ REPLAY: tower as of end of ${esc(fmtDay(replayAsof))} (Sydney) · <button id="goLive">BACK TO LIVE</button>` : '';
  if (replayAsof) $('goLive').onclick = () => { replayAsof = null; worldKey = ''; poll(); };
}
$('replay').addEventListener('input', () => { const days = liveDays.length ? liveDays : (data?.days || []), i = +$('replay').value;
  $('replayLabel').textContent = i >= days.length - 1 ? 'LIVE' : fmtDay(days[i]).toUpperCase(); });
$('replay').addEventListener('change', () => { const days = liveDays.length ? liveDays : (data?.days || []), i = +$('replay').value;
  replayAsof = i >= days.length - 1 ? null : days[i]; worldKey = ''; poll(); });

function ladder(d, lvl) {
  $('ladder').innerHTML = d.tiers.map(t => `<button class="${t.level <= d.tier.level ? 'reached' : ''} ${t.level === lvl ? 'current' : ''}" data-l="${t.level}" title="${esc(t.unlocks)} · click to preview">
      <canvas class="px" data-icon="${t.level}"></canvas><span>LV${t.level}<br>${esc(t.name.toUpperCase())}<small>${esc(t.label)}</small></span></button>`).join('');
  $('ladder').querySelectorAll('canvas[data-icon]').forEach(c => PX.icon(c, +c.dataset.icon));
  $('ladder').querySelectorAll('button').forEach(b => b.onclick = () => { const l = +b.dataset.l; preview = l === d.tier.level ? null : l; worldKey = ''; render(); });
}

function spark(curve) {
  const c = $('spark'), w = Math.max(60, Math.floor(c.parentElement.clientWidth / 3)), h = 32;
  c.width = w; c.height = h; c.style.height = h * 3 + 'px'; const x = c.getContext('2d');
  const R = (a, b, cw, ch, col) => { x.fillStyle = col; x.fillRect(a, b, cw, ch); };
  for (let gx = 0; gx < w; gx += 8) for (let gy = 0; gy < h; gy += 8) R(gx, gy, 1, 1, '#2a3266');
  const has = curve && curve.length >= 2; $('sparkEmpty').style.display = has ? 'none' : 'grid';
  if (!has) { R(0, 16, w, 1, '#3d4a86'); return; }
  const ys = curve.map(q => q.equity), mn = Math.min(...ys), mx = Math.max(...ys), rg = (mx - mn) || 1;
  const col = ys[ys.length - 1] >= ys[0] ? '#4cff8f' : '#ff4d5e', fill = ys[ys.length - 1] >= ys[0] ? '#1d6b40' : '#6b1f2b';
  const P = ys.map((v, i) => [Math.round(i * (w - 3) / (ys.length - 1)), Math.round(28 - (v - mn) / rg * 24)]);
  for (let i = 0; i < P.length - 1; i++) { const [x1, y1] = P[i], [x2, y2] = P[i + 1];
    for (let xx = x1; xx < x2; xx++) for (let yy = y1 + 2; yy < h; yy++) if ((xx + yy) % 2 === 0) R(xx, yy, 1, 1, fill);
    R(x1, y1, x2 - x1 + 1, 2, col); R(x2, Math.min(y1, y2), 2, Math.abs(y2 - y1) + 2, col); }
  const [lx, ly] = P[P.length - 1]; R(lx - 1, ly - 1, 3, 4, '#fff');
}

function openTrades(d) {
  const ot = d.open_trades, ct = d.closed_trades;
  if (!ot.length && !ct.length) {
    $('openTrades').innerHTML = `<div class="empty">No paper trades yet. When Cam replies <b>PAPER BUY #id</b>, Chief logs it in <code>desk/paper-ledger.csv</code> and it shows up here. The first new floor unlocks at +$500 paper profit.</div>`; return; }
  const row = t => `<tr><td class="lid">#${esc(t.lead_id)}</td><td>${esc(t.ticker)}</td><td>${esc(t.side)}</td><td>${t.entry ?? '–'}</td><td>${t.stop ?? '–'}</td><td>${t.target ?? '–'}</td><td class="${cls(t.pnl)}">${t.pnl == null ? esc(t.status || 'open') : money(t.pnl, true)}</td></tr>`;
  $('openTrades').innerHTML = `<div class="tscroll"><table><tr><th>LEAD</th><th>TICKER</th><th>SIDE</th><th>ENTRY</th><th>STOP</th><th>TGT</th><th>P&amp;L</th></tr>${ot.map(row).join('')}${ct.slice(-5).reverse().map(row).join('')}</table></div>`;
}

// ---------------- positions (ledger + optional last-price hook)
function positions(d) {
  const hk = d.positions_hook || {};
  const tvp = d.pnl.source === 'tradovate';
  $('posSrc').innerHTML = tvp ? `Read-only snapshot from <code>data/tradovate.json</code> (Tradovate Simulation, read from screen). Ledger keeps the trade history.`
    : `Read-only, from <code>paper-ledger.csv</code>. The site can't read Tradovate.`;
  $('hookNote').innerHTML = tvp ? `As of ${esc(fmtTime(hk.updated))}${d.pnl.stale ? ' · <b class="neg">older than 1 day</b>' : ''}` : hk.present ? `Last prices from <code>data/positions.json</code>${hk.updated ? ' · updated ' + esc(fmtTime(hk.updated)) : ''}`
    : `No last price yet. Chief can write <code>data/positions.json</code> later; the site only reads it.`;
  const ps = d.positions || [];
  if (!ps.length) { $('positions').innerHTML = `<div class="empty">${tvp ? 'No open positions in the Tradovate snapshot.' : 'No open demo positions in the ledger.'}</div>`; return; }
  $('positions').innerHTML = ps.map(p => {
    const ok = p.stop != null && p.target != null && p.entry != null && p.target !== p.stop;
    const at = v => Math.max(0, Math.min(100, 100 * (v - p.stop) / (p.target - p.stop)));
    const e = ok ? at(p.entry) : 50, l = ok && p.last != null ? at(p.last) : null;
    return `<div class="posi">
      <div class="posH">${p.lead_id ? `<span class="lid">#${esc(p.lead_id)}</span>` : ''} <b>${esc(p.ticker)}</b> <span class="k">${esc(p.side || '?')}</span> <span>size ${p.size ?? '–'}</span>
        ${p.last != null ? `<span>last ${p.last}</span>` : ''}${p.unrealized != null ? `<span class="${cls(p.unrealized)}">open ${money(p.unrealized, true)}</span>` : ''}</div>
      ${ok ? `<div class="pbar"><i class="red" style="width:${e}%"></i><i class="grn" style="left:${e}%;width:${100 - e}%"></i>
        <b class="mk entry" style="left:${e}%" title="entry ${p.entry}"></b>${l != null ? `<b class="mk last" style="left:${l}%" title="last ${p.last}"></b>` : ''}</div>
      <div class="pscale"><span class="neg">STOP ${p.stop}</span><span>ENTRY ${p.entry}${l != null ? ' · ▲ LAST ' + p.last : ''}</span><span class="pos">TGT ${p.target}</span></div>`
      : `<div class="srcNote">Needs entry, stop and target in the ledger to draw the bar.</div>`}</div>`; }).join('');
}

// ---------------- lead tracker
function leads(d) {
  const L = d.leads || [];
  if (!L.length) { $('leads').innerHTML = `<div class="empty">No lead IDs in the feed yet. Each strip fills in as Scout, News, Sentiment and Charts report and Skeptic gives a verdict.</div>`; return; }
  const who = ['Scout', 'News', 'Sentiment', 'Charts'];
  $('leads').innerHTML = L.map(l => {
    const v = l.verdict, vc = v === 'APPROVE' ? 'ok' : v === 'REDUCE' ? 'mid' : v ? 'bad' : 'wait';
    const tr = l.trade ? (l.trade.status === 'open' ? '<span class="k">OPEN</span>' : `<span class="${cls(l.trade.pnl)}">${money(l.trade.pnl, true)}</span>`) : '';
    const lotd = d.lead_of_day && d.lead_of_day.lead_id === l.lead_id;
    return `<div class="leadrow ${l.complete ? 'done' : ''} ${lotd ? 'lotd' : ''}" ${lotd ? 'title="Lead of the day: furthest along in the tracker"' : ''}><span class="lid">#${esc(l.lead_id)}</span><span class="ltk" title="${esc(l.ticker)}">${esc(l.ticker || '–')}</span>
      <span class="lights">${who.map(b => `<i class="lt ${l.reports[b] ? 'on' : ''}" style="--c:${PX.COL[b]}" title="${b}: ${l.reports[b] ? 'reported ' + esc(fmtTime(l.reports[b])) : 'waiting'}"></i>`).join('')}</span>
      <span class="vbadge ${vc}" title="${esc(l.verdict_text || 'waiting for Skeptic')}">${esc(v || '...')}</span>${tr}${l.complete ? '<span class="star">★</span>' : ''}</div>`; }).join('');
}

// ---------------- achievements
const BADGE = {
  doors: ['..####..', '.#....#.', '.#....#.', '.#...##.', '.#....#.', '.#....#.', '.#....#.', '########'],
  lead1: ['..###...', '.#...#..', '#.....#.', '#.....#.', '.#...#..', '..####..', '.....##.', '......##'],
  full: ['...##...', '...##...', '########', '.######.', '..####..', '.######.', '.##..##.', '##....##'],
  gate: ['########', '#......#', '#..##..#', '#.####.#', '#..##..#', '.#....#.', '..#..#..', '...##...'],
  trade1: ['..####..', '.#....#.', '#..##..#', '#.#....#', '#.#....#', '#..##..#', '.#....#.', '..####..'],
  win1: ['...##...', '..####..', '.######.', '########', '...##...', '...##...', '...##...', '...##...'],
  streak5: ['...#....', '..##..#.', '..###.#.', '.######.', '.######.', '########', '.######.', '..####..'],
  perfect: ['#..##..#', '.#....#.', '..####..', '#.####.#', '#.####.#', '..####..', '.#....#.', '#..##..#'],
  floor1: ['...##...', '..####..', '.######.', '.#.##.#.', '.######.', '.#.##.#.', '.######.', '.##..##.'],
  sky: ['...##...', '..#..#..', '..#..#..', '..####..', '.##..##.', '.#....#.', '##.##.##', '#..##..#'],
  leads10: ['########', '#......#', '########', '#......#', '########', '#......#', '########', '........'],
  comeback: ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........'],
  discipline: ['..####..', '.#....#.', '.#....#.', '########', '###..###', '###..###', '########', '########'],
};
const BCOL = {doors: '#c8d0f0', lead1: '#5ab0ff', full: '#ffd23f', gate: '#ff8a3d', trade1: '#ffd23f', win1: '#4cff8f', streak5: '#ff5d3d', perfect: '#ffe066',
  floor1: '#b77dff', sky: '#ff7ac0', leads10: '#7fd3ff', comeback: '#ff4d5e', discipline: '#4cd98a'};
function badgeURL(id, got) {
  const c = document.createElement('canvas'); c.width = 12; c.height = 12; const x = c.getContext('2d');
  x.fillStyle = got ? '#2a1d00' : '#151a33'; x.fillRect(0, 0, 12, 12); x.fillStyle = got ? '#c99a00' : '#2a3266'; x.fillRect(0, 0, 12, 1); x.fillRect(0, 11, 12, 1); x.fillRect(0, 0, 1, 12); x.fillRect(11, 0, 1, 12);
  (BADGE[id] || BADGE.full).forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { x.fillStyle = got ? BCOL[id] || '#ffd23f' : '#3a4270'; x.fillRect(2 + i, 2 + j, 1, 1); } }));
  return c.toDataURL();
}
function trophies(d) {
  const A = d.achievements || [], got = A.filter(a => a.got).length;
  $('trophyCount').textContent = `${got}/${A.length}`;
  $('trophies').innerHTML = A.map(a => `<div class="badge2 ${a.got ? 'got' : ''}" title="${esc(a.desc)}"><img class="px" src="${badgeURL(a.id, a.got)}" alt=""><b>${esc(a.got ? a.name : '???')}</b><small>${esc(a.desc)}</small></div>`).join('');
}

// ---------------- floor modal
function openModal(name, refresh) {
  const b = data && data.bots.find(x => x.name === name); if (!b) return;
  openBot = name; const room = PX.ROOM[name], st = b.stats, prop = data.proposals.find(p => p.bot === name);
  const leadMap = Object.fromEntries((data.leads || []).map(l => [l.lead_id, l]));
  const latest = b.reports && b.reports[0];
  $('modalBody').innerHTML = `
    <div class="idcard" style="--c:${PX.COL[name]}"><div class="idtop"><span>DESK HQ · STAFF ID</span><span>No. ${String(PX.BOT_ORDER.indexOf(name) + 1).padStart(3, '0')}</span></div>
      <div class="idbody"><img class="mAv px" src="${avatar(name)}" alt=""><dl>
        <dt>NAME</dt><dd><b>${esc(name.toUpperCase())}</b> <span class="ver">v${b.version || 1}</span></dd>
        <dt>JOB</dt><dd>${esc(b.role)}</dd><dt>FLOOR</dt><dd>${esc(room.name)}</dd>
        <dt>HIRED</dt><dd>${b.hired ? esc(fmtDate(b.hired)) + ` <small>(${esc(b.hired_src)})</small>` : '–'}</dd>
        <dt>BEST CALL</dt><dd>${b.best_call ? `#${esc(b.best_call.lead_id)} ${esc(b.best_call.ticker)} <span class="pos">${money(b.best_call.pnl, true)}</span>` : '<small>no winning trade yet</small>'}</dd>
        <dt>MOOD</dt><dd>${esc((b.face || 'neutral').toUpperCase())}${b.recent && b.recent.trades ? ` <small>(${b.recent.winrate}% of last ${b.recent.trades})</small>` : ''}</dd></dl></div>
      <div class="wkspark"><span>WEEKLY WIN%</span>${b.weekly && b.weekly.some(w => w.n) ? `<img class="px" src="${weekSpark(b.weekly)}" alt="weekly win rate" title="${esc(b.weekly.map(w => w.week + ': ' + (w.n ? w.winrate + '% of ' + w.n : 'no trades')).join(' · '))}">` : '<small>no closed trades in the last 8 weeks</small>'}</div>
      <div class="idbar"></div></div>
    <div class="srcNote">${esc(b.job)}</div>
    ${prop ? `<div class="flag">⚠ Fire/rehire proposal open: ${esc(prop.why)} Cam decides in chat with Chief.</div>` : ''}
    <div class="stats m"><div><label>LEADS</label><b>${b.leads.length}</b></div><div><label>TRADES</label><b>${st.trades}</b></div>
      <div><label>WIN%</label><b>${st.winrate == null ? '–' : st.winrate + '%'}</b></div><div><label>NET</label><b class="${cls(st.net)}">${money(st.net, true)}</b></div></div>
    <div class="eyebrow msec">LATEST REPORT</div>
    ${latest ? `<div class="mb" style="--c:${PX.COL[name]}"><div class="mh"><span class="k ${esc(latest.kind)}">${esc(latest.kind)}</span>${latest.lead_id ? `<span class="lid">#${esc(latest.lead_id)}</span>` : ''}<span>${fmtTime(latest.ts)}</span></div><div class="mt">${esc(latest.text)}</div></div>` : '<div class="empty">No reports from this bot in the feed yet.</div>'}
    <div class="eyebrow msec">LEADS WORKED</div>
    <div class="chips">${b.leads.length ? b.leads.map(l => { const L = leadMap[l]; return `<span class="chip2 ${L && L.complete ? 'done' : ''}">#${esc(l)}${L && L.verdict ? ' · ' + esc(L.verdict) : ''}</span>`; }).join('') : '<span class="srcNote">None yet</span>'}</div>
    <div class="eyebrow msec">TRADES ON ITS LEADS</div>
    ${b.trades.length ? `<div class="tscroll"><table><tr><th>LEAD</th><th>TICKER</th><th>DATE</th><th>P&amp;L</th></tr>${b.trades.map(t => `<tr><td class="lid">#${esc(t.lead_id)}</td><td>${esc(t.ticker)}</td><td>${esc(t.date)}</td><td class="${cls(t.pnl)}">${money(t.pnl, true)}</td></tr>`).join('')}</table></div>` : '<div class="srcNote">No closed paper trades on its leads yet.</div>'}
    ${b.reports.length > 1 ? `<div class="eyebrow msec">EARLIER</div>${b.reports.slice(1, 5).map(r => `<div class="srcNote">${fmtTime(r.ts)} ${r.lead_id ? '#' + esc(r.lead_id) : ''} · ${esc(r.text.slice(0, 140))}</div>`).join('')}` : ''}
    <p class="fine">Read-only view built from feed.jsonl and paper-ledger.csv. Nothing here changes the bot.</p>`;
  $('modal').hidden = false; if (!refresh) $('modalClose').focus();
}
function weekSpark(wk) {
  const c = document.createElement('canvas'); c.width = wk.length * 4; c.height = 12; const x = c.getContext('2d');
  wk.forEach((w, i) => { x.fillStyle = '#d9cfb8'; x.fillRect(i * 4, 0, 3, 12);
    if (w.n) { const hgt = Math.max(1, Math.round(w.winrate / 100 * 12)); x.fillStyle = w.winrate >= 60 ? '#1d9a4f' : w.winrate >= 40 ? '#c99a00' : '#c0392b'; x.fillRect(i * 4, 12 - hgt, 3, hgt); } });
  return c.toDataURL();
}
function closeModal() { openBot = null; $('modal').hidden = true; }
$('modalClose').onclick = closeModal;
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function fire(d) {
  $('firePanel').classList.toggle('alert', d.proposals.length > 0);
  if (!d.proposals.length) { $('fireBody').innerHTML = `<div class="ok">★ Nobody's on the chopping block. All six bots keep their floors.</div><div class="rule"><b>Rule:</b> ${esc(d.fire_rule)}</div>`; return; }
  $('fireBody').innerHTML = d.proposals.map(p => `<div class="prop">
    <span class="pill">PROPOSAL · NEEDS CAM'S OK</span>
    <h3><img class="mini px" src="${avatar(p.bot)}" alt="">FIRE ${esc(p.bot.toUpperCase())} → HIRE ${esc(p.replacement_name.toUpperCase())}</h3>
    <div><b>Why:</b> ${esc(p.why)}</div>
    ${p.also_flagged && p.also_flagged.length ? `<div class="rule">Also past the rule (one proposal at a time): ${p.also_flagged.map(esc).join(', ')}</div>` : ''}
    <div style="margin-top:6px"><b>What ${esc(p.replacement_name)} does better:</b></div>
    <ul>${p.improvements.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    <details><summary>SUGGESTED DESCRIPTION</summary><p>${esc(p.suggested_description)}</p></details>
    <div class="how">To act on it, tell Chief in chat: <code>${esc(p.approve_hint.replace(/^Reply to Chief: /, ''))}</code>. Nothing happens unless you do.</div>
  </div>`).join('') + `<div class="rule"><b>Rule:</b> ${esc(d.fire_rule)}</div>`;
}

function chat(d) {
  const bots = ['All', ...d.bots.map(b => b.name)];
  $('filters').innerHTML = bots.map(n => `<button class="${n === chatFilter ? 'on' : ''}" style="--c:${PX.COL[n] || '#5ab0ff'}" data-f="${n}">${n.toUpperCase()}</button>`).join('');
  $('filters').querySelectorAll('button').forEach(b => b.onclick = () => { chatFilter = b.dataset.f; lastChatKey = ''; chat(d); });
  const items = d.chat.filter(m => chatFilter === 'All' || m.bot === chatFilter).slice().reverse();
  const key = chatFilter + items.length + (items[0]?.ts || '') + (items[0]?.text || '');
  if (key === lastChatKey) return; lastChatKey = key;
  if (!items.length) { $('chat').innerHTML = '<div class="empty">No desk messages yet. Bots append to desk/feed.jsonl and they appear here within a few seconds.</div>'; return; }
  $('chat').innerHTML = items.map(m => { const c = PX.COL[m.bot] || '#5ab0ff';
    const av = PX.COL[m.bot] ? `<img class="av px" src="${avatar(m.bot)}" alt="${esc(m.bot)}">` : `<div class="av"></div>`;
    return `<div class="msg" style="--c:${c}">${av}<div class="mb">
      <div class="mh"><b>${esc(m.bot.toUpperCase())}</b><span class="k ${esc(m.kind)}">${esc(m.kind)}</span>${m.lead_id ? `<span class="lid">#${esc(m.lead_id)}</span>` : ''}<span>${fmtTime(m.ts)}</span></div>
      <div class="mt">${esc(m.text)}</div>${m.flag ? `<div class="flag">⚠ ${esc(m.flag)}</div>` : ''}</div></div>`; }).join('');
}

function celebrate(name) {
  const c = $('confetti'), cols = ['#ffd23f', '#4cff8f', '#5ab0ff', '#ff7ac0', '#b77dff'];
  for (let i = 0; i < 120; i++) { const e = document.createElement('i'); e.style.left = Math.floor(Math.random() * 100) + 'vw';
    e.style.background = cols[i % cols.length]; e.style.animationDelay = (Math.floor(Math.random() * 8) / 10) + 's'; c.appendChild(e); }
  const b = document.createElement('div'); b.className = 'levelup'; b.textContent = `LEVEL UP! ${name.toUpperCase()}`; document.body.appendChild(b);
  setTimeout(() => { c.innerHTML = ''; b.remove(); }, 3200);
}
(function logo() { const c = $('logo'); PX.icon(c, 5); c.style.width = '32px'; c.style.height = '48px'; })();
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { worldKey = ''; data && render(); }, 150); });
start(); setInterval(poll, POLL_MS);
if (Q.get('chatter') === '1') { const t = setInterval(() => { if (data && PX.layout()) { clearInterval(t); const l = (data.leads || [])[0]; leadAdvance(data, [l ? l.lead_id : 'L000', 'Scout']); } }, 200); }
if (Q.get('open')) { const want = Q.get('open'); const t = setInterval(() => { if (data) { clearInterval(t); want === 'rules' ? openRules() : want === 'tv' ? openTV() : want === 'cal' ? openCal() : want === 'share' ? $('share').click() : openModal(want); } }, 200); }
