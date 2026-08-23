const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const W = 24, H = 24;
const DIR = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const SKINS = {
  pink: ['#ff719e', '#ffb0c6'],
  purple: ['#a678e8', '#d5bbff'],
  blue: ['#5bccec', '#a5edff'],
  mint: ['#4ac99e', '#a5f0d0']
};

const modes = [
  ['classic', '🟢', 'Classic', 'Pure, cozy snake'],
  ['speed', '⚡', 'Speed', 'Level up the pace'],
  ['maze', '🧱', 'Maze', 'Navigate walls'],
  ['time', '⏱️', 'Time attack', '60 second sprint'],
  ['challenge', '💎', 'Challenge', 'Mission mode'],
  ['local', '👥', 'Local party', '2–4 friends']
];

const state = {
  mode: 'classic',
  running: false,
  paused: false,
  snakes: [],
  food: null,
  special: null,
  obstacles: [],
  portals: [],
  score: 0,
  foods: 0,
  combo: 0,
  bestCombo: 0,
  level: 1,
  started: 0,
  remaining: null,
  effects: { speed: 0, freeze: 0, rainbow: 0, shield: 0 },
  tick: null,
  lastSpecial: 0,
  online: false
};

let settings = JSON.parse(localStorage.getItem('rush-settings') || '{"skin":"pink","control":"buttons","sound":true,"music":false,"localPlayers":2}');
let progress = JSON.parse(localStorage.getItem('rush-progress') || '{"best":0,"scores":[],"badges":{},"stats":{"apples":0,"gold":0,"special":0,"portals":0,"wins":0}}');

const save = () => {
  localStorage.setItem('rush-settings', JSON.stringify(settings));
  localStorage.setItem('rush-progress', JSON.stringify(progress));
};

function show(id) {
  $$('.screen').forEach(x => x.classList.remove('active'));
  $('#' + id).classList.add('active');
  if (id === 'menu') renderMenu();
  if (id === 'leaderboard') renderScores();
  if (id === 'settings') renderSettings();
}

function renderMenu() {
  $('#menuBest').textContent = progress.best;
  $('#achievementCount').textContent = Object.keys(progress.badges).length;
  $('#modeGrid').innerHTML = modes.map(([id, e, n, d]) =>
    `<button class="mode ${state.mode === id ? 'selected' : ''}" data-mode="${id}">
      <i>${e}</i>${n}<small>${d}</small>
    </button>`
  ).join('');
  $$('[data-mode]').forEach(b => b.onclick = () => {
    state.mode = b.dataset.mode;
    renderMenu();
  });
}

function renderSettings() {
  $('#skin').value = settings.skin;
  $('#control').value = settings.control;
  $('#localPlayers').value = settings.localPlayers || 2;
  $('#sound').checked = settings.sound;
  $('#music').checked = settings.music;

  const badges = [
    ['apple', '🍎 Apple Collector', '50 apples'],
    ['gold', '💎 Golden Hunter', '10 goldens'],
    ['speed', '⚡ Speed Demon', 'reach level 10'],
    ['maze', '🧱 Maze Master', 'win 10 mazes'],
    ['portal', '🌀 Portal Master', '20 portals'],
    ['shield', '🛡️ Survivor', 'use a shield'],
    ['champion', '🏆 Snake Champion', '25 wins'],
    ['robot', '🤖 Robot Slayer', 'beat hard AI']
  ];
  $('#badges').innerHTML = badges.map(([k, n, d]) =>
    `<div class="badge ${progress.badges[k] ? 'unlocked' : ''}">${n}<br><small>${d}</small></div>`
  ).join('');
}

function renderScores() {
  $('#scores').innerHTML = (progress.scores.length
    ? progress.scores
    : ['No scores yet — make the first rush!']
  ).map((s, i) =>
    `<li>${typeof s === 'string' ? s : `<b>${s.score}</b> · ${s.mode} · level ${s.level}`}</li>`
  ).join('');
}

function rndCell() {
  let tries = 0;
  while (tries++ < 500) {
    let p = { x: Math.floor(Math.random() * W), y: Math.floor(Math.random() * H) };
    if (!occupied(p)) return p;
  }
  return { x: 2, y: 2 };
}

function key(p) { return p.x + ',' + p.y; }
function occupied(p) {
  return state.snakes.some(s => s.body.some(q => key(q) === key(p)))
    || state.obstacles.some(q => key(q) === key(p));
}

function snake(name, colour, body, dir, keys = null, ai = false) {
  return { name, colour, body, dir, next: dir, keys, ai, alive: true, score: 0, grow: 0, foods: 0 };
}

