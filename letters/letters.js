// state_machine.js
var time_sync = {
  clock_offset: Infinity,
  lowest_ping: Infinity,
  request_sent_at: 0
};
var ws = new WebSocket("ws://localhost:8080");
var room_watchers = new Map;
var pending_messages = [];
var is_ready = false;
function now() {
  return Math.floor(Date.now());
}
function server_time() {
  if (!isFinite(time_sync.clock_offset)) {
    return now();
  }
  return Math.floor(now() + time_sync.clock_offset);
}
function send(message) {
  if (is_ready && ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  } else {
    pending_messages.push(message);
  }
}
ws.addEventListener("open", () => {
  console.log("[WS] Connected");
  is_ready = true;
  while (pending_messages.length > 0) {
    const message = pending_messages.shift();
    if (message) {
      ws.send(message);
    }
  }
  setInterval(() => {
    time_sync.request_sent_at = now();
    ws.send(JSON.stringify({ $: "get_time" }));
  }, 2000);
});
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  switch (message.$) {
    case "info_time": {
      const time = now();
      const ping = time - time_sync.request_sent_at;
      if (ping < time_sync.lowest_ping) {
        const local_avg_time = Math.floor((time_sync.request_sent_at + time) / 2);
        time_sync.clock_offset = message.time - local_avg_time;
        time_sync.lowest_ping = ping;
      }
      break;
    }
    case "info_post": {
      const handler = room_watchers.get(message.room);
      if (handler) {
        handler(message);
      }
      break;
    }
  }
});
function post(room, data) {
  send(JSON.stringify({ $: "post", room, time: server_time(), data }));
}
function load(room, from = 0, handler) {
  if (handler) {
    if (room_watchers.has(room)) {
      throw new Error(`Handler already registered for room: ${room}`);
    }
    room_watchers.set(room, handler);
  }
  send(JSON.stringify({ $: "load", room, from }));
}
function watch(room, handler) {
  if (handler) {
    if (room_watchers.has(room)) {
      throw new Error(`Handler already registered for room: ${room}`);
    }
    room_watchers.set(room, handler);
  }
  send(JSON.stringify({ $: "watch", room }));
}

class StateMachine {
  room;
  init;
  on_tick;
  on_post;
  ticks_per_second;
  tolerance;
  room_posts;
  constructor(room, init, on_tick, on_post, ticks_per_second, tolerance) {
    this.room = room;
    this.init = init;
    this.on_tick = on_tick;
    this.on_post = on_post;
    this.ticks_per_second = ticks_per_second;
    this.tolerance = tolerance;
    this.room_posts = new Map;
    watch(this.room, (post2) => {
      this.room_posts.set(post2.index, post2);
    });
    load(this.room, 0);
  }
  time_to_tick(server_time2) {
    return Math.floor(server_time2 * this.ticks_per_second / 1000);
  }
  server_time() {
    return server_time();
  }
  server_tick() {
    return this.time_to_tick(this.server_time());
  }
  initial_time() {
    const post2 = this.room_posts.get(0);
    if (!post2) {
      return null;
    }
    return post2.server_time;
  }
  initial_tick() {
    const time = this.initial_time();
    if (time === null) {
      return null;
    }
    return this.time_to_tick(time);
  }
  compute_state_at(at_tick) {
    const initial_tick = this.initial_tick();
    if (initial_tick === null) {
      return this.init;
    }
    if (at_tick < initial_tick) {
      return this.init;
    }
    const timeline = new Map;
    for (const post2 of this.room_posts.values()) {
      let official_time;
      if (post2.client_time <= post2.server_time - this.tolerance) {
        official_time = post2.server_time - this.tolerance;
      } else {
        official_time = post2.client_time;
      }
      const official_tick = this.time_to_tick(official_time);
      if (!timeline.has(official_tick)) {
        timeline.set(official_tick, []);
      }
      timeline.get(official_tick).push(post2);
    }
    for (const posts of timeline.values()) {
      posts.sort((a, b) => a.index - b.index);
    }
    let state = this.init;
    for (let tick = initial_tick;tick <= at_tick; tick++) {
      state = this.on_tick(state);
      const posts = timeline.get(tick) || [];
      for (const post2 of posts) {
        state = this.on_post(post2.data, state);
      }
    }
    return state;
  }
  post(data) {
    post(this.room, data);
  }
  compute_current_state() {
    return this.compute_state_at(this.server_tick());
  }
}

// letters.ts
var TICKS_PER_SECOND = 24;
var TOLERANCE = 100;
var PIXELS_PER_SECOND = 200;
var PIXELS_PER_TICK = PIXELS_PER_SECOND / 24;
var initial_state = {};
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
  if (post2.$ === "spawn") {
    return {
      ...state,
      [post2.nick]: {
        px: post2.px,
        py: post2.py,
        w: 0,
        a: 0,
        s: 0,
        d: 0
      }
    };
  } else if (post2.$ === "down") {
    const player = state[post2.player];
    if (!player) {
      return state;
    }
    return {
      ...state,
      [post2.player]: {
        ...player,
        [post2.key]: 1
      }
    };
  } else if (post2.$ === "up") {
    const player = state[post2.player];
    if (!player) {
      return state;
    }
    return {
      ...state,
      [post2.player]: {
        ...player,
        [post2.key]: 0
      }
    };
  }
  return state;
}
function createGame(room) {
  const sm = new StateMachine(room, initial_state, on_tick, on_post, TICKS_PER_SECOND, TOLERANCE);
  return sm;
}
export {
  createGame
};
