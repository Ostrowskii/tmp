// src/client.ts
var time_sync = {
  clock_offset: Infinity,
  lowest_ping: Infinity,
  request_sent_at: 0,
  last_ping: Infinity
};
var ws = new WebSocket(`ws://${window.location.hostname}:8080`);
var room_watchers = new Map;
var is_synced = false;
var sync_listeners = [];
function now() {
  return Math.floor(Date.now());
}
function server_time() {
  if (!isFinite(time_sync.clock_offset)) {
    throw new Error("server_time() called before initial sync");
  }
  return Math.floor(now() + time_sync.clock_offset);
}
function ensure_open() {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not open");
  }
}
function send(obj) {
  ensure_open();
  ws.send(JSON.stringify(obj));
}
function register_handler(room, handler) {
  if (!handler) {
    return;
  }
  if (room_watchers.has(room)) {
    throw new Error(`Handler already registered for room: ${room}`);
  }
  room_watchers.set(room, handler);
}
ws.addEventListener("open", () => {
  console.log("[WS] Connected");
  time_sync.request_sent_at = now();
  ws.send(JSON.stringify({ $: "get_time" }));
  setInterval(() => {
    time_sync.request_sent_at = now();
    ws.send(JSON.stringify({ $: "get_time" }));
  }, 2000);
});
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.$) {
    case "info_time": {
      const t = now();
      const ping = t - time_sync.request_sent_at;
      time_sync.last_ping = ping;
      if (ping < time_sync.lowest_ping) {
        const local_avg = Math.floor((time_sync.request_sent_at + t) / 2);
        time_sync.clock_offset = msg.time - local_avg;
        time_sync.lowest_ping = ping;
      }
      if (!is_synced) {
        is_synced = true;
        for (const cb of sync_listeners) {
          cb();
        }
        sync_listeners.length = 0;
      }
      break;
    }
    case "info_post": {
      const handler = room_watchers.get(msg.room);
      if (handler) {
        handler(msg);
      }
      break;
    }
  }
});
function gen_name() {
  const alphabet = "_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";
  const bytes = new Uint8Array(8);
  const can_crypto = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";
  if (can_crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0;i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let i = 0;i < 8; i++) {
    out += alphabet[bytes[i] % 64];
  }
  return out;
}
function post(room, data) {
  const name = gen_name();
  send({ $: "post", room, time: server_time(), name, data });
  return name;
}
function load(room, from = 0, handler) {
  register_handler(room, handler);
  send({ $: "load", room, from });
}
function watch(room, handler) {
  register_handler(room, handler);
  send({ $: "watch", room });
}
function on_sync(callback) {
  if (is_synced) {
    callback();
    return;
  }
  sync_listeners.push(callback);
}
function ping() {
  return time_sync.last_ping;
}

// src/rollback.ts
function push(tick, state, snapshots) {
  if (snapshots === null) {
    return { tick, keep: 0, life: 0, state, older: null };
  }
  const { keep, life, state: old_state, older, tick: old_tick } = snapshots;
  if (keep === 0) {
    return { tick: old_tick, keep: 1, life, state: old_state, older };
  }
  if (life > 0) {
    return {
      tick,
      keep: 0,
      life: 0,
      state,
      older: { tick: old_tick, keep: 0, life: life - 1, state: old_state, older }
    };
  }
  return { tick, keep: 0, life: 0, state, older: push(old_tick, old_state, older) };
}
function find_recent(target_tick, snapshots) {
  let current = snapshots;
  while (current !== null) {
    if (current.tick <= target_tick) {
      return [current.state, current.tick];
    }
    current = current.older;
  }
  return null;
}
function invalidate_from(target_tick, snapshots) {
  if (snapshots === null) {
    return null;
  }
  if (snapshots.tick >= target_tick) {
    return invalidate_from(target_tick, snapshots.older);
  }
  const new_older = invalidate_from(target_tick, snapshots.older);
  if (new_older === snapshots.older) {
    return snapshots;
  }
  return {
    tick: snapshots.tick,
    keep: 0,
    life: 0,
    state: snapshots.state,
    older: new_older
  };
}