function start() {
  $('#modal').classList.add('hidden');
  show('game');
  state.running = true;
  state.paused = false;
  state.frame = 0;
  state.score = state.foods = state.combo = state.bestCombo = 0;
  state.level = 1;
  state.started = Date.now();
  state.remaining = state.mode === 'time' ? 60 : null;
  state.effects = { speed: 0, freeze: 0, rainbow: 0, shield: 0 };
  state.obstacles = [];
  state.portals = [];
  state.lastSpecial = 0;
  state.snakes = [snake('YOU', settings.skin, [{ x: 6, y: 12 }, { x: 5, y: 12 }, { x: 4, y: 12 }], DIR.right, {
    up: ['ArrowUp', 'w'], down: ['ArrowDown', 's'], left: ['ArrowLeft', 'a'], right: ['ArrowRight', 'd']
  })];

  if (state.mode === 'local') {
    let extra = [
      ['P2', 'purple', [{ x: 18, y: 7 }, { x: 19, y: 7 }, { x: 20, y: 7 }], DIR.left, { up: ['i'], down: ['k'], left: ['j'], right: ['l'] }],
      ['P3', 'blue', [{ x: 6, y: 18 }, { x: 5, y: 18 }, { x: 4, y: 18 }], DIR.right, { up: ['t'], down: ['g'], left: ['f'], right: ['h'] }],
      ['P4', 'mint', [{ x: 18, y: 18 }, { x: 19, y: 18 }, { x: 20, y: 18 }], DIR.left, { up: ['8'], down: ['5'], left: ['4'], right: ['6'] }]
    ];
    state.snakes.push(...extra.slice(0, (settings.localPlayers || 2) - 1).map(x => snake(...x)));
  }

  if (state.mode === 'challenge')
    state.snakes.push(snake('ROBOT', 'purple', [{ x: 18, y: 12 }, { x: 19, y: 12 }, { x: 20, y: 12 }], DIR.left, null, true));

  state.food = { ...rndCell(), kind: 'apple' };
  state.special = null;

  if (state.mode === 'maze') addMaze();

  clearInterval(state.tick);
  state.tick = setInterval(step, 125);
  renderHud();
  draw();
}

function addMaze() {
  for (let x = 7; x < 17; x++)
    if (x !== 12) state.obstacles.push({ x, y: 7 }, { x, y: 17 });
}

function levelSetup() {
  let target = Math.floor(state.foods / 5) + 1;
  if (target <= state.level) return;
  state.level = target;
  toast(`LEVEL ${target}!`);
  if (target >= 4 && state.mode !== 'classic') addObstacles(Math.min(6, target - 2));
  if (target >= 11 && state.mode !== 'classic' && state.portals.length === 0)
    state.portals = [rndCell(), rndCell()];
  if (target >= 10) unlock('speed');
}

function addObstacles(n) {
  for (let i = 0; i < n; i++) state.obstacles.push(rndCell());
}

function step() {
  if (!state.running || state.paused) return;

  let elapsed = (Date.now() - state.started) / 1000;
  if (state.remaining !== null) {
    state.remaining = Math.max(0, 60 - Math.floor(elapsed));
    if (!state.remaining) return finish(true, 'Time is up!');
  }

  for (const k of ['speed', 'freeze', 'rainbow'])
    if (state.effects[k] > 0) state.effects[k] -= 125;

  state.frame++;
  let stride = state.effects.speed > 0 ? 1 : Math.max(1, 2 - Math.floor(state.level / 5)) + (state.effects.freeze > 0 ? 1 : 0);
  if (state.frame % stride) { renderHud(); return; }

  for (const s of state.snakes)
    if (s.alive) { if (s.ai) aiTurn(s); move(s); }

  levelSetup();

  if (state.special && Date.now() > state.special.expires) state.special = null;
  if (!state.special && state.mode !== 'classic' && state.foods > 2 && Math.random() < 0.045) spawnSpecial();

  renderHud();
  draw();
}

function safe(s, d) {
  let h = s.body[0], p = { x: h.x + d.x, y: h.y + d.y };
  return p.x >= 0 && p.y >= 0 && p.x < W && p.y < H && !occupied(p) && !state.obstacles.some(o => key(o) === key(p));
}

function aiTurn(s) {
  let options = Object.values(DIR).filter(d => !(d.x + s.dir.x === 0 && d.y + s.dir.y === 0) && safe(s, d));
  if (!options.length) return;
  let t = state.special || state.food;
  options.sort((a, b) =>
    Math.abs(s.body[0].x + a.x - t.x) + Math.abs(s.body[0].y + a.y - t.y) -
    Math.abs(s.body[0].x + b.x - t.x) - Math.abs(s.body[0].y + b.y - t.y)
  );
  s.next = options[Math.random() < 0.78 ? 0 : Math.floor(Math.random() * options.length)];
}

