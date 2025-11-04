// client_web.ts
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
function unwatch(room) {
  room_watchers.delete(room);
  send(JSON.stringify({ $: "unwatch", room }));
}
function close() {
  ws.close();
}
export {
  watch,
  unwatch,
  server_time,
  post,
  load,
  close
};
