import http from 'node:http';
import { WebSocketServer } from 'ws';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
  const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = normalize(join(root, requested));
  if (!file.startsWith(normalize(root))) return res.writeHead(403).end();

  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
const colours = ['pink', 'purple', 'blue', 'mint'];

const key = p => `${p.x},${p.y}`;
const opposite = (a, b) => a.x + b.x === 0 && a.y + b.y === 0;
const dirs = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

function code() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function openCell(room) {
  const used = new Set([...room.players.values()].flatMap(p => p.snake.map(key)));
  for (let i = 0; i < 900; i++) {
    const p = { x: Math.floor(Math.random() * room.w), y: Math.floor(Math.random() * room.h) };
    if (!used.has(key(p))) return p;
  }
  return { x: 1, y: 1 };
}

function snapshot(room) {
  return {
    type: 'state', room: room.code, phase: room.phase,
    players: [...room.players.values()].map(({ ws, ...p }) => p),
    food: room.food, timer: Math.ceil(room.timer / 7)
  };
}

function broadcast(room, payload = snapshot(room)) {
  const msg = JSON.stringify(payload);
  for (const p of room.players.values())
    if (p.ws.readyState === 1) p.ws.send(msg);
}

function makePlayer(ws, name) {
  return {
    id: Math.random().toString(36).slice(2), ws,
    name: name?.slice(0, 14) || 'Rusher',
    colour: null, ready: false, alive: true,
    score: 0, foods: 0, dir: dirs.right, next: dirs.right, snake: []
  };
}

function start(room) {
  room.phase = 'playing';
  room.timer = 600;
  let i = 0;
  for (const p of room.players.values()) {
    p.alive = true; p.score = 0; p.foods = 0;
    p.dir = i % 2 ? dirs.left : dirs.right;
    p.next = p.dir;
    p.snake = [
      { x: i % 2 ? room.w - 4 : 3, y: 3 + i * 5 },
      { x: i % 2 ? room.w - 3 : 2, y: 3 + i * 5 },
      { x: i % 2 ? room.w - 2 : 1, y: 3 + i * 5 }
    ];
    i++;
  }
  room.food = { ...openCell(room), kind: 'apple' };
  broadcast(room);
}

function tick(room) {
  if (room.phase !== 'playing') return;
  room.timer--;
  const next = [];
  for (const p of room.players.values()) if (p.alive) {
    p.dir = p.next;
    const h = p.snake[0];
    next.push([p, { x: h.x + p.dir.x, y: h.y + p.dir.y }]);
  }
  const bodies = new Set([...room.players.values()].flatMap(p => p.snake.map(key)));

  for (const [p, h] of next)
    if (h.x < 0 || h.y < 0 || h.x >= room.w || h.y >= room.h || bodies.has(key(h))) p.alive = false;

  for (const [p, h] of next) if (p.alive) {
    p.snake.unshift(h);
    if (key(h) === key(room.food)) { p.score += 10; p.foods++; room.food = { ...openCell(room), kind: 'apple' }; }
    else p.snake.pop();
  }

  if (room.timer <= 0 || [...room.players.values()].filter(p => p.alive).length <= 1) {
    room.phase = 'results';
    clearInterval(room.loop);
  }
  broadcast(room);
}

wss.on('connection', ws => {
  let player, room;
  const send = x => ws.readyState === 1 && ws.send(JSON.stringify(x));

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'create' || m.type === 'join') {
      const roomCode = m.type === 'create' ? code() : String(m.room || '').toUpperCase();
      room = m.type === 'create'
        ? { code: roomCode, w: 24, h: 24, players: new Map(), phase: 'lobby', food: null, timer: 90 }
        : rooms.get(roomCode);

      if (!room) return send({ type: 'error', message: 'Room not found.' });
      if (room.players.size >= 4) return send({ type: 'error', message: 'Room is full.' });

      if (!rooms.has(roomCode)) rooms.set(roomCode, room);
      player = makePlayer(ws, m.name);
      player.colour = colours[room.players.size];
      room.players.set(player.id, player);
      broadcast(room);
      return;
    }

    if (!room || !player) return;
    if (m.type === 'ready') { player.ready = !player.ready; broadcast(room); }
    if (m.type === 'start' && room.phase === 'lobby' && [...room.players.values()].every(p => p.ready)) {
      start(room);
      room.loop = setInterval(() => tick(room), 150);
    }
    if (m.type === 'dir' && dirs[m.dir] && !opposite(player.dir, dirs[m.dir])) player.next = dirs[m.dir];
    if (m.type === 'reaction') broadcast(room, { type: 'reaction', name: player.name, emoji: String(m.emoji || '🔥').slice(0, 3) });
  });

  ws.on('close', () => {
    if (!room || !player) return;
    room.players.delete(player.id);
    broadcast(room, { type: 'notice', message: `${player.name} disconnected.` });
    broadcast(room);
    if (!room.players.size) { clearInterval(room.loop); rooms.delete(room.code); }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Snake Rush at http://localhost:3000'));