function move(s) {
  if (s.next.x + s.dir.x !== 0 || s.next.y + s.dir.y !== 0) s.dir = s.next;
  let h = s.body[0], next = { x: h.x + s.dir.x, y: h.y + s.dir.y };

  let portal = state.portals.find(p => key(p) === key(next));
  if (portal) {
    next = state.portals.find(p => p !== portal);
    progress.stats.portals++;
    toast('🌀 WARP!');
    sound(520);
    if (progress.stats.portals >= 20) unlock('portal');
  }

  let hit = next.x < 0 || next.y < 0 || next.x >= W || next.y >= H ||
    state.obstacles.some(o => key(o) === key(next)) ||
    state.snakes.some(other => other.body.some(p => key(p) === key(next)));

  if (hit) {
    if (s === state.snakes[0] && state.effects.shield > 0) {
      state.effects.shield = 0;
      unlock('shield');
      toast('🛡️ SHIELD SAVE!');
      return;
    }
    s.alive = false;
    sound(100);
    if (s === state.snakes[0]) return finish(false, 'You bumped!');
    return;
  }

  s.body.unshift(next);
  let eaten = key(next) === key(state.food);
  let special = state.special && key(next) === key(state.special);

  if (eaten || special) {
    let item = eaten ? state.food : state.special;
    eat(s, item);
    if (eaten) state.food = { ...rndCell(), kind: 'apple' };
    else state.special = null;
  } else {
    s.body.pop();
  }
}

function spawnSpecial() {
  let types = state.level >= 7
    ? ['bonus', 'gold', 'speed', 'freeze', 'teleport', 'rainbow', 'shield']
    : ['bonus', 'gold'];
  let kind = types[Math.floor(Math.random() * types.length)];
  state.special = { ...rndCell(), kind, expires: Date.now() + 7000 };
}

const info = {
  apple: ['🍎', 10],
  bonus: ['⭐', 50],
  gold: ['💎', 100],
  speed: ['⚡', 25],
  freeze: ['🧊', 25],
  teleport: ['🌀', 35],
  rainbow: ['🌈', 75],
  shield: ['🛡️', 30]
};

function eat(s, item) {
  let [emoji, base] = info[item.kind];
  s.grow++;
  s.foods++;
  state.foods++;
  state.combo = Math.min(10, state.combo + 1);
  state.bestCombo = Math.max(state.bestCombo, state.combo);

  let mult = state.effects.rainbow > 0 ? 2 : Math.min(3, 1 + Math.floor(state.combo / 4));
  let pts = base * mult;
  s.score += pts;
  if (s === state.snakes[0]) state.score += pts;

  if (item.kind === 'apple') progress.stats.apples++;
  else progress.stats.special++;
  if (item.kind === 'gold') progress.stats.gold++;

  if (item.kind === 'speed') state.effects.speed = 6000;
  if (item.kind === 'freeze') state.effects.freeze = 6000;
  if (item.kind === 'rainbow') state.effects.rainbow = 8000;
  if (item.kind === 'shield') state.effects.shield = 1;
  if (item.kind === 'teleport') { let p = rndCell(); s.body[0] = p; }

  toast(`${emoji} +${pts}${mult > 1 ? ' ×' + mult : ''}`);
  sound(item.kind === 'gold' ? 780 : 440);

  if (progress.stats.apples >= 50) unlock('apple');
  if (progress.stats.gold >= 10) unlock('gold');
  if (state.combo >= 10) toast('🔥 MAX COMBO!');
}

function renderHud() {
  $('#score').textContent = state.score;
  $('#high').textContent = Math.max(progress.best, state.score);
  $('#level').textContent = state.level;
  $('#combo').textContent = '×' + Math.max(1, Math.min(3, 1 + Math.floor(state.combo / 4)));
  $('#time').textContent = state.remaining === null ? '∞' : state.remaining + 's';
  $('#missionText').textContent = state.mode === 'challenge' ? 'Beat the Robot' : 'Eat 10 apples';
  $('#missionBar').style.width = Math.min(100, state.foods * 10) + '%';

  $('#players').innerHTML = state.snakes.map(s =>
    `<div class="player-row">${infoSkin(s.colour)} ${s.name} ${s.alive ? '' : '💥'}<b>${s.score}</b></div>`
  ).join('');

  let e = [];
  if (state.effects.speed > 0) e.push('⚡ Speed');
  if (state.effects.freeze > 0) e.push('🧊 Freeze');
  if (state.effects.rainbow > 0) e.push('🌈 ×2');
  if (state.effects.shield > 0) e.push('🛡️ Shield');
  $('#powers').textContent = e.join(' · ') || 'Pick up specials as you level up';
}