// src/vibi.ts
class Vibi {
  room;
  init;
  on_tick;
  on_post;
  smooth;
  tick_rate;
  tolerance;
  room_posts;
  local_posts;
  state_cache;
  official_time(post2) {
    if (post2.client_time <= post2.server_time - this.tolerance) {
      return post2.server_time - this.tolerance;
    } else {
      return post2.client_time;
    }
  }
  official_tick(post2) {
    return this.time_to_tick(this.official_time(post2));
  }
  constructor(room, init, on_tick, on_post, smooth, tick_rate, tolerance) {
    this.room = room;
    this.init = init;
    this.on_tick = on_tick;
    this.on_post = on_post;
    this.smooth = smooth;
    this.tick_rate = tick_rate;
    this.tolerance = tolerance;
    this.room_posts = new Map;
    this.local_posts = new Map;
    this.state_cache = null;
    on_sync(() => {
      console.log(`[VIBI] synced; watching+loading room=${this.room}`);
      watch(this.room, (post2) => {
        if (post2.name && this.local_posts.has(post2.name)) {
          this.local_posts.delete(post2.name);
        }
        const post_tick = this.official_tick(post2);
        this.state_cache = invalidate_from(post_tick, this.state_cache);
        this.room_posts.set(post2.index, post2);
      });
      load(this.room, 0);
    });
  }
  time_to_tick(server_time2) {
    return Math.floor(server_time2 * this.tick_rate / 1000);
  }
  server_time() {
    return server_time();
  }
  server_tick() {
    return this.time_to_tick(this.server_time());
  }
  post_count() {
    return this.room_posts.size;
  }
  compute_render_state() {
    const curr_tick = this.server_tick();
    const tick_ms = 1000 / this.tick_rate;
    const tol_ticks = Math.ceil(this.tolerance / tick_ms);
    const rtt_ms = ping();
    const half_rtt = isFinite(rtt_ms) ? Math.ceil(rtt_ms / 2 / tick_ms) : 0;
    const past_ticks = Math.max(tol_ticks, half_rtt + 1);
    const past_tick = Math.max(0, curr_tick - past_ticks);
    const past_state = this.compute_state_at(past_tick);
    const curr_state = this.compute_state_at(curr_tick);
    return this.smooth(past_state, curr_state);
  }
  initial_time() {
    const post2 = this.room_posts.get(0);
    if (!post2) {
      return null;
    }
    return this.official_time(post2);
  }
  initial_tick() {
    const t = this.initial_time();
    if (t === null) {
      return null;
    }
    return this.time_to_tick(t);
  }
  compute_state_at(at_tick) {
    const initial_tick = this.initial_tick();
    if (initial_tick === null) {
      return this.init;
    }
    if (at_tick < initial_tick) {
      return this.init;
    }
    const cached = find_recent(at_tick, this.state_cache);
    let start_tick;
    let state;
    if (cached !== null && cached[1] >= initial_tick) {
      [state, start_tick] = cached;
      if (start_tick === at_tick) {
        return state;
      }
      start_tick = start_tick + 1;
    } else {
      state = this.init;
      start_tick = initial_tick;
    }
    const timeline = new Map;
    for (const post2 of this.room_posts.values()) {
      const official_tick = this.official_tick(post2);
      if (official_tick >= start_tick && official_tick <= at_tick) {
        if (!timeline.has(official_tick)) {
          timeline.set(official_tick, []);
        }
        timeline.get(official_tick).push(post2);
      }
    }
    for (const post2 of this.local_posts.values()) {
      const official_tick = this.official_tick(post2);
      if (official_tick >= start_tick && official_tick <= at_tick) {
        if (!timeline.has(official_tick)) {
          timeline.set(official_tick, []);
        }
        const local_queued = { ...post2, index: Number.MAX_SAFE_INTEGER };
        timeline.get(official_tick).push(local_queued);
      }
    }
    for (const posts of timeline.values()) {
      posts.sort((a, b) => a.index - b.index);
    }
    for (let tick = start_tick;tick <= at_tick; tick++) {
      state = this.on_tick(state);
      const posts = timeline.get(tick) || [];
      for (const post2 of posts) {
        state = this.on_post(post2.data, state);
      }
      if (this.local_posts.size === 0) {
        this.state_cache = push(tick, state, this.state_cache);
      }
    }
    return state;
  }
  post(data) {
    const name = post(this.room, data);
    const t = this.server_time();
    const local_post = {
      room: this.room,
      index: -1,
      server_time: t,
      client_time: t,
      name,
      data
    };
    this.local_posts.set(name, local_post);
  }
  compute_current_state() {
    return this.compute_state_at(this.server_tick());
  }
}
// package.json
var package_default = {
  name: "vibi",
  type: "module",
  scripts: {
    check: "tsc --target esnext --noEmit --skipLibCheck",
    dev: "bun run index.ts",
    server: "bun run src/server.ts",
    client: "bun run client_cli.ts",
    deploy: "bash scripts/deploy.sh"
  },
  dependencies: {
    ws: "^8.18.0"
  },
  devDependencies: {
    "@types/ws": "^8.5.13"
  }
};