function infoSkin(s) {
  return ({ pink: '🩷', purple: '💜', blue: '🩵', mint: '💚' })[s] || '🤖';
}

function draw() {
  let c = $('#board'), ctx = c.getContext('2d'), z = c.width / W;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fffafe';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = '#eedff1';
  ctx.lineWidth = 1;
  for (let i = 1; i < W; i++) {
    ctx.beginPath(); ctx.moveTo(i * z, 0); ctx.lineTo(i * z, c.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * z); ctx.lineTo(c.width, i * z); ctx.stroke();
  }

  for (const p of state.obstacles) {
    ctx.fillStyle = '#a97dd4';
    round(ctx, p, z, 8);
    ctx.fillStyle = '#fff';
    ctx.font = `${z * 0.45}px sans-serif`;
    ctx.fillText('✦', p.x * z + z * 0.29, p.y * z + z * 0.65);
  }

  for (const [i, p] of state.portals.entries()) {
    ctx.fillStyle = i ? '#72dce2' : '#bc8cef';
    ctx.beginPath();
    ctx.arc((p.x + 0.5) * z, (p.y + 0.5) * z, z * 0.36, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${z * 0.4}px sans-serif`;
    ctx.fillText('↯', p.x * z + z * 0.33, p.y * z + z * 0.65);
  }

  drawFood(ctx, state.food, z);
  if (state.special) drawFood(ctx, state.special, z);

  for (const s of state.snakes) if (s.alive) {
    let [a, b] = SKINS[s.colour] || SKINS.purple;
    s.body.slice().reverse().forEach((p, i) => {
      let g = ctx.createLinearGradient(p.x * z, p.y * z, (p.x + 1) * z, (p.y + 1) * z);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      ctx.fillStyle = g;
      round(ctx, p, z, z * 0.31);
    });
    let h = s.body[0];
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc((h.x + 0.36) * z, (h.y + 0.34) * z, z * 0.1, 0, 7);
    ctx.arc((h.x + 0.65) * z, (h.y + 0.34) * z, z * 0.1, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#503852';
    ctx.beginPath();
    ctx.arc((h.x + 0.38) * z, (h.y + 0.35) * z, z * 0.04, 0, 7);
    ctx.arc((h.x + 0.67) * z, (h.y + 0.35) * z, z * 0.04, 0, 7);
    ctx.fill();
  }
}

function round(ctx, p, z, r) {
  ctx.beginPath();
  ctx.roundRect(p.x * z + 2, p.y * z + 2, z - 4, z - 4, r);
  ctx.fill();
}

function drawFood(ctx, f, z) {
  let [emoji] = info[f.kind];
  ctx.font = `${z * 0.7}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, (f.x + 0.5) * z, (f.y + 0.55) * z);
}

function finish(win, sub) {
  if (!state.running) return;
  state.running = false;
  clearInterval(state.tick);

  if (state.score > progress.best) progress.best = state.score;
  progress.scores.push({ score: state.score, mode: state.mode, level: state.level });
  progress.scores = progress.scores.sort((a, b) => b.score - a.score).slice(0, 10);
  if (win) progress.stats.wins++;
  if (state.mode === 'challenge' && state.snakes[1] && !state.snakes[1].alive) unlock('robot');
  save();

  $('#modalTitle').textContent = win ? '🏆 You win!' : '💥 Game over';
  $('#modalSub').textContent = sub;
  $('#stats').innerHTML = `
    <div class="stat-grid">
      <span>Score<b>${state.score}</b></span>
      <span>Food<b>${state.foods}</b></span>
      <span>Length<b>${state.snakes[0].body.length}</b></span>
      <span>Best combo<b>×${state.bestCombo}</b></span>
    </div>`;
  $('#modal').classList.remove('hidden');
  if (win) sound(880);
}

function unlock(k) {
  if (!progress.badges[k]) {
    progress.badges[k] = true;
    toast('🏅 Badge unlocked!');
    save();
  }
}

function toast(t) {
  let e = $('#toast');
  e.textContent = t;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 1100);
}

function sound(freq) {
  if (!settings.sound) return;
  try {
    let a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.13);
  } catch { }
}

function input(dir, s = state.snakes[0]) {
  if (state.online && ws?.readyState === 1) {
    let name = Object.entries(DIR).find(([, v]) => v === dir)?.[0];
    ws.send(JSON.stringify({ type: 'dir', dir: name }));
    return;
  }
  if (!s || !state.running) return;
  if (dir.x + s.dir.x === 0 && dir.y + s.dir.y === 0) return;
  s.next = dir;
}

document.addEventListener('keydown', e => {
  if (e.key === ' ' && state.running) { state.paused = !state.paused; return; }
  for (const s of state.snakes) {
    if (s.keys) for (const [d, ks] of Object.entries(s.keys))
      if (ks.includes(e.key)) { input(DIR[d], s); e.preventDefault(); }
  }
});

let touchStart;
$('#board').addEventListener('touchstart', e => touchStart = e.changedTouches[0], { passive: true });
$('#board').addEventListener('touchend', e => {
  if (settings.control !== 'swipe' || !touchStart) return;
  let p = e.changedTouches[0], x = p.clientX - touchStart.clientX, y = p.clientY - touchStart.clientY;
  input(Math.abs(x) > Math.abs(y) ? (x > 0 ? DIR.right : DIR.left) : (y > 0 ? DIR.down : DIR.up));
}, { passive: true });

$$('#touch button').forEach(b => b.onclick = () => input(DIR[b.dataset.dir]));

$('#playBtn').onclick = start;
$('#again').onclick = start;
$('#pauseBtn').onclick = () => { state.paused = !state.paused; $('#pauseBtn').textContent = state.paused ? '▶' : 'Ⅱ'; };
$$('[data-screen]').forEach(b => b.onclick = () => show(b.dataset.screen));
$('#skin').onchange = e => { settings.skin = e.target.value; save(); };
$('#localPlayers').onchange = e => { settings.localPlayers = +e.target.value; save(); };
$('#control').onchange = e => { settings.control = e.target.value; save(); };
$('#sound').onchange = e => { settings.sound = e.target.checked; save(); };
$('#music').onchange = e => { settings.music = e.target.checked; save(); };
$('#soundBtn').onclick = () => { settings.sound = !settings.sound; save(); $('#soundBtn').textContent = settings.sound ? '🔊' : '🔇'; };

let ws;
function connect(type) {
  let name = $('#playerName').value || 'Rusher', room = $('#roomCode').value;
  state.online = true;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type, name, room }));
  ws.onmessage = e => onlineMessage(JSON.parse(e.data));
  ws.onerror = () => toast('Could not reach room server.');
}

function onlineMessage(m) {
  if (m.type === 'error') { toast(m.message); return; }
  if (m.type === 'notice') { toast(m.message); return; }
  if (m.type === 'reaction') { toast(`${m.name}: ${m.emoji}`); return; }

  if (m.type === 'state' && m.phase === 'playing') {
    show('game');
    state.running = false;
    state.mode = 'online';
    state.score = 0; state.level = 1; state.foods = 0;
    state.remaining = m.timer;
    state.obstacles = []; state.portals = []; state.special = null;
    state.snakes = m.players.map(p => ({
      name: p.name, colour: p.colour, body: p.snake, dir: p.dir, next: p.dir, alive: p.alive, score: p.score
    }));
    state.score = Math.max(...m.players.map(p => p.score));
    renderHud();
    draw();
    return;
  }

  if (m.type === 'state' && m.phase === 'results') {
    state.online = false;
    show('online');
    toast('Match finished — check the scores!');
  }

  if (m.type === 'state') {
    show('online');
    let l = $('#lobby');
    l.classList.remove('hidden');
    l.innerHTML = `
      <h3>Room ${m.room}</h3>
      <p>${m.phase === 'lobby' ? 'Everyone ready?' : 'Match in progress'}</p>
      ${m.players.map(p => `<div class="lobby-player">${infoSkin(p.colour)} ${p.name} — ${p.ready ? 'READY' : 'WAITING'}</div>`).join('')}
      <button id="ready" class="secondary">Ready</button>
      <button id="hostStart" class="primary">Start match</button>
      <div class="reactions">${['❤️', '😂', '🔥', '😱', '🎉'].map(x => `<button data-reaction="${x}">${x}</button>`).join('')}</div>`;
    $('#ready').onclick = () => ws.send(JSON.stringify({ type: 'ready' }));
    $('#hostStart').onclick = () => ws.send(JSON.stringify({ type: 'start' }));
    $$('[data-reaction]').forEach(b => b.onclick = () => ws.send(JSON.stringify({ type: 'reaction', emoji: b.dataset.reaction })));
  }
}

$('#createRoom').onclick = () => connect('create');
$('#joinRoom').onclick = () => connect('join');

renderMenu();