// walkers/index.ts
var TICK_RATE = 24;
var TOLERANCE = 300;
var PIXELS_PER_SECOND = 200;
var PIXELS_PER_TICK = PIXELS_PER_SECOND / TICK_RATE;
var initial = {};
function on_tick(state) {
  const new_state = {};
  for (const [char, player] of Object.entries(state)) {
    new_state[char] = {
      px: player.px + player.d * PIXELS_PER_TICK + player.a * -PIXELS_PER_TICK,
      py: player.py + player.s * PIXELS_PER_TICK + player.w * -PIXELS_PER_TICK,
      w: player.w,
      a: player.a,
      s: player.s,
      d: player.d
    };
  }
  return new_state;
}
function on_post(post2, state) {
  switch (post2.$) {
    case "spawn": {
      const player = { px: 200, py: 200, w: 0, a: 0, s: 0, d: 0 };
      return { ...state, [post2.nick]: player };
    }
    case "down": {
      const updated = { ...state[post2.player], [post2.key]: 1 };
      return { ...state, [post2.player]: updated };
    }
    case "up": {
      const updated = { ...state[post2.player], [post2.key]: 0 };
      return { ...state, [post2.player]: updated };
    }
  }
  return state;
}
function create_game(room, smooth) {
  return new Vibi(room, initial, on_tick, on_post, smooth, TICK_RATE, TOLERANCE);
}
var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
function resize_canvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize_canvas();
window.addEventListener("resize", resize_canvas);
var room = prompt("Enter room name:");
if (!room)
  room = gen_name();
var nick = prompt("Enter your nickname (single character):");
if (!nick || nick.length !== 1) {
  alert("Nickname must be exactly one character!");
  throw new Error("Nickname must be one character");
}
console.log("[GAME] Room:", room, "Nick:", nick);
var smooth = (past, curr) => {
  if (curr[nick]) {
    past[nick] = curr[nick];
  }
  return past;
};
var game = create_game(room, smooth);
document.title = `Walkers ${package_default.version}`;
var key_states = { w: false, a: false, s: false, d: false };
on_sync(() => {
  const spawn_x = 200;
  const spawn_y = 200;
  console.log(`[GAME] Synced; spawning '${nick}' at (${spawn_x},${spawn_y})`);
  game.post({ $: "spawn", nick, px: spawn_x, py: spawn_y });
  const valid_keys = new Set(["w", "a", "s", "d"]);
  function handle_key_event(e) {
    const key = e.key.toLowerCase();
    const is_down = e.type === "keydown";
    if (!valid_keys.has(key)) {
      return;
    }
    if (key_states[key] === is_down) {
      return;
    }
    key_states[key] = is_down;
    const action = is_down ? "down" : "up";
    game.post({ $: action, key, player: nick });
  }
  window.addEventListener("keydown", handle_key_event);
  window.addEventListener("keyup", handle_key_event);
  setInterval(render, 1000 / TICK_RATE);
});
function render() {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const curr_tick = game.server_tick();
  const state = game.compute_render_state();
  ctx.fillStyle = "#000";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  try {
    const st = game.server_time();
    const pc = game.post_count ? game.post_count() : 0;
    const rtt = ping();
    ctx.fillText(`room: ${room}`, 8, 6);
    ctx.fillText(`time: ${st}`, 8, 24);
    ctx.fillText(`tick: ${curr_tick}`, 8, 42);
    ctx.fillText(`post: ${pc}`, 8, 60);
    if (isFinite(rtt)) {
      ctx.fillText(`ping: ${Math.round(rtt)} ms`, 8, 78);
    }
  } catch {}
  ctx.fillStyle = "#000";
  ctx.font = "24px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [char, player] of Object.entries(state)) {
    const x = Math.floor(player.px);
    const y = Math.floor(player.py);
    ctx.fillText(char, x, y);
  }
}
export {
  create_game
};
